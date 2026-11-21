import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateProducts, prepareProducts, LIMITS } from "../shared/schema.mjs";
import { keyForUploadId, S3_BUCKET_KEY_RE, MAX_UPLOAD_BYTES } from "../shared/images.mjs";

// Server-side guarantees added in issue #23: the catalogue is validated before
// it reaches GitHub, and an upload retried under the same uploadId always lands
// on the same S3 key.

const box = (over = {}) => ({
  id: "ring-box",
  name: "Ring Box",
  tagline: "Velvet-lined gift box",
  specs: ["Velvet Lined"],
  image: "images/ring-box-1.jpg",
  images: ["images/ring-box-1.jpg"],
  alt: "Ring box",
  badges: [{ text: "B2B", style: "gold" }],
  quoteNote: "Please share pricing.",
  ...over,
});

const ids = (errors) => errors.map((e) => e.message);

// ---- validation ----

describe("validateProducts", () => {
  test("accepts the shape the admin panel produces", () => {
    const { errors, warnings } = validateProducts([box()]);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  test("accepts an S3-uploaded product with recorded metadata", () => {
    const meta = { path: "products/ring-box/ring-box-1.jpg", width: 1200, height: 900, size: 2048 };
    const { errors } = validateProducts([
      box({
        image: meta.path,
        images: [meta.path],
        imagesMeta: [meta],
      }),
    ]);
    expect(errors).toEqual([]);
  });

  test("rejects a non-array payload", () => {
    expect(ids(validateProducts(null).errors)).toContain('A "products" array is required.');
    expect(ids(validateProducts({}).errors)).toContain('A "products" array is required.');
  });

  test("rejects a product that is not an object", () => {
    const { errors } = validateProducts(["not-a-product"]);
    expect(ids(errors).some((m) => m.includes("must be an object"))).toBe(true);
  });

  test("requires name and id", () => {
    const { errors } = validateProducts([box({ name: "  " }), box({ id: "" })]);
    expect(ids(errors).some((m) => m.includes("name is required"))).toBe(true);
    expect(ids(errors).some((m) => m.includes("id is missing"))).toBe(true);
  });

  test("rejects ids that could break an S3 key", () => {
    const { errors } = validateProducts([box({ id: "bad id/../etc" })]);
    expect(ids(errors).some((m) => m.includes("may only use"))).toBe(true);
  });

  test("rejects duplicate ids regardless of case", () => {
    const { errors } = validateProducts([box(), box({ id: "RING-BOX", name: "Second" })]);
    expect(ids(errors).some((m) => m.includes("Duplicate product id"))).toBe(true);
  });

  test("rejects a product with no photos", () => {
    const { errors } = validateProducts([box({ image: "", images: [] })]);
    expect(ids(errors).some((m) => m.includes("at least one photo"))).toBe(true);
  });

  test("rejects un-uploaded data URIs and malformed paths", () => {
    const dataUri = validateProducts([
      box({ image: "data:image/jpeg;base64,AAA", images: ["data:image/jpeg;base64,AAA"] }),
    ]);
    expect(ids(dataUri.errors).some((m) => m.includes("un-uploaded photo"))).toBe(true);

    const bad = validateProducts([box({ image: "../../etc/passwd", images: ["../../etc/passwd"] })]);
    expect(ids(bad.errors).some((m) => m.includes("invalid image path"))).toBe(true);
  });

  test("accepts absolute image URLs", () => {
    const { errors } = validateProducts([
      box({ image: "https://cdn.test/x.jpg", images: ["https://cdn.test/x.jpg"] }),
    ]);
    expect(errors).toEqual([]);
  });

  test("enforces the per-field size limits", () => {
    const long = validateProducts([box({ name: "x".repeat(LIMITS.name + 1) })]);
    expect(ids(long.errors).some((m) => m.includes("name is longer than"))).toBe(true);

    const photos = validateProducts([
      box({
        image: "images/a.jpg",
        images: Array.from({ length: LIMITS.images + 1 }, (_, i) => `images/a-${i}.jpg`),
      }),
    ]);
    expect(ids(photos.errors).some((m) => m.includes("photos. The limit is"))).toBe(true);

    const specs = validateProducts([box({ specs: Array(LIMITS.specs + 1).fill("x") })]);
    expect(ids(specs.errors).some((m) => m.includes("specs. The limit is"))).toBe(true);

    const badges = validateProducts([
      box({ badges: Array.from({ length: LIMITS.badges + 1 }, () => ({ text: "x", style: "gold" })) }),
    ]);
    expect(ids(badges.errors).some((m) => m.includes("badges. The limit is"))).toBe(true);
  });

  test("rejects a payload with more products than the cap", () => {
    const many = Array.from({ length: LIMITS.products + 1 }, (_, i) => box({ id: `p-${i}` }));
    const { errors } = validateProducts(many);
    expect(ids(errors).some((m) => m.includes("Too many products"))).toBe(true);
  });

  test("rejects wrong types for text, list and metadata fields", () => {
    expect(ids(validateProducts([box({ tagline: 42 })]).errors).some((m) => m.includes("tagline must be text"))).toBe(true);
    expect(ids(validateProducts([box({ specs: "Velvet" })]).errors).some((m) => m.includes("specs must be a list"))).toBe(true);
    expect(ids(validateProducts([box({ badges: "gold" })]).errors).some((m) => m.includes("badges must be a list"))).toBe(true);
    expect(ids(validateProducts([box({ imagesMeta: {} })]).errors).some((m) => m.includes("metadata must be a list"))).toBe(true);
  });

  test("rejects unknown badge styles and invalid publish dates", () => {
    expect(
      ids(validateProducts([box({ badges: [{ text: "X", style: "neon" }] })]).errors).some((m) =>
        m.includes("unknown style")
      )
    ).toBe(true);
    expect(
      ids(validateProducts([box({ publishAt: "not-a-date" })]).errors).some((m) =>
        m.includes("date is not valid")
      )
    ).toBe(true);
    expect(validateProducts([box({ publishAt: "2026-12-01T00:00:00.000Z" })]).errors).toEqual([]);
  });

  test("rejects image metadata with a bad path or negative dimensions", () => {
    const badPath = validateProducts([
      box({ imagesMeta: [{ path: "nope.jpg", width: 10, height: 10, size: 1 }] }),
    ]);
    expect(ids(badPath.errors).some((m) => m.includes("invalid path"))).toBe(true);

    const neg = validateProducts([
      box({
        imagesMeta: [{ path: "images/ring-box-1.jpg", width: -1, height: 10, size: 1 }],
      }),
    ]);
    expect(ids(neg.errors).some((m) => m.includes("invalid width"))).toBe(true);
  });

  test("warns, but does not block, on a reused image", () => {
    const { errors, warnings } = validateProducts([
      box(),
      box({ id: "chain-box", name: "Chain Box", image: "images/ring-box-1.jpg" }),
    ]);
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.message.includes("used by"))).toBe(true);
  });
});

// ---- prepareProducts ----

describe("prepareProducts", () => {
  test("returns errors instead of products when invalid", () => {
    const out = prepareProducts([box({ name: "" })]);
    expect(out.products).toBeUndefined();
    expect(out.errors.length).toBeGreaterThan(0);
  });

  test("strips unknown keys so nothing unexpected is committed", () => {
    const { products } = prepareProducts([
      box({ secret: "x", __proto__: { polluted: true }, nested: { a: 1 } }),
    ]);
    expect(products[0].secret).toBeUndefined();
    expect(products[0].nested).toBeUndefined();
    expect(products[0].name).toBe("Ring Box");
  });

  test("normalises image and images to agree with each other", () => {
    const { products } = prepareProducts([
      box({ image: "images/a.jpg", images: ["images/a.jpg", "images/b.jpg"] }),
    ]);
    expect(products[0].image).toBe("images/a.jpg");
    expect(products[0].images).toEqual(["images/a.jpg", "images/b.jpg"]);
  });

  test("the committed products.json passes the server-side schema", () => {
    const file = JSON.parse(
      readFileSync(join(resolve(import.meta.dirname, "../public"), "products.json"), "utf8")
    );
    expect(validateProducts(file.products).errors).toEqual([]);
    const { products } = prepareProducts(file.products);
    expect(products.length).toBe(file.products.length);
  });
});

// ---- upload idempotency ----

describe("keyForUploadId", () => {
  test("is stable, so a retry overwrites the same object", () => {
    const a = keyForUploadId("ring-box", "ring-box-1");
    const b = keyForUploadId("ring-box", "ring-box-1");
    expect(a).toBe(b);
    expect(S3_BUCKET_KEY_RE.test(a)).toBe(true);
  });

  test("normalises hostile or empty upload ids", () => {
    expect(keyForUploadId("ring-box", "../../etc/passwd")).toMatch(
      /^products\/ring-box\/[a-z0-9][a-z0-9._-]*\.jpg$/
    );
    expect(keyForUploadId("ring-box", "")).toBeNull();
    expect(keyForUploadId("", "ring-box-1")).toBeNull();
  });

  test("different products never collide", () => {
    expect(keyForUploadId("a", "photo-1")).not.toBe(keyForUploadId("b", "photo-1"));
  });

  test("the upload ceiling is a sane number of bytes", () => {
    expect(MAX_UPLOAD_BYTES).toBeGreaterThanOrEqual(1024 * 1024);
  });
});