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
(There is an optional `preview` environment used by PR previews.)

## 6) Verify

- Push a commit to `main` → the **Deploy** workflow should run to
  completion (S3 sync → CloudFront invalidation → smoke test).
- Open a PR → the **Preview** job deploys to `/pr-<number>/` and comments
  the preview URL.

---

## Troubleshooting

- **`aws-region` error on the Configure AWS credentials step**: the
  `AWS_REGION` variable (or `AWS_ROLE_ARN` secret) is missing — add it in
  step 4.
- **AccessDenied during scripts/cloudfront**: re-check the role's
  trust/policies from `./generate-policies.sh`; confirm the role ARN matches.
- **403 on the site**: the bucket must be private + use Origin Access
  Control from CloudFront (step 2).
