variable "region" {
  type        = string
  description = "AWS region the site bucket and stack live in."
  default     = "ap-south-1"
}

variable "bucket_name" {
  type        = string
  description = "Name of the site bucket. S3 bucket names are fixed once created."
  default     = "riddhi-siddhi-gift-pack-prod"
}

variable "cdn_domain" {
  type        = string
  description = "Public hostname (the distribution domain). Must match module.static_site.distribution_domain or CORS breaks photo uploads."
  default     = "dd4hzdnwrj3px.cloudfront.net"
}

variable "custom_domain" {
  type        = string
  description = "Optional custom domain. Leave empty until a domain is attached (then also set acm_certificate_arn)."
  default     = ""
}

variable "acm_certificate_arn" {
  type        = string
  description = "ACM certificate ARN for custom_domain (required only when custom_domain is set)."
  default     = ""
}

variable "price_class" {
  type        = string
  description = "CloudFront PriceClass. PriceClass_200 excludes Asia edges — a deliberate cost-over-latency trade."
  default     = "PriceClass_200"
}

variable "rollback_retention_days" {
  type        = number
  description = "Days rollbacks/ snapshots are kept. Must match deploy.yml (7)."
  default     = 7
}

variable "noncurrent_version_retention_days" {
  type        = number
  description = "Days old S3 versions are retained. 30 days bounds versioning storage cost while allowing mistake recovery."
  default     = 30
}

variable "github_oidc_sub_prefix" {
  type        = string
  description = "Prefix of the OIDC `sub` GitHub emits for this repo (immutable owner@id/repo@id form for repos created after 2026-07-15)."
  default     = "repo:ganesh-159th@112203904/Riddhi-Siddhi-Gift-Pack@1329157001"
}

variable "role_name" {
  type        = string
  description = "Name of the CI deploy role."
  default     = "riddhi-cicd"
}

variable "github_repo" {
  type        = string
  description = "owner/name of the repo the Lambda commits products.json to."
  default     = "ganesh-159th/Riddhi-Siddhi-Gift-Pack"
}

variable "alert_email" {
  type        = string
  description = "Email that receives budget and operational alerts (set in terraform.tfvars)."
}

variable "alert_sms_number" {
  type        = string
  description = "Optional E.164 phone number for operational SMS alerts (e.g. +919876543210). Leave empty to disable SMS."
  default     = ""
}

variable "logs_bucket_name" {
  type        = string
  description = "Private S3 bucket for CloudFront and S3 access logs. Must be globally unique."
  default     = "riddhi-siddhi-gift-pack-logs"
}

variable "log_retention_days" {
  type        = number
  description = "Days before access logs expire from the log bucket."
  default     = 90
}

variable "canary_enabled" {
  type        = bool
  description = "Create a CloudWatch Synthetics canary for the public site."
  default     = true
}

variable "canary_schedule" {
  type        = string
  description = "Canary schedule. Hourly keeps cost low; rate(5 minutes) detects outages faster at a higher cost."
  default     = "rate(1 hour)"
}

variable "backup_bucket_name" {
  type        = string
  description = "Globally unique name of the private backup bucket (products.json snapshots + product photos)."
  default     = "riddhi-siddhi-gift-pack-backups"
}

variable "backup_schedule" {
  type        = string
  description = "EventBridge schedule for the backup Lambda. Daily keeps S3 PUTs well inside the free tier."
  default     = "cron(0 3 * * ? *)"
}

variable "backup_snapshot_retention_days" {
  type        = number
  description = "Days of daily products.json snapshots to keep. 90 days is a quarter of restore points."
  default     = 90
}

variable "monthly_budget_usd" {
  type        = number
  description = "Monthly budget cap in USD."
  default     = 1
}

variable "csp_report_uri" {
  type        = string
  description = "Optional CSP report-uri endpoint. Leave empty until a report collector is deployed; set to the save-products API /api/csp-report URL to log violations."
  default     = ""
}