import { test, expect } from "@playwright/test";

const apiOrigin = process.env.ADMIN_API_ORIGIN;
const bucket = process.env.SITE_BUCKET || "riddhi-siddhi-gift-pack-prod";
const region = process.env.AWS_REGION || "ap-south-1";
const s3Origin = `https://${bucket}.s3.${region}.amazonaws.com`;
const uploadUrl = `${s3Origin}/products/csp-e2e.jpg`;

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type,x-api-key",
  "access-control-allow-methods": "POST,PUT,OPTIONS",
};

const json = (body, status = 200) => ({
  status,
  headers: corsHeaders,
  contentType: "application/json",
  body: JSON.stringify(body),
});

test("CloudFront admin page permits only the pinned cross-origin calls", async ({ page }) => {
  const consoleViolations = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy/i.test(message.text())) {
      consoleViolations.push(message.text());
    }
  });

  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__cspViolations.push({
        blockedURI: event.blockedURI,
        violatedDirective: event.violatedDirective,
      });
    });
  });

  await page.route(`${apiOrigin}/api/admin-login`, (route) =>
    route.fulfill(json({ ok: true, token: "csp-e2e", exp: Date.now() + 3_600_000 }))
  );
  await page.route(`${apiOrigin}/api/history-products`, (route) =>
    route.fulfill(json({ ok: true, sha: "csp-e2e", products: [] }))
  );
  await page.route(uploadUrl, (route) => route.fulfill({ status: 200, headers: corsHeaders }));
  await page.route("**/products.json", (route) => route.fulfill(json({ products: [] })));

  const response = await page.goto("/admin.html", { waitUntil: "domcontentloaded" });
  const csp = response.headers()["content-security-policy"] || "";
  expect(csp).toContain(`connect-src 'self' ${apiOrigin} ${s3Origin};`);
  expect(csp).not.toContain("*.");

  await page.getByLabel(/admin password/i).fill("csp-e2e");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByRole("heading", { name: /add new product/i })).toBeVisible();

  await page.evaluate(async (url) => {
    await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    });
  }, uploadUrl);

  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
  expect(consoleViolations).toEqual([]);
});
