# Central log archive (issue #39).
#
# One private S3 bucket receives:
#   * CloudFront standard access logs (v2, delivered through CloudWatch Logs,
#     which writes the final objects here), and
#   * S3 server access logs from the site bucket.
#
# Keeping logs in their own bucket means the site bucket stays lean, and the
# retention policy is managed in one place. Access is bucket-policy based, so
# Object Ownership can stay at the safe default (ACLs disabled).

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
}

resource "aws_s3_bucket" "logs" {
  bucket        = var.bucket_name
  force_destroy = var.force_destroy
  tags          = var.tags
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket                  = aws_s3_bucket.logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Logs are only useful for incident retrospection; keeping them forever is a
# silent storage bill. 90 days covers a quarter and stays inside the free tier
# at this site's traffic.
resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    id     = "ExpireLogs"
    status = "Enabled"
    filter {
      prefix = ""
    }
    expiration {
      days = var.retention_days
    }
  }

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

data "aws_iam_policy_document" "logs" {
  # CloudFront standard logging (v2) delivers through the CloudWatch Logs
  # delivery pipeline. The delivery-source ARN is always in us-east-1.
  statement {
    sid    = "AWSLogDeliveryWrite"
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com"]
    }
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.logs.arn}/*"]
    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:logs:us-east-1:${local.account_id}:delivery-source:*"]
    }
  }

  # CloudWatch Logs delivery performs an ACL check on the destination bucket
  # before writing, even when Object Ownership disables ACLs.
  statement {
    sid    = "AWSLogDeliveryAclCheck"
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com"]
    }
    actions   = ["s3:GetBucketAcl"]
    resources = [aws_s3_bucket.logs.arn]
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }

  # S3 server access logging writes with the logging.s3.amazonaws.com service
  # principal. SourceAccount prevents another account's bucket from using this
  # bucket as its log destination.
  statement {
    sid    = "S3ServerAccessLogsWrite"
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["logging.s3.amazonaws.com"]
    }
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.logs.arn}/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

resource "aws_s3_bucket_policy" "logs" {
  bucket = aws_s3_bucket.logs.id
  policy = data.aws_iam_policy_document.logs.json

  depends_on = [aws_s3_bucket_public_access_block.logs]
}
