variable "name_prefix" {
  type        = string
  description = "Prefix for alarm, topic, dashboard and canary names."
  default     = "riddhi"
}

variable "alert_email" {
  type        = string
  description = "Email address subscribed to the alert topics. Required — an alarm with no subscriber is decoration."
}

variable "alert_sms_number" {
  type        = string
  description = "Optional E.164 phone number (e.g. +919876543210) subscribed to the alert topics. SNS SMS may require leaving the SMS sandbox."
  default     = ""
}

variable "site_url" {
  type        = string
  description = "Public site URL the synthetic canary checks, including https:// and no trailing slash."
}

variable "site_bucket_name" {
  type        = string
  description = "Site bucket name, for the S3 storage dashboard widget."
}

variable "distribution_id" {
  type        = string
  description = "CloudFront distribution ID (also the CloudFront metric dimension)."
}

variable "distribution_arn" {
  type        = string
  description = "CloudFront distribution ARN, used as the access-log delivery source."
}

variable "api_name" {
  type        = string
  description = "API Gateway REST API name (ApiName metric dimension)."
}

variable "api_stage" {
  type        = string
  description = "API Gateway stage name (Stage metric dimension)."
}

variable "api_access_log_group_name" {
  type        = string
  description = "CloudWatch log group receiving API Gateway access logs. Empty disables the throttling metric and alarm."
  default     = ""
}

variable "lambda_function_name" {
  type        = string
  description = "save-products Lambda function name (FunctionName metric dimension)."
}

variable "log_bucket_name" {
  type        = string
  description = "Name of the central log bucket."
}

variable "log_bucket_arn" {
  type        = string
  description = "ARN of the central log bucket."
}

variable "canary_enabled" {
  type        = bool
  description = "Create the CloudWatch Synthetics canary. Canary runs are billed per execution, so an hourly schedule keeps the cost near USD 1/month."
  default     = true
}

variable "canary_schedule" {
  type        = string
  description = "Canary schedule expression. Hourly is the cost-conscious default; use rate(5 minutes) for faster detection at ~11x the cost."
  default     = "rate(1 hour)"
}

variable "canary_runtime_version" {
  type        = string
  description = "Synthetics runtime. 13.1+ changes the library namespace, so the bundled script targets a pre-13.1 runtime."
  default     = "syn-nodejs-puppeteer-12.0"
}

variable "cloudfront_5xx_threshold_percent" {
  type        = number
  description = "Alarm when the average CloudFront 5xx error rate exceeds this percentage over 5 minutes."
  default     = 5
}

variable "cloudfront_4xx_threshold_percent" {
  type        = number
  description = "Alarm when the average CloudFront 4xx error rate exceeds this percentage over 5 minutes."
  default     = 20
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to every observability resource."
  default     = {}
}
