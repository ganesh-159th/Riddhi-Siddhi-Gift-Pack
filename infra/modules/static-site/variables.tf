variable "bucket_name" {
  type        = string
  description = "Name of the site bucket. S3 bucket names are fixed once created."
}

variable "cdn_domain" {
  type        = string
  description = "Public hostname (e.g. dd4hzdnwrj3px.cloudfront.net) the browser uploads product photos to. Must match the distribution's domain name — S3 CORS and the distribution origin reference each other."
}

variable "custom_domain" {
  type        = string
  description = "Optional custom domain (e.g. yourbrand.com). Leave empty until a domain is attached. If set, acm_certificate_arn becomes required."
  default     = ""
}

variable "acm_certificate_arn" {
  type        = string
  description = "ARN of the ACM certificate for custom_domain. Empty when using the free *.cloudfront.net domain."
  default     = ""
}

variable "price_class" {
  type        = string
  description = "CloudFront PriceClass. PriceClass_200 = North America + Europe edges only (deliberate cost/latency trade)."
  default     = "PriceClass_200"
}

variable "rollback_retention_days" {
  type        = number
  description = "Days rollbacks/ snapshots are kept. Must match deploy.yml's prune window (7)."
  default     = 7
}

variable "noncurrent_version_retention_days" {
  type        = number
  description = "Days an overwritten/deleted S3 object stays as a noncurrent version. Bounds versioning storage cost."
  default     = 30
}

variable "server_access_logs_bucket" {
  type        = string
  description = "Name of the central log bucket that receives S3 server access logs. Empty disables server access logging."
  default     = ""
}

variable "server_access_logs_prefix" {
  type        = string
  description = "Key prefix for S3 server access logs inside the log bucket."
  default     = "s3-access/"
}

variable "force_destroy" {
  type        = bool
  description = "Allow a terraform destroy to delete the bucket and all contents. Keep false for the fleet-created bucket import."
  default     = false
}

variable "csp_report_uri" {
  type        = string
  description = "Optional absolute URI for CSP violation reports. Included in report-uri/directives when non-empty."
  default     = ""
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to the bucket and distribution."
  default     = {}
}