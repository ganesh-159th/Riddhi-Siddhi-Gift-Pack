// Bundle the AWS Lambda entry point into a single self-contained file.
//
// Terraform zips dist-lambda/save-products and ships it as the function code.
// Bundling here (rather than relying on the runtime's AWS SDK) makes the
// deployment deterministic and keeps the source tree's relative imports intact.
//
// Run with: npm run build:lambda
import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";

const outdir = "dist-lambda/save-products";

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: ["lambda/save-products/index.mjs"],
  outfile: `${outdir}/index.cjs`,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
});
