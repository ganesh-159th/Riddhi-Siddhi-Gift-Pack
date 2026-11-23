import { defineConfig } from "@playwright/test";

const baseURL = process.env.ADMIN_E2E_URL || "https://dd4hzdnwrj3px.cloudfront.net";
const apiOrigin = process.env.ADMIN_API_ORIGIN || "";

if (!/^https:\/\/[A-Za-z0-9.-]+$/.test(apiOrigin)) {
  throw new Error("ADMIN_API_ORIGIN must be an HTTPS origin with no path or trailing slash");
}

export default defineConfig({
  testDir: "./tests/cloudfront",
  testMatch: "**/*.spec.js",
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL,
    colorScheme: "dark",
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  reporter: [["line"]],
});
