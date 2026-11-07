import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { handler } from "../lambda/save-products/index.mjs";
import { signSession } from "../netlify/lib/session.mjs";

// The Lambda wrapper's contract with API Gateway: translate the proxy event,
// reuse the Netlify handler, and always return reviewable CORS + JSON logs.

const REPO = "ganesh-159th/Riddhi-Siddhi-Gift-Pack";
const sha = (seed) => `sha-${seed}`;

const box = (over = {}) => ({
  id: "ring-box",
  name: "Ring Box",
  image: "images/ring-box-1.jpg",
  images: ["images/ring-box-1.jpg"],
  ...over,
});

const makeToken = () => signSession("test-secret", 1).token;

const event = ({ body, httpMethod = "POST" } = {}) => ({
  httpMethod,
  headers: { origin: "https://example.test" },
  body: typeof body === "string" ? body : JSON.stringify(body),
  isBase64Encoded: false,
  requestContext: { requestId: "req-1" },
});

const stubGitHub = ({ current }) => {
  const calls = { put: [] };
  const fn = vi.fn(async (url, init) => {
    const u = String(url);
    if (init && init.method === "PUT") {
      calls.put.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ content: { sha: sha("new") } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (u.includes("/contents/")) {
      if (!current) return new Response("{}", { status: 404 });
      return new Response(
        JSON.stringify({
          content: Buffer.from(JSON.stringify(current.data), "utf8").toString("base64"),
          encoding: "base64",
          sha: current.sha,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (u.includes("/commits")) {
      return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (u.endsWith("/user")) {
      return new Response(JSON.stringify({ login: "test-admin" }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  });
  return { fn, calls };
};

beforeEach(() => {
  process.env.GITHUB_REPO = REPO;
  process.env.GITHUB_TOKEN = "gh-token";
  process.env.JWT_SECRET = "test-secret";
  // No SSM prefix: the wrapper skips SSM and reads process.env directly, which
  // is exactly the local/dev path we want to exercise here.
  delete process.env.SSM_PREFIX;
  delete process.env.S3_BUCKET;
  delete process.env.AWS_REGION;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Lambda save-products wrapper", () => {
  test("proxies a valid publish and allows the API key CORS header", async () => {
    const current = { sha: sha("a"), data: { products: [box()] } };
    const { fn } = stubGitHub({ current });
    vi.stubGlobal("fetch", fn);

    const res = await handler(
      event({ body: { token: makeToken(), products: [box()], baseSha: sha("a") } })
    );

    expect(res.statusCode).toBe(200);
    // Headers normalises names to lowercase; HTTP treats them case-insensitively.
    expect(res.headers["access-control-allow-headers"]).toContain("X-Api-Key");
    expect(JSON.parse(res.body).ok).toBe(true);
  });

  test("answers OPTIONS preflight without calling GitHub", async () => {
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);

    const res = await handler(event({ httpMethod: "OPTIONS", body: "" }));

    expect(res.statusCode).toBe(200);
    expect(fn).not.toHaveBeenCalled();
  });

  test("returns 400 for an unparseable body", async () => {
    const res = await handler(event({ body: "{not json" }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toMatch(/Invalid JSON/i);
  });

  test("returns 500 (and never calls GitHub) when JWT_SECRET is missing", async () => {
    delete process.env.JWT_SECRET;
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);

    const res = await handler(event({ body: { products: [box()], token: "x" } }));

    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).message).toMatch(/JWT_SECRET/);
    expect(fn).not.toHaveBeenCalled();
  });

  test("emits a structured JSON invocation log", async () => {
    const current = { sha: sha("a"), data: { products: [box()] } };
    const { fn } = stubGitHub({ current });
    vi.stubGlobal("fetch", fn);
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    await handler(event({ body: { token: makeToken(), products: [box()], baseSha: sha("a") } }));

    const lines = spy.mock.calls.map(([line]) => JSON.parse(line));
    const request = lines.find((line) => line.msg === "request");
    expect(request).toMatchObject({
      level: "info",
      msg: "request",
      method: "POST",
      status: 200,
    });
    expect(typeof request.durationMs).toBe("number");
  });
});
