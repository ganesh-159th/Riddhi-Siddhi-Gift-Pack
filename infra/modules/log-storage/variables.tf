variable "bucket_name" {
  type        = string
  description = "Name of the private bucket that stores CloudFront and S3 access logs."
}

variable "retention_days" {
  type        = number
  description = "Days to keep access logs before S3 expires them."
  default     = 90
}

variable "force_destroy" {
  type        = bool
  description = "Allow terraform destroy to delete the bucket and its logs. Keep false in production."
  default     = false
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to the log bucket."
  default     = {}
}
