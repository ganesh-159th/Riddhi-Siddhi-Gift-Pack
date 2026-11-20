// Bundle both AWS Lambda entry points into single self-contained files.
//
// Terraform zips dist-lambda/<function> and ships each as the function code.
// Bundling here (rather than relying on the runtime's AWS SDK) makes the
// deployment deterministic and keeps the source tree's relative imports intact.
//
// Run with: npm run build:lambda
import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";

const functions = ["save-products", "backup-products"];

for (const name of functions) {
  const outdir = `dist-lambda/${name}`;

  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });

  await build({
    entryPoints: [`lambda/${name}/index.mjs`],
    outfile: `${outdir}/index.cjs`,
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    sourcemap: false,
    legalComments: "none",
    logLevel: "info",
  });
}
