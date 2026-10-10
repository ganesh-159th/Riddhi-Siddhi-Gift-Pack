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

output "security_headers_policy_id" {
  value = module.static_site.security_headers_policy_id
}