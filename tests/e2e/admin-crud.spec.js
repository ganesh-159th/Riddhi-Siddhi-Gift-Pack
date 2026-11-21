import { test, expect } from "@playwright/test";

// End-to-end admin journeys (issue #37): login, create, edit, delete and
// publish. The AWS API doesn't run under `vite preview`, so every call is
// fulfilled by a route — no real GitHub or S3 access.

const liveProduct = {
  id: "ring-box",
  name: "Ring Box",
  tagline: "Velvet-lined gift box",
  specs: ["Velvet Lined"],
  image: "images/og-cover.jpg",
  images: ["images/og-cover.jpg"],
  alt: "Ring box",
  badges: [{ text: "B2B", style: "gold" }],
  quoteNote: "Please share pricing.",
};

const json = (body, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

async function prepare(page, { loginSucceeds = true } = {}) {
  await page.route("**/api/admin-login", (route) =>
    route.fulfill(
      loginSucceeds
        ? json({ ok: true, token: "e2e-token", exp: Date.now() + 60 * 60 * 1000 })
        : json({ ok: false, message: "Invalid admin password." })
    )
  );
  await page.route("**/api/history-products", (route) =>
    route.fulfill(json({ ok: true, sha: "sha-e2e", products: [liveProduct] }))
  );
  await page.route("**/products.json", (route) =>
    route.fulfill(json({ products: [liveProduct] }))
  );
  await page.goto("/admin.html", { waitUntil: "domcontentloaded" });
}

async function login(page, password = "correct-horse") {
  await page.getByLabel(/admin password/i).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByRole("heading", { name: /add new product/i })).toBeVisible({
    timeout: 15_000,
  });
}

async function createProduct(page, name) {
  await page.getByLabel(/product name/i).fill(name);
  await page.getByLabel(/description/i).fill("E2E description");
  await page.getByLabel(/features \/ specs/i).fill("Velvet Lined, Rigid Board");
  await page
    .getByPlaceholder(/add an existing file name/i)
    .fill("images/og-cover.jpg");
  await page.getByRole("button", { name: /^add$/i }).click();
  await page.getByRole("button", { name: /save product/i }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

test.describe("admin panel journeys", () => {
  test("gates the panel behind login and rejects a wrong password", async ({ page }) => {
    await prepare(page, { loginSucceeds: false });

    await expect(page.getByLabel(/admin password/i)).toBeVisible();
    await page.getByLabel(/admin password/i).fill("wrong-password");
    await page.getByRole("button", { name: /^sign in$/i }).click();

    await expect(page.getByRole("alert")).toHaveText("Invalid admin password.");
    await expect(page.getByRole("heading", { name: /add new product/i })).toBeHidden();
  });

  test("logs in, creates, edits and deletes a product", async ({ page }) => {
    await prepare(page);
    await login(page);

    await createProduct(page, "E2E Gift Box");
    await expect(page.getByText(/draft saved on this device only/i)).toBeVisible();

    // Edit: the form is populated with the saved values and keeps the id.
    await page.getByRole("button", { name: /^edit$/i }).last().click();
    await expect(page.getByRole("heading", { name: /edit product/i })).toBeVisible();
    const nameInput = page.getByLabel(/product name/i);
    await expect(nameInput).toHaveValue("E2E Gift Box");
    await nameInput.fill("E2E Gift Box Deluxe");
    await page.getByRole("button", { name: /save product/i }).click();
    await expect(page.getByText("E2E Gift Box Deluxe", { exact: true })).toBeVisible();

    // Delete the edited product (the fixture product stays).
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /^delete$/i }).last().click();
    await expect(page.getByText("E2E Gift Box Deluxe", { exact: true })).toBeHidden();
    await expect(page.getByText("Ring Box", { exact: true })).toBeVisible();
  });

  test("publishes a new product with the base sha and change summary", async ({ page }) => {
    await prepare(page);
    let savedBody;
    await page.route("**/api/save-products", async (route) => {
      savedBody = route.request().postDataJSON();
      await route.fulfill(
        json({ ok: true, message: "Published products.json.", sha: "sha-saved" })
      );
    });

    await login(page);
    await createProduct(page, "E2E Published Box");

    await page.getByRole("button", { name: /review & publish/i }).click();
    const dialog = page.getByRole("dialog", { name: "Confirm publish" });
    await expect(dialog.getByText(/ready to publish/i)).toBeVisible({ timeout: 20_000 });
    await dialog
      .getByPlaceholder(/updated pricing/i)
      .fill("Add E2E published box");
    await dialog.getByRole("button", { name: /publish now/i }).click();

    await expect(page.getByText("Published products.json.")).toBeVisible({ timeout: 20_000 });
    await expect(dialog).toBeHidden();

    expect(savedBody).toMatchObject({
      token: "e2e-token",
      notes: "Add E2E published box",
      baseSha: "sha-e2e",
      force: false,
    });
    expect(savedBody.products.map((p) => p.id)).toEqual(["ring-box", "e2e-published-box"]);
  });
});
