import { afterEach, describe, expect, test, vi } from "vitest";
import {
  slugify,
  splitSpecs,
  badgeClass,
  toDateTimeLocal,
  dataUriToBlob,
  compressImage,
} from "../src/admin/helpers.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("slugify", () => {
  test("lowercases and hyphenates runs of non-alphanumerics", () => {
    expect(slugify("  Royal  Jewellery   Box! ")).toBe("royal-jewellery-box");
    expect(slugify("Gift/Pack & Hamper")).toBe("gift-pack-hamper");
  });

  test("trims leading and trailing separators", () => {
    expect(slugify("---hello---")).toBe("hello");
  });

  test("caps the id at 40 characters", () => {
    expect(slugify("a".repeat(60))).toHaveLength(40);
  });

  test("falls back to a generated id for empty input", () => {
    expect(slugify("")).toMatch(/^product-\d+$/);
    expect(slugify(null)).toMatch(/^product-\d+$/);
    expect(slugify("!!!")).toMatch(/^product-\d+$/);
  });
});

describe("splitSpecs", () => {
  test("splits, trims and drops empty entries", () => {
    expect(splitSpecs(" Velvet finish, 12 x 8 in ,, 500 g ")).toEqual([
      "Velvet finish",
      "12 x 8 in",
      "500 g",
    ]);
  });

  test("returns an empty array for empty or missing input", () => {
    expect(splitSpecs("")).toEqual([]);
    expect(splitSpecs(null)).toEqual([]);
  });
});

describe("badgeClass", () => {
  test("maps known styles to their classes", () => {
    expect(badgeClass("gold")).toBe("bg-agold-500 text-white");
    expect(badgeClass("wine")).toBe("bg-wine-500 text-cream");
    expect(badgeClass("ink")).toBe("bg-ink text-cream");
  });

  test("falls back to gold for unknown or missing styles", () => {
    expect(badgeClass("purple")).toBe("bg-agold-500 text-white");
    expect(badgeClass(undefined)).toBe("bg-agold-500 text-white");
  });
});

describe("toDateTimeLocal", () => {
  test("converts an ISO timestamp to local datetime-local format", () => {
    const iso = new Date(2026, 0, 2, 3, 4).toISOString();
    expect(toDateTimeLocal(iso)).toBe("2026-01-02T03:04");
  });

  test("returns an empty string for empty or invalid values", () => {
    expect(toDateTimeLocal("")).toBe("");
    expect(toDateTimeLocal(null)).toBe("");
    expect(toDateTimeLocal("not-a-date")).toBe("");
  });
});

describe("dataUriToBlob", () => {
  test("decodes the base64 payload and keeps the mime type", async () => {
    const blob = dataUriToBlob("data:image/png;base64,aGVsbG8=");
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
    expect(await blob.text()).toBe("hello");
  });

  test("defaults to image/jpeg when the mime type is missing", () => {
    expect(dataUriToBlob("data:;base64,aGVsbG8=").type).toBe("image/jpeg");
  });
});

describe("compressImage", () => {
  const DATA_URI = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

  function stubCanvas() {
    const context = { drawImage: vi.fn() };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toDataURL: vi.fn(() => DATA_URI),
    };
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag) =>
      String(tag).toLowerCase() === "canvas" ? canvas : realCreate(tag)
    );
    return { canvas, context };
  }

  function stubImage(width, height) {
    class FakeImage {
      constructor() {
        this.width = width;
        this.height = height;
        this.onload = null;
        this.onerror = null;
      }
      set src(value) {
        this._src = value;
        queueMicrotask(() => this.onload && this.onload());
      }
      get src() {
        return this._src;
      }
    }
    vi.stubGlobal("Image", FakeImage);
  }

  function stubFileReader(result) {
    class FakeFileReader {
      readAsDataURL() {
        this.result = result;
        queueMicrotask(() => this.onload && this.onload());
      }
    }
    vi.stubGlobal("FileReader", FakeFileReader);
  }

  test("downscales to a max dimension of 1600px and records dimensions", async () => {
    stubFileReader("data:image/jpeg;base64,AAAA");
    stubImage(3200, 1600);
    const { canvas, context } = stubCanvas();

    const out = await compressImage({ name: "box.jpg" });

    expect(out.name).toBe("box.jpg");
    expect(out.dataURI).toBe(DATA_URI);
    expect(out.width).toBe(1600);
    expect(out.height).toBe(800);
    expect(out.size).toBeGreaterThan(0);
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(800);
    expect(context.drawImage).toHaveBeenCalled();
  });

  test("does not upscale images smaller than the ceiling", async () => {
    stubFileReader("data:image/jpeg;base64,AAAA");
    stubImage(800, 400);
    stubCanvas();

    const out = await compressImage({ name: "small.jpg" });
    expect(out.width).toBe(800);
    expect(out.height).toBe(400);
  });

  test("defaults the filename when the file has none", async () => {
    stubFileReader("data:image/jpeg;base64,AAAA");
    stubImage(100, 100);
    stubCanvas();

    const out = await compressImage({});
    expect(out.name).toBe("photo.jpg");
  });

  test("rejects when the image cannot be decoded", async () => {
    class FailingImage {
      set src(_value) {
        queueMicrotask(() => this.onerror && this.onerror(new Error("bad image")));
      }
    }
    vi.stubGlobal("Image", FailingImage);
    stubFileReader("data:image/jpeg;base64,AAAA");
    stubCanvas();

    await expect(compressImage({ name: "bad.jpg" })).rejects.toThrow("bad image");
  });
});
