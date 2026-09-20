# Riddhi Siddhi Gift & Pack

[![CI](https://github.com/ganesh-159th/Riddhi-Siddhi-Gift-Pack/actions/workflows/ci.yml/badge.svg)](https://github.com/ganesh-159th/Riddhi-Siddhi-Gift-Pack/actions/workflows/ci.yml)
[![Deploy](https://github.com/ganesh-159th/Riddhi-Siddhi-Gift-Pack/actions/workflows/deploy.yml/badge.svg)](https://github.com/ganesh-159th/Riddhi-Siddhi-Gift-Pack/actions/workflows/deploy.yml)

Corporate gift & packaging showcase site (Vite + React). The static site is built in CI and
deployed to **AWS S3 + CloudFront** from GitHub Actions using **OIDC** (no long-lived AWS keys).

## How it works

Everything is gated by CI/CD. There is no path to production that bypasses the pipeline.

- **CI** (`.github/workflows/ci.yml`) — runs on **every push to any branch** and **every pull
  request**: `npm ci`, ESLint, Vitest, `npm audit`, `vite build` + SEO verification, and `actionlint`
  validation of the workflows themselves. The built `dist/` is uploaded as an artifact
  (`dist-<sha>`, 7-day retention). Key checks:
  - **`Quality gates (lint, tests, build)`** — required before any merge.
  - **`Admin panel responsive (mobile/tablet)`** — drives the built admin panel at 375px/768px
    and asserts no horizontal overflow, tappable controls, camera photo upload and the draft/
    sync indicator (issue #22).
  - **`Visual regression (UI gate)`** — screenshots the rendered site (navbar desktop/mobile, hero,
    products, footer) and pixel-compares it against committed baselines. Any branch that **changes
    the UI** fails here and cannot merge until the change is intentional (see below).
  - **`Dependency audit (npm audit)`** — blocks **pushes to `main`** (with retries to ride out
    transient npm 503s); report-only on branches/PRs so a flaky registry never blocks feature work.
  - **`Dependency review`** — optional PR gate that blocks a merge when a dependency with a known
    vulnerability is added; active only when GitHub Advanced Security is enabled (see below).
- **CodeQL** (`.github/workflows/codeql.yml`) — semantic security scanning on every push/PR plus a
  weekly cron; active only when GitHub Advanced Security is enabled (see below).
- **Deploy** (`.github/workflows/deploy.yml`) — production deploys are **main-only** and serialized
  (`cancel-in-progress: false`, so a production deploy is never cancelled mid-flight):
  1. Assumes an IAM role through GitHub OIDC.
  2. Snapshots the current site to `s3://<bucket>/rollbacks/<sha>/`.
  3. Syncs `dist/` to S3 (immutable caching for `images/`, `no-store` for HTML + `products.json`).
  4. Invalidates the CloudFront cache and smoke-tests the live URL.
  5. **Rollback:** on any failure the previous snapshot is restored and the cache re-invalidated.

## One-time AWS setup

1. **S3 bucket** — create a bucket (e.g. `riddhi-siddhi-gift-pack-prod`), enable **Static website
   hosting** (or better, keep it private and use CloudFront Origin Access Control). Add an S3
   Lifecycle rule to expire `rollbacks/` after ~30 days — this is what keeps rollback snapshots tidy.

2. **CloudFront distribution** — point its origin at the bucket. The **origin domain must be the
   bucket's website/regional endpoint**, and the regular distribution domain will be your `SITE_URL`.

3. **GitHub OIDC provider + role** — in IAM: *Identity providers → Add provider* →
   `token.actions.githubusercontent.com`. Create a role and attach the following **trust policy**
   (replace `ACCOUNT_ID`):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": {
           "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
         },
         "Action": "sts:AssumeRoleWithWebIdentity",
         "Condition": {
           "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
           "StringLike": { "token.actions.githubusercontent.com:sub": "repo:ganesh-159th/Riddhi-Siddhi-Gift-Pack:*" }
         }
       }
     ]
   }
   ```

   Attach this **permissions policy** (replace `BUCKET` and `DISTRIBUTION_ID`):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "S3StaticSite",
         "Effect": "Allow",
         "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
         "Resource": ["arn:aws:s3:::BUCKET", "arn:aws:s3:::BUCKET/*"]
       },
       {
         "Sid": "CloudFrontInvalidation",
         "Effect": "Allow",
         "Action": "cloudfront:CreateInvalidation",
         "Resource": "arn:aws:cloudfront::ACCOUNT_ID:distribution/DISTRIBUTION_ID"
       }
     ]
   }
   ```

4. **Configure GitHub** — `Settings → Secrets and variables → Actions`:

   | Name                        | Type     | Where      | Example / value                                  |
   | --------------------------- | -------- | ---------- | ------------------------------------------------ |
   | `AWS_ROLE_ARN`              | Secret   | Repository | `arn:aws:iam::123456789012:role/riddhi-cicd`     |
   | `AWS_REGION`                | Variable | Repository | `ap-south-1`                                     |
   | `S3_BUCKET`                 | Variable | Repository | `riddhi-siddhi-gift-pack-prod`                   |
   | `CLOUDFRONT_DISTRIBUTION_ID`| Variable | Repository | `E2EXAMPLEID`                                    |
   | `SITE_URL`                  | Variable | Repository | `https://d123.cloudfront.net`                    |

   These five values are all you need for the deployment pipeline.

## Protection rules

- **Environment protection** — `Settings → Environments → production → Add protection rule → Required
  reviewers`. Optionally give jobs a `timeout-minutes`. This pauses deploys until a reviewer approves.
- **Branch protection** — `Settings → Branches → main → Add rule`: require a pull request within at
  least one review, and require status checks to pass before merging. Add these status checks:
  **`Quality gates (lint, tests, build)`**, **`Visual regression (UI gate)`** and
  **`Dependency audit (npm audit)`** (all run on PRs).
- **Visual regression — how to bless an intentional UI change**: the **`Update visual baselines`**
  workflow (Actions tab → *workflow_dispatch*) regenerates the committed screenshots on Ubuntu and
  opens a PR. Once that PR's own `Visual regression` check passes and it merges, the new look becomes
  the baseline and later PRs are compared against it. Never regenerate baselines on your own machine
  (macOS/Windows font metrics differ and would break every PR).
- **GitHub Advanced Security (optional)** — this repo is **private**, so `Dependency review` and
  `CodeQL` need Advanced Security. Enable it under `Settings → Code security`, then set the Actions
  variable **`ENABLE_GHAS=true`** (repo → Settings → Secrets and variables → Actions). The security
  jobs activate automatically; unset the variable to turn them back off.
- **Dependabot** (`.github/dependabot.yml`) — weekly grouped PRs for both `npm` and the GitHub
  Actions, so the pinned actions below stay current.
- **Pinned actions** — every `uses:` in these workflows is pinned to a full commit SHA (tag shown in
  the trailing comment), so third-party action code cannot change underneath the pipeline.

## Cost & budget guardrails (issues #42, free-tier target)

This site is **S3 + CloudFront only** (a static site), so it stays well within the
[AWS free tier](https://aws.amazon.com/free/) and should cost **$0.00/month**.

| Resource        | Free tier allowance                | What we expect to use          |
| --------------- | ---------------------------------- | ------------------------------ |
| S3 storage      | 5 GB + 20k GET / 2k PUT / 15GB out | a few MB + a few k requests    |
| CloudFront      | 1 TB transfer + 10M requests/mo    | tiny (site is lightweight)     |
| IAM / Budgets / Cost Explorer / Lifecycle | free                 | n/a                            |

**Deliberately avoided** (they are NOT free — see issue #42):
- **Route 53** hosted zone (~$0.50/mo) — we use the free `*.cloudfront.net` domain instead.
- **WAF** (~$5/mo) — not needed for a low-traffic static site.
- **Reserved / Savings Plans** — makes no sense at $0 spend.
- **Lambda / API Gateway** — the site is static; no serverless backend is required.

### Setting the guardrails up

`provision/generate-cost-guardrails.sh` prints all the (free) AWS CLI commands to:
1. Tag resources `Project=RiddhiSiddhi` + `Env=prod` (Cost Explorer grouping).
2. Create an **AWS Budget** (`free-tier-guard`) that alerts if spend exceeds **$0.01**.
3. Create a second **budget** (`free-tier-thresholds`) that notifies at 50/80/100% of that cap.
4. Add an **S3 lifecycle** rule to tier old `rollbacks/<sha>/` backups to Glacier, then expire.
5. Enable **Cost Anomaly Detection** alerts.

Nothing in that script costs anything monthly. Run it once (or apply the steps in the AWS
console: *Billing → Budgets*, *Cost Explorer → Tags & Cost Anomaly Detection*, bucket
*Management → Lifecycle*) to keep costs predictable with **no surprise bills**.

## Local development

```bash
npm install
npm run dev            # local dev server
npm run lint           # ESLint
npm test               # Vitest
npm run build          # production build to dist/
npm run preview        # serve the built dist/ locally
npm run test:visual    # visual regression VS committed baselines (Ubuntu only)
npm run test:admin     # admin panel responsive checks (mobile/tablet)
```

> **Node**: use **Node 22** (see `.nvmrc`). Node ≤21 cannot run this repo's Vite 8 build.

## Product image storage (S3 + CloudFront)

Product photos no longer live in the GitHub repo. The admin panel uploads them straight to the
**S3 bucket** and they are served through the **CloudFront CDN**:

1. Admin picks/compresses a photo client-side (`src/admin/helpers.js`).
2. `presign-image` Netlify function returns a **presigned S3 PUT URL**.
3. The browser uploads the JPEG directly to S3 (`products/<id>/<name>.jpg`) — no base64, no GitHub.
4. `process-image` reads it back, generates the responsive **jpg/webp variants** and the image
   **metadata** (path, dimensions, size) recorded on the product.
5. `save-products` commits only `products.json` (image *references*, never binaries), then sweeps
   S3 for **orphaned images** no product references anymore (grace: 30 min, tunable via
   `ORPHAN_GRACE_MINUTES`).

**Netlify env vars** (Build & deploy → Environment) needed by the functions:

| Name                 | Value                                        |
| -------------------- | -------------------------------------------- |
| `ADMIN_TOKEN`        | same admin password as today                 |
| `GITHUB_TOKEN`       | repo-scoped token (unchanged)                |
| `GITHUB_REPO`        | `ganesh-159th/Riddhi-Siddhi-Gift-Pack`       |
| `AWS_ACCESS_KEY_ID`  | AWS key with `s3:PutObject`/`GetObject`/`ListBucket`/`DeleteObject` on the bucket |
| `AWS_SECRET_ACCESS_KEY` | matching secret                            |
| `AWS_REGION`         | `ap-south-1`                                 |
| `S3_BUCKET`          | `riddhi-siddhi-gift-pack-prod`               |
| `ORPHAN_GRACE_MINUTES` | `30` (default)                            |

**S3 bucket CORS** — because the browser PUTs directly to S3, add CORS to the bucket (Permissions →
CORS):

```json
[
  {
    "AllowedOrigins": ["https://dd4hzdnwrj3px.cloudfront.net"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

The bucket stays private; CloudFront serves `products/*` via its existing origin. The deploy
workflow already **excludes `products/*`** from its `--delete` sync so the pipeline never wipes
uploaded photos.

### Migrating existing images (one-time)

```bash
AWS_REGION=ap-south-1 S3_BUCKET=riddhi-siddhi-gift-pack-prod \
  node scripts/migrate-images-to-s3.mjs --dry-run   # preview mapping first
AWS_REGION=ap-south-1 S3_BUCKET=riddhi-siddhi-gift-pack-prod \
  node scripts/migrate-images-to-s3.mjs             # upload + rewrite products.json
```

The script uploads every referenced `public/images/*` photo (+ responsive variants) under
`products/<product-id>/…`, then rewrites `public/products.json` to point at S3 with recorded
metadata. **Commit the new `products.json`** so the live site re-deploys; after verifying the CDN
URLs, delete the now-unused `public/images/*` and `public/images/responsive/*`.

## Local SEO checklist (issue #33)

The code-implementable parts of local SEO are in the repo: `index.html` carries the
canonical / `robots` / `x-default hreflang` / OG tags and a `LocalBusiness` schema with
`openingHoursSpecification`, `areaServed`, `hasOfferCatalog` and local keywords; the build
generates `sitemap.xml`, `robots.txt` and image sitemaps into `dist/`
(`scripts/generate-seo.mjs`).

The remaining items are **manual, outside code**:

1. Claim/verify the **Google Business Profile** (address: Plus Code `9CMW+QW`, Hyderabad).
2. Add website URL, product photos, business hours and services to the **GBP listing**.
3. Verify the domain in **Google Search Console** and submit
   `https://dd4hzdnwrj3px.cloudfront.net/sitemap.xml`.
4. Set up **Bing Webmaster Tools** (add the site + the same sitemap).
5. After the GBP is live, grab its **CID** and paste it into `REVIEW_CID` in
   `src/lib/site-config.js` so the review CTAs become direct write-review links.

**Search-engine site verification**: once Google/Bing issue their tokens, set the
`GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION` build-time env vars
(see `.env.example`). If set, the build injects the corresponding `<meta>` tags into
`<head>` (they are skipped entirely when empty, so the page is unchanged until then).
In CI, expose them as GitHub repository variables/secrets so `npm run build` picks them up.

## Notes on migrating off Netlify

Netlify is used for two things today:

- **Static hosting** — replaced by S3 + CloudFront via this pipeline.
- **Admin panel functions** — the admin dashboard saves product edits and uploads photos through
  Netlify Functions (`netlify/functions/save-products.mjs`, `presign-image.mjs`,
  `process-image.mjs`). To fully decommission Netlify, either migrate them to AWS Lambda +
  API Gateway / CloudFront Functions later, or keep Netlify as a **function-only** host (pause its
  build & deploy so it stops auto-deploying).