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

module "log_storage" {
  source = "../../modules/log-storage"

  bucket_name    = var.logs_bucket_name
  retention_days = var.log_retention_days
  tags           = local.tags
}

module "static_site" {
  source = "../../modules/static-site"

  providers = {
    aws.us_east_1 = aws.us_east_1
  }

  bucket_name                       = var.bucket_name
  cdn_domain                        = var.cdn_domain
  custom_domain                     = var.custom_domain
  acm_certificate_arn               = var.acm_certificate_arn
  price_class                       = var.price_class
  rollback_retention_days           = var.rollback_retention_days
  noncurrent_version_retention_days = var.noncurrent_version_retention_days
  server_access_logs_bucket         = module.log_storage.bucket_name
  csp_report_uri                    = var.csp_report_uri
  tags                              = local.tags

  # The log bucket policy must exist before S3 enables server access logging.
  depends_on = [module.log_storage]
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

  # The account's total Lambda concurrency is only 10, so reserving the module
  # default (5) is rejected: AWS requires at least 10 unreserved. Keep this
  # function unreserved (-1) unless the account quota is raised.
  reserved_concurrency = -1

  depends_on = [module.static_site, module.backend_secrets]
}

# Centralised logging, monitoring and alerting (issue #39). CloudFront logs
# flow into the log bucket, API access logs feed the throttle metric, and every
# alarm publishes to SNS email/SMS.
module "observability" {
  source = "../../modules/observability"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  name_prefix               = "riddhi"
  alert_email               = var.alert_email
  alert_sms_number          = var.alert_sms_number
  site_url                  = "https://${module.static_site.distribution_domain}"
  site_bucket_name          = module.static_site.bucket_name
  distribution_id           = module.static_site.distribution_id
  distribution_arn          = module.static_site.distribution_arn
  api_name                  = module.save_products_api.api_name
  api_stage                 = module.save_products_api.stage_name
  api_access_log_group_name = module.save_products_api.api_access_log_group_name
  lambda_function_name      = module.save_products_api.function_name
  log_bucket_name           = module.log_storage.bucket_name
  log_bucket_arn            = module.log_storage.bucket_arn
  canary_enabled            = var.canary_enabled
  canary_schedule           = var.canary_schedule
  tags                      = local.tags

  depends_on = [module.log_storage]
}

# Automated backups of products.json and admin-uploaded product photos (issue #41).
# Reuses the observability SNS topic, so no extra topic/subscription is created.
module "backup" {
  source = "../../modules/backup"

  backup_bucket_name      = var.backup_bucket_name
  source_bucket_name      = module.static_site.bucket_name
  lambda_source_dir       = "${path.root}/../../../dist-lambda/backup-products"
  schedule_expression     = var.backup_schedule
  snapshot_retention_days = var.backup_snapshot_retention_days
  alert_topic_arn         = module.observability.alert_topic_arn
  tags                    = local.tags

  depends_on = [module.static_site, module.observability]
}
