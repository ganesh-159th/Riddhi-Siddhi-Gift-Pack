// Bundle both AWS Lambda entry points and copy sharp's Linux native modules.
//
// Terraform zips dist-lambda/<function> and ships each as the function code.
// Bundling here (rather than relying on the runtime's AWS SDK) makes the
// deployment deterministic and keeps the source tree's relative imports intact.
//
// Run with: npm run build:lambda
import { existsSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";

const nativeModules = [
  "sharp",
  "@img/colour",
  "@img/sharp-linux-x64",
  "@img/sharp-libvips-linux-x64",
  "detect-libc",
  "semver",
];

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
    external: name === "save-products" ? ["sharp"] : [],
  });

  if (name === "save-products") {
    await mkdir(new URL(`../dist-lambda/${name}/node_modules/`, import.meta.url), { recursive: true });
    for (const mod of nativeModules) {
      const src = new URL(`../node_modules/${mod}/`, import.meta.url);
      if (!existsSync(src)) {
        console.warn(`skipping ${mod}: not installed for this platform`);
        continue;
      }
      await cp(src, new URL(`../dist-lambda/${name}/node_modules/${mod}/`, import.meta.url), {
        recursive: true,
      });
    }
  }
}
