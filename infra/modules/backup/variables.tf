variable "backup_bucket_name" {
  type        = string
  description = "Globally unique name of the private bucket that holds snapshots and product photos."
}

variable "source_bucket_name" {
  type        = string
  description = "Live site bucket that holds products.json and products/* images."
}

variable "function_name" {
  type        = string
  description = "Name of the scheduled backup Lambda."
  default     = "riddhi-backup-products"
}

variable "lambda_source_dir" {
  type        = string
  description = "Directory containing the bundled backup Lambda (built by npm run build:lambda)."
}

variable "lambda_zip_path" {
  type        = string
  description = "Where Terraform writes the deployment zip."
  default     = ""
}

variable "schedule_expression" {
  type        = string
  description = "EventBridge schedule for the backup. Daily is enough for this catalogue."
  default     = "cron(0 3 * * ? *)"
}

variable "snapshot_retention_days" {
  type        = number
  description = "Days to keep daily products.json snapshots. 90 gives a quarter of restore points."
  default     = 90
}

variable "log_retention_days" {
  type        = number
  description = "CloudWatch log retention for the backup Lambda."
  default     = 14
}

variable "alert_topic_arn" {
  type        = string
  description = "Existing SNS topic for failure alarms. Empty disables alarm actions."
  default     = ""
}

variable "force_destroy" {
  type        = bool
  description = "Allow terraform destroy to delete the backup bucket and its contents. Keep false."
  default     = false
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to all resources."
  default     = {}
}
