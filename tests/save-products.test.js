import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import saveProducts from "../netlify/functions/save-products.mjs";
import { signSession } from "../netlify/lib/session.mjs";

// Behaviour of the save-products function around the two guarantees added in
// issue #23: a publish carrying a stale baseSha is refused with 409 instead of
// clobbering a newer revision, and an invalid catalogue is rejected server-side
// before anything is written.

const REPO = "ganesh-159th/riddhi-siddhi-gift-pack";

const sha = (seed) => `sha-${seed}`;

const blob = (data, blobSha) => ({
  content: Buffer.from(JSON.stringify(data, null, 2), "utf8").toString("base64"),
  encoding: "base64",
  sha: blobSha,
});

const box = (over = {}) => ({
  id: "ring-box",
  name: "Ring Box",
  tagline: "Velvet-lined gift box",
  specs: ["Velvet Lined"],
  image: "images/ring-box-1.jpg",
  images: ["images/ring-box-1.jpg"],
  badges: [{ text: "B2B", style: "gold" }],
  ...over,
});

const req = (body) => ({ method: "POST", json: async () => body });

// Build a fetch stub for the GitHub calls save-products makes.
const stubGitHub = ({ current, putResult }) => {
  const calls = { put: [] };
  const handler = vi.fn(async (url, init) => {
    const u = String(url);

    if (init && init.method === "PUT") {
      const body = JSON.parse(init.body);
      calls.put.push(body);
      return putResult(body);
    }
    if (u.includes("/contents/")) {
      if (!current) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify(blob(current.data, current.sha)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (u.includes("/commits")) {
      return new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (u.endsWith("/user")) {
      return new Response(JSON.stringify({ login: "test-admin" }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  });
  return { handler, calls };
};

const okPut = () =>
  new Response(JSON.stringify({ content: { sha: sha("new") } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const ENV_KEYS = ["GITHUB_REPO", "GITHUB_TOKEN", "JWT_SECRET", "S3_BUCKET", "AWS_REGION"];
let savedEnv;

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.GITHUB_REPO = REPO;
  process.env.GITHUB_TOKEN = "gh-token";
  process.env.JWT_SECRET = "test-secret";
  delete process.env.S3_BUCKET;
  delete process.env.AWS_REGION;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.unstubAllGlobals();
});

const run = async (body, current) => {
  const { handler, calls } = stubGitHub({ current, putResult: okPut });
  vi.stubGlobal("fetch", handler);
  const res = await saveProducts(req({ token: makeToken(), ...body }));
  return { status: res.status, body: await res.json(), calls };
};

// A session token signed the same way admin-login signs one.
const makeToken = () => signSession("test-secret", 1).token;

describe("save-products concurrency (issue #23)", () => {
  test("writes when baseSha matches the repo head and returns the new sha", async () => {
    const current = { sha: sha("a"), data: { products: [box()] } };
    const { status, body, calls } = await run(
      { products: [box({ name: "Ring Box v2" })], baseSha: sha("a") },
      current
    );

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.sha).toBe(sha("new"));
    expect(calls.put).toHaveLength(1);
    expect(calls.put[0].sha).toBe(sha("a"));
    expect(calls.put[0].branch).toBe("main");
  });

  test("refuses a stale baseSha with 409 and commits nothing", async () => {
    const current = { sha: sha("b"), data: { products: [box()], meta: { version: 2 } } };
    const { status, body, calls } = await run(
      { products: [box({ name: "Mine" })], baseSha: sha("a") },
      current
    );

    expect(status).toBe(409);
    expect(body.conflict).toBe(true);
    expect(body.currentSha).toBe(sha("b"));
    expect(body.baseSha).toBe(sha("a"));
    expect(body.message).toMatch(/changed on the server/i);
    expect(calls.put).toHaveLength(0);
  });

  test("the 409 body carries the server's products so the dialog can diff them", async () => {
    const live = [box(), box({ id: "chain-box", name: "Chain Box", image: "images/chain-1.jpg" })];
    const current = { sha: sha("b"), data: { products: live } };
    const { body } = await run({ products: [box()], baseSha: sha("a") }, current);

    expect(Array.isArray(body.liveProducts)).toBe(true);
    expect(body.liveProducts).toHaveLength(2);
    expect(body.liveProducts[1].id).toBe("chain-box");
  });

  test("force: true overwrites despite a stale baseSha", async () => {
    const current = { sha: sha("b"), data: { products: [box()] } };
    const { status, calls } = await run(
      { products: [box({ name: "Forced" })], baseSha: sha("a"), force: true },
      current
    );

    expect(status).toBe(200);
    expect(calls.put).toHaveLength(1);
    expect(calls.put[0].sha).toBe(sha("b"));
  });

  test("always sends the freshly-read head sha, so GitHub guards the write", async () => {
    const current = { sha: sha("head"), data: { products: [box()] } };
    // No baseSha at all: an older panel (or a direct API call) still can't
    // produce an unversioned write.
    const { calls } = await run({ products: [box()] }, current);
    expect(calls.put[0].sha).toBe(sha("head"));
  });

  test("reports a lost write race as a 409 conflict, not a 502", async () => {
    const current = { sha: sha("a"), data: { products: [box()] } };
    const { handler } = stubGitHub({
      current,
      putResult: () =>
        new Response(JSON.stringify({ message: "is at ... but expected ..." }), { status: 409 }),
    });
    vi.stubGlobal("fetch", handler);

    const res = await saveProducts(req({ token: await makeToken(), products: [box()] }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.conflict).toBe(true);
    expect(body.raced).toBe(true);
  });

  test("surfaces a GitHub outage as 502", async () => {
    const current = { sha: sha("a"), data: { products: [box()] } };
    const { handler } = stubGitHub({
      current,
      putResult: () => new Response("server error", { status: 500 }),
    });
    vi.stubGlobal("fetch", handler);

    const res = await saveProducts(req({ token: await makeToken(), products: [box()] }));
    expect(res.status).toBe(502);
    expect((await res.json()).ok).toBe(false);
  });
});

describe("save-products server-side validation (issue #23)", () => {
  test("rejects an invalid catalogue with 400 and writes nothing", async () => {
    const current = { sha: sha("a"), data: { products: [box()] } };
    const { status, body, calls } = await run(
      { products: [box({ badges: [{ text: "X", style: "neon" }] })] },
      current
    );

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.errors.some((e) => e.message.includes("unknown style"))).toBe(true);
    expect(calls.put).toHaveLength(0);
  });

  test("rejects an un-uploaded data URI photo", async () => {
    const current = { sha: sha("a"), data: { products: [box()] } };
    const dataUri = "data:image/jpeg;base64,AAA";
    const { status, body } = await run(
      { products: [box({ image: dataUri, images: [dataUri] })] },
      current
    );
    expect(status).toBe(400);
    expect(body.errors.some((e) => e.message.includes("un-uploaded photo"))).toBe(true);
  });

  test("still requires a products array", async () => {
    const current = { sha: sha("a"), data: { products: [box()] } };
    const { status, body } = await run({}, current);
    expect(status).toBe(400);
    expect(body.message).toContain('"products" array is required');
  });

  test("rejects an unauthenticated request before touching GitHub", async () => {
    const handler = vi.fn();
    vi.stubGlobal("fetch", handler);
    const res = await saveProducts(req({ products: [box()], token: "garbage" }));
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  test("commits only the sanitised catalogue", async () => {
    const current = { sha: sha("a"), data: { products: [box()] } };
    const { calls } = await run({ products: [box({ secret: "leak" })] }, current);

    const committed = JSON.parse(
      Buffer.from(calls.put[0].content, "base64").toString("utf8")
    );
    expect(committed.products[0].secret).toBeUndefined();
    expect(committed.products[0].name).toBe("Ring Box");
    expect(committed.meta.source).toBe("admin-panel");
  });

  test("records the change summary in the commit message", async () => {
    const current = { sha: sha("a"), data: { products: [box()] } };
    const { calls } = await run({ products: [box()], notes: "  Updated ring boxes  " }, current);
    expect(calls.put[0].message).toBe("Publish products: Updated ring boxes");
  });
});