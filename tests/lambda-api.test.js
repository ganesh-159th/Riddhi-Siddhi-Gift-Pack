import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { S3Client } from "@aws-sdk/client-s3";
import { handler } from "../lambda/save-products/index.mjs";
import { signSession } from "../shared/session.mjs";

const REPO = "ganesh-159th/Riddhi-Siddhi-Gift-Pack";

const event = (path, body, headers = {}) => ({
  httpMethod: "POST",
  resource: path,
  path: `/prod${path}`,
  headers: { origin: "https://example.test", ...headers },
  body: JSON.stringify(body),
  isBase64Encoded: false,
  requestContext: { requestId: "req-api" },
});

const result = (res) => ({ status: res.statusCode, body: JSON.parse(res.body || "{}") });

beforeEach(() => {
  process.env.GITHUB_REPO = REPO;
  process.env.GITHUB_TOKEN = "gh-token";
  process.env.JWT_SECRET = "test-secret";
  process.env.ADMIN_TOKEN = "admin-password";
  process.env.S3_BUCKET = "site-bucket";
  process.env.ENQUIRIES_BUCKET = "enquiries-bucket";
  delete process.env.SSM_PREFIX;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("admin API routing", () => {
  test("issues a session token from admin-login", async () => {
    const res = result(await handler(event("/api/admin-login", { password: "admin-password" })));
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.token).toMatch(/^.+\..+$/);
  });

  test("rejects a bad password", async () => {
    const res = result(await handler(event("/api/admin-login", { password: "wrong" })));
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  test("rejects an unauthenticated history request", async () => {
    const res = result(await handler(event("/api/history-products", { token: "bad" })));
    expect(res.status).toBe(401);
  });

  test("accepts a signed session for history", async () => {
    const token = signSession("test-secret", 1).token;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = result(await handler(event("/api/history-products", { token, action: "list" })));
    expect(res.status).toBe(200);
    expect(res.body.revisions).toEqual([]);
    expect(fetchMock).toHaveBeenCalled();
  });

  test("persists a valid enquiry to S3 instead of a forms provider", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({});
    const res = result(
      await handler(
        event("/api/submit-enquiry", {
          name: "Rahul Jewellers",
          phone: "+91 98765 43210",
          message: "Need 500 boxes",
          tf_fill_ms: 5000,
        })
      )
    );
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0];
    expect(command.input.Bucket).toBe("enquiries-bucket");
    expect(command.input.Key).toMatch(/^enquiries\/\d{4}-\d{2}-\d{2}\/.+\.json$/);
    expect(JSON.parse(command.input.Body)).toMatchObject({
      form: "enquiry",
      name: "Rahul Jewellers",
      phone: "+91 98765 43210",
    });
  });

  test("does not store honeypot submissions", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({});
    const res = result(
      await handler(
        event("/api/submit-enquiry", {
          name: "Bot",
          phone: "+91 98765 43210",
          message: "Need boxes",
          tf_hp_name: "filled",
          tf_fill_ms: 5000,
        })
      )
    );
    expect(res.status).toBe(200);
    expect(res.body.honeypot).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  test("returns 404 for an unknown route and accepts preflight", async () => {
    const unknown = await handler(event("/api/not-a-route", {}));
    expect(unknown.statusCode).toBe(404);

    const preflight = await handler({ ...event("/api/admin-login", {}), httpMethod: "OPTIONS" });
    expect(preflight.statusCode).toBe(200);
    expect(preflight.headers["access-control-allow-headers"]).toContain("X-Api-Key");
  });
});
