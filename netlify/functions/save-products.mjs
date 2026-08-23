const PATH = "products.json";

const json = (status, message) =>
  new Response(JSON.stringify({ ok: status < 400, message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });

export default async (req) => {
  if (req.method === "OPTIONS") return json(200, "ok");

  const REPO = process.env.GITHUB_REPO;
  const TOKEN = process.env.GITHUB_TOKEN;
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

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

  if (!ADMIN_TOKEN) {
    return json(500, "Server is missing ADMIN_TOKEN. Publishing is disabled until it is set in Netlify site settings.");
  }

  if (!body.token || body.token !== ADMIN_TOKEN) {
    return json(401, "Invalid admin password.");
  }

  if (!TOKEN || !REPO) {
    return json(500, "Server is missing GITHUB_TOKEN / GITHUB_REPO. Set them in Netlify site settings.");
  }

  const headers = {
    Authorization: "Bearer " + TOKEN,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };

  const url = `https://api.github.com/repos/${REPO}/contents/${PATH}`;

  let sha = null;
  const getRes = await fetch(url, { headers });
  if (getRes.ok) {
    sha = (await getRes.json()).sha;
  } else if (getRes.status !== 404) {
    return json(502, "Could not read current products.json from GitHub: " + getRes.status);
  }

  const content = Buffer.from(JSON.stringify({ products: body.products }, null, 2), "utf8").toString("base64");

  const putRes = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: "Update products via admin panel",
      content,
      sha: sha || undefined,
      branch: "main",
    }),
  });

  if (!putRes.ok) {
    const err = (await putRes.text()).slice(0, 300);
    return json(502, "GitHub write failed (" + putRes.status + "): " + err);
  }

  return json(200, "Saved to GitHub. Your live site will auto-deploy in a minute.");
};
