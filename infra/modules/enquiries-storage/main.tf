resource "aws_s3_bucket" "enquiries" {
  bucket        = var.bucket_name
  force_destroy = false
  tags          = var.tags
}

resource "aws_s3_bucket_public_access_block" "enquiries" {
  bucket                  = aws_s3_bucket.enquiries.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "enquiries" {
  bucket = aws_s3_bucket.enquiries.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "enquiries" {
  bucket = aws_s3_bucket.enquiries.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "enquiries" {
  bucket = aws_s3_bucket.enquiries.id

  rule {
    id     = "AbortIncompleteMultipartUploads"
    status = "Enabled"

    filter {
      prefix = ""
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}
