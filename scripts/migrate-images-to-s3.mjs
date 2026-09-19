import { S3Client, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { LEGACY_IMAGE_RE, IMAGE_WIDTHS, IMAGE_EXTENSIONS, variantKeyFor } from "../netlify/lib/images.mjs";

// One-time migration: upload every product image currently living in the repo
// (public/images/*) to the S3 bucket under `products/<id>/<name>.jpg`, generate
// the responsive variants, and rewrite products.json so it carries only the new
// S3 references + metadata. The new products.json is written in place; commit it
// (and re-deploy) once the CDN URLs verify.
//
// Usage (needs AWS credentials in env or via ~/.aws):
//   AWS_REGION=ap-south-1 S3_BUCKET=riddhi-siddhi-gift-pack-prod \
//     node scripts/migrate-images-to-s3.mjs
//   node scripts/migrate-images-to-s3.mjs --dry-run   # preview only

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(SCRIPT_DIR, "../public");
const PRODUCTS_FILE = resolve(PUBLIC, "products.json");
const IMG_DIR = resolve(PUBLIC, "images");

const CACHE_IMMUTABLE = "public, max-age=31536000, immutable";
const VERSION_QUALITY = { jpg: 82, webp: 80 };

const imgsOf = (p) =>
  (p && p.images && p.images.length ? p.images : [p && p.image]).filter(Boolean);

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    console.error("S3_BUCKET env var is required (e.g. S3_BUCKET=riddhi-siddhi-gift-pack-prod).");
    process.exit(1);
  }

  const { products } = JSON.parse(readFileSync(PRODUCTS_FILE, "utf8"));
  const s3 = new S3Client({ region: process.env.AWS_REGION || "ap-south-1" });

  const exists = async (key) => {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (e) {
      if (e?.name === "NotFound" || e?.name === "NoSuchKey") return false;
      throw e;
    }
  };

  const put = async (key, data, contentType) => {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
        CacheControl: CACHE_IMMUTABLE,
      })
    );
  };

  const readLocal = async (file) => {
    const abs = resolve(IMG_DIR, file);
    if (!existsSync(abs)) return null;
    const buf = readFileSync(abs);
    const meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height) return null;
    return { buf, width: meta.width, height: meta.height };
  };

  const metaLocal = async (relFile) => {
    const abs = resolve(IMG_DIR, relFile);
    if (!existsSync(abs)) return null;
    const buf = readFileSync(abs);
    const meta = await sharp(buf).metadata();
    return { width: meta.width, height: meta.height, size: buf.byteLength };
  };

  // Legacy image ref -> S3 key, computed once per unique file.
  const keys = new Map(); // "images/x.jpg" -> "products/<id>/<base>.jpg"
  for (const p of products) {
    for (const img of imgsOf(p)) {
      if (!LEGACY_IMAGE_RE.test(img) || keys.has(img)) continue;
      const base = img.replace(/^images\//, "").replace(/\.(jpe?g|png|webp)$/i, "");
      keys.set(img, `products/${p.id}/${base}.jpg`);
    }
  }

  // Upload each unique file (source + responsive variants) once.
  const uploaded = new Set();
  let uploadedCount = 0;
  let alreadyCount = 0;
  let missing = 0;

  for (const [img, key] of keys) {
    const relFile = img.replace(/^images\//, "");
    const local = await readLocal(relFile);
    if (!local) {
      console.error(`  ! missing file for "${img}" — skipping`);
      missing++;
      continue;
    }

    if (dryRun) {
      console.log(`  [dry] ${img} -> ${key} (${local.width}x${local.height})`);
      uploaded.add(key);
      continue;
    }

    if (await exists(key)) {
      console.log(`  = already on S3: ${key}`);
      alreadyCount++;
      uploaded.add(key);
      continue;
    }

    await put(key, local.buf, "image/jpeg");
    for (const width of IMAGE_WIDTHS) {
      const resized = sharp(local.buf).resize({ width, withoutEnlargement: true });
      for (const ext of IMAGE_EXTENSIONS) {
        const vBuf = await (ext === "webp"
          ? resized.clone().webp({ quality: VERSION_QUALITY.webp })
          : resized.clone().jpeg({ quality: VERSION_QUALITY.jpg, mozjpeg: true })
        ).toBuffer();
        await put(variantKeyFor(key, width, ext), vBuf, `image/${ext}`);
      }
    }
    uploaded.add(key);
    uploadedCount++;
    console.log(`  + uploaded ${key} (${IMAGE_WIDTHS.length * IMAGE_EXTENSIONS.length} variants)`);
  }

  // Rewrite products.json with S3 refs + recorded metadata.
  const next = [];
  for (const p of products) {
    const source = imgsOf(p);
    const images = source.map((img) => keys.get(img) || img);
    const imagesMeta = [];
    for (const img of source) {
      const key = keys.get(img);
      if (!key) continue;
      const relFile = img.replace(/^images\//, "");
      const meta = await metaLocal(relFile);
      if (meta) imagesMeta.push({ path: key, ...meta });
    }
    next.push({
      ...p,
      image: source.length ? images[0] : p.image,
      images,
      imagesMeta: imagesMeta.length ? imagesMeta : p.imagesMeta,
    });
  }

  if (dryRun) {
    console.log("\nDry run only — nothing was uploaded or written.");
    return;
  }

  writeFileSync(PRODUCTS_FILE, JSON.stringify({ products: next }, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${PRODUCTS_FILE}`);
  console.log(`Summary: uploaded ${uploadedCount}, already on S3 ${alreadyCount}, missing ${missing}.`);
  console.log("\nNext steps:");
  console.log("  1. Open the site and confirm the CDN serves product images.");
  console.log("  2. Commit public/products.json so the live site re-deploys.");
  console.log("  3. Afterwards, remove the now-unused public/images/* and public/images/responsive/* .");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});