// Shared S3 image-key helpers for the product-image pipeline.
// Product photos live in S3 under `products/<product-id>/<name>.jpg` and are
// served through the CloudFront CDN. Responsive variants sit next to the
// source as `<name>-<width>w.<ext>` — mirror the rules here and in
// `src/lib/products.js` so render-time srcSets match what upload lambdas write.

export const IMAGE_WIDTHS = [400, 800, 1200];
export const IMAGE_EXTENSIONS = ["jpg", "webp"];

export const S3_BUCKET_KEY_RE =
  /^products\/[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*\.(jpe?g|png|webp)$/i;

export const LEGACY_IMAGE_RE = /^images\/[a-z0-9._-]+\.(jpe?g|png|webp)$/i;

// Hard ceiling on a single source photo. Enforced twice: cheaply against the
// declared content-length when signing the PUT, and authoritatively against the
// bytes actually read back in process-image (issue #23).
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

// Only real raster image types may be uploaded. The admin panel always
// re-encodes to image/jpeg client-side, so anything else is either a mistake or
// an attempt to smuggle something else through the bucket (issue #23).
export const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];

// Formats sharp is willing to treat as a photo. Checked in process-image
// against the decoded header rather than any client-declared value.
export const ALLOWED_IMAGE_FORMATS = ["jpeg", "jpg", "png", "webp", "avif"];

export const stripExt = (key) => {
  const s = String(key || "");
  const i = s.lastIndexOf(".");
  return i === -1 ? s : s.slice(0, i);
};

// `products/<id>/<name>.jpg` -> `products/<id>/<name>-400w.webp`
export const variantKeyFor = (key, width, ext) =>
  `${stripExt(key)}-${width}w.${ext}`;

export const variantsFor = (key) => {
  if (!/^products\//.test(key)) return [];
  return IMAGE_WIDTHS.flatMap((w) =>
    IMAGE_EXTENSIONS.map((ext) => variantKeyFor(key, w, ext))
  );
};

const imgsOf = (p) =>
  (p && p.images && p.images.length ? p.images : [p && p.image]).filter(Boolean);

// Every S3 object a products array depends on (sources + responsive variants).
export const referencedKeys = (products) => {
  const keys = new Set();
  for (const p of Array.isArray(products) ? products : []) {
    for (const img of imgsOf(p)) {
      if (!/^products\//.test(img)) continue;
      keys.add(img);
      for (const v of variantsFor(img)) keys.add(v);
    }
  }
  return keys;
};

// Build a unique `products/<id>/<name>.jpg` key for a new upload.
export const uniqueKeyFor = (productId, name, taken = new Set()) => {
  const safe = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "photo";
  const ext = "jpg";
  for (let n = 1; n < 200; n++) {
    const cand = `products/${productId}/${safe}-${n}.${ext}`;
    if (!taken.has(cand)) return cand;
  }
  return `products/${productId}/${safe}-${Date.now()}.${ext}`;
};

// Deterministic S3 key for an upload that has already been attempted (issue
// #23). The admin panel sends the same `uploadId` when it retries a photo, so
// both attempts resolve to the same key and the retry overwrites in place
// instead of leaving an orphan duplicate behind.
export const keyForUploadId = (productId, uploadId) => {
  const safe = String(uploadId || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!productId || !safe) return null;
  return `products/${productId}/${safe}.jpg`;
};