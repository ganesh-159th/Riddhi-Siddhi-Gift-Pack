# AWS Provisioning for GitHub Actions Deploy (#36)

This guide sets up the AWS resources needed by `.github/workflows/deploy.yml`
so that pushes to `main` deploy the site to **S3 + CloudFront** via **OIDC**
(no long-lived AWS keys stored in GitHub).

> You need an AWS account with console access. No coding is required —
> everything below is clicking in the AWS console + adding a few GitHub
> settings. Run `./generate-policies.sh` first to get the exact policy JSON
> (it needs your account ID, bucket name and CloudFront distribution ID).

---

## 0) Prerequisites

- An AWS account (free tier is fine for a small static site).
- The AWS region you will use (recommended: `ap-south-1` for India).

## 1) Create the S3 bucket

1. AWS console → **S3 → Create bucket**.
2. Name it, e.g. `riddhi-siddhi-gift-pack-prod` (must be globally unique).
3. Region: your chosen region.
4. **Block all public access** — leave ON (CloudFront or the site serves it).
5. Create.
6. Add a **Lifecycle rule** (under the bucket → Management → Lifecycle):
   - Rule for the `rollbacks/` prefix → **Expire after 30 days**.
   - This keeps rollback snapshots tidy and controls costs.

## 2) Create the CloudFront distribution

1. AWS console → **CloudFront → Create distribution**.
2. Origin domain: pick your S3 bucket (leave the "Use website endpoint" note
   in mind — the origin domain should be the bucket's **regional/website**
   endpoint if you use the "Static website hosting" option).
3. Origin access: **Origin access control settings (OAC)** → create/select an
   OAC. This keeps the bucket private.
4. Viewer protocol policy: **Redirect HTTP to HTTPS**.
5. Cache policy: **CachingOptimized** (default) — fine to start.
6. Default root object: `index.html`.
7. Create the distribution, and **copy the Distribution ID** (e.g.
   `E2EXAMPLEID`). Your site URL is the distribution domain
   (e.g. `https://d123.cloudfront.net`).
8. **Optional but recommended:** later add a custom domain + ACM cert
   (tracked separately in issue #17).

### 2a) Configure error responses (branded 404 — issue #35)

After the distribution is created, configure **Error pages** so the branded
`404.html` is served on unknown URLs (this is built and deployed by CI):

1. Go to the distribution → **Error pages → Create custom error response**.
2. Create the following custom error responses (all in one batch):

   | HTTP error code | Customize error response | Response page path | HTTP response code |
   | --------------- | ------------------------ | ------------------ | ------------------ |
   | `403` (Forbidden) | On | `/404.html` | `404 Not Found` |
   | `404` (Not Found) | On | `/404.html` | `404 Not Found` |
   | `500` (Server Error) | On | `/404.html` | `500` |
   | `502` (Bad Gateway) | On | `/404.html` | `502` |
   | `503` (Service Unavailable) | On | `/404.html` | `503` |
   | `504` (Gateway Timeout) | On | `/404.html` | `504` |

   - For `403` and `404`, **clear "Cache error responses"** checkbox so the
     404 is always served fresh (our CI also re-uploads `404.html` with
     `Cache-Control: no-store`).
   - The `403` row (without "Customize error response" this would expose
     S3's default AccessDenied XML) is redirected to the branded 404 with a
     `404 Not Found` status so private-URL probing can never reveal the
     bucket.
3. Save and wait for the distribution to deploy (shown as **Deploying**).

This guarantees:
- **Unknown URLs** → branded 404 page with HTTP `404` status.
- **Private paths / S3 denials** → no leaked XML, branded 404 with `404`.
- **Backend/edge 5xx** → branded error page instead of a blank browser error.

## 3) Create the GitHub OIDC provider + role

1. IAM → **Identity providers → Add provider**.
   - Provider type: **OpenID Connect**.
   - URL: `https://token.actions.githubusercontent.com`.
   - Audience: `sts.amazonaws.com`.
2. IAM → **Roles → Create role → Web identity**.
   - Identity provider: the one you just added.
   - Audience: `sts.amazonaws.com`.
3. **Trust policy** — paste the output of `./generate-policies.sh` part 1.
4. **Permissions policy** — create a new inline policy and paste part 2.
5. Name the role (e.g. `riddhi-cicd`) and **copy the Role ARN**
   (e.g. `arn:aws:iam::123456789012:role/riddhi-cicd`).

## 4) Add GitHub secrets & variables

Repo: `Settings → Secrets and variables → Actions`.

| Name                         | Type     | Value (example)                                    |
| ---------------------------- | -------- | -------------------------------------------------- |
| `AWS_ROLE_ARN`               | Secret   | `arn:aws:iam::123456789012:role/riddhi-cicd`       |
| `AWS_REGION`                 | Variable | `ap-south-1`                                       |
| `S3_BUCKET`                  | Variable | `riddhi-siddhi-gift-pack-prod`                     |
| `CLOUDFRONT_DISTRIBUTION_ID` | Variable | `E2EXAMPLEID`                                      |
| `SITE_URL`                   | Variable | `https://d123.cloudfront.net`                      |

## 5) (Recommended) Environment protection

Repo: `Settings → Environments → production → Add protection rule →
Required reviewers`. This pauses production deploys until someone approves.


## 6) Verify

- Push a commit to `main` → the **Deploy** workflow should run to
  completion (S3 sync → CloudFront invalidation → smoke test).

---

## 7) (Recommended) Cost guardrails — stays on free tier

This is a tiny static site, so it should cost **$0/month**. To keep it that way and
avoid surprise bills, run:

```bash
./generate-cost-guardrails.sh
```

It prints the AWS CLI commands that (all free, no monthly charge):
- tag resources `Project=RiddhiSiddhi` + `Env=prod` for Cost Explorer,
- create an **AWS Budget** alerting if spend goes over **$0.01** (plus 50/80% soft alerts),
- add an **S3 lifecycle** rule tiering old `rollbacks/*` backups to Glacier then expiring them,
- enable **Cost Anomaly Detection** alerts.

> Keep the site **static-only**: skip Route 53 (~$0.50/mo), WAF (~$5/mo) and Lambda/API GW.
> The free `*.cloudfront.net` domain avoids hosting-zone fees. See issue #42.

## Troubleshooting

- **`aws-region` error on the Configure AWS credentials step**: the
  `AWS_REGION` variable (or `AWS_ROLE_ARN` secret) is missing — add it in
  step 4.
- **AccessDenied during scripts/cloudfront**: re-check the role's
  trust/policies from `./generate-policies.sh`; confirm the role ARN matches.
- **403 on the site**: the bucket must be private + use Origin Access
  Control from CloudFront (step 2).
