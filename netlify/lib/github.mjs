// Shared GitHub REST API helpers for the admin panel (issue #20). All the
// admin functions talk to the same repo through a single fine-grained token, so
// the headers / URL construction / path-commit counting live here instead of
// being duplicated in save-products, history-products and rollback-products.

const API = "https://api.github.com";

export const ghHeaders = (token) => ({
  Authorization: "Bearer " + token,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
});

export const contentUrl = (repo, path) => `${API}/repos/${repo}/contents/${path}`;

// How many commits have ever touched `path` in `repo`? GitHub returns the total
// page count in the Link header when `per_page=1`, so this is a single request.
// Falls back to counting the returned list when no last-page link is present.
export async function countCommitsForPath({ token, repo, path }) {
  const url = `${API}/repos/${repo}/commits?path=${encodeURIComponent(path)}&per_page=1`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (res.status === 404) return 0;
  if (!res.ok) throw new Error("GitHub commits " + res.status);
  const link = res.headers.get("link") || "";
  const last = /<([^>]+)>;\s*rel="last"/.exec(link);
  if (last) {
    const page = /[?&]page=(\d+)/.exec(last[1]);
    if (page) return Number(page[1]) || 0;
  }
  const list = await res.json();
  return Array.isArray(list) ? list.length : 0;
}

// The account the deployed token acts as — used as `updatedBy` in the version
// metadata so every publish records who made it.
export async function fetchUserLogin(token) {
  const res = await fetch(`${API}/user`, { headers: ghHeaders(token) });
  if (!res.ok) return "Admin";
  const user = await res.json().catch(() => ({}));
  return user.login || "Admin";
}

// Parse the current top-of-branch JSON held at `path`, returning
// { sha, text, data } or null when the file doesn't exist yet.
export async function readRepoFile({ token, repo, path, ref }) {
  const url = ref
    ? `${contentUrl(repo, path)}?ref=${encodeURIComponent(ref)}`
    : contentUrl(repo, path);
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("GitHub contents " + res.status);
  const d = await res.json();
  const text = Buffer.from(d.content || "", d.encoding || "base64").toString("utf8");
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  return { sha: d.sha, text, data };
}

// Pretty-printed products.json body (version metadata + products array) ready
// to be committed.
export const encodeProductsBody = ({ meta, products }) =>
  Buffer.from(JSON.stringify({ meta, products }, null, 2), "utf8").toString("base64");