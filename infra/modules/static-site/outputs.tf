output "bucket_name" {
  value       = aws_s3_bucket.site.id
  description = "S3 bucket holding the built site and product photos"
}

output "bucket_arn" {
  value       = aws_s3_bucket.site.arn
  description = "ARN of the site bucket"
}

output "distribution_id" {
  value       = aws_cloudfront_distribution.site.id
  description = "Set this as the CLOUDFRONT_DISTRIBUTION_ID GitHub variable"
}

output "distribution_domain" {
  value       = aws_cloudfront_distribution.site.domain_name
  description = "Set this as the SITE_URL GitHub variable"
}

output "distribution_arn" {
  value       = aws_cloudfront_distribution.site.arn
  description = "ARN of the CloudFront distribution"
}

output "cdn_domain_in_use" {
  value       = var.cdn_domain
  description = "Must equal distribution_domain. If these differ, browser photo uploads are blocked by S3 CORS."
}

output "security_headers_policy_id" {
  value       = aws_cloudfront_response_headers_policy.security.id
  description = "ID of the security headers response headers policy"
}

output "origin_access_control_id" {
  value       = aws_cloudfront_origin_access_control.s3.id
  description = "ID of the S3 Origin Access Control"
}

output "index_rewrite_function_arn" {
  value       = aws_cloudfront_function.index_rewrite.arn
  description = "ARN of the viewer-request index-rewrite function"
}