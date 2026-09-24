import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { referencedKeys } from "../lib/images.mjs";
import { verifySession } from "../lib/session.mjs";
// Version metadata (issue #20): products.json gets a monotonically bumping
// version number + who published + when, so the admin panel's history view can
// label every revision even if GitHub's UI is bypassed.
import {
  contentUrl,
  countCommitsForPath,
  encodeProductsBody,
  fetchUserLogin,
  ghHeaders,
  readRepoFile,
} from "../lib/github.mjs";

const PATH = "public/products.json"; // Vite copies public/ to dist/ on build

const json = (status, message, extra = {}) =>
  new Response(JSON.stringify({ ok: status < 400, message, ...extra }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });

// Objects uploaded but never referenced (failed publish, deleted product) are
// removed on the next successful publish. A grace window keeps images in the
// middle of an in-flight publish from being swept out from under another admin.
const graceMs = () => {
  const n = Number(process.env.ORPHAN_GRACE_MINUTES);
  return (Number.isFinite(n) && n >= 0 ? n : 30) * 60_000;
};

async function cleanupOrphans({ products, bucket, region }) {
  if (!bucket) return { deleted: 0, report: [] };
  const s3 = new S3Client({ region: region || "ap-south-1" });

  const keep = referencedKeys(products);
  const cutoff = Date.now() - graceMs();
  const candidates = [];

  let token;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: "products/",
        ContinuationToken: token,
      })
    );
    for (const obj of res.Contents || []) {
      const lastModified = obj.LastModified ? obj.LastModified.getTime() : 0;
      const survivors = keep.has(obj.Key) || lastModified >= cutoff;
      if (!survivors) candidates.push(obj.Key);
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  if (!candidates.length) return { deleted: 0, report: [] };

  // S3's DeleteObjects caps at 1000 keys per request.
  for (let i = 0; i < candidates.length; i += 1000) {
    const batch = candidates.slice(i, i + 1000);
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch.map((Key) => ({ Key })) },
      })
    );
  }

  return { deleted: candidates.length, report: candidates };
}

export default async (req) => {
  if (req.method === "OPTIONS") return json(200, "ok");

  const REPO = process.env.GITHUB_REPO;
  const TOKEN = process.env.GITHUB_TOKEN;
  const secret = process.env.JWT_SECRET;

  if (req.method !== "POST") return json(405, "Method not allowed");

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, "Invalid JSON body.");
  }

  if (!Array.isArray(body.products)) {
    return json(400, 'A "products" array is required.');
  }

  const notes = String(body.notes || "").trim().slice(0, 200);

  if (!secret) {
    return json(500, "Server is missing JWT_SECRET. Publishing is disabled until it is set in Netlify site settings.");
  }

  if (!verifySession(body.token, secret)) {
    return json(401, "Invalid or expired admin session. Log in again in the admin panel.");
  }

  if (!TOKEN || !REPO) {
    return json(500, "Server is missing GITHUB_TOKEN / GITHUB_REPO. Set them in Netlify site settings.");
  }

  const headers = ghHeaders(TOKEN);

  // ---- products.json now carries image *references* only: photos were already
  // uploaded to S3 straight from the admin panel via presigned URLs, so no
  // base64 blobs ever reach this function. ----

  // Read the current top-of-branch file so we can (a) get the sha for the PUT
  // and (b) bump the existing version metadata instead of restarting at 1.
  let current;
  try {
    current = await readRepoFile({ token: TOKEN, repo: REPO, path: PATH });
  } catch (e) {
    return json(502, "Could not read current products.json from GitHub: " + String(e?.message || e));
  }

  let version;
  let updatedBy = "Admin";
  try {
    const existing = current && current.data ? current.data.meta : null;
    version = Math.max(
      (await countCommitsForPath({ token: TOKEN, repo: REPO, path: PATH })) + 1,
      Number(existing && existing.version) + 1 || 1
    );
    updatedBy = await fetchUserLogin(TOKEN);
  } catch {
    // Non-fatal: fall back to a monotonic bump or 1.
    const existing = current && current.data ? current.data.meta : null;
    version = Number(existing && existing.version) > 0 ? Number(existing.version) + 1 : 1;
  }

  const meta = {
    version,
    lastUpdated: new Date().toISOString(),
    updatedBy,
    source: "admin-panel",
  };

  const content = encodeProductsBody({ meta, products: body.products });

  const commitMessage = notes
    ? `Publish products: ${notes}`
    : "Update products via admin panel";

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
    return json(502, "GitHub write failed (" + putRes.status + "): " + err);
  }

  // ---- orphan detection: delete S3 images no product references any more ----
  let cleanup = { deleted: 0, report: [] };
  try {
    cleanup = await cleanupOrphans({
      products: body.products,
      bucket: process.env.S3_BUCKET,
      region: process.env.AWS_REGION,
    });
  } catch (e) {
    // Non-fatal: products are saved; cleanup can be retried next publish.
    return json(200, "Saved to GitHub. Your live site will auto-deploy in a minute.", {
      cleanupError: String(e?.message || e),
    });
  }

  const extra =
    cleanup.deleted > 0
      ? { deletedImages: cleanup.deleted }
      : {};

  return json(200, "Saved to GitHub. Your live site will auto-deploy in a minute.", extra);
};