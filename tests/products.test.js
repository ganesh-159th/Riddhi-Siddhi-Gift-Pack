import { afterEach, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  imgsOf,
  quoteMsgFor,
  imgUrl,
  imgSrcSet,
  webpSrcSet,
  metaOf,
  isScheduled,
  fetchProducts,
  IMG_WIDTHS,
} from "../src/lib/products.js";
import { S3_BUCKET_KEY_RE, LEGACY_IMAGE_RE, variantKeyFor, referencedKeys } from "../shared/images.mjs";

const PUBLIC = resolve(import.meta.dirname, "../public");
const { products } = JSON.parse(readFileSync(join(PUBLIC, "products.json"), "utf8"));

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
afterEach(() => {
  vi.restoreAllMocks();
});

test("isScheduled only treats valid future dates as scheduled", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  expect(isScheduled({ publishAt: "2026-06-01T00:00:00.000Z" }, now)).toBe(true);
  expect(isScheduled({ publishAt: "2025-06-01T00:00:00.000Z" }, now)).toBe(false);
  expect(isScheduled({ publishAt: "not-a-date" }, now)).toBe(false);
  expect(isScheduled({}, now)).toBe(false);
  expect(isScheduled(null, now)).toBe(false);
});

test("fetchProducts loads the catalogue and filters out scheduled products", async () => {
  const now = Date.now();
  const payload = {
    products: [
      { id: "live", name: "Live" },
      { id: "future", name: "Future", publishAt: new Date(now + 86400000).toISOString() },
      { id: "past", name: "Past", publishAt: new Date(now - 86400000).toISOString() },
    ],
  };
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue({ ok: true, json: async () => payload });

  await expect(fetchProducts()).resolves.toEqual([
    { id: "live", name: "Live" },
    { id: "past", name: "Past", publishAt: payload.products[2].publishAt },
  ]);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, options] = fetchMock.mock.calls[0];
  expect(String(url)).toMatch(/products\.json$/);
  expect(options).toEqual({ cache: "no-store" });
});

test("fetchProducts rejects when the response is not ok", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 503 });
  await expect(fetchProducts()).rejects.toThrow("products.json 503");
});

test("fetchProducts treats a missing products field as an empty catalogue", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({}) });
  await expect(fetchProducts()).resolves.toEqual([]);
});

test("fetchProducts propagates network failures", async () => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  await expect(fetchProducts()).rejects.toThrow("offline");
});
