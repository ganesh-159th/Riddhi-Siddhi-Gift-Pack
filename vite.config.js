import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
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
