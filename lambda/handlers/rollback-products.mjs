import { verifySession } from "../../shared/session.mjs";
import {
  contentUrl,
  countCommitsForPath,
  encodeProductsBody,
  fetchUserLogin,
  ghHeaders,
  readRepoFile,
} from "../../shared/github.mjs";

// Rollback / restore (issue #20): rewrites public/products.json to the products
// array carried by an earlier commit. Creates a NEW commit (never rewrites its)
// so the history stays intact, and bumps the version metadata like a normal
// publish so the live site re-deploys and the audit trail stays consistent.

const PATH = "public/products.json";

const json = (status, message, extra = {}) =>
  new Response(JSON.stringify({ ok: status < 400, message, ...extra }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Api-Key, Authorization",
    },
  });

export default async (req) => {
  if (req.method === "OPTIONS") return json(200, "ok");
  if (req.method !== "POST") return json(405, "Method not allowed");

  const REPO = process.env.GITHUB_REPO;
  const TOKEN = process.env.GITHUB_TOKEN;
  const secret = process.env.JWT_SECRET;

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, "Invalid JSON body.");
  }

  const targetSha = String(body.sha || "");
  if (!targetSha) return json(400, 'A "sha" to restore is required.');

  if (!secret) return json(500, "Server is missing JWT_SECRET.");
  if (!verifySession(body.token, secret)) {
    return json(401, "Invalid or expired admin session. Log in again in the admin panel.");
  }
  if (!TOKEN || !REPO) {
    return json(500, "Server is missing GITHUB_TOKEN / GITHUB_REPO. Set them in SSM Parameter Store.");
  }

  const headers = ghHeaders(TOKEN);
  const notes = String(body.notes || "").trim().slice(0, 200);

  let current;
  let target;
  try {
    [current, target] = await Promise.all([
      readRepoFile({ token: TOKEN, repo: REPO, path: PATH }),
      readRepoFile({ token: TOKEN, repo: REPO, path: PATH, ref: targetSha }),
    ]);
  } catch (e) {
    return json(502, "Could not read products.json from GitHub: " + String(e?.message || e));
  }

  if (!target) return json(404, "No products.json found at that revision.");
  const products = (target.data && target.data.products) || null;
  if (!Array.isArray(products)) {
    return json(502, "products.json at that revision is not valid (missing products array).");
  }

  let version = 1;
  let updatedBy = "Admin";
  try {
    const commitCount = await countCommitsForPath({ token: TOKEN, repo: REPO, path: PATH });
    const currentVer = current && current.data && Number(current.data.meta?.version) || 0;
    version = Math.max(commitCount + 1, currentVer + 1);
    updatedBy = await fetchUserLogin(TOKEN);
  } catch {
    version =
      current && current.data && Number(current.data.meta?.version) > 0
        ? Number(current.data.meta.version) + 1
        : 1;
  }

  const meta = {
    version,
    lastUpdated: new Date().toISOString(),
    updatedBy,
    source: "admin-panel-restore",
    restoredFrom: targetSha,
  };

  const content = encodeProductsBody({ meta, products });
  const commitMessage = notes
    ? `Restore products to ${String(targetSha).slice(0, 7)}: ${notes}`
    : `Restore products to ${String(targetSha).slice(0, 7)}`;

  const putRes = await fetch(contentUrl(REPO, PATH), {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: commitMessage,
      content,
      sha: current ? current.sha : undefined,
      branch: "main",
    }),
  });

  if (!putRes.ok) {
    const err = (await putRes.text()).slice(0, 300);
    // Another publish landed between our read and this write — report it as a
    // conflict rather than a generic failure (issue #23).
    if (putRes.status === 409 || putRes.status === 422) {
      return json(
        409,
        "products.json changed on the server while the restore was in flight. Close history and try again.",
        { conflict: true }
      );
    }
    return json(502, "GitHub restore failed (" + putRes.status + "): " + err);
  }

  // The new head sha lets the panel keep publishing without re-reading.
  let newSha = null;
  try {
    const putBody = await putRes.json();
    newSha = (putBody && putBody.content && putBody.content.sha) || null;
  } catch {}

  return json(200, "Restored to an earlier version. Your live site will auto-deploy in a minute.", {
    products,
    sha: newSha,
    version,
  });
};