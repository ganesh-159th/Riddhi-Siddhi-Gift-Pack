# Riddhi Siddhi Gift & Pack

[![CI](https://github.com/ganesh-159th/Riddhi-Siddhi-Gift-Pack/actions/workflows/ci.yml/badge.svg)](https://github.com/ganesh-159th/Riddhi-Siddhi-Gift-Pack/actions/workflows/ci.yml)
[![Deploy](https://github.com/ganesh-159th/Riddhi-Siddhi-Gift-Pack/actions/workflows/deploy.yml/badge.svg)](https://github.com/ganesh-159th/Riddhi-Siddhi-Gift-Pack/actions/workflows/deploy.yml)

Corporate gift & packaging showcase site (Vite + React). The static site is built in CI and
deployed to **AWS S3 + CloudFront** from GitHub Actions using **OIDC** (no long-lived AWS keys).

**Live site:** https://dd4hzdnwrj3px.cloudfront.net (custom domain setup tracked in #129)

## Overview

Riddhi Siddhi Gift & Pack is a Hyderabad-based corporate gifting and packaging business. This
repository contains its public product catalogue, enquiry flow and password-protected admin panel.
Everything is deployed through GitHub Actions — there is no manual path to production.

## Features

- Responsive product catalogue with gallery, quick view, WebP variants and lazy loading
- Multilingual interface: English, हिन्दी and తెలుగు
- WhatsApp enquiry handoff and a validated contact form with spam protection
- Admin panel with login, product editing, validation, preview, version history and rollback
- Product images stored in S3, with variants generated at upload time
- SEO: sitemap, robots, Open Graph image, canonical URLs and LocalBusiness structured data
- Terraform/CloudFormation infrastructure, automated backups, monitoring and cost guardrails
- CI with lint, unit tests, coverage thresholds, Playwright E2E, dependency and security scans

## Tech stack

| Layer | Stack |
| --- | --- |
| Frontend | React 19, Vite 8, Tailwind CSS 4, i18next |
| Backend | AWS Lambda, API Gateway, SSM Parameter Store, Node.js |
| Storage & delivery | S3, CloudFront, ACM/Route53 (pending #129) |
| Infrastructure | Terraform, CloudFormation, GitHub Actions (OIDC) |
| Testing | Vitest, Testing Library, Playwright, ESLint, npm audit, Snyk, ZAP, CodeQL |

## Quick links

- [One-time AWS setup](#one-time-aws-setup)
- [Local development](#local-development)
- [Admin panel login](#admin-panel-login-issue-18)
- [Product image storage](#product-image-storage-s3--cloudfront)
- [Backups & disaster recovery](#backups--disaster-recovery-issue-41)
- [Logging, monitoring & alerting](#logging-monitoring--alerting-issue-39)
- [Local SEO checklist](#local-seo-checklist-issue-33)
- [Netlify → AWS migration (complete)](#netlify--aws-migration-issue-130--complete)
- [Master checklist](https://github.com/ganesh-159th/Riddhi-Siddhi-Gift-Pack/issues/44)

## How it works

Everything is gated by CI/CD. There is no path to production that bypasses the pipeline.

- **CI** (`.github/workflows/ci.yml`) — runs on **every push to any branch** and **every pull
  request**: `npm ci`, ESLint, Vitest with coverage thresholds, `npm audit`, `vite build` + SEO
  verification, and `actionlint` validation of the workflows themselves. Each Playwright job
  builds the site itself (no artifact storage). Key checks:
  - **`Quality gates (lint, tests, build)`** — required before any merge.
  - **`E2E (landing + admin)`** — drives the built site through landing navigation, product modal,
    WhatsApp handoff, contact validation/submission, admin login/create/edit/delete/publish, and
    the admin mobile/tablet checks at 375px/768px (issues #22 and #37).
  - **`Visual regression (UI gate)`** — screenshots the rendered site (navbar desktop/mobile, hero,
    products, footer) and pixel-compares it against committed baselines. Any branch that **changes
    the UI** fails here and cannot merge until the change is intentional (see below).
  - **`Dependency audit (npm audit)`** — blocks **pushes to `main`** (with retries to ride out
    transient npm 503s); report-only on branches/PRs so a flaky registry never blocks feature work.
  - **`Dependency review`** — optional PR gate that blocks a merge when a dependency with a known
    vulnerability is added; active only when GitHub Advanced Security is enabled (see below).
- **CodeQL** (`.github/workflows/codeql.yml`) — semantic security scanning on every push/PR plus a
  weekly cron; active only when GitHub Advanced Security is enabled (see below).
- **Security scans** (`.github/workflows/security.yml`) — static and dynamic coverage for issue #28,
  running alongside npm audit on every push/PR:
  - **`Snyk static analysis (dependencies + SAST)`** — Snyk Open Source checks `package.json` /
    `package-lock.json` against Snyk's advisory database; Snyk Code scans our source. Both use
    `--severity-threshold=high` and block pushes to `main` (report-only on branches/PRs). Skipped
    with a notice when `SNYK_TOKEN` is not configured.
  - **`OWASP ZAP (dynamic scan of built site)`** — builds this commit's `dist/`, serves it with
    `vite preview` and runs a passive ZAP baseline over HTTP. Report-only (artifact
    `zap-dast-report`) so first-run findings do not block unrelated work; `.zap/rules.tsv` filters
    headers that only exist at the CloudFront edge.
- **Deploy** (`.github/workflows/deploy.yml`) — production deploys are **main-only** and serialized
  (`cancel-in-progress: false`, so a production deploy is never cancelled mid-flight):
  1. Assumes an IAM role through GitHub OIDC.
  2. Snapshots the current site to `s3://<bucket>/rollbacks/<sha>/`.
  3. Syncs `dist/` to S3 (immutable caching for `images/`, `no-store` for HTML + `products.json`).
   4. Invalidates the CloudFront cache and smoke-tests the live URL.
   5. **Rollback:** on any failure the previous snapshot is restored and the cache re-invalidated.

## One-time AWS setup

> **Prefer the CloudFormation template.** `provision/cloudformation/site.yaml` describes
> every AWS resource this project needs. For an **existing** deployment, adopt it with
> `provision/cloudformation/adopt.sh` — it *imports* the live resources rather than
> recreating them, which matters because a recreated CloudFront distribution gets a new
> `*.cloudfront.net` domain (the current one, `dd4hzdnwrj3px.cloudfront.net`, is not
> resettable) and would mean a DNS change and broken links.
>
> ```bash
> export ADMIN_API_ORIGIN=https://<api-id>.execute-api.ap-south-1.amazonaws.com
> ALERT_EMAIL=you@example.com provision/cloudformation/adopt.sh            # dry run
> ALERT_EMAIL=you@example.com provision/cloudformation/adopt.sh --execute  # adopt
> provision/cloudformation/verify-live-headers.sh                           # confirm at the edge
> ```
>
> The manual steps below are kept only as a record of how the current stack was built by
> hand. Note they contain two inaccuracies that the template corrects: the bucket is
> **private behind CloudFront OAC**, not statically hosted, and the OIDC trust policy scopes
> to `repo:ganesh-159th/*` rather than a specific repository.

> **Terraform equivalent (issue #38).** `infra/` holds the same stack as Terraform — local
> modules, an S3+DynamoDB state backend, an `import-live.sh` that adopts the existing
> resources, and a `.github/workflows/terraform.yml` that runs `plan` on PRs and `apply` on
> `main` behind approval. Pick **one** source of truth: CloudFormation or Terraform, never
> both against the same resources. To switch to Terraform, delete the `riddhi-site` stack
> (its resources are `DeletionPolicy: Retain`) and follow `infra/README.md`.

1. **S3 bucket** — create a bucket (e.g. `riddhi-siddhi-gift-pack-prod`), keep it **private** and
   serve it through CloudFront Origin Access Control (never enable Static website hosting —
   that bypasses OAC and forces a public bucket). Add an S3 Lifecycle rule to expire
   `rollbacks/` — the template uses **7 days**, which matches what `deploy.yml` can actually
   roll back within.

2. **CloudFront distribution** — point its origin at the bucket's **regional** endpoint
   (`<bucket>.s3.<region>.amazonaws.com`) with an OAC, and the distribution domain becomes
   your `SITE_URL`. The template also sets the security headers, the branded error pages, and
   a viewer-request Function that appends `index.html` to directory-style paths.

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
  **`Quality gates (lint, tests, build)`**, **`Visual regression (UI gate)`**,
  **`Dependency audit (npm audit)`** and **`Snyk static analysis (dependencies + SAST)`** (all run
  on PRs; the Snyk check needs `SNYK_TOKEN` to be set).
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
  Actions, so the pinned actions below stay current. Patch/minor updates arrive grouped by
  production vs development dependencies; major upgrades come as separate PRs and are reviewed
  manually (eslint 10 is ignored until `eslint-plugin-react` supports it). Security alerts and
  auto-fix PRs for them must be switched on under *Settings → Code security* (GitHub-side setting,
  not expressible in `dependabot.yml`).
- **Snyk token (issue #28)** — create a Snyk account, copy the API token from *Account settings →
  General → API token* (or run `npx snyk auth` locally), then add it as repository secret
  **`SNYK_TOKEN`** under *Settings → Secrets and variables → Actions*. Without it the two Snyk
   steps skip with a notice; ZAP and npm audit still run. Forked PRs cannot receive secrets, so
   their Snyk steps skip too. Add the organization slug (for example `ganesh-159th`) as repository
   variable **`SNYK_ORG`** so both scans target that org; Snyk Code must also be enabled there.
   To run the same scans locally: `npx snyk auth` then `npx snyk test` (dependency scan) and
   `npx snyk code test` (SAST) from the repo root.
- **Pinned actions** — every `uses:` in these workflows is pinned to a full commit SHA (tag shown in
  the trailing comment), so third-party action code cannot change underneath the pipeline.

## Cost & budget guardrails (issues #42, #43)

This site is **S3 + CloudFront only** (a static site), so the site itself stays well
within the [AWS free tier](https://aws.amazon.com/free/).

### Measured, not estimated

Earlier versions of this section claimed "$0.00/month". That was wrong. Actuals for
September 2026 (Cost Explorer, `ap-south-1` account `352329341119`):

| Line item                             | Sep 2026 | What it is                                     |
| ------------------------------------- | -------- | ---------------------------------------------- |
| `GetCostAndUsage` (Cost Explorer API) | **$2.00** | **85% of total spend — and not the website**   |
| S3 `PutObject`                        | $0.08    | every deploy re-PUTs its whole snapshot        |
| S3 `GetObject` / `ListBucket` / storage | $0.01  | visitor traffic — negligible                   |
| **Total**                             | **$2.09** |                                             |

The honest summary: **the website costs ~$0.09/month; the tooling around it cost $2.00.**
Cost Explorer bills per API call, so any script that polls `ce get-cost-and-usage` in a
loop will burn real money. Prefer CloudWatch metrics and budget notifications.

The largest controllable saving was `PutObject`: because `rollbacks/<sha>/` is a brand-new
empty prefix on every deploy, `aws s3 sync` re-PUTs every staged object whether or not it
changed. The backup now excludes `products/*` (admin-owned, never touched by a code deploy,
and must never be rolled back), which removes ~175 PUTs per deploy.

| Resource        | Free tier allowance                | What we expect to use          |
| --------------- | ---------------------------------- | ------------------------------ |
| S3 storage      | 5 GB + 20k GET / 2k PUT / 15GB out | ~90 MB, dominated by `rollbacks/` |
| CloudFront      | 1 TB transfer + 10M requests/mo    | tiny (site is lightweight)     |
| IAM / Budgets / Lifecycle | free                          | n/a                            |
| Cost Explorer API | **not free — per call**          | avoid polling it              |

The versioning + daily snapshot backups from issue #41 add ~0.25 MB/month of
snapshots and ~30 Lambda invocations/PUTs — still free tier. See
[Backups & disaster recovery](#backups--disaster-recovery-issue-41).

**Deliberately avoided** (they are NOT free — see issue #42):
- **Route 53** hosted zone (~$0.50/mo) — we use the free `*.cloudfront.net` domain instead.
- **WAF** (~$5/mo) — not needed for a low-traffic static site.
- **Reserved / Savings Plans** — makes no sense at this spend level.
- **Lambda / API Gateway as the default runtime** — the public site is static, so no
  compute is required. The one exception is the opt-in admin publish endpoint
  (`POST /api/save-products`, issue #4): Lambda stays in the free tier and API Gateway REST
  is free for the first 1M calls/month for 12 months, then $3.50/M — negligible at
  admin-publish volumes. It is deliberately **not** put in a VPC (a NAT Gateway is
  ~$32/month) and not protected by WAF (usage plans give the throttling for free).
  CloudFront Functions (used for the `Permissions-Policy` header) *are* free and stay well
  inside the 2M invocations/month allowance.
- **CloudFront `PriceClass_300`** — the distribution is on `PriceClass_200`, which excludes
  Asia edges even though the customers are in Hyderabad. That is a deliberate
  cost-over-latency trade at this traffic level; raising it needs budget headroom.

### Setting the guardrails up

`provision/cloudformation/site.yaml` now manages the budget and its alerting
(`CostAlertTopic`, `MonthlySpendBudget`) — it alerts at 50/80/100% of a **$1.00/month** cap
plus a 100% forecast alert, all with real email subscribers.

> The budget that existed before was `$5.00/month` with an **empty `Notifications` array**,
> so it could never alert on anything. A budget without subscribers is decoration.

> **Deprecated.** `site.yaml` is the source of truth for every guardrail below; this script
> is a legacy print-only record kept for reference. Where the two disagree, the template
> wins. Do not run its output against the production bucket — it would overwrite the real
> budget with a `$0.01` cap. Its one piece of live logic is the `rollbacks/` lifecycle rule,
> and it now reads the retention window out of `site.yaml` at runtime so the two cannot
> drift.

`provision/generate-cost-guardrails.sh` still prints the older copy-pasteable commands
(bucket tags, an S3 lifecycle rule for `rollbacks/`) and documents a **$0.01** cap rather
than the template's `$1.00`.

**Rollback retention is 7 days everywhere.** `site.yaml` is the source of truth;
`deploy.yml` prunes to the same window and `generate-cost-guardrails.sh` derives its value
from the template. The "Rollback retention is consistent" gate in
`.github/workflows/ci.yml` asserts all three agree and fails the build if they don't, so
this cannot silently drift again.

> This was previously stated three different ways (7 days in the template and `deploy.yml`,
> ~30 in this file, 90 in `generate-cost-guardrails.sh`). The 90-day variant was also a
> live cost bug, not just untidy prose: it transitioned `rollbacks/` to `GLACIER` at 7 days
> and `DEEP_ARCHIVE` at 30, and both storage classes carry minimum storage durations (90
> and 180 days) with no free-tier allowance — so it would have billed for months of objects
> that `deploy.yml` had already made unreachable.

Verify the guardrails are actually live:

```bash
# ADMIN_API_ORIGIN is the origin of `terraform output -raw aws_api_url` (no /prod path).
ADMIN_API_ORIGIN=https://<api-id>.execute-api.ap-south-1.amazonaws.com \
  provision/cloudformation/verify-live-headers.sh   # includes budget-subscriber check
```

## Backups & disaster recovery (issue #41)

The two things that cannot be regenerated from source code — `products.json` and
the admin-uploaded product photos — are protected in three layers:

1. **S3 versioning** on the site bucket (`riddhi-siddhi-gift-pack-prod`): an
   accidental delete or overwrite of `products.json` or `products/*` is recoverable.
   Old versions and delete markers expire after 30 days, so storage stays bounded.
2. **Daily snapshots** to a separate private bucket
   (`riddhi-siddhi-gift-pack-backups`) by the `riddhi-backup-products` Lambda on
   EventBridge (`cron(0 3 * * ? *)`): `products/<YYYY-MM-DD>/products.json` plus a
   `manifest.json` with counts/ETags. Snapshots expire after 90 days.
3. **Incremental image copies** to `images/<key>` in that backup bucket. Only
   new or changed images are copied (ETag + size comparison), so a normal run
   issues zero image PUTs. Backups survive deletion of the site bucket.

Failures page the existing ops SNS topic via two CloudWatch alarms (Lambda
`Errors > 0`, and no invocation for two days). No new SNS topic is created.

**Manual export:** open `/admin.html` → **Download products.json**. It writes
the current in-browser catalogue to your computer; no AWS calls involved.

**Restore products.json (recommended path):**

```bash
# A) from a daily snapshot
aws s3 cp s3://riddhi-siddhi-gift-pack-backups/products/2026-11-19/products.json \
  public/products.json --region ap-south-1

# B) from an S3 version of the live object
aws s3api list-object-versions --bucket riddhi-siddhi-gift-pack-prod \
  --prefix products.json --region ap-south-1
aws s3api get-object --bucket riddhi-siddhi-gift-pack-prod --key products.json \
  --version-id <VERSION_ID> public/products.json --region ap-south-1

# C) undo a delete marker (makes the previous version current again)
aws s3api delete-object --bucket riddhi-siddhi-gift-pack-prod \
  --key products.json --version-id <DELETE_MARKER_VERSION_ID> --region ap-south-1
```

Commit the restored `public/products.json` to GitHub and push to `main`: the
deploy workflow publishes it and invalidates CloudFront. Verify by loading
`/products.json` with a cache-busting query string and checking the admin panel.

**Restore a product photo:**

```bash
aws s3 cp s3://riddhi-siddhi-gift-pack-backups/images/products/<key> \
  s3://riddhi-siddhi-gift-pack-prod/products/<key> --region ap-south-1
aws cloudfront create-invalidation --distribution-id <DIST_ID> \
  --paths "/products/<key>" --region us-east-1
```

Then re-save the product in the admin panel if its metadata needs updating.

**Verify the backups** (read-only, no AWS charges beyond a few S3 requests):

```bash
./infra/scripts/verify-backup.sh
```

It checks versioning, finds the newest snapshot, validates its JSON and counts
backed-up images.

**Cost:** enabling versioning is free; ~30 × 8 KB daily snapshots (~0.25 MB/month),
30 Lambda invocations and ~30 S3 PUTs stay inside the free tier, and the alarms
use the already-existing SNS topic. Incremental copies mean ~11 MB of photos is
written once, not every day. Realistic added cost is **~$0.00–0.01/month**.
Cross-region replication is deliberately not enabled: it would add real
replication and storage charges.

## Logging, monitoring & alerting (issue #39)

The production stack ships logs and metrics to CloudWatch and alerts to SNS:

- **CloudFront** access logs (v2) and **S3** server access logs land in a private
  log bucket (`logs_bucket_name`, 90-day expiry).
- **API Gateway** writes JSON access logs; **Lambda** writes one structured JSON
  line per request with `requestId`, `apiRequestId`, `coldStart` and duration.
- A CloudWatch dashboard shows requests, 5xx/4xx rates, throttles, latency,
  Lambda errors, S3 storage and synthetic results.
- Alarms cover API 5xx, API 429 throttles, Lambda errors/throttles, CloudFront
  5xx/4xx and synthetic canary failures. They publish to SNS **email** and, if
  configured, **SMS**.
- A CloudWatch Synthetics canary checks `/` and `/products.json` hourly. It is
  the only billed monitoring item (~USD 0.9/month); set `canary_enabled = false`
  to skip it.

Operational details, outputs and the external uptime/status-page setup are in
[`infra/README.md`](infra/README.md#centralised-logging-monitoring-and-alerting-issue-39).

## Local development

```bash
npm install
npm run dev            # local dev server
npm run lint           # ESLint
npm test               # Vitest (unit + component)
npm run test:coverage  # Vitest + enforced >=70% gate on key logic
npm run build          # production build to dist/
npm run preview        # serve the built dist/ locally
npm run test:e2e       # Playwright: landing, contact, admin CRUD + responsive
npm run test:visual    # visual regression VS committed baselines (Ubuntu only)
npm run test:admin     # admin panel responsive checks (mobile/tablet)
```

> **Node**: use **Node 22** (see `.nvmrc`). Node ≤21 cannot run this repo's Vite 8 build.

## Admin panel login (issue #18)

`/admin.html` is behind a sign-in screen. Logging in calls `POST /api/admin-login` on the AWS
Lambda, which checks the password against `ADMIN_TOKEN` and returns a short-lived session token
signed with `JWT_SECRET`. The token is stored in `sessionStorage` (or `localStorage` when “Keep
me signed in” is ticked), expires after `SESSION_TTL_HOURS` (default 12), and is verified by every
admin route on each call. Sign out anytime via the button in the admin header. No extra AWS
services are used — HMAC signing runs inside the same Lambda that serves the API.

## Product image storage (S3 + CloudFront)

Product photos no longer live in the GitHub repo. The admin panel uploads them straight to the
**S3 bucket** and they are served through the **CloudFront CDN**:

1. Admin picks/compresses a photo client-side (`src/admin/helpers.js`).
2. `POST /api/presign-image` returns a **presigned S3 PUT URL** signed by the Lambda role.
3. The browser uploads the JPEG directly to S3 (`products/<id>/<name>.jpg`) — no base64, no GitHub.
4. `POST /api/process-image` reads it back, generates the responsive **jpg/webp variants** and the
   image **metadata** (path, dimensions, size) recorded on the product.
5. `POST /api/save-products` commits only `products.json` (image *references*, never binaries),
   then sweeps S3 for **orphaned images** no product references anymore (grace: 30 min, tunable via
   `ORPHAN_GRACE_MINUTES`).

**Backend configuration** (SSM Parameter Store under `/riddhi/prod`; secrets are created by
`infra/scripts/set-secrets.sh`, `GITHUB_REPO`/`S3_BUCKET`/`ENQUIRIES_BUCKET` by Terraform):

| Name                 | Value                                        |
| -------------------- | -------------------------------------------- |
| `ADMIN_TOKEN`        | admin password — checked by `admin-login`    |
| `JWT_SECRET`         | random string used to sign admin sessions    |
| `SESSION_TTL_HOURS`  | hours an admin session stays valid (default 12) |
| `GITHUB_TOKEN`       | repo-scoped token (unchanged)                |
| `GITHUB_REPO`        | `ganesh-159th/Riddhi-Siddhi-Gift-Pack`       |
| `AWS_REGION`         | `ap-south-1`                                 |
| `S3_BUCKET`          | `riddhi-siddhi-gift-pack-prod`               |
| `ENQUIRIES_BUCKET`   | `riddhi-siddhi-gift-pack-enquiries`          |
| `ORPHAN_GRACE_MINUTES` | `30` (default)                            |

**Build-time frontend env** (GitHub repository variable/secret injected by `deploy.yml`):

| Name                 | Value                                        |
| -------------------- | -------------------------------------------- |
| `VITE_AWS_API_URL`   | `terraform -chdir=infra/environments/prod output -raw aws_api_url` |
| `VITE_AWS_API_KEY`   | `terraform -chdir=infra/environments/prod output -raw aws_api_key` |

The key is public by design (usage-plan identification); access control is the signed session.

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

Product images have been migrated to S3; the legacy `public/images/*` product photos and their
responsive variants were removed. `og-cover.jpg` and its variants remain because the OG/Twitter
cards and sitemap image entries still reference them.

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

## Netlify → AWS migration (issue #130 — complete)

The migration launch gate is complete: production no longer depends on Netlify.

- **Static hosting** is S3 + CloudFront (`deploy.yml`); `netlify.toml` and `deno.lock` are gone.
- **All backend routes** — `admin-login`, `history-products`, `rollback-products`,
  `presign-image`, `process-image`, `save-products`, `submit-enquiry` and `csp-report` — run on
  one Lambda behind API Gateway. The frontend and admin panel use `VITE_AWS_API_URL` for every
  call; there is no Netlify fallback.
- **Contact form** leads are written as encrypted JSON objects under `enquiries/` in a
  dedicated private bucket that CloudFront cannot reach. The hidden Netlify Forms registration
  and `form-name` fields were removed.
- **Long-lived AWS keys are gone**: presigning and image processing use the Lambda's temporary
  IAM role credentials. Legacy product images were removed from `public/images/*` (the OG cover
  stays). `products.json` was never on Netlify.
- **No redirects were lost**: `netlify.toml` only defined headers (now mirrored in CloudFront
  policies) and the `*.netlify.app` origin only hosted API endpoints.

If you still have the old Netlify Forms export, import it once with:

```bash
ENQUIRIES_BUCKET=$(terraform -chdir=infra/environments/prod output -raw enquiries_bucket_name) npm run import:enquiries -- netlify-enquiries.csv
```

The importer writes `enquiries/imported/<day>/<id>.json` objects and is idempotent per source
submission ID (or a hash of the row when no ID is present).

Cost target is unchanged: the Lambda is free below 1M requests/month, the REST API is free for
the first 1M calls/month for 12 months (then $3.50/M), and there is no NAT Gateway or WAF —
see `infra/README.md`.

## Active launch work

The Netlify migration gate (#130) is complete. Remaining work is tracked in the
[master checklist](https://github.com/ganesh-159th/Riddhi-Siddhi-Gift-Pack/issues/44):

- #126 — contact form submission on AWS
- #127 — admin CSP cross-origin API calls
- #128 — WAF and endpoint rate limiting
- #129 — custom domain and HTTPS certificate
- #136 — GitHub token and CI credential hardening
- #137 — admin login throttling and session revocation
- #142 — production verification and launch-gate sign-off

## Contact

- **Business:** Riddhi Siddhi Gift & Pack, Hyderabad, India
- **Phone / WhatsApp:** [+91 93467 97060](https://wa.me/919346797060)
- **Enquiries:** use the contact form on the [live site](https://dd4hzdnwrj3px.cloudfront.net)
