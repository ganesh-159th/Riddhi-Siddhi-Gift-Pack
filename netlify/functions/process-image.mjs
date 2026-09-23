import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { S3_BUCKET_KEY_RE, IMAGE_WIDTHS, IMAGE_EXTENSIONS, variantKeyFor } from "../lib/images.mjs";
import { verifySession } from "../lib/session.mjs";

// After the admin panel PUTs a photo via its presigned URL, this function reads
// the object back from S3, generates the responsive jpg/webp variants and
// records image metadata (path, dimensions, byte size) so the frontend can
// render srcSets straight from the CDN.

const JSON_STATIC = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: JSON_STATIC });

const VERSION_QUALITY = { jpg: 82, webp: 80 };
const CACHE_IMMUTABLE = "public, max-age=31536000, immutable";

export default async (req) => {
  if (req.method === "OPTIONS") return json(200, { ok: true });

  const secret = process.env.JWT_SECRET;
  const bucket = process.env.S3_BUCKET;

  if (!secret) {
    return json(500, {
      ok: false,
      message: "Server is missing JWT_SECRET. Publishing is disabled until it is set.",
    });
  }
  if (!bucket) {
    return json(500, {
      ok: false,
      message: "Server is missing S3_BUCKET. Set it in the site settings.",
    });
  }
  if (req.method !== "POST") return json(405, { ok: false, message: "Method not allowed" });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, message: "Invalid JSON body." });
  }

  if (!verifySession(body.token, secret)) {
    return json(401, { ok: false, message: "Invalid or expired admin session. Log in again in the admin panel." });
  }

  const key = typeof body.key === "string" ? body.key : "";
  if (!S3_BUCKET_KEY_RE.test(key)) {
    return json(400, { ok: false, message: `Invalid image key: ${key}` });
  }

  const s3 = new S3Client({ region: process.env.AWS_REGION || "ap-south-1" });

  const getObject = async (k) => {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: k }));
    return Buffer.from(await res.Body.transformToByteArray());
  };

  const putObject = async (k, data, contentType) => {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: k,
        Body: data,
        ContentType: contentType,
        CacheControl: CACHE_IMMUTABLE,
      })
    );
  };

  let source;
  try {
    source = await getObject(key);
  } catch (e) {
    const msg = e?.name === "NoSuchKey" ? "Nothing was uploaded for this image yet." : `S3 read failed — ${e?.message || e}`;
    return json(502, { ok: false, message: msg });
  }

  try {
    const meta = await sharp(source).metadata();
    if (!meta.width || !meta.height) {
      return json(400, { ok: false, message: "Uploaded file is not a readable image." });
    }

    const pipe = sharp(source);
    const variants = [];

    for (const width of IMAGE_WIDTHS) {
      const resized = pipe.clone().resize({ width, withoutEnlargement: true });
      for (const ext of IMAGE_EXTENSIONS) {
        const vKey = variantKeyFor(key, width, ext);
        const vBuf = await (ext === "webp"
          ? resized.clone().webp({ quality: VERSION_QUALITY.webp })
          : resized.clone().jpeg({ quality: VERSION_QUALITY.jpg, mozjpeg: true })
        ).toBuffer();
        await putObject(vKey, vBuf, `image/${ext}`);
        variants.push({ path: vKey, width, ext, size: vBuf.byteLength });
      }
    }

    return json(200, {
      ok: true,
      metadata: {
        path: key,
        width: meta.width,
        height: meta.height,
        size: source.byteLength,
      },
      variants,
    });
  } catch (e) {
    return json(502, { ok: false, message: "Image processing failed — " + (e?.message || e) });
  }
};