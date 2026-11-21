import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { signSession } from "../shared/session.mjs";
import { keyForUploadId, S3_BUCKET_KEY_RE, ALLOWED_CONTENT_TYPES } from "../shared/images.mjs";

// Captures the command the function asks the AWS SDK to sign. Mocking the module
// (rather than a global) is required because getSignedUrl is an ESM binding.
const signed = [];
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: async (_client, command) => {
    signed.push(command.input);
    return "https://s3.test/signed";
  },
}));

const { default: presignImage } = await import("../lambda/handlers/presign-image.mjs");

// Upload guards from issue #23: a presigned PUT is only issued for a real image
// type and a declared size inside the ceiling, and the same uploadId always
// resolves to the same S3 key so a retry can't duplicate the object.

const post = (body) => ({ method: "POST", json: async () => body });

const ENV_KEYS = ["JWT_SECRET", "S3_BUCKET", "AWS_REGION"];
let savedEnv;

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.JWT_SECRET = "test-secret";
  process.env.S3_BUCKET = "test-bucket";
  delete process.env.AWS_REGION;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.unstubAllGlobals();
});

const token = () => signSession("test-secret", 1).token;

const base = (over = {}) => ({
  token: token(),
  productId: "ring-box",
  name: "photo.jpg",
  contentLength: 2048,
  ...over,
});

const call = async (body) => {
  signed.length = 0;
  const res = await presignImage(post(base(body)));
  return { status: res.status, body: await res.json(), seen: [...signed] };
};

describe("presign-image upload guards (issue #23)", () => {
  test("issues a signed URL for a valid photo", async () => {
    const { status, body, seen } = await call({ uploadId: "ring-box-1" });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.uploadId).toBe("ring-box-1");
    expect(S3_BUCKET_KEY_RE.test(body.key)).toBe(true);
    // The declared size and type are signed into the PUT, not just logged.
    expect(seen[0].ContentLength).toBe(2048);
    expect(seen[0].ContentType).toBe("image/jpeg");
  });

  test("rejects a non-image content type", async () => {
    for (const bad of ["text/html", "application/pdf", "image/gif", "application/octet-stream"]) {
      const { status, body, seen } = await call({ contentType: bad, uploadId: "x" });
      expect(status, bad).toBe(400);
      expect(body.message).toContain("Unsupported image type");
      expect(seen).toHaveLength(0);
    }
  });

  test("accepts every allow-listed image type", async () => {
    for (const ok of ALLOWED_CONTENT_TYPES) {
      const { status } = await call({ contentType: ok, uploadId: "x" });
      expect(status, ok).toBe(200);
    }
  });

  test("rejects a photo over the size ceiling", async () => {
    const { status, body, seen } = await call({
      contentLength: 16 * 1024 * 1024,
      uploadId: "x",
    });
    expect(status).toBe(400);
    expect(body.message).toMatch(/too large/i);
    expect(seen).toHaveLength(0);
  });

  test("rejects a missing or zero length instead of skipping the check", async () => {
    for (const len of [undefined, 0, null, "abc"]) {
      const { status, body } = await call({ contentLength: len, uploadId: "x" });
      expect(status, String(len)).toBe(400);
      expect(body.message).toMatch(/size/i);
    }
  });

  test("a retry with the same uploadId gets the same key", async () => {
    const first = await call({ uploadId: "ring-box-1" });
    const second = await call({ uploadId: "ring-box-1" });
    expect(second.body.key).toBe(first.body.key);
    expect(first.body.key).toBe(keyForUploadId("ring-box", "ring-box-1"));
  });

  test("a different uploadId gets a different key", async () => {
    const a = await call({ uploadId: "ring-box-1" });
    const b = await call({ uploadId: "ring-box-2" });
    expect(a.body.key).not.toBe(b.body.key);
  });

  test("the uploadId path ignores the client's taken list, so retries can't fork", async () => {
    // The key a previous attempt already used is in `taken`; an idempotent retry
    // must still target it rather than minting a "-2" duplicate.
    const a = await call({ uploadId: "ring-box-1" });
    const retry = await call({ uploadId: "ring-box-1", taken: [a.body.key] });
    expect(retry.body.key).toBe(a.body.key);
  });

  test("falls back to a unique key when no uploadId is sent", async () => {
    const taken = ["products/ring-box/photo.jpg"];
    const { body } = await call({ name: "photo.jpg", key: taken[0], taken });
    expect(S3_BUCKET_KEY_RE.test(body.key)).toBe(true);
    expect(body.key).not.toBe(taken[0]);
    expect(body.uploadId).toBeNull();
  });

  test("normalises a hostile uploadId into a safe key", async () => {
    const { status, body } = await call({ uploadId: "../../etc/passwd" });
    expect(status).toBe(200);
    expect(body.key).toMatch(/^products\/ring-box\/[a-z0-9][a-z0-9._-]*\.jpg$/);
    expect(body.key).not.toContain("..");
  });

  test("requires a product id", async () => {
    const { status, seen } = await call({ productId: "", uploadId: "x" });
    expect(status).toBe(400);
    expect(seen).toHaveLength(0);
  });

  test("requires a valid session", async () => {
    signed.length = 0;
    const res = await presignImage(post(base({ token: "garbage", uploadId: "x" })));
    expect(res.status).toBe(401);
    expect(signed).toHaveLength(0);
  });

  test("reports missing configuration instead of signing", async () => {
    delete process.env.S3_BUCKET;
    signed.length = 0;
    const res = await presignImage(post(base({ uploadId: "x" })));
    expect(res.status).toBe(500);
    expect((await res.json()).message).toContain("S3_BUCKET");
    expect(signed).toHaveLength(0);
  });
});