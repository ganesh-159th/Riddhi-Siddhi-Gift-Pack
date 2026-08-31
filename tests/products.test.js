import { expect, test } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { imgsOf, quoteMsgFor } from "../src/lib/products.js";

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

test("every referenced image exists in public/images", () => {
  for (const p of products) {
    for (const img of imgsOf(p)) {
      const name = String(img).replace(/^images\//, "");
      expect(imageFiles, `${img} (product ${p.id})`).toContain(name);
    }
  }
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

test("quoteMsgFor uses the product quoteNote when present", () => {
  const p = { name: "Jewellery Boxes", quoteNote: "Need 500 boxes." };
  expect(quoteMsgFor(p)).toContain("Need 500 boxes.");
  expect(quoteMsgFor({ name: "Jewellery Boxes" })).toContain("Jewellery Boxes");
});