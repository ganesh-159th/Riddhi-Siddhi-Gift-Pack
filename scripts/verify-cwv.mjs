import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const url = process.env.SITE_URL || "https://dd4hzdnwrj3px.cloudfront.net";
const cli = fileURLToPath(new URL("../node_modules/lighthouse/cli/index.js", import.meta.url));
const report = resolve(root, process.env.CWV_REPORT || "test-results/lighthouse.json");

mkdirSync(dirname(report), { recursive: true });

execFileSync(
  process.execPath,
  [
    cli,
    url,
    "--quiet",
    "--chrome-flags=--headless --no-sandbox --disable-gpu",
    "--only-categories=performance",
    "--output=json",
    `--output-path=${report}`,
  ],
  { stdio: "inherit" },
);

const results = JSON.parse(readFileSync(report, "utf8"));
const audits = results.audits || {};
const thresholds = [
  ["lcp", "largest-contentful-paint", 2500],
  ["cls", "cumulative-layout-shift", 0.1],
  ["tbt", "total-blocking-time", 200],
];
const values = {};
let failed = false;

for (const [name, audit, max] of thresholds) {
  const value = audits[audit]?.numericValue;
  values[name] = value === undefined ? "n/a" : Number(value.toFixed(1));
  if (value === undefined || value > max) {
    failed = true;
  }
}

const score = Math.round((results.categories?.performance?.score || 0) * 100);
console.log(
  `CWV_RESULT score=${score} lcp=${values.lcp} cls=${values.cls} tbt=${values.tbt} lighthouse=${report}`,
);

if (failed) {
  console.error("Core Web Vitals are not green (LCP <= 2500ms, CLS <= 0.1, TBT <= 200ms).");
  process.exitCode = 1;
}
