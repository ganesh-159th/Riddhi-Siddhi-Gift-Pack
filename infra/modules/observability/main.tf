# Observability for the whole production stack (issue #39).
#
# Covers:
#   * CloudFront standard access logs (v2) -> S3
#   * API Gateway access logs -> CloudWatch Logs
#   * CloudWatch dashboard (requests, errors, latency, throttles, canary)
#   * CloudWatch alarms -> SNS email/SMS
#   * CloudWatch Synthetics canary for home + products.json
#
# CloudFront metrics live in us-east-1, so the module takes a us_east_1
# provider alias for the CloudFront log delivery and alarms. CloudFront alarms
# must also publish to an SNS topic in their own region, hence the second topic.

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_partition" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.region
  partition  = data.aws_partition.current.partition

  canary_name = "${var.name_prefix}-site-canary"
}

# ---------------------------------------------------------------------------
# SNS — one topic per region so every alarm can publish locally
# ---------------------------------------------------------------------------
resource "aws_sns_topic" "alerts" {
  name         = "${var.name_prefix}-alerts"
  display_name = "Riddhi production alerts"
  tags         = var.tags
}

resource "aws_sns_topic" "alerts_us_east_1" {
  provider = aws.us_east_1

  name         = "${var.name_prefix}-alerts-us-east-1"
  display_name = "Riddhi CloudFront alerts"
  tags         = var.tags
}

data "aws_iam_policy_document" "alerts" {
  statement {
    sid    = "AllowAccountOwner"
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = ["arn:${local.partition}:iam::${local.account_id}:root"]
    }
    actions   = ["sns:*"]
    resources = [aws_sns_topic.alerts.arn]
  }

  statement {
    sid    = "AllowCloudWatchAlarms"
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

data "aws_iam_policy_document" "alerts_us_east_1" {
  statement {
    sid    = "AllowAccountOwner"
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = ["arn:${local.partition}:iam::${local.account_id}:root"]
    }
    actions   = ["sns:*"]
    resources = [aws_sns_topic.alerts_us_east_1.arn]
  }

  statement {
    sid    = "AllowCloudWatchAlarms"
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts_us_east_1.arn]
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

resource "aws_sns_topic_policy" "alerts" {
  arn    = aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts.json
}

resource "aws_sns_topic_policy" "alerts_us_east_1" {
  provider = aws.us_east_1

  arn    = aws_sns_topic.alerts_us_east_1.arn
  policy = data.aws_iam_policy_document.alerts_us_east_1.json
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_sns_topic_subscription" "email_us_east_1" {
  provider = aws.us_east_1

  topic_arn = aws_sns_topic.alerts_us_east_1.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# SNS SMS is opt-in: it needs an E.164 number and the account must not be in the
# SMS sandbox (or the number must be verified).
resource "aws_sns_topic_subscription" "sms" {
  count = var.alert_sms_number != "" ? 1 : 0

  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "sms"
  endpoint  = var.alert_sms_number
}

resource "aws_sns_topic_subscription" "sms_us_east_1" {
  count    = var.alert_sms_number != "" ? 1 : 0
  provider = aws.us_east_1

  topic_arn = aws_sns_topic.alerts_us_east_1.arn
  protocol  = "sms"
  endpoint  = var.alert_sms_number
}

# ---------------------------------------------------------------------------
# CloudFront standard logging (v2) -> S3
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_log_delivery_source" "cloudfront" {
  provider = aws.us_east_1

  name         = "${var.name_prefix}-cloudfront-access-logs"
  log_type     = "ACCESS_LOGS"
  resource_arn = var.distribution_arn
}

resource "aws_cloudwatch_log_delivery_destination" "cloudfront_s3" {
  provider = aws.us_east_1

  name                      = "${var.name_prefix}-cloudfront-s3"
  delivery_destination_type = "S3"
  output_format             = "parquet"

  delivery_destination_configuration {
    destination_resource_arn = "${var.log_bucket_arn}/cloudfront"
  }
}

resource "aws_cloudwatch_log_delivery" "cloudfront_s3" {
  provider = aws.us_east_1

  delivery_source_name     = aws_cloudwatch_log_delivery_source.cloudfront.name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.cloudfront_s3.arn

  s3_delivery_configuration {
    enable_hive_compatible_path = true
  }
}

# ---------------------------------------------------------------------------
# API Gateway throttling metric (from the JSON access log)
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_log_metric_filter" "api_throttles" {
  count = var.api_access_log_group_name != "" ? 1 : 0

  name           = "${var.name_prefix}-api-throttles"
  log_group_name = var.api_access_log_group_name
  pattern        = "{ $.status = \"429\" }"

  metric_transformation {
    name          = "ApiThrottles"
    namespace     = "Riddhi/ApiGateway"
    value         = "1"
    default_value = "0"
  }
}

# ---------------------------------------------------------------------------
# Alarms
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${var.name_prefix}-api-5xx"
  alarm_description   = "API Gateway returned one or more 5xx responses in 5 minutes."
  namespace           = "AWS/ApiGateway"
  metric_name         = "5XXError"
  dimensions          = { ApiName = var.api_name, Stage = var.api_stage }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "api_throttles" {
  count = var.api_access_log_group_name != "" ? 1 : 0

  alarm_name          = "${var.name_prefix}-api-throttles"
  alarm_description   = "API Gateway throttled a request (HTTP 429) in the last 5 minutes."
  namespace           = "Riddhi/ApiGateway"
  metric_name         = "ApiThrottles"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${var.name_prefix}-lambda-errors"
  alarm_description   = "The save-products Lambda threw an error in the last 5 minutes."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = var.lambda_function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  alarm_name          = "${var.name_prefix}-lambda-throttles"
  alarm_description   = "The save-products Lambda was throttled in the last 5 minutes."
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  dimensions          = { FunctionName = var.lambda_function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "cloudfront_5xx" {
  provider = aws.us_east_1

  alarm_name          = "${var.name_prefix}-cloudfront-5xx"
  alarm_description   = "CloudFront 5xx error rate is above ${var.cloudfront_5xx_threshold_percent}%."
  namespace           = "AWS/CloudFront"
  metric_name         = "5xxErrorRate"
  dimensions          = { DistributionId = var.distribution_id }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = var.cloudfront_5xx_threshold_percent
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts_us_east_1.arn]
  ok_actions          = [aws_sns_topic.alerts_us_east_1.arn]
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "cloudfront_4xx" {
  provider = aws.us_east_1

  alarm_name          = "${var.name_prefix}-cloudfront-4xx"
  alarm_description   = "CloudFront 4xx error rate is above ${var.cloudfront_4xx_threshold_percent}%."
  namespace           = "AWS/CloudFront"
  metric_name         = "4xxErrorRate"
  dimensions          = { DistributionId = var.distribution_id }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = var.cloudfront_4xx_threshold_percent
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts_us_east_1.arn]
  ok_actions          = [aws_sns_topic.alerts_us_east_1.arn]
  tags                = var.tags
}

# ---------------------------------------------------------------------------
# Synthetic canary
# ---------------------------------------------------------------------------
data "archive_file" "canary" {
  count = var.canary_enabled ? 1 : 0

  type        = "zip"
  source_file = "${path.module}/canary/site.js"
  output_path = "${path.root}/.build/canary.zip"
}

data "aws_iam_policy_document" "canary_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "canary" {
  count = var.canary_enabled ? 1 : 0

  name               = "${var.name_prefix}-canary"
  assume_role_policy = data.aws_iam_policy_document.canary_assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "canary" {
  statement {
    sid       = "WriteArtifacts"
    actions   = ["s3:PutObject"]
    resources = ["${var.log_bucket_arn}/synthetics/*"]
  }

  statement {
    sid       = "LocateArtifactBucket"
    actions   = ["s3:GetBucketLocation", "s3:ListAllMyBuckets"]
    resources = ["*"]
  }

  statement {
    sid       = "ListArtifactBucket"
    actions   = ["s3:ListBucket"]
    resources = [var.log_bucket_arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["synthetics/*"]
    }
  }

  statement {
    sid       = "PublishCanaryMetrics"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]
  }

  statement {
    sid       = "WriteCanaryLogs"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:${local.partition}:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/cwsyn-*:*"]
  }
}

resource "aws_iam_role_policy" "canary" {
  count = var.canary_enabled ? 1 : 0

  name   = "${var.name_prefix}-canary-policy"
  role   = aws_iam_role.canary[0].id
  policy = data.aws_iam_policy_document.canary.json
}

resource "aws_synthetics_canary" "site" {
  count = var.canary_enabled ? 1 : 0

  name                     = local.canary_name
  artifact_s3_location     = "s3://${var.log_bucket_name}/synthetics/"
  execution_role_arn       = aws_iam_role.canary[0].arn
  handler                  = "site.handler"
  zip_file                 = data.archive_file.canary[0].output_path
  runtime_version          = var.canary_runtime_version
  start_canary             = true
  success_retention_period = 31
  failure_retention_period = 31

  schedule {
    expression = var.canary_schedule
  }

  run_config {
    timeout_in_seconds = 30
    # Synthetics requires at least 960 MB for this runtime.
    memory_in_mb = 960
    environment_variables = {
      SITE_URL = var.site_url
    }
  }

  artifact_config {
    s3_encryption {
      encryption_mode = "SSE_S3"
    }
  }

  tags = var.tags

  depends_on = [aws_iam_role_policy.canary]
}

resource "aws_cloudwatch_metric_alarm" "canary_failed" {
  count = var.canary_enabled ? 1 : 0

  alarm_name          = "${var.name_prefix}-canary-failed"
  alarm_description   = "The synthetic canary failed a run in the last 5 minutes."
  namespace           = "CloudWatchSynthetics"
  metric_name         = "Failed"
  dimensions          = { CanaryName = aws_synthetics_canary.site[0].name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  tags                = var.tags
}

# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
locals {
  common_widgets = [
    {
      type   = "text"
      x      = 0
      y      = 0
      width  = 24
      height = 2
      properties = {
        markdown = "# Riddhi Siddhi — production observability\nCloudFront metrics live in **us-east-1**; API, Lambda and canary metrics in **${local.region}**."
      }
    },
    {
      type   = "metric"
      x      = 0
      y      = 2
      width  = 12
      height = 6
      properties = {
        title  = "CloudFront — requests and error rates"
        region = "us-east-1"
        view   = "timeSeries"
        period = 300
        metrics = [
          ["AWS/CloudFront", "Requests", "DistributionId", var.distribution_id, { stat = "Sum" }],
          ["AWS/CloudFront", "5xxErrorRate", "DistributionId", var.distribution_id, { stat = "Average", yAxis = "right" }],
          ["AWS/CloudFront", "4xxErrorRate", "DistributionId", var.distribution_id, { stat = "Average", yAxis = "right" }],
        ]
      }
    },
    {
      type   = "metric"
      x      = 12
      y      = 2
      width  = 12
      height = 6
      properties = {
        title  = "API Gateway — requests, errors, throttles, latency"
        region = local.region
        view   = "timeSeries"
        period = 300
        metrics = [
          ["AWS/ApiGateway", "Count", "ApiName", var.api_name, "Stage", var.api_stage, { stat = "Sum" }],
          ["AWS/ApiGateway", "5XXError", "ApiName", var.api_name, "Stage", var.api_stage, { stat = "Sum" }],
          ["AWS/ApiGateway", "4XXError", "ApiName", var.api_name, "Stage", var.api_stage, { stat = "Sum" }],
          ["Riddhi/ApiGateway", "ApiThrottles", { stat = "Sum" }],
          ["AWS/ApiGateway", "Latency", "ApiName", var.api_name, "Stage", var.api_stage, { stat = "Average", yAxis = "right" }],
        ]
      }
    },
    {
      type   = "metric"
      x      = 0
      y      = 8
      width  = 12
      height = 6
      properties = {
        title  = "Lambda — invocations, errors, throttles, duration"
        region = local.region
        view   = "timeSeries"
        period = 300
        metrics = [
          ["AWS/Lambda", "Invocations", "FunctionName", var.lambda_function_name, { stat = "Sum" }],
          ["AWS/Lambda", "Errors", "FunctionName", var.lambda_function_name, { stat = "Sum" }],
          ["AWS/Lambda", "Throttles", "FunctionName", var.lambda_function_name, { stat = "Sum" }],
          ["AWS/Lambda", "Duration", "FunctionName", var.lambda_function_name, { stat = "Average", yAxis = "right" }],
        ]
      }
    },
    {
      type   = "metric"
      x      = 12
      y      = 8
      width  = 12
      height = 6
      properties = {
        title  = "S3 — site bucket storage"
        region = local.region
        view   = "timeSeries"
        period = 86400
        metrics = [
          ["AWS/S3", "BucketSizeBytes", "BucketName", var.site_bucket_name, "StorageType", "StandardStorage", { stat = "Average" }],
          ["AWS/S3", "NumberOfObjects", "BucketName", var.site_bucket_name, "StorageType", "AllStorageTypes", { stat = "Average" }],
        ]
      }
    },
  ]

  canary_widgets = var.canary_enabled ? [
    {
      type   = "metric"
      x      = 0
      y      = 14
      width  = 12
      height = 6
      properties = {
        title  = "Synthetic canary — success and failures"
        region = local.region
        view   = "timeSeries"
        period = 300
        metrics = [
          ["CloudWatchSynthetics", "SuccessPercent", "CanaryName", local.canary_name, { stat = "Average" }],
          ["CloudWatchSynthetics", "Failed", "CanaryName", local.canary_name, { stat = "Sum", yAxis = "right" }],
          ["CloudWatchSynthetics", "Duration", "CanaryName", local.canary_name, { stat = "Average", yAxis = "right" }],
        ]
      }
    },
  ] : []
}

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.name_prefix}-observability"
  dashboard_body = jsonencode({
    widgets = concat(local.common_widgets, local.canary_widgets)
  })
}
