// CloudWatch Synthetics canary for the public site (issue #39).
//
// Two checks, run on a schedule:
//   * the home page returns HTTP 200, and
//   * products.json returns HTTP 200 with a non-empty products array.
//
// Uses the legacy `Synthetics` namespace, so keep the runtime at
// syn-nodejs-puppeteer-12.0 or earlier (13.1+ moved to a new namespace).

const synthetics = require("Synthetics");
const http = require("http");
const https = require("https");

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const request = client.get(url, { timeout: 10000 }, (response) => {
      const location = response.headers.location;
      if (
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        location &&
        redirects < 3
      ) {
        response.resume();
        resolve(get(new URL(location, url).toString(), redirects + 1));
        return;
      }

      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () =>
        resolve({
          statusCode: response.statusCode,
          body: Buffer.concat(chunks).toString("utf8"),
        })
      );
    });

    request.on("timeout", () =>
      request.destroy(new Error(`timed out after 10s: ${url}`))
    );
    request.on("error", reject);
  });
}

function requireOk(url, response) {
  if (response.statusCode !== 200) {
    throw new Error(`${url} returned HTTP ${response.statusCode}`);
  }
}

exports.handler = async function () {
  const base = String(process.env.SITE_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("SITE_URL environment variable is required");

  await synthetics.executeStep("home-page", async function () {
    const url = `${base}/`;
    const response = await get(url);
    requireOk(url, response);
  });

  await synthetics.executeStep("products-json", async function () {
    const url = `${base}/products.json`;
    const response = await get(url);
    requireOk(url, response);

    const payload = JSON.parse(response.body);
    if (!Array.isArray(payload.products) || payload.products.length === 0) {
      throw new Error("products.json has no products");
    }
  });
};
