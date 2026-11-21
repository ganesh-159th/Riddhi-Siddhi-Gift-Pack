output "bucket_name" {
  value       = module.static_site.bucket_name
  description = "Set this as the S3_BUCKET GitHub variable"
}

output "distribution_id" {
  value       = module.static_site.distribution_id
  description = "Set this as the CLOUDFRONT_DISTRIBUTION_ID GitHub variable"
}

output "distribution_domain" {
  value       = module.static_site.distribution_domain
  description = "Set this as the SITE_URL GitHub variable"
}

output "cdn_domain_in_use" {
  value       = module.static_site.cdn_domain_in_use
  description = "Must equal distribution_domain, or browser photo uploads are blocked by S3 CORS."
}

output "deploy_role_arn" {
  value       = module.github_oidc.ci_role_arn
  description = "Set this as the AWS_ROLE_ARN GitHub secret"
}

output "deploy_role_name" {
  value = module.github_oidc.ci_role_name
}

output "cost_alert_topic_arn" {
  value       = module.cost_guardrails.cost_alert_topic_arn
  description = "ARN of the SNS topic receiving budget alerts"
}

output "observability_dashboard_name" {
  value       = module.observability.dashboard_name
  description = "CloudWatch dashboard with requests, errors, latency and canary widgets"
}

output "alert_topic_arn" {
  value       = module.observability.alert_topic_arn
  description = "SNS topic receiving API/Lambda/canary alerts"
}

output "cloudfront_alert_topic_arn" {
  value       = module.observability.cloudfront_alert_topic_arn
  description = "SNS topic receiving CloudFront alerts (us-east-1)"
}

output "canary_name" {
  value       = module.observability.canary_name
  description = "CloudWatch Synthetics canary name (empty when disabled)"
}

output "logs_bucket_name" {
  value       = module.log_storage.bucket_name
  description = "S3 bucket holding CloudFront and S3 access logs"
}

output "security_headers_policy_id" {
  value = module.static_site.security_headers_policy_id
}

output "aws_api_url" {
  value       = module.save_products_api.invoke_url
  description = "Stage base URL. Set this as the AWS_API_URL GitHub variable (frontend VITE_AWS_API_URL); the frontend appends /api/<route>."
}

output "save_products_api_url" {
  value       = module.save_products_api.save_products_url
  description = "Full publish endpoint, kept for direct API checks."
}

output "aws_api_key" {
  value       = module.save_products_api.api_key
  description = "Set this as the AWS_API_KEY GitHub secret (frontend VITE_AWS_API_KEY)."
  sensitive   = true
}

output "save_products_api_key" {
  value       = module.save_products_api.api_key
  description = "Legacy alias of aws_api_key."
  sensitive   = true
}

output "save_products_function_name" {
  value       = module.save_products_api.function_name
  description = "Lambda function name."
}

output "save_products_log_group" {
  value       = module.save_products_api.log_group_name
  description = "CloudWatch log group for the publish Lambda."
}

output "enquiries_bucket_name" {
  value       = module.enquiries_storage.bucket_name
  description = "Private S3 bucket for contact submissions. Use with npm run import:enquiries."
}

output "backup_bucket_name" {
  value       = module.backup.backup_bucket_name
  description = "Private S3 bucket holding products.json snapshots and product photo copies."
}

output "backup_function_name" {
  value       = module.backup.function_name
  description = "Scheduled backup Lambda."
}

output "backup_schedule_rule" {
  value       = module.backup.schedule_rule_name
  description = "EventBridge rule running the daily backup."
}
