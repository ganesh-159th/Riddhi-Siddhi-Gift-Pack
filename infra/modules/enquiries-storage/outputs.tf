output "bucket_name" {
  value       = var.bucket_name
  description = "Name of the private enquiries bucket."
}

output "bucket_arn" {
  value       = aws_s3_bucket.enquiries.arn
  description = "ARN of the private enquiries bucket."
}
