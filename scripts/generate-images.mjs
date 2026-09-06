import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname ?? ".");
const IMG_DIR = join(ROOT, "..", "public", "images");
const OUT_DIR = join(IMG_DIR, "responsive");

const WIDTHS = [400, 800, 1200];
const JPG_QUALITY = 82;
const WEBP_QUALITY = 80;

function hasTool(name) {
  try {
    execFileSync("which", [name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const cwebp = hasTool("cwebp");

const baseName = (file) => file.replace(/\.jpe?g$/i, "");

function jpgVariant(srcPath, file, w) {
  const out = join(OUT_DIR, `${baseName(file)}-${w}w.jpg`);
  if (isFresh(out, srcPath)) return false;
  const tmp = join("/tmp", `rsg-${Date.now()}-${w}.jpg`);
  execFileSync("sips", ["--resampleWidth", String(w), "-s", "format", "jpeg", "-s", "formatOptions", String(JPG_QUALITY), srcPath, "--out", tmp]);
  execFileSync("mv", [tmp, out]);
  return true;
}

function webpVariant(srcPath, file, w) {
  const out = join(OUT_DIR, `${baseName(file)}-${w}w.webp`);
  if (isFresh(out, srcPath)) return false;
  if (!cwebp) {
    throw new Error("cwebp (from webp) is required to generate WebP variants. Install with: brew install webp");
  }
  const tmp = join("/tmp", `rsg-${Date.now()}-${w}.jpg`);
  execFileSync("sips", ["--resampleWidth", String(w), "-s", "format", "jpeg", "-s", "formatOptions", "92", srcPath, "--out", tmp]);
  execFileSync("cwebp", ["-quiet", "-q", String(WEBP_QUALITY), tmp, "-o", out]);
  execFileSync("rm", ["-f", tmp]);
  return true;
}

function isFresh(candidate, source) {
  if (!existsSync(candidate) || !existsSync(source)) return false;
  return statSync(candidate).mtimeMs >= statSync(source).mtimeMs;
}

mkdirSync(OUT_DIR, { recursive: true });

const sources = readdirSync(IMG_DIR).filter((f) => /\.jpe?g$/i.test(f));

let created = 0;
let skipped = 0;

for (const file of sources) {
  const srcPath = join(IMG_DIR, file);
  for (const w of WIDTHS) {
    if (jpgVariant(srcPath, file, w)) created++;
    else skipped++;
    if (webpVariant(srcPath, file, w)) created++;
    else skipped++;
  }
}

console.log(`Responsive images ready in ${OUT_DIR}`);
console.log(`  generated: ${created}  (up-to-date: ${skipped})`);