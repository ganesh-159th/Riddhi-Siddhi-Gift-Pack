# Riddhi Siddhi Gift & Pack — production environment (prod).
#
# Wires together the three local modules into the live stack. This is the
# Terraform equivalent of provision/cloudformation/site.yaml; see infra/README.md
# for the import-first workflow that adopts the existing resources without
# recreating them (a recreated CloudFront distribution gets a NEW domain).

locals {
  tags = {
    Project = "RiddhiSiddhi"
    Env     = "prod"
    IaC     = "terraform"
  }

  # /riddhi/prod/<NAME> — read at runtime by the Lambda, never in TF state.
  backend_secret_prefix = "/riddhi/prod"
}

provider "aws" {
  region = var.region
}

# CloudFront Functions only exist in us-east-1 (see static-site module).
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

module "static_site" {
  source = "../../modules/static-site"

  providers = {
    aws.us_east_1 = aws.us_east_1
  }

  bucket_name             = var.bucket_name
  cdn_domain              = var.cdn_domain
  custom_domain           = var.custom_domain
  acm_certificate_arn     = var.acm_certificate_arn
  price_class             = var.price_class
  rollback_retention_days = var.rollback_retention_days
  tags                    = local.tags
}

module "github_oidc" {
  source = "../../modules/github-oidc"

  github_oidc_sub_prefix = var.github_oidc_sub_prefix
  role_name              = var.role_name
  bucket_arn             = module.static_site.bucket_arn
  distribution_id        = module.static_site.distribution_id
  tags                   = local.tags
}

module "cost_guardrails" {
  source = "../../modules/cost-guardrails"

  alert_email        = var.alert_email
  monthly_budget_usd = var.monthly_budget_usd
  tags               = local.tags
}

# Backend config for the AWS save-products Lambda. The two credentials
# (GITHUB_TOKEN, JWT_SECRET) are created out-of-band by
# infra/scripts/set-secrets.sh so they never enter Terraform state; the module
# only exposes their ARNs for the Lambda IAM policy.
module "backend_secrets" {
  source = "../../modules/backend-secrets"

  region      = var.region
  name_prefix = local.backend_secret_prefix
  github_repo = var.github_repo
  s3_bucket   = module.static_site.bucket_name
  tags        = local.tags

  depends_on = [module.static_site]
}

# POST /api/save-products on Lambda + API Gateway (issue #4). The bundle must be
# built first: `npm run build:lambda`.
module "save_products_api" {
  source = "../../modules/save-products-api"

  function_name           = "riddhi-save-products"
  lambda_source_dir       = "${path.root}/../../../dist-lambda/save-products"
  secret_parameter_prefix = local.backend_secret_prefix
  secret_parameter_arns   = module.backend_secrets.parameter_arns
  s3_bucket_arn           = module.static_site.bucket_arn
  tags                    = local.tags

  depends_on = [module.static_site, module.backend_secrets]
}
