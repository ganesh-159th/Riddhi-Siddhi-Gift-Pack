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

## AWS save-products backend (issue #4)

`POST /api/save-products` runs on Lambda behind API Gateway. The handler is a
thin wrapper around the existing `netlify/functions/save-products.mjs`, so the
publish logic has a single source of truth. Everything else in the admin panel
(`admin-login`, history, rollback, image processing) stays on Netlify.

```bash
# 1. Bundle the Lambda (Terraform zips dist-lambda/save-products)
npm run build:lambda

# 2. Apply the stack
cd infra/environments/prod
terraform init -backend-config=backend.hcl
terraform apply

# 3. Create/rotate the two credentials. The script creates the SecureString
#    parameters if they do not exist; they are not Terraform-managed, so their
#    values never enter state. JWT_SECRET must match Netlify admin-login exactly.
#    (Still in infra/environments/prod, so the script is ../../scripts/.)
GITHUB_TOKEN=ghp_... JWT_SECRET=... ../../scripts/set-secrets.sh

# 4. Wire the frontend (GitHub repo settings)
#    Variable AWS_API_URL = terraform output -raw save_products_api_url
#    Secret   AWS_API_KEY = terraform output -raw save_products_api_key
```

The deploy workflow passes those into the build as `VITE_AWS_API_URL` /
`VITE_AWS_API_KEY`. If `AWS_API_URL` is unset the panel keeps calling the
Netlify function, so the migration is opt-in and reversible.

Cost: Lambda and CloudWatch stay in the free tier at publish volumes. API
Gateway REST is free for the first 1M calls/month for 12 months, then $3.50/M.
The usage plan (5 req/s, 10 burst, 5000/month quota) needs no WAF. SSM standard
parameters are free. Deliberate choices that keep the bill at ~$0: no VPC (a NAT
Gateway is ~$32/month), no provisioned concurrency, and a 30-day log retention.

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
> `PriceClass_200`. The only compute is the opt-in save-products Lambda/API
> Gateway (issue #4), which stays inside the free tier at publish volumes. It
> is the reason the static site cost (~USD 0.10/month) is no longer the whole
> bill, but at admin-publish traffic the added cost rounds to zero.

## Adding the custom domain later

Leave `custom_domain` and `acm_certificate_arn` empty (the default). When you
own a domain, set `custom_domain` and pass the ACM certificate ARN — the
distribution switches `viewer_certificate` to an SNI cert and the S3 CORS
origin updates automatically. ACM certs live in `us-east-1`, so issue them
with the `aws.us_east_1` provider.

## Why there is no staging environment

Deliberate decision, not an oversight. `environments/prod` is the only root:

- The safety a staging stack would add is already covered by the PR **`terraform
  plan`** (the real dry-run) plus the merge gates (lint, tests, build,
  Playwright, visual, cfn-lint, terraform fmt/validate).
- A second standing stack means another bucket, distribution, budget and SNS
  topic, and several names are effectively global and would collide:
  CloudFront Function names (`index-rewrite`, `permissions-policy`), the OAC
  name, and the budget name. Each would need a `-staging` prefix, turning
  "identical config" into a pile of conditionals.
- The site is a free-tier static site — the blast radius of a bad `apply` is
  small and visible in the plan.

If a specific change genuinely needs live infra validation (e.g. the
OAC/CORS upload path), add an **on-demand** `staging` root that you `apply` and
immediately `destroy`, rather than a permanent second environment.