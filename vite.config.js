import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    // Code splitting (issue #31): the default Vite/Rollup chunking already
    // isolates shared react/react-dom/lucide into its own cacheable chunk (a
    // "must be shared by both entries" chunk), keeps i18n inside the landing
    // entry only, and leaves the admin panel as a separate entry that only
    // loads on /admin. We benchmarked manualChunks variants (single "vendor",
    // "vendor-react" + "vendor-icons", etc.) and every explicit split made
    // gzip WORSE for both landing (~+2-3KB) and admin (~+6-8KB) than leaving
    // Rollup's default boundaries alone, so we intentionally do NOT hand-chunk.
    // Real size wins come from lazy-loading components (see src/admin).
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        admin: resolve(import.meta.dirname, "admin.html"),
        notfound: resolve(import.meta.dirname, "404.html"),
      },
    },
  },
  test: {
    // Unit tests only. Playwright lives in tests/e2e and MUST NOT be picked up
    // by Vitest — it is executed by `npm run test:visual` / CI's visual job.
    include: ["tests/*.test.{js,jsx}"],
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
    // Component tests (React Testing Library) need a DOM. The server-side
    // tests keep working because jsdom still exposes Node built-ins.
    environment: "jsdom",
    setupFiles: ["./tests/setup.js"],
    env: {
      VITE_AWS_API_URL: "https://api.example.test",
      VITE_AWS_API_KEY: "test-api-key",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
      // Only source we actually own; entry points and generated locales are
      // wiring/content, not logic worth a percentage.
      include: ["src/**/*.{js,jsx}", "shared/**/*.mjs"],
      exclude: [
        "src/main.jsx",
        "src/admin-main.jsx",
        "src/locales/**",
        "src/**/*.css",
      ],
      // Issue #37 requires >=70% coverage of the key logic. UI shells are
      // exercised by the Playwright suites, so the hard gate is scoped to the
      // modules where a bug is data loss / security, not styling.
      thresholds: {
        "src/admin/helpers.js": { statements: 70, lines: 70, branches: 60, functions: 60 },
        "src/admin/validate.js": { statements: 70, lines: 70, branches: 60, functions: 60 },
        "src/lib/products.js": { statements: 70, lines: 70, branches: 60, functions: 60 },
        "src/lib/site-config.js": { statements: 70, lines: 70, branches: 60, functions: 60 },
        "src/components/ProductCard.jsx": {
          statements: 70,
          lines: 70,
          branches: 60,
          functions: 60,
        },
        "src/components/ProductModal.jsx": {
          statements: 70,
          lines: 70,
          branches: 60,
          functions: 60,
        },
        "src/components/Contact.jsx": { statements: 70, lines: 70, branches: 60, functions: 60 },
        "shared/schema.mjs": { statements: 80, lines: 80, branches: 80, functions: 80 },
        "shared/images.mjs": { statements: 80, lines: 80, branches: 60, functions: 80 },
        "shared/session.mjs": { statements: 70, lines: 70, branches: 70, functions: 70 },
        "shared/github.mjs": { statements: 70, lines: 70 },
      },
    },
  },
});
