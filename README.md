# Riddhi Siddhi Gift & Pack

[![CI](https://github.com/ganesh-159th/Riddhi-Siddhi-Gift-Pack/actions/workflows/ci.yml/badge.svg)](https://github.com/ganesh-159th/Riddhi-Siddhi-Gift-Pack/actions/workflows/ci.yml)
[![Deploy](https://github.com/ganesh-159th/Riddhi-Siddhi-Gift-Pack/actions/workflows/deploy.yml/badge.svg)](https://github.com/ganesh-159th/Riddhi-Siddhi-Gift-Pack/actions/workflows/deploy.yml)

Corporate gift & packaging showcase site (Vite + React). The static site is built in CI and
deployed to **AWS S3 + CloudFront** from GitHub Actions using **OIDC** (no long-lived AWS keys).

## How it works

- **CI** (`.github/workflows/ci.yml`) — runs on every push/PR to `main`: `npm ci`, lint, test,
  `npm audit`, `vite build`. `node_modules` is cached via `actions/setup-node`. The `dist/`
  artifact is passed to the deploy workflow.
- **Deploy** (`.github/workflows/deploy.yml`) — on a push to `main`:
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
  least one review, and require status checks to pass before merging. Add **`Lint, test, audit & build`**
  (the CI job name — it runs on PRs) as a required status check.

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
npm run dev       # local dev server
npm run lint      # ESLint
npm test          # Vitest
npm run build     # production build to dist/
```

## Notes on migrating off Netlify

Netlify is used for two things today:

- **Static hosting** — replaced by S3 + CloudFront via this pipeline.
- **Admin panel function** (`netlify/functions/save-products.mjs`) — the admin dashboard still saves
  product edits through this Netlify Function. To fully decommission Netlify, either migrate it to an
  AWS Lambda/CloudFront function later, or keep Netlify as a function-only host (pause its build &
  deploy so it stops auto-deploying).