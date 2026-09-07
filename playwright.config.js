import { defineConfig } from "@playwright/test";

const PORT = 4173;

// Visual regression gate — compares rendered screenshots against committed
// baselines (see tests/e2e/visual.spec.js). Baselines are regenerated only by
// the "Update visual baselines" workflow, so an intentional UI change never
// merges unless it is explicitly blessed.
//
// IMPORTANT: run on the SAME renderer as CI (Ubuntu). Never regenerate
// baselines on macOS/Windows — font metrics differ and would make every PR fail.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.js",
  fullyParallel: false,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      // 0.2% of pixels may differ — enough headroom for font antialiasing, tight
      // enough to catch any real visual change (an unplanned navbar wrap shifts
      // far more than 0.2%).
      maxDiffPixelRatio: 0.002,
      threshold: 0.15,
      animations: "disabled",
      caret: "hide",
    },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    colorScheme: "dark",
    viewport: { width: 1280, height: 800 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  reporter: process.env.CI ? [["line"], ["github"]] : [["line"]],
});