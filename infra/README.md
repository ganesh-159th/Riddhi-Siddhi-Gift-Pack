# Terraform infrastructure (issue #38)

This directory is Terraform IaC for the same AWS stack that
`provision/cloudformation/site.yaml` describes: a private S3 bucket behind a
CloudFront distribution (OAC), the two CloudFront Functions (index rewrite +
`Permissions-Policy`), the security headers, the GitHub OIDC deploy role, and
the cost guardrails (SNS + AWS Budget). It exists to satisfy the **"entire AWS
stack reproducible with one command / drift detection / clean teardown"**
acceptance criteria of issue #38.

> **CloudFormation vs Terraform.** Do not run both against the same resources.
> Pick one source of truth. The live account (`352329341119`) is currently on
> the `riddhi-site` CloudFormation stack. To move it to Terraform, delete that
> stack first (its resources are `DeletionPolicy: Retain`, so nothing is
> deleted), then run `scripts/import-live.sh`. See "Adopting the live stack".

## Layout

```
infra/
├── bootstrap/          # one-time: state backend (S3 + DynamoDB) AND the
│                       #   scoped OIDC role GitHub Actions uses for Terraform
├── modules/
│   ├── static-site/    # S3 + CloudFront + OAC + Functions + header policies
│   ├── log-storage/    # private S3 bucket for CloudFront + S3 access logs
│   ├── backup/         # versioning companion + scheduled products.json/image backups
│   ├── observability/  # SNS alerts, CloudWatch dashboard, alarms, Synthetics
│   ├── github-oidc/    # OIDC provider, cicd role, inline deploy policy
│   ├── cost-guardrails/# SNS topic/subscription + monthly spend budget
│   ├── backend-secrets/# SSM parameters read by the save-products Lambda
│   └── save-products-api/# Lambda + API Gateway for POST /api/save-products
├── environments/
│   └── prod/           # the environment root that wires the modules together
└── scripts/
    ├── import-live.sh  # adopt the existing hand-built resources into state
    └── set-secrets.sh  # write GITHUB_TOKEN / JWT_SECRET into SSM
```

The GitHub Actions workflow `.github/workflows/terraform.yml` runs `plan` on
pull requests and `apply` on `main` (behind a manual approval) against the
`environments/prod` root. See "Automating plan/apply in GitHub Actions".

Modules are kept **in this repo** (not a separate module repository) until a
second consumer appears — local modules are versioned with the app and need no
registry. Terragrunt is deliberately not added: with one environment the thin
`environments/prod` root is enough, and Terragrunt would only duplicate it.

## Prerequisites

- `terraform >= 1.5` (install: `brew install terraform`)
- `aws` CLI v2 with credentials for the site account
- A region: the live stack is `ap-south-1`

## Provision a fresh stack (one command)

```bash
# 1. State backend + Terraform CI role (once, no remote backend yet)
cd infra/bootstrap
terraform init
terraform apply            # -> state_bucket, lock_table, terraform_role_arn

# 2. Environment
cd ../environments/prod
cp backend.hcl.example backend.hcl   # point it at the bootstrap outputs
cp terraform.tfvars.example terraform.tfvars  # set alert_email (+ cdn_domain)
terraform init -backend-config=backend.hcl
terraform plan            #   review
terraform apply            # everything: bucket, CloudFront, OIDC, budget
```

After `apply`, the outputs are the GitHub Settings values to set:
`S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`, `SITE_URL` (from
`distribution_domain`), `AWS_ROLE_ARN`. Then deploy with the existing
`.github/workflows/deploy.yml`.

> If you already have a CloudFront distribution for this site, the custom
> `cdn_domain` parameter **must** equal the distribution domain — S3 CORS
> references it back, so the browser photo uploads break otherwise.

## AWS admin API backend (issue #130)

All `/api/*` routes — login, history, rollback, presign, process-image, publish,
contact (`submit-enquiry`) and CSP reports — run on one Lambda behind API Gateway.
The handlers live in `lambda/handlers/`, shared validation in `shared/`, and the
API Gateway contract in `infra/modules/save-products-api`. Admin routes require the
API key and a signed admin session; the public contact route is throttled at the
method level and by client IP inside the handler.

