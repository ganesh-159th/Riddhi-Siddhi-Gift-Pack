output "bucket_name" {
  value       = aws_s3_bucket.logs.id
  description = "Name of the log bucket."
}

output "bucket_arn" {
  value       = aws_s3_bucket.logs.arn
  description = "ARN of the log bucket."
}

output "bucket_domain_name" {
  value       = aws_s3_bucket.logs.bucket_domain_name
  description = "Regional domain name of the log bucket."
}
