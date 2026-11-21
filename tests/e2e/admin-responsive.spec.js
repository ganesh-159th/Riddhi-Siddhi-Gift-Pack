import { test, expect } from "@playwright/test";

// Functional responsiveness checks for the admin panel (issue #22).
//
// Unlike visual.spec.js these assert behaviour (no horizontal overflow, large
// enough touch targets, camera-friendly file input, draft/sync indicator) so
// they run anywhere — no screenshot baselines involved.

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 667 },
  { name: "tablet", width: 768, height: 1024 },
];

test.describe("admin panel is usable on small screens (issue #22)", () => {
  const openAdmin = async (page, viewport) => {
    await page.setViewportSize(viewport);
    // The admin panel is gated behind a login (issue #18). AWS API routes
    // don't run under `vite preview`, so seed a still-valid session directly.
    await page.addInitScript(() => {
      sessionStorage.setItem(
        "rsp_admin_session",
        JSON.stringify({ token: "preview", exp: Date.now() + 3600_000 })
      );
    });
    await page.goto("/admin.html", { waitUntil: "domcontentloaded" });
    // The product form is lazy-loaded — wait for it to appear.
    await page
      .getByRole("heading", { name: /add new product/i })
      .waitFor({ timeout: 15_000 });
  };

  for (const vp of VIEWPORTS) {
    test(`${vp.name}: no horizontal overflow anywhere`, async ({ page }) => {
      await openAdmin(page, vp);
      // Scroll to the bottom so full-height layouts are exercised too.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth, "page must not scroll sideways").toBeLessThanOrEqual(clientWidth + 1);
    });

    test(`${vp.name}: core form + publish controls are visible and tappable`, async ({ page }) => {
      await openAdmin(page, vp);
      const targets = [
        page.getByLabel(/product name/i),
        page.getByRole("button", { name: /save product/i }),
        page.getByRole("button", { name: /sign out/i }),
        page.getByRole("button", { name: /review & publish/i }),
        page.getByRole("button", { name: /preview/i }).first(),
        page.getByRole("button", { name: /download products\.json/i }),
        page.getByRole("button", { name: /reset to defaults/i }),
        page.getByRole("button", { name: /edit/i }).first(),
        page.getByRole("button", { name: /delete/i }).first(),
      ];
      for (const t of targets) {
        const box = await t.boundingBox();
        expect(box, `${await t.getAttribute("aria-label") || t}`).not.toBeNull();
        expect(box.height, "touch target should be at least 40px tall").toBeGreaterThanOrEqual(40);
        expect(box.width).toBeGreaterThan(0);
      }
    });

    test(`${vp.name}: photo upload exposes a camera/photo-library picker`, async ({ page }) => {
      await openAdmin(page, vp);
      const picker = page.locator('input[type="file"][accept="image/*"]');
      await expect(picker).toBeVisible();
      // `capture` is deliberately absent so iOS offers camera AND photo library.
      expect(await picker.getAttribute("capture")).toBeNull();
    });
  }

  test("draft indicator appears after saving a local edit", async ({ page }) => {
    await openAdmin(page, { width: 375, height: 667 });
    await page.getByLabel(/product name/i).fill("Draft responsive test");
    await page.getByRole("button", { name: /save product/i }).click();
    await expect(page.getByRole("button", { name: /draft/i })).toBeVisible();
    await expect(page.getByText(/draft saved on this device only/i)).toBeVisible();
  });

  test("draft indicator clears when published data is pulled", async ({ page }) => {
    await openAdmin(page, { width: 375, height: 667 });
    await page.getByLabel(/product name/i).fill("Draft responsive test");
    await page.getByRole("button", { name: /save product/i }).click();
    await expect(page.getByRole("button", { name: /draft/i })).toBeVisible();

    // Confirming the pull must replace the draft with the published products.
    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /^draft$/i }).click();
    await expect(page.getByRole("button", { name: /in sync/i })).toBeVisible();
    await expect(page.getByText(/draft saved on this device only/i)).toBeHidden();
  });
});