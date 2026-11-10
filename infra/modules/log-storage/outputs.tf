output "bucket_name" {
  # Use the input rather than the resource attribute so callers can use this
  # output in count/for_each before the bucket exists.
  value       = var.bucket_name
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
