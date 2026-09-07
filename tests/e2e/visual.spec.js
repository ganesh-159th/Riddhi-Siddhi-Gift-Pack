import { test, expect } from "@playwright/test";

// Visual regression snapshots for the Riddhi Siddhi site.
//
// These cover the areas most likely to regress: the navigation bar (the glass
// state on scroll, every breakpoint layout), the mobile menu and the main page
// sections. Baselines live in tests/e2e/visual.spec.js-snapshots/ and are
// re-generated ONLY by the "Update visual baselines" workflow — never locally.
//
// Renderer notes that keep the comparison deterministic:
//  - prefers-reduced-motion is emulated; the site disables animations.
//  - the Google Maps embed is aborted so the third-party iframe cannot vary.
//  - elements reveal-on-scroll, so we scroll to each section and let transitions
//    settle before capturing.

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

const MAP_EMBED = "**://www.google.com/maps**";

const prepare = async (page, viewport) => {
  await page.route(MAP_EMBED, (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(viewport);
  await page.goto("/", { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
};

// Scroll to an element, then wait for reveal transitions + lazy images to settle.
const scrollTo = async (page, selector, settle = 1800) => {
  await page.locator(selector).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  await page.waitForTimeout(settle);
};

// Current viewport screenshot anchored to the top of the page.
const shot = (page, name) => expect(page).toHaveScreenshot(name);

test.describe("navigation bar", () => {
  test("desktop links stay on a single even line", async ({ page }) => {
    await prepare(page, DESKTOP);
    await page.waitForTimeout(800);
    await shot(page, "desktop-nav.png");
  });

  test("glass background appears once scrolled far enough", async ({ page }) => {
    await prepare(page, DESKTOP);
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(900);
    await shot(page, "desktop-nav-scrolled.png");
  });

  test("nav stays centred on a mid-size laptop (1366px)", async ({ page }) => {
    await prepare(page, { width: 1366, height: 768 });
    await page.waitForTimeout(800);
    await shot(page, "laptop-nav.png");
  });

  test("mobile nav collapses to the hamburger", async ({ page }) => {
    await prepare(page, MOBILE);
    await page.waitForTimeout(800);
    await shot(page, "mobile-nav.png");
  });

  test("mobile menu opens cleanly below the bar", async ({ page }) => {
    await prepare(page, MOBILE);
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: /open menu/i }).click();
    await page.waitForTimeout(700);
    await shot(page, "mobile-nav-open.png");
  });
});

test.describe("page sections", () => {
  test("hero renders on desktop", async ({ page }) => {
    await prepare(page, DESKTOP);
    await page.waitForTimeout(1000);
    await shot(page, "desktop-hero.png");
  });

  test("products grid on desktop", async ({ page }) => {
    await prepare(page, DESKTOP);
    await scrollTo(page, "#products");
    await shot(page, "desktop-products.png");
  });

  test("process + careers section on desktop", async ({ page }) => {
    await prepare(page, DESKTOP);
    await scrollTo(page, "#careers");
    await shot(page, "desktop-careers.png");
  });

  test("footer on desktop", async ({ page }) => {
    await prepare(page, DESKTOP);
    await scrollTo(page, "#contact");
    await page.waitForTimeout(1200);
    await shot(page, "desktop-footer.png");
  });
});