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
  description = "Email that receives budget alerts (set in terraform.tfvars)."
}

variable "monthly_budget_usd" {
  type        = number
  description = "Monthly budget cap in USD."
  default     = 1
}