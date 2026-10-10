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
│   └── cost-guardrails/# SNS topic/subscription + monthly spend budget
├── environments/
│   └── prod/           # the environment root that wires the modules together
└── scripts/
    └── import-live.sh  # adopt the existing hand-built resources into state
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

## Automating plan/apply in GitHub Actions

`.github/workflows/terraform.yml` runs Terraform from CI, so nobody has to run
it locally:

| Event | Job | What it does |
| --- | --- | --- |
| Pull request touching `infra/**` | `plan` | `terraform plan`, posted to the run summary. Read-only. |
| Push to `main` touching `infra/**`, or manual run | `apply` | `plan -out`, then `apply` that exact plan — **paused by the `production` Environment's required reviewers**. |

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
CloudFormation):

```bash
# 1. First remove the CloudFormation stack (resources are retain'ed, nothing
#    is deleted, but two sources of truth can never both manage them):
aws cloudformation delete-stack --stack-name riddhi-site --region ap-south-1

# 2. Terraform import adopts the bucket, distribution, OAC, functions,
#    OIDC provider, role, inline policy, policies, SNS and budget:
cd infra
./scripts/import-live.sh            # dry run — shows what will be imported
./scripts/import-live.sh --execute  # actually import
terraform plan                      # review the re-derived config
```

The import runs against **local** state so nothing is published until you
decide. After importing, switch to the backend:

```bash
cd infra/environments/prod
cp backend.hcl.example backend.hcl
terraform init -reconfigure -backend-config=backend.hcl   # migrates local state to S3
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
- The **github-oidc role** must outlive nothing — the `CloudFrontInvalidation`
  scope is per-distribution, so once the distribution is gone the role has
  nothing to act on. GitHub variables like `AWS_ROLE_ARN` should be removed by
  hand.
- CloudFront distributions take a few minutes to delete; `terraform destroy`
  waits for it.

> Note: the CloudFormation guidelines to stay inside the free tier apply here
> unchanged: no WAF, no Route 53, no Lambda/API Gateway, `PriceClass_200`.
> Those deliberately-avoided services are the only reason this stack costs
> ~USD 0.10/month.

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