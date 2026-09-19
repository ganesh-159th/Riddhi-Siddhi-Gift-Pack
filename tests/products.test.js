import { expect, test } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  imgsOf,
  quoteMsgFor,
  imgUrl,
  imgSrcSet,
  webpSrcSet,
  metaOf,
  IMG_WIDTHS,
} from "../src/lib/products.js";
import { S3_BUCKET_KEY_RE, LEGACY_IMAGE_RE, variantKeyFor, referencedKeys } from "../netlify/lib/images.mjs";

const PUBLIC = resolve(import.meta.dirname, "../public");
const IMAGES = join(PUBLIC, "images");
const { products } = JSON.parse(readFileSync(join(PUBLIC, "products.json"), "utf8"));

const imageFiles = existsSync(IMAGES) ? readdirSync(IMAGES) : [];

test("products.json is a non-empty array", () => {
  expect(Array.isArray(products)).toBe(true);
  expect(products.length).toBeGreaterThan(0);
});

test("every product has required fields", () => {
  for (const p of products) {
    expect(p.id, `${p.name}: missing id`).toBeTruthy();
    expect(typeof p.name, `${p.id}: name`).toBe("string");
    expect(typeof p.tagline, `${p.id}: tagline`).toBe("string");
    expect(typeof p.image, `${p.id}: image`).toBe("string");
    expect(typeof p.alt, `${p.id}: alt`).toBe("string");
  }
});

test("every image reference is either a local image or a valid S3 key", () => {
  for (const p of products) {
    for (const img of imgsOf(p)) {
      expect(
        LEGACY_IMAGE_RE.test(img) || S3_BUCKET_KEY_RE.test(img) || /^https?:\/\//.test(img),
        `${img} (product ${p.id}) is not a valid image reference`
      ).toBe(true);
    }
  }
});

test("legacy images referenced by products exist in public/images", () => {
  for (const p of products) {
    for (const img of imgsOf(p)) {
      if (!LEGACY_IMAGE_RE.test(img)) continue;
      const name = String(img).replace(/^images\//, "");
      expect(imageFiles, `${img} (product ${p.id})`).toContain(name);
    }
  }
});

test("referencedKeys derives the full S3 object set for a products payload", () => {
  const result = referencedKeys([{ image: "products/a/b-1.jpg", images: ["products/a/b-1.jpg", "products/a/b-2.jpg"] }]);
  for (const key of ["products/a/b-1.jpg", "products/a/b-2.jpg"]) {
    expect(result).toContain(key);
    for (const w of IMG_WIDTHS) {
      expect(result).toContain(variantKeyFor(key, w, "jpg"));
      expect(result).toContain(variantKeyFor(key, w, "webp"));
    }
  }
  // Legacy repo images are not S3-managed and must be ignored by cleanup.
  expect(referencedKeys([{ image: "images/legacy.jpg" }])).toEqual(new Set());
});

test("imgsOf returns all images, falling back to the single image", () => {
  const multi = { image: "images/a.jpg", images: ["images/a.jpg", "images/b.jpg"] };
  const single = { image: "images/a.jpg" };
  const none = { image: "images/a.jpg", images: [] };
  expect(imgsOf(multi)).toEqual(["images/a.jpg", "images/b.jpg"]);
  expect(imgsOf(single)).toEqual(["images/a.jpg"]);
  expect(imgsOf(none)).toEqual(["images/a.jpg"]);
  expect(imgsOf(null)).toEqual([]);
});

test("imgUrl resolves CDN, legacy and absolute references", () => {
  const cdn = imgUrl("products/jewellery-box/b-1.jpg");
  expect(cdn).toMatch(/^https:\/\/[^/]+\/products\/jewellery-box\/b-1\.jpg$/);
  expect(imgUrl("https://cdn.example.com/x.jpg")).toBe("https://cdn.example.com/x.jpg");
  expect(imgUrl("images/legacy.jpg")).toContain("images/legacy.jpg");
});

test("imgSrcSet/webpSrcSet build widths from CDN and legacy sources", () => {
  const cdn = imgSrcSet("products/jewellery-box/b-1.jpg");
  for (const w of IMG_WIDTHS) {
    expect(cdn).toContain(`${w}w`);
    expect(cdn).toContain(`-${w}w.jpg`);
    expect(imgSrcSet("products/jewellery-box/b-1.jpg")).toMatch(/^https:\/\//);
  }
  for (const w of IMG_WIDTHS) {
    expect(webpSrcSet("products/jewellery-box/b-1.jpg")).toContain(`-${w}w.webp`);
  }
  // Legacy repo images keep the same-origin responsive folder behaviour.
  expect(imgSrcSet("images/legacy.jpg")).toContain("responsive/legacy-400w.jpg");
});

test("metaOf returns recorded image metadata by path", () => {
  const meta = { path: "products/a/b-1.jpg", width: 1200, height: 900, size: 204800 };
  expect(metaOf({ imagesMeta: [meta] }, "products/a/b-1.jpg")).toEqual(meta);
  expect(metaOf({ imagesMeta: [meta] }, "products/a/other.jpg")).toBeNull();
  expect(metaOf({}, "products/a/b-1.jpg")).toBeNull();
});

test("quoteMsgFor uses the product quoteNote when present", () => {
  const p = { name: "Jewellery Boxes", quoteNote: "Need 500 boxes." };
  expect(quoteMsgFor(p)).toContain("Need 500 boxes.");
  expect(quoteMsgFor({ name: "Jewellery Boxes" })).toContain("Jewellery Boxes");
});