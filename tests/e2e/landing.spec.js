import { test, expect } from "@playwright/test";

// Functional E2E coverage for the public landing page (issue #37): navigation,
// product loading, the product modal and the contact form. Unlike visual.spec.js
// these assert behaviour, so they need no screenshot baselines.

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };
const MAP_EMBED = "**://www.google.com/maps**";

const prepare = async (page, viewport = DESKTOP) => {
  await page.route(MAP_EMBED, (route) => route.abort());
  // Suppress the consent banner and capture WhatsApp hand-offs instead of
  // opening a real popup (which would leave the page context).
  await page.addInitScript(() => {
    localStorage.setItem("rsp-consent", "denied");
    window.__opened = [];
    window.open = (url) => {
      window.__opened.push(String(url));
      return null;
    };
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(viewport);
  await page.goto("/", { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
};

const firstProductCard = (page) =>
  page.getByRole("button", { name: /view details for/i }).first();

test.describe("landing navigation", () => {
  test("desktop nav links scroll to their sections", async ({ page }) => {
    await prepare(page);
    const nav = page.getByRole("navigation", { name: "Main navigation" });

    await nav.getByRole("link", { name: "Products", exact: true }).click();
    await expect(page).toHaveURL(/#products$/);
    await expect(page.locator("#products")).toBeInViewport();

    await nav.getByRole("link", { name: "Contact", exact: true }).click();
    await expect(page).toHaveURL(/#contact$/);
    await expect(page.locator("#contact")).toBeInViewport();
  });

  test("mobile menu opens, navigates and closes", async ({ page }) => {
    await prepare(page, MOBILE);
    await page.getByRole("button", { name: /open menu/i }).click();

    const region = page.getByRole("region", { name: "Mobile navigation" });
    await expect(region).toBeVisible();
    await region.getByRole("link", { name: "Contact", exact: true }).click();

    await expect(page).toHaveURL(/#contact$/);
    await expect(region).toBeHidden();
  });

  test("mobile viewport does not scroll sideways", async ({ page }) => {
    await prepare(page, MOBILE);
    await page.locator("#contact").scrollIntoViewIfNeeded();
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});

test.describe("products", () => {
  test("loads products and opens the modal from a card", async ({ page }) => {
    await prepare(page);
    const card = firstProductCard(page);
    await expect(card).toBeVisible({ timeout: 15_000 });

    const name = (await card.locator("h3").innerText()).trim();
    await card.click();

    const dialog = page.getByRole("dialog", { name: /product details/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name })).toBeVisible();

    const counter = dialog.locator('[aria-live="polite"][aria-atomic="true"]');
    await expect(counter).toHaveText(/^1 \/ \d+$/);
    await dialog.getByRole("button", { name: "Next image", exact: true }).click();
    await expect(counter).toHaveText(/^2 \/ \d+$/);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("product quote links point at WhatsApp with the product name", async ({ page }) => {
    await prepare(page);
    const card = firstProductCard(page);
    await expect(card).toBeVisible({ timeout: 15_000 });

    const quote = card.getByRole("link", { name: /get whatsapp quote/i });
    const href = await quote.getAttribute("href");
    expect(href).toContain("https://wa.me/919346797060");
    expect(decodeURIComponent(href)).toContain("I'm interested in");

    const navQuote = page
      .getByRole("link", { name: /whatsapp enquire/i })
      .first();
    expect(await navQuote.getAttribute("href")).toContain("https://wa.me/919346797060");
  });
});

test.describe("contact form", () => {
  const fillForm = async (page, { name, phone, message }) => {
    await page.locator("#contact").scrollIntoViewIfNeeded();
    if (name) await page.getByLabel(/your name/i).fill(name);
    if (phone) await page.getByLabel(/phone/i).fill(phone);
    if (message) await page.getByLabel(/message/i).fill(message);
  };

  test("rejects an invalid phone number", async ({ page }) => {
    await prepare(page);
    await fillForm(page, {
      name: "Rahul Jewellers",
      phone: "abc",
      message: "Need 500 boxes",
    });

    await page.getByRole("button", { name: /send enquiry/i }).click();
    await expect(page.getByRole("alert")).toHaveText("Please enter a valid phone number.");
  });

  test("rejects spammy message content", async ({ page }) => {
    await prepare(page);
    await fillForm(page, {
      name: "Rahul Jewellers",
      phone: "+91 98765 43210",
      message: "buy now casino free money",
    });

    await page.getByRole("button", { name: /send enquiry/i }).click();
    await expect(page.getByRole("alert")).toHaveText(
      "Your message looks like spam. Please rephrase and try again."
    );
  });

  test("submits a valid enquiry and hands off to WhatsApp", async ({ page }) => {
    await prepare(page);
    await page.route("**/api/submit-enquiry", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      })
    );

    await fillForm(page, {
      name: "Rahul Jewellers",
      phone: "+91 98765 43210",
      message: "Need 500 velvet boxes",
    });
    await page.getByRole("button", { name: /send enquiry/i }).click();

    await expect(page.getByRole("status")).toContainText("Enquiry sent!");
    const opened = await page.evaluate(() => window.__opened);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toContain("https://wa.me/919346797060");
    expect(decodeURIComponent(opened[0])).toContain("Rahul Jewellers");
    expect(decodeURIComponent(opened[0])).toContain("Need 500 velvet boxes");
  });
});
