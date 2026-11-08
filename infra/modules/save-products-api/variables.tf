variable "function_name" {
  type        = string
  description = "Name of the Lambda function (also used for the role, API and API key)."
  default     = "riddhi-save-products"
}

variable "lambda_source_dir" {
  type        = string
  description = "Directory containing the bundled Lambda (index.cjs). Produced by `npm run build:lambda`."
}

variable "lambda_zip_path" {
  type        = string
  description = "Where Terraform writes the deployment zip. Defaults to <root>/.build/save-products.zip."
  default     = ""
}

variable "secret_parameter_prefix" {
  type        = string
  description = "SSM path prefix the handler reads secrets from (SSM_PREFIX)."
  default     = "/riddhi/prod"
}

variable "secret_parameter_arns" {
  type        = list(string)
  description = "SSM parameter ARNs the Lambda may read."
}

variable "s3_bucket_arn" {
  type        = string
  description = "Site bucket ARN, for the orphan-cleanup S3 permissions."
}

variable "orphan_grace_minutes" {
  type        = number
  description = "Grace window before an unreferenced product image may be deleted."
  default     = 30
}

variable "stage_name" {
  type        = string
  description = "API Gateway stage name."
  default     = "prod"
}

variable "log_retention_days" {
  type        = number
  description = "CloudWatch log retention. Keeps spend bounded."
  default     = 30
}

variable "memory_size" {
  type        = number
  description = "Lambda memory (MB). 512 keeps a publish well under a second."
  default     = 512
}

variable "timeout_seconds" {
  type        = number
  description = "Lambda timeout (GitHub writes + orphan sweep). Kept under API Gateway REST's hard 29-second integration limit."
  default     = 25
}

variable "reserved_concurrency" {
  type        = number
  description = "Reserved concurrency caps both abuse and cost. Set to -1 for unreserved."
  default     = 5
}

variable "rate_limit" {
  type        = number
  description = "Sustained requests/second allowed by the usage plan."
  default     = 5
}

variable "burst_limit" {
  type        = number
  description = "Burst requests/second allowed by the usage plan."
  default     = 10
}

variable "monthly_quota" {
  type        = number
  description = "Requests allowed per calendar month by the usage plan (0 disables the quota)."
  default     = 5000
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to every resource."
  default     = {}
}
