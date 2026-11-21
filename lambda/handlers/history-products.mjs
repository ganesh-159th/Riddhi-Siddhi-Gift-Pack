import { verifySession } from "../../shared/session.mjs";
import { ghHeaders, readRepoFile } from "../../shared/github.mjs";

// Version history & diff source (issue #20). Admin asks for either:
//   list    — git commits that touched public/products.json (author, date, msg)
//   get     — the raw products.json as it existed at a given commit sha
//   current — head-of-branch sha + products, so the panel can publish with
//             optimistic concurrency instead of overwriting blind (issue #23)
// Both are read-only GitHub API calls; rollback lives in rollback-products.

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

  if (!secret) return json(500, "Server is missing JWT_SECRET.");
  if (!verifySession(body.token, secret)) {
    return json(401, "Invalid or expired admin session. Log in again in the admin panel.");
  }
  if (!TOKEN || !REPO) {
    return json(500, "Server is missing GITHUB_TOKEN / GITHUB_REPO. Set them in SSM Parameter Store.");
  }

  const headers = ghHeaders(TOKEN);
  const action = body.action || "list";

  if (action === "list") {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/commits?path=${encodeURIComponent(PATH)}&per_page=100`,
      { headers }
    );
    if (!res.ok) {
      return json(502, "Could not read product history from GitHub (" + res.status + ").");
    }
    const commits = await res.json();
    const revisions = (Array.isArray(commits) ? commits : []).map((c) => {
      const author = c.commit && c.commit.author ? c.commit.author : {};
      return {
        sha: c.sha,
        short: String(c.sha || "").slice(0, 7),
        message: (c.commit && c.commit.message) || "",
        author: author.name || "",
        email: author.email || "",
        date: author.date || "",
        url: c.html_url || "",
      };
    });
    return json(200, "ok", { revisions });
  }

  if (action === "current") {
    const file = await readRepoFile({ token: TOKEN, repo: REPO, path: PATH });
    if (!file) return json(404, "No products.json found on the default branch yet.");
    if (!file.data || !Array.isArray(file.data.products)) {
      return json(502, "products.json on the default branch is not valid JSON.");
    }
    return json(200, "ok", {
      sha: file.sha,
      products: file.data.products,
      meta: file.data.meta || null,
    });
  }

  if (action === "get") {
    const sha = String(body.sha || "");
    if (!sha) return json(400, 'A "sha" is required when action is "get".');
    const file = await readRepoFile({ token: TOKEN, repo: REPO, path: PATH, ref: sha });
    if (!file) {
      return json(404, "No products.json found at that revision.");
    }
    if (!file.data) {
      return json(502, "products.json at that revision is not valid JSON.");
    }
    return json(200, "ok", { content: file.data });
  }

  return json(400, 'Unknown action "' + action + '".');
};