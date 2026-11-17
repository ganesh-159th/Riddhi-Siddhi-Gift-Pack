# Riddhi Siddhi Gift & Pack

[![CI](https://github.com/ganesh-159th/Riddhi-Siddhi-Gift-Pack/actions/workflows/ci.yml/badge.svg)](https://github.com/ganesh-159th/Riddhi-Siddhi-Gift-Pack/actions/workflows/ci.yml)
[![Deploy](https://github.com/ganesh-159th/Riddhi-Siddhi-Gift-Pack/actions/workflows/deploy.yml/badge.svg)](https://github.com/ganesh-159th/Riddhi-Siddhi-Gift-Pack/actions/workflows/deploy.yml)

Corporate gift & packaging showcase site (Vite + React). The static site is built in CI and
deployed to **AWS S3 + CloudFront** from GitHub Actions using **OIDC** (no long-lived AWS keys).

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
provision/cloudformation/verify-live-headers.sh   # includes budget-subscriber check
```

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

`/admin.html` is now behind a sign-in screen. Logging in calls the `admin-login` Netlify
function, which checks the password against `ADMIN_TOKEN` and returns a short-lived session
token signed with `JWT_SECRET`. The token is stored in `sessionStorage` (or `localStorage`
when “Keep me signed in” is ticked), expires after `SESSION_TTL_HOURS` (default 12), and is
verified by every admin function (`presign-image`, `process-image`, `save-products`) on each
call. Sign out anytime via the button in the admin header. No extra AWS services are used —
it's the same Netlify functions, adding HMAC-signed sessions only.

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
| `ADMIN_TOKEN`        | admin password — checked by `admin-login`    |
| `JWT_SECRET`         | random string used to sign admin sessions    |
| `SESSION_TTL_HOURS`  | hours an admin session stays valid (default 12) |
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

- **Static hosting** — already replaced by S3 + CloudFront via this pipeline.
- **Admin panel functions** — product edits are published through the AWS Lambda
  `save-products` endpoint (issue #4; the handler is shared with
  `netlify/functions/save-products.mjs`), photo uploads still go through Netlify Functions
  (`presign-image.mjs`, `process-image.mjs`), and the public contact form posts to
  **Netlify Forms**. This is the only remaining Netlify dependency.

Current status of that last dependency (issue #43):

- **Product images are already on S3.** The image *storage* is done; only the functions that
  orchestrate presigning and variant generation still run on Netlify.
- **`products.json` is not a migration concern.** It lives in git and is synced to S3 by
  `deploy.yml`; it never lived on Netlify.
- **The data actually stranded on Netlify is the Netlify Forms submissions.** `index.html`
  registers an `enquiry` form that `submit-enquiry.mjs` posts to, so captured B2B leads exist
  only in Netlify. Export them **before** touching anything else.
- **There are no redirects to preserve.** `netlify.toml` defines only `[[headers]]`, no
  redirects, and the `*.netlify.app` origin has only ever hosted API endpoints — so there are
  no indexed Netlify links at risk.

**Decision (issue #3): Netlify stays, as a function-only host.** The static site is served
by S3 + CloudFront and deployed by `deploy.yml`; Netlify now only matters for the admin
functions and the contact form, so there is no deadline to move them. Consequences of
keeping it:

- `netlify.toml` is still needed for `functions` config, but its `[[headers]]` block no
  longer reaches the real site — CloudFront serves those pages. The header rules are
  mirrored in `provision/cloudformation/site.yaml` (`SecurityHeadersPolicy`,
  `PermissionsPolicyFunction`, `AdminNoIndexPolicy`), which is the side to edit; the
  comment block at the top of `netlify.toml` says so in place.
- The `*.netlify.app` origin still serves a copy of the site from the same build, so the
  `<link rel="canonical">` in `index.html` (pointing at the CloudFront domain) is what
  keeps it out of search results, not the origin being off.
- The long-lived `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` in Netlify's environment
  remain for the functions still on Netlify (login, history, rollback, image processing).

The publish endpoint (`save-products`) has moved to AWS Lambda + API Gateway (issue #4);
the rest of the admin functions still run on Netlify. Completing the move would let the
Netlify credentials be deleted. The cost target is preserved: the Lambda is free below 1M
requests/month, the REST API is free for the first 1M calls/month for 12 months (then
$3.50/M), and the endpoint avoids a NAT Gateway and WAF — see `infra/README.md`.
