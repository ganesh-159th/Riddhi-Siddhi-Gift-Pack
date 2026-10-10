variable "alert_email" {
  type        = string
  description = "Email address that receives the cost-threshold alerts. Required — a budget without subscribers is decoration."
}

variable "monthly_budget_usd" {
  type        = number
  description = "Monthly hard cap in USD (default 1.00 leaves ~10x headroom over the measured ~0.10/month)."
  default     = 1
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to the SNS topic."
  default     = {}
}