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

  github_org      = var.github_org
  role_name       = var.role_name
  bucket_arn      = module.static_site.bucket_arn
  distribution_id = module.static_site.distribution_id
  tags            = local.tags
}

module "cost_guardrails" {
  source = "../../modules/cost-guardrails"

  alert_email        = var.alert_email
  monthly_budget_usd = var.monthly_budget_usd
  tags               = local.tags
}