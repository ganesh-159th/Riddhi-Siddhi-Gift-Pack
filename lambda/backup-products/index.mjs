// Scheduled backup of the two pieces of data that are not reproducible from
// source code: public/products.json (also the GitHub source of truth) and the
// admin-uploaded product photos in the site bucket's products/ prefix.
//
// Design goal: stay inside the AWS free tier at publish volumes.
//   * one daily invocation (EventBridge) and one small JSON snapshot per day,
//   * image copies are incremental — only new/changed ETags are copied, so a
//     normal run issues no image PUTs at all,
//   * all writes go to a separate backup bucket so deleting the site bucket
//     cannot take the company data with it,
//   * no Glacier transitions (minimum storage durations are billed).
//
// Terraform wires the buckets, schedule, IAM and alarms in infra/modules/backup.

import {
  CopyObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const s3 = new S3Client({});

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing required environment variable ${name}`);
  return value;
}

const SOURCE_BUCKET = required("SOURCE_BUCKET");
const BACKUP_BUCKET = required("BACKUP_BUCKET");
const PRODUCTS_KEY = process.env.PRODUCTS_KEY || "products.json";
const IMAGE_PREFIX = process.env.IMAGE_PREFIX || "products/";
const BACKUP_IMAGE_PREFIX = process.env.BACKUP_IMAGE_PREFIX || "images/";
const SNAPSHOT_PREFIX = process.env.SNAPSHOT_PREFIX || "products/";

async function listObjects(bucket, prefix) {
  const objects = new Map();
  let continuationToken;

  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );
    for (const object of page.Contents || []) {
      if (!object.Key || object.Key.endsWith("/")) continue;
      objects.set(object.Key, {
        etag: object.ETag,
        size: object.Size,
      });
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  return objects;
}

export async function handler() {
  const capturedAt = new Date().toISOString();
  const day = capturedAt.slice(0, 10);
  const snapshotKey = `${SNAPSHOT_PREFIX}${day}/${PRODUCTS_KEY}`;
  const manifestKey = `${SNAPSHOT_PREFIX}${day}/manifest.json`;

  const live = await s3.send(
    new GetObjectCommand({ Bucket: SOURCE_BUCKET, Key: PRODUCTS_KEY })
  );
  const bytes = await live.Body.transformToByteArray();
  const products = JSON.parse(Buffer.from(bytes).toString("utf8"));
  if (!Array.isArray(products.products)) {
    throw new Error(`${PRODUCTS_KEY} has no products array; refusing to snapshot corrupt data`);
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: BACKUP_BUCKET,
      Key: snapshotKey,
      Body: bytes,
      ContentType: "application/json",
      ServerSideEncryption: "AES256",
      Metadata: {
        "source-etag": String(live.ETag || "").replaceAll('"', ""),
        "captured-at": capturedAt,
      },
    })
  );

  const [sourceImages, backedUpImages] = await Promise.all([
    listObjects(SOURCE_BUCKET, IMAGE_PREFIX),
    listObjects(BACKUP_BUCKET, BACKUP_IMAGE_PREFIX),
  ]);

  let imagesCopied = 0;
  for (const [sourceKey, source] of sourceImages) {
    const backupKey = `${BACKUP_IMAGE_PREFIX}${sourceKey.slice(IMAGE_PREFIX.length)}`;
    const existing = backedUpImages.get(backupKey);
    if (existing && existing.etag === source.etag && existing.size === source.size) {
      continue;
    }
    await s3.send(
      new CopyObjectCommand({
        Bucket: BACKUP_BUCKET,
        Key: backupKey,
        CopySource: `${SOURCE_BUCKET}/${sourceKey.split("/").map(encodeURIComponent).join("/")}`,
        MetadataDirective: "COPY",
        ServerSideEncryption: "AES256",
      })
    );
    imagesCopied += 1;
  }

  const result = {
    capturedAt,
    snapshot: `s3://${BACKUP_BUCKET}/${snapshotKey}`,
    manifest: `s3://${BACKUP_BUCKET}/${manifestKey}`,
    productsEtag: String(live.ETag || "").replaceAll('"', ""),
    productCount: products.products.length,
    imageCount: sourceImages.size,
    imagesCopied,
  };

  await s3.send(
    new PutObjectCommand({
      Bucket: BACKUP_BUCKET,
      Key: manifestKey,
      Body: JSON.stringify(result, null, 2),
      ContentType: "application/json",
      ServerSideEncryption: "AES256",
    })
  );

  console.log(JSON.stringify(result));
  return result;
}
