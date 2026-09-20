import { describe, expect, test } from "vitest";
import {
  validateProductList,
  findBrokenImages,
  computeStatuses,
  summarizeChanges,
  isScheduled,
} from "../src/admin/validate.js";

const NOW = new Date("2026-09-21T10:00:00Z");

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

describe("validateProductList", () => {
  test("accepts a well-formed product", () => {
    const { errors, warnings } = validateProductList([box()]);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  test("flags missing name and id", () => {
    const { errors } = validateProductList([box({ name: " " }), box({ id: "" })]);
    expect(errors.some((e) => e.message.includes("name is required"))).toBe(true);
    expect(errors.some((e) => e.message.includes("id is missing"))).toBe(true);
  });

  test("flags duplicate ids", () => {
    const { errors } = validateProductList([box(), box({ name: "Second Box" })]);
    expect(errors.some((e) => e.message.includes("Duplicate product id"))).toBe(true);
  });

  test("flags a product with no photos", () => {
    const { errors } = validateProductList([box({ image: "", images: [] })]);
    expect(errors.some((e) => e.message.includes("at least one photo"))).toBe(true);
  });

  test("flags bad image paths and un-uploaded photos", () => {
    const bad = validateProductList([
      box({ image: "not-a-path", images: ["not-a-path"] }),
    ]);
    expect(bad.errors.some((e) => e.message.includes("invalid image path"))).toBe(true);

    const dataUri = validateProductList([
      box({ image: "data:image/jpeg;base64,AAAA", images: ["data:image/jpeg;base64,AAAA"] }),
    ]);
    expect(dataUri.errors.some((e) => e.message.includes("un-uploaded photo"))).toBe(true);

    const s3 = validateProductList([
      box({
        image: "products/ring-box/ring-box-1.jpg",
        images: ["products/ring-box/ring-box-1.jpg"],
      }),
    ]);
    expect(s3.errors).toEqual([]);

    const url = validateProductList([
      box({ image: "https://cdn.test/x.jpg", images: ["https://cdn.test/x.jpg"] }),
    ]);
    expect(url.errors).toEqual([]);
  });

  test("warns when the same image is referenced twice", () => {
    const { warnings } = validateProductList([
      box(),
      box({ id: "chain-box", name: "Chain Box", image: "images/ring-box-1.jpg" }),
    ]);
    expect(warnings.some((w) => w.message.includes("used by"))).toBe(true);
  });

  test("flags unknown badge style and invalid publish date", () => {
    const badge = validateProductList([box({ badges: [{ text: "X", style: "neon" }] })]);
    expect(badge.errors.some((e) => e.message.includes("unknown style"))).toBe(true);

    const date = validateProductList([box({ publishAt: "not-a-date" })]);
    expect(date.errors.some((e) => e.message.includes("date is not valid"))).toBe(true);

    const fine = validateProductList([box({ publishAt: "2026-12-01T00:00:00.000Z" })]);
    expect(fine.errors).toEqual([]);
  });

  test("specs must be an array", () => {
    const { errors } = validateProductList([box({ specs: "Velvet" })]);
    expect(errors.some((e) => e.message.includes("specs must be a list"))).toBe(true);
  });
});

describe("isScheduled", () => {
  test("only future dates count as scheduled", () => {
    expect(isScheduled(box({ publishAt: "2026-12-01T00:00:00.000Z" }), NOW)).toBe(true);
    expect(isScheduled(box({ publishAt: "2026-01-01T00:00:00.000Z" }), NOW)).toBe(false);
    expect(isScheduled(box(), NOW)).toBe(false);
    expect(isScheduled(box({ publishAt: "junk" }), NOW)).toBe(false);
  });
});

describe("computeStatuses", () => {
  const live = [
    box(),
    box({ id: "chain-box", name: "Chain Box", image: "images/chain-1.jpg" }),
  ];

  test("classifies published / modified / draft / scheduled", () => {
    const { statuses } = computeStatuses(
      [
        box(),
        box({ id: "chain-box", name: "Chain Box v2", image: "images/chain-1.jpg" }),
        box({ id: "new-box", name: "New Box", image: "images/new-1.jpg" }),
        box({ id: "future-box", name: "Future Box", image: "images/f-1.jpg", publishAt: "2026-12-01T00:00:00.000Z" }),
      ],
      live,
      NOW
    );
    expect(statuses.get("ring-box").status).toBe("published");
    expect(statuses.get("chain-box").status).toBe("modified");
    expect(statuses.get("new-box").status).toBe("draft");
    expect(statuses.get("future-box").status).toBe("scheduled");
  });

  test("modified when fields differ from live", () => {
    const { statuses } = computeStatuses(
      [box({ name: "Box v2" })],
      [box({ name: "Box v1" })],
      NOW
    );
    expect(statuses.get("ring-box").status).toBe("modified");
  });

  test("lists live products removed from the draft", () => {
    const { removed } = computeStatuses([box({ id: "kept", name: "Kept", image: "images/k-1.jpg" })], live, NOW);
    expect(removed.map((r) => r.id)).toEqual(["ring-box", "chain-box"]);
  });
});

describe("summarizeChanges", () => {
  const live = [box()];

  test("counts added / updated / deleted / scheduled", () => {
    const summary = summarizeChanges(
      [
        box({ name: "Box v2", specs: ["Updated"] }),
        box({ id: "new-box", name: "New", image: "images/n-1.jpg" }),
        box({ id: "future-box", name: "Future", image: "images/f-1.jpg", publishAt: "2026-12-01T00:00:00.000Z" }),
      ],
      live,
      NOW
    );
    expect(summary).toEqual({ added: 2, updated: 1, deleted: 0, scheduled: 1 });
  });

  test("counts deleted live products", () => {
    const summary = summarizeChanges(
      [box({ id: "kept", name: "Kept", image: "images/k-1.jpg" })],
      live,
      NOW
    );
    expect(summary.deleted).toBe(1);
  });
});

describe("findBrokenImages", () => {
  test("skips pending uploads, no crash on odd inputs", async () => {
    const { missing, checked } = await findBrokenImages([], new Set());
    expect(missing).toEqual([]);
    expect(checked).toBe(0);
    // Data URIs are skipped (they can't be probed) and treated as missing-safe.
    const pending = await findBrokenImages(
      [
        box({
          image: "images/pending-1.jpg",
          images: ["images/pending-1.jpg"],
        }),
      ],
      new Set(["images/pending-1.jpg"])
    );
    expect(pending.missing).toEqual([]);
    expect(pending.checked).toBe(0);
  });
});