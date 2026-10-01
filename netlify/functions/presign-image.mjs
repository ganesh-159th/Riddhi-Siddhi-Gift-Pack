import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  ALLOWED_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  S3_BUCKET_KEY_RE,
  keyForUploadId,
  uniqueKeyFor,
} from "../lib/images.mjs";
import { verifySession } from "../lib/session.mjs";

// One-time presigned PUT URLs so the admin panel can upload product photos
// straight to S3 (never through a 1MB-limited base64 GitHub commit).
//
// The signing credentials come from Netlify site env (AWS_ACCESS_KEY_ID,
// AWS_SECRET_ACCESS_KEY, AWS_REGION) or the IAM role attached to the function.
// The S3 bucket must allow CORS PUTs from the admin origin (see README).

const JSON_STATIC = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: JSON_STATIC });

const toParam = (v) => (typeof v === "string" ? v : "");

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

  const productId = toParam(body.productId || body.slug).slice(0, 48);
  const name = toParam(body.name || "photo").slice(0, 60);
  const desiredKey = toParam(body.key);
  const uploadId = toParam(body.uploadId).slice(0, 64);
  const contentLength = Number(body.contentLength) || 0;

  if (!productId || !/^[a-z0-9._-]+$/i.test(productId)) {
    return json(400, {
      ok: false,
      message: "A product id is required (letters, numbers, dashes).",
    });
  }

  // Content-type must be a real image type. process-image re-checks the decoded
  // header, so this is the cheap first gate that keeps obviously wrong uploads
  // out of the bucket entirely (issue #23).
  const contentType = (toParam(body.contentType) || "image/jpeg").toLowerCase().trim();
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    return json(400, {
      ok: false,
      message: `Unsupported image type "${contentType}". Use one of: ${ALLOWED_CONTENT_TYPES.join(", ")}.`,
    });
  }

  // contentLength is client-declared and therefore advisory; process-image
  // enforces the same ceiling against the real bytes. Require it to be present
  // so an omitted value can't skip the check here (issue #23).
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return json(400, { ok: false, message: "Could not read the photo's size. Try the upload again." });
  }
  if (contentLength > MAX_UPLOAD_BYTES) {
    return json(400, {
      ok: false,
      message: "Image is too large. Keep uploads under 15 MB.",
    });
  }

  const taken = new Set(
    Array.isArray(body.taken)
      ? body.taken.filter((k) => typeof k === "string")
      : []
  );

  // Idempotency (issue #23): a retried upload sends the same uploadId, which
  // maps to the same key every time, so the retry overwrites the earlier object
  // instead of leaving a second copy behind for the orphan sweep to clean up.
  const idemKey = uploadId ? keyForUploadId(productId, uploadId) : null;
  const key =
    idemKey ||
    (desiredKey && S3_BUCKET_KEY_RE.test(desiredKey) && !taken.has(desiredKey)
      ? desiredKey
      : uniqueKeyFor(productId, name, taken));

  if (!S3_BUCKET_KEY_RE.test(key)) {
    return json(400, { ok: false, message: `Invalid image key: ${key}` });
  }

  const s3 = new S3Client({ region: process.env.AWS_REGION || "ap-south-1" });

  try {
    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: contentLength,
        CacheControl: "public, max-age=31536000, immutable",
      }),
      { expiresIn: 300 }
    );
    return json(200, {
      ok: true,
      uploadUrl,
      key,
      uploadId: uploadId || null,
      contentType,
      expiresIn: 300,
    });
  } catch (e) {
    return json(502, {
      ok: false,
      message: "Could not create upload link — " + (e.message || e),
    });
  }
};