```bash
# 1. Bundle the Lambda (Terraform zips dist-lambda/save-products)
npm run build:lambda

# 2. Apply the stack
cd infra/environments/prod
terraform init -backend-config=backend.hcl
terraform apply

# 3. Create/rotate the credentials. The script creates the SecureString
#    parameters if they do not exist; they are not Terraform-managed, so their
#    values never enter state.
#    (Still in infra/environments/prod, so the script is ../../scripts/.)
GITHUB_TOKEN=ghp_... JWT_SECRET=... ADMIN_TOKEN=... ../../scripts/set-secrets.sh

# 4. Wire the frontend (GitHub repo settings)
#    Variable AWS_API_URL = terraform output -raw aws_api_url
#    Secret   AWS_API_KEY = terraform output -raw aws_api_key
```

Set `admin_api_origin` in `terraform.tfvars` to the origin part of
`terraform output -raw aws_api_url` (drop the `/prod` stage path). The static-site
module pins the admin CSP to that origin and to the site bucket's S3 host; the
CloudFormation route uses the `AdminApiOrigin` parameter for the same value.
Update both if the API address or site bucket changes. CI derives `admin_api_origin`
from the `AWS_API_URL` repository variable, so that variable must stay set.

For a browser-level proof, run the opt-in CloudFront smoke (mocked API, no credentials):

```bash
ADMIN_API_ORIGIN=https://<api-id>.execute-api.ap-south-1.amazonaws.com \
  npm run test:csp:cloudfront
```

`npm run build:lambda` keeps `sharp` external and copies the Linux native binaries from the
optional `@img/sharp-*-linux-x64` packages into the zip, because Lambda cannot run esbuild's
bundled darwin binaries. Run the build on the Ubuntu CI image.

The deploy workflow passes those into the build as `VITE_AWS_API_URL` /
`VITE_AWS_API_KEY` and fails the build when `AWS_API_URL` is missing. Contact
submissions are stored under `enquiries/` in `module.enquiries_storage` (a private bucket
with no CloudFront origin); existing Netlify Forms exports can be imported with
`ENQUIRIES_BUCKET=<bucket> npm run import:enquiries -- <export.csv>`.

Cost: Lambda and CloudWatch stay in the free tier at publish volumes. API
Gateway REST is free for the first 1M calls/month for 12 months, then $3.50/M.
The usage plan (5 req/s, 10 burst, 5000/month quota) needs no WAF. SSM standard
parameters are free. The observability stack (dashboards, alarms, log delivery)
also stays in the free tier; only the optional synthetic canary is billed
(~USD 0.9/month on the default hourly schedule). Deliberate choices that keep the bill at ~$0: no VPC (a NAT
Gateway is ~$32/month), no provisioned concurrency, and a 30-day log retention.

## Centralised logging, monitoring and alerting (issue #39)

`module.observability` wires the whole production stack into CloudWatch:

| Layer | What is captured | Where to look |
| --- | --- | --- |
| CloudFront | Standard access logs (v2) | S3 `s3://<logs_bucket>/cloudfront/` |
| S3 | Server access logs | S3 `s3://<logs_bucket>/s3-access/` |
| API Gateway | JSON access logs (request id, status, latency, API key id) | `/aws/apigateway/riddhi-save-products-access` |
| Lambda | Structured JSON (request id + API request id + cold start) | `/aws/lambda/riddhi-save-products` |
| Synthetics | Home page + `products.json` checks | CloudWatch Synthetics canary |

The CloudWatch dashboard (`terraform output observability_dashboard_name`)
shows CloudFront requests/error rates, API requests/5xx/throttles/latency,
Lambda invocations/errors/throttles/duration, S3 storage, and canary results.

Alarms publish to SNS email + optional SMS:

- API Gateway 5xx
- API Gateway HTTP 429 throttles (metric filter over the JSON access log)
- Lambda errors and throttles
- CloudFront 5xx and 4xx error rates
- Synthetics canary failures

CloudFront metrics only exist in `us-east-1`, so `module.observability` takes
the `aws.us_east_1` provider alias and keeps a second SNS topic in that region
(CloudWatch alarms cannot target a cross-region SNS topic). The same
`alert_email` / `alert_sms_number` are subscribed to both topics. Confirm both
subscription emails after the first apply; an unconfirmed subscription receives
nothing.

