output "alert_topic_arn" {
  value       = aws_sns_topic.alerts.arn
  description = "SNS topic receiving API/Lambda/canary alerts."
}

output "cloudfront_alert_topic_arn" {
  value       = aws_sns_topic.alerts_us_east_1.arn
  description = "us-east-1 SNS topic receiving CloudFront alerts."
}

output "dashboard_name" {
  value       = aws_cloudwatch_dashboard.main.dashboard_name
  description = "CloudWatch dashboard name."
}

output "canary_name" {
  value       = try(aws_synthetics_canary.site[0].name, "")
  description = "Synthetic canary name (empty when disabled)."
}

output "cloudfront_log_delivery_id" {
  value       = aws_cloudwatch_log_delivery.cloudfront_s3.id
  description = "CloudFront standard logging (v2) delivery id."
}
