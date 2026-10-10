# Cost guardrails — the site is ~USD 0.10/month, so the budget cap is $1.00 with
# real email subscribers at 50/80/100% plus a forecast alert. The pre-existing
# budget ($5.00, empty Notifications array) could never alert on anything; this
# one can. See README "Cost & budget guardrails".

data "aws_caller_identity" "current" {}

resource "aws_sns_topic" "cost" {
  name         = "riddhi-cost-alerts"
  display_name = "Riddhi cost alerts"
  tags         = var.tags
}

resource "aws_sns_topic_policy" "cost" {
  arn    = aws_sns_topic.cost.arn
  policy = data.aws_iam_policy_document.cost_subscribers.json
}

data "aws_iam_policy_document" "cost_subscribers" {
  statement {
    sid    = "AllowBudgetsPublish"
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.cost.arn]
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.cost.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_budgets_budget" "monthly" {
  name         = "riddhi-site-monthly-spend"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_types {
    include_credit             = false
    include_discount           = false
    include_other_subscription = false
    include_recurring          = true
    include_refund             = false
    include_subscription       = false
    include_support            = false
    include_tax                = false
    include_upfront            = false
    use_amortized              = false
    use_blended                = false
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 50
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }
  # Forecast alerts catch a bad month before it happens — the site's own cost is
  # tiny, so surprises show up as a sudden step change.
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}