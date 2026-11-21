import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { referencedKeys } from "../../shared/images.mjs";
// Server-side catalog validation (issue #23): the browser checks too, but the
// function must not trust anything that reaches it over the wire.
import { prepareProducts } from "../../shared/schema.mjs";
import { verifySession } from "../../shared/session.mjs";
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
} from "../../shared/github.mjs";

const PATH = "public/products.json"; // Vite copies public/ to dist/ on build

const json = (status, message, extra = {}) =>
  new Response(JSON.stringify({ ok: status < 400, message, ...extra }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      // X-Api-Key: the AWS API Gateway front door requires an API key, so the
      // browser preflight must allow that header through.
      "Access-Control-Allow-Headers": "Content-Type, X-Api-Key, Authorization",
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

  // Optimistic concurrency (issue #23): the panel sends the sha of the
  // products.json it edited. If the repo has moved on since then, somebody else
  // published in between and this write would silently clobber their work.
  const baseSha = typeof body.baseSha === "string" ? body.baseSha.trim() : "";
  const force = body.force === true;

  const notes = String(body.notes || "").trim().slice(0, 200);

  if (!secret) {
    return json(500, "Server is missing JWT_SECRET. Set it in SSM Parameter Store before publishing.");
  }

  if (!verifySession(body.token, secret)) {
    return json(401, "Invalid or expired admin session. Log in again in the admin panel.");
  }

  if (!TOKEN || !REPO) {
    return json(500, "Server is missing GITHUB_TOKEN / GITHUB_REPO. Set them in SSM Parameter Store.");
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

  // ---- optimistic concurrency: refuse to write over a newer revision unless
  // the admin explicitly forced it from the conflict dialog. ----
  const currentSha = current ? current.sha : null;
  if (!force && baseSha && baseSha !== (currentSha || "")) {
    const liveProducts =
      current && current.data && Array.isArray(current.data.products)
        ? current.data.products
        : [];
    const liveMeta = (current && current.data && current.data.meta) || null;
    return json(
      409,
      "products.json changed on the server since you started editing. Load the latest version, or overwrite it with your draft.",
      {
        conflict: true,
        currentSha: currentSha || null,
        baseSha,
        liveProducts,
        liveMeta,
        updatedBy: (liveMeta && liveMeta.updatedBy) || null,
        updatedAt: (liveMeta && liveMeta.lastUpdated) || null,
      }
    );
  }

  const prepared = prepareProducts(body.products);
  if (prepared.errors) {
    return json(400, "products.json was rejected by server-side validation.", {
      errors: prepared.errors.slice(0, 25),
      errorCount: prepared.errors.length,
    });
  }
  const products = prepared.products;

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

  const content = encodeProductsBody({ meta, products });

  const commitMessage = notes
    ? `Publish products: ${notes}`
    : "Update products via admin panel";

  // `sha` is always the freshly-read head, so GitHub itself rejects the write if
  // another admin committed between our read and this PUT — even when the
  // caller sent no baseSha at all.
  const putRes = await fetch(contentUrl(REPO, PATH), {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: commitMessage,
      content,
      sha: currentSha || undefined,
      branch: "main",
    }),
  });

  if (!putRes.ok) {
    const err = (await putRes.text()).slice(0, 300);
    // Lost the race between our read and the write: report it as a conflict so
    // the panel offers load-latest / overwrite instead of a bare 502.
    if (putRes.status === 409 || putRes.status === 422) {
      let liveProducts = null;
      let liveMeta = null;
      let liveSha = null;
      try {
        const fresh = await readRepoFile({ token: TOKEN, repo: REPO, path: PATH });
        liveSha = (fresh && fresh.sha) || null;
        liveProducts =
          fresh && fresh.data && Array.isArray(fresh.data.products) ? fresh.data.products : null;
        liveMeta = (fresh && fresh.data && fresh.data.meta) || null;
      } catch {}
      return json(
        409,
        "Someone else published products.json a moment before you did. Load the latest version, or overwrite it with your draft.",
        {
          conflict: true,
          raced: true,
          currentSha: liveSha,
          liveProducts,
          liveMeta,
          updatedBy: (liveMeta && liveMeta.updatedBy) || null,
          updatedAt: (liveMeta && liveMeta.lastUpdated) || null,
        }
      );
    }
    return json(502, "GitHub write failed (" + putRes.status + "): " + err);
  }

  // Hand the new head back so the panel can keep publishing without a refetch.
  let newSha = null;
  try {
    const putBody = await putRes.json();
    newSha = (putBody && putBody.content && putBody.content.sha) || null;
  } catch {}

  // ---- orphan detection: delete S3 images no product references any more ----
  let cleanup = { deleted: 0, report: [] };
  try {
    cleanup = await cleanupOrphans({
      products,
      bucket: process.env.S3_BUCKET,
      region: process.env.AWS_REGION,
    });
  } catch (e) {
    // Non-fatal: products are saved; cleanup can be retried next publish.
    return json(200, "Saved to GitHub. Your live site will auto-deploy in a minute.", {
      cleanupError: String(e?.message || e),
      sha: newSha,
      version,
    });
  }

  const extra = cleanup.deleted > 0 ? { deletedImages: cleanup.deleted } : {};

  return json(200, "Saved to GitHub. Your live site will auto-deploy in a minute.", {
    ...extra,
    sha: newSha,
    version,
  });
};