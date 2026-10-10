# Remote state backend (issue #38 deliverable) — S3 for the tfstate files,
# DynamoDB for locking. Run this ONCE per account/region, directly (no remote
# backend), then point infra/environments/prod at it via backend.hcl.

resource "aws_s3_bucket" "state" {
  bucket        = var.bucket_name
  force_destroy = false
  tags          = var.tags
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "state_lock" {
  name         = var.lock_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"
  attribute {
    name = "LockID"
    type = "S"
  }
  tags = var.tags
}

output "state_bucket" {
  value       = aws_s3_bucket.state.id
  description = "Name of the S3 bucket holding tfstate files"
}

output "state_bucket_arn" {
  value = aws_s3_bucket.state.arn
}

output "lock_table" {
  value       = aws_dynamodb_table.state_lock.name
  description = "Name of the DynamoDB lock table"
}

output "terraform_role_arn" {
  value       = aws_iam_role.terraform.arn
  description = "Set this as the AWS_TF_ROLE_ARN GitHub secret so the Terraform workflow can run plan/apply"
}