```bash
cd infra/environments/prod
terraform apply
terraform output observability_dashboard_name
terraform output alert_topic_arn
```

Cost notes:

- CloudWatch dashboards: the first 3 are free (this stack creates one).
- Alarms: 10 free per month; this stack creates 9 (observability 7 + backups 2).
- CloudFront standard logs and S3 server logs are free to deliver; the log
  bucket is the only storage cost and expires after `log_retention_days` (90).
- API/Lambda log retention is 30 days, so CloudWatch Logs cannot grow forever.
- The synthetic canary is the one line item that is not free. The default
  `rate(1 hour)` schedule is roughly USD 0.9/month; see
  `canary_schedule` in `variables.tf`. Set `canary_enabled = false` to omit it.
- SNS email is free; SMS is billable per message and may require leaving the
  SNS SMS sandbox. Leave `alert_sms_number` empty to stay email-only.

### Uptime monitoring and status page (manual)

CloudWatch Synthetics covers availability inside AWS. For an independent
second opinion and a public status page, use a free UptimeRobot (or Pingdom)
monitor outside AWS:

1. Create an HTTP(s) monitor for the CloudFront domain, checking `/` and
   `/products.json` every 5 minutes.
2. Add `alert_email` (and optionally SMS) as the alert contact.
3. Enable the built-in public status page and point it at the same monitors.
4. Keep the CloudWatch canary as the in-AWS check; the external monitor is
   what catches an AWS/CloudFront outage or a DNS problem.

These are external accounts, so they are intentionally not Terraform-managed
here (no API keys in state). If you later want them codified, add the provider
and its API key as a repository secret.

## Automated backups and DR (issue #41)

`module.backup` protects the two non-reproducible data sets and adds no new SNS
topic or subscription:

| Resource | Purpose | Cost |
| --- | --- | --- |
| Site-bucket versioning + noncurrent/delete-marker expiry | Undo accidental delete/overwrite of `products.json` or `products/*` | free to enable; bounded storage |
| `riddhi-backup-products` Lambda + daily EventBridge rule | Snapshot `products.json`, incrementally copy changed photos | ~30 invocations/mo (free tier) |
| Private `riddhi-siddhi-gift-pack-backups` bucket | `products/<date>/` snapshots (90-day expiry) + `images/` copies | ~0.25 MB snapshots + ~11 MB photos once |
| Two alarms on the existing ops SNS topic | Failures and "did not run" | free (alarms 1–10) |

`lambda/backup-products/index.mjs` is bundled by `npm run build:lambda` into
`dist-lambda/backup-products`, which Terraform zips at apply time. No npm
install happens in Lambda, and the function is not in a VPC (no NAT Gateway).

One-time operator step: re-apply `infra/bootstrap` once after pulling this
change. `bootstrap/backup.tf` grants the Terraform CI role permission to manage
the backup bucket, the Lambda, its log group and the EventBridge rule; without
it the `terraform.yml` apply will fail with `AccessDenied`. The site bucket's
`PutBucketVersioning` permission is added in `bootstrap/cicd.tf` too. If
versioning was already enabled manually, `infra/scripts/import-live.sh` imports
it into state instead of trying to create it.

