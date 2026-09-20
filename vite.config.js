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
        main: resolve(__dirname, "index.html"),
        admin: resolve(__dirname, "admin.html"),
        notfound: resolve(__dirname, "404.html"),
      },
    },
  },
  test: {
    // Unit tests only. Playwright lives in tests/e2e and MUST NOT be picked up
    // by Vitest — it is executed by `npm run test:visual` / CI's visual job.
    include: ["tests/*.test.js"],
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
  },
});
