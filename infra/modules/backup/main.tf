# Automated, low-cost backups for products.json and admin-uploaded product photos.
#
# Cost controls (deliberate, see README "Cost & budget guardrails"):
#   * one daily Lambda invocation + one ~8 KB snapshot PUT (well inside the
#     S3/Lambda free tier), no always-on compute, no VPC, no NAT Gateway,
#   * image copies are incremental (ETag/size comparison), so a steady-state run
#     issues zero image PUTs,
#   * a separate bucket means deleting the site bucket cannot delete the data,
#     but it is still one-region, no cross-region replication (a real cost),
#   * lifecycle expires old snapshots; NO Glacier transitions (their minimum
#     storage durations are billed even after deletion).

data "archive_file" "backup" {
  type        = "zip"
  source_dir  = var.lambda_source_dir
  output_path = var.lambda_zip_path != "" ? var.lambda_zip_path : "${path.root}/.build/backup-products.zip"
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
data "aws_region" "current" {}

locals {
  source_bucket_arn = "arn:${data.aws_partition.current.partition}:s3:::${var.source_bucket_name}"
  alarm_actions     = var.alert_topic_arn == "" ? [] : [var.alert_topic_arn]
}

# ---------------------------------------------------------------------------
# Backup bucket
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "backups" {
  bucket        = var.backup_bucket_name
  force_destroy = var.force_destroy
  tags          = var.tags
}

resource "aws_s3_bucket_public_access_block" "backups" {
  bucket                  = aws_s3_bucket.backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Versioning protects an image overwritten by a bad publish. The lifecycle
# below bounds how long those previous versions are kept.
resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    id     = "ExpireOldSnapshots"
    status = "Enabled"
    filter {
      prefix = "products/"
    }
    expiration {
      days = var.snapshot_retention_days
    }
  }

  rule {
    id     = "DeleteExpiredDeleteMarkers"
    status = "Enabled"
    filter {
      prefix = ""
    }
    expiration {
      expired_object_delete_marker = true
    }
  }

  rule {
    id     = "ExpireNoncurrentVersions"
    status = "Enabled"
    filter {
      prefix = ""
    }
    noncurrent_version_expiration {
      noncurrent_days = var.snapshot_retention_days
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

# ---------------------------------------------------------------------------
# Lambda + IAM
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backup" {
  name               = "${var.function_name}-role"
  assume_role_policy = data.aws_iam_policy_document.assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "backup" {
  statement {
    sid       = "ReadProductsJson"
    actions   = ["s3:GetObject"]
    resources = ["${local.source_bucket_arn}/products.json"]
  }

  statement {
    sid       = "ListSourceImages"
    actions   = ["s3:ListBucket"]
    resources = [local.source_bucket_arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["products/*"]
    }
  }

  statement {
    sid       = "ReadSourceImages"
    actions   = ["s3:GetObject"]
    resources = ["${local.source_bucket_arn}/products/*"]
  }

  statement {
    sid       = "WriteBackups"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.backups.arn}/*"]
  }

  statement {
    sid       = "ListBackedUpImages"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.backups.arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["images/*"]
    }
  }

  statement {
    sid       = "WriteInvocationLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.backup.arn}:*"]
  }
}

resource "aws_iam_role_policy" "backup" {
  name   = "${var.function_name}-policy"
  role   = aws_iam_role.backup.id
  policy = data.aws_iam_policy_document.backup.json
}

resource "aws_cloudwatch_log_group" "backup" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_lambda_function" "backup" {
  function_name = var.function_name
  role          = aws_iam_role.backup.arn
  runtime       = "nodejs22.x"
  handler       = "index.handler"

  filename         = data.archive_file.backup.output_path
  source_code_hash = data.archive_file.backup.output_base64sha256

  memory_size = 128
  timeout     = 60

  environment {
    variables = {
      SOURCE_BUCKET                       = var.source_bucket_name
      BACKUP_BUCKET                       = aws_s3_bucket.backups.id
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
    }
  }

  depends_on = [aws_cloudwatch_log_group.backup, aws_iam_role_policy.backup]

  tags = var.tags
}

# ---------------------------------------------------------------------------
# Schedule
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_event_rule" "backup" {
  name                = "${var.function_name}-schedule"
  description         = "Daily snapshot of products.json and incremental product image backup"
  schedule_expression = var.schedule_expression
  tags                = var.tags
}

resource "aws_cloudwatch_event_target" "backup" {
  rule = aws_cloudwatch_event_rule.backup.name
  arn  = aws_lambda_function.backup.arn
}

resource "aws_lambda_permission" "eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.backup.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.backup.arn
}

# ---------------------------------------------------------------------------
# Alarms (reuse the existing ops SNS topic — no new topic or subscription)
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "backup_errors" {
  alarm_name          = "${var.function_name}-errors"
  alarm_description   = "Backup Lambda failed; check CloudWatch logs"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.backup.function_name }
  statistic           = "Sum"
  period              = 86400
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "backup_not_running" {
  alarm_name          = "${var.function_name}-not-running"
  alarm_description   = "No backup invocation in two days; check the EventBridge rule"
  namespace           = "AWS/Lambda"
  metric_name         = "Invocations"
  dimensions          = { FunctionName = aws_lambda_function.backup.function_name }
  statistic           = "Sum"
  period              = 172800
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  tags                = var.tags
}