Restore steps (including restoring from an S3 version or delete marker) are in
[README.md](../README.md#backups--disaster-recovery-issue-41).

## Automating plan/apply in GitHub Actions

`.github/workflows/terraform.yml` runs Terraform from CI, so nobody has to run
it locally:

| Event | Job | What it does |
| --- | --- | --- |
| Pull request touching `infra/**`, `lambda/**` or the shared publish code | `plan` | `terraform plan`, posted to the run summary. Read-only. |
| Push to `main` touching those paths, or manual run | `apply` | `plan -out`, then `apply` that exact plan — **paused by the `production` Environment's required reviewers**. |

`plan` runs only for same-repo PRs (fork PRs get no secrets/OIDC). The `apply`
job is attached to the `production` GitHub Environment, so set its **required
reviewers** (Settings → Environments → `production`) if you have not already —
that is the human approval gate.

**One-time setup for CI (all from the `bootstrap` outputs):**

1. Run `infra/bootstrap` once by hand (above) — it creates the backend *and*
   the `riddhi-terraform` OIDC role the workflow assumes. That role is
   separate from `riddhi-cicd` because Terraform needs create/modify rights,
   not just S3 sync.
2. Repo → Settings → Secrets and variables → Actions:
   - Secret **`AWS_TF_ROLE_ARN`** = bootstrap output `terraform_role_arn`
   - Secret **`TF_ALERT_EMAIL`** = the budget alert address
   - Variables **`TF_STATE_BUCKET`** / **`TF_LOCK_TABLE`** = bootstrap outputs
     (defaults match the bootstrap defaults, so they are optional)
   - `AWS_REGION` = `ap-south-1`

After the one-time **import** below, CI owns the stack: every PR shows a plan,
and an approved merge applies it.

## Adopting the existing live resources

Everything in the live account already exists, so `terraform apply` cannot
create it. Import it instead (this replaces what `adopt.sh` does for
CloudFormation). The script imports straight into the S3 backend created by
`bootstrap`, so CI reads the same state — no local-then-migrate step:

```bash
# 1. Remove the CloudFormation stack first. Every resource is
#    DeletionPolicy: Retain, so nothing is deleted — but two sources of truth
#    can never both manage them:
aws cloudformation delete-stack --stack-name riddhi-site --region ap-south-1

# 2. Import adopts the bucket, distribution, OAC, functions, OIDC provider,
#    role, inline policy, policies, SNS and budget, and writes to S3:
cd infra
TF_VAR_alert_email=you@example.com ./scripts/import-live.sh            # dry run
TF_VAR_alert_email=you@example.com ./scripts/import-live.sh --execute  # import
```

The script runs `terraform init` against the state backend
(`TF_STATE_BUCKET` / `TF_STATE_KEY`, defaults in the script) and then imports
each resource, skipping any already in state. A `terraform plan` afterwards
shows the only remaining drift — re-derived config the hand-built account never
had (tags, a comment, the lifecycle rule, the never-confirmed SNS
subscription):

```bash
cd infra/environments/prod
terraform plan && terraform apply
```

Once the state lives in S3, `.github/workflows/terraform.yml` owns the stack:
open a PR to see a plan, merge to `main` to apply it (after approval).

## Drift detection

```bash
cd infra/environments/prod
terraform plan    # diffs declared config against live state
```

If the config and the real AWS resources drift (someone clicked in the
console), `plan` reports it exactly like CloudFormation's drift detection, and
`apply` converges.

## Clean teardown

```bash
cd infra/environments/prod
terraform destroy          # removes every resource EXCEPT what needs a manual
                           # step (see below); nothing is recreated.

cd ../bootstrap
terraform destroy          # finally, the state backend itself
```

Manual steps afterwards:

- S3 **bucket contents** are preserved (`force_destroy = false`); delete the
  objects yourself if the bucket must go entirely. Terraform deletes the bucket
  only after it is empty.
- The two **SecureString parameters** (`/riddhi/prod/GITHUB_TOKEN`,
  `/riddhi/prod/JWT_SECRET`) are created out-of-band by
  `infra/scripts/set-secrets.sh` and are not in Terraform state, so `destroy`
  leaves them behind. Remove them by hand if they are no longer needed:
  `aws ssm delete-parameter --name /riddhi/prod/GITHUB_TOKEN` (and `.../JWT_SECRET`).
- The **github-oidc role** must outlive nothing — the `CloudFrontInvalidation`
  scope is per-distribution, so once the distribution is gone the role has
  nothing to act on. GitHub variables like `AWS_ROLE_ARN` should be removed by
  hand.
- CloudFront distributions take a few minutes to delete; `terraform destroy`
  waits for it.

> Note: the free-tier guidelines still apply: no WAF, no Route 53,
> `PriceClass_200`. The only compute is the admin API Lambda/API Gateway
> (issue #130), which stays inside the free tier at publish volumes. It
> is the reason the static site cost (~USD 0.10/month) is no longer the whole
> bill, but at admin-publish traffic the added cost rounds to zero.

## Adding the custom domain later

Leave `custom_domain` and `acm_certificate_arn` empty (the default). When you
own a domain, set `custom_domain` and pass the ACM certificate ARN — the
distribution switches `viewer_certificate` to an SNI cert and the S3 CORS
origin updates automatically. ACM certs live in `us-east-1`, so issue them
with the `aws.us_east_1` provider.
