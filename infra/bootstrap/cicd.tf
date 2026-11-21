# GitHub Actions OIDC role that runs Terraform (plan + apply) from
# .github/workflows/terraform.yml.
#
# This is deliberately SEPARATE from the deploy role (riddhi-cicd): that one can
# only sync objects and invalidate the CDN, whereas Terraform has to create and
# modify infrastructure. Its trust policy is also tighter — scoped to this one
# repository (and the `production` environment), not `repo:<org>/*`.
#
# Bootstrap is applied once by a human with admin credentials (it cannot use a
# backend it is itself creating); from then on CI owns the prod stack.

data "aws_caller_identity" "current" {}

# The GitHub OIDC provider already exists in the account (created by the
# riddhi-site CloudFormation stack / the prod stack's github-oidc module). We
# reference it by ARN rather than creating it, to avoid two owners for one
# provider. On a genuinely fresh account, create it first (or import it) and
# pass its ARN via `github_oidc_provider_arn`.
data "aws_iam_policy_document" "terraform_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [var.github_oidc_provider_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "${var.github_oidc_sub_prefix}:pull_request",
        "${var.github_oidc_sub_prefix}:ref:refs/heads/main",
        "${var.github_oidc_sub_prefix}:environment:production",
      ]
    }
  }
}

resource "aws_iam_role" "terraform" {
  name                 = var.terraform_role_name
  max_session_duration = 3600
  assume_role_policy   = data.aws_iam_policy_document.terraform_assume_role.json
  tags                 = var.tags
}

data "aws_iam_policy_document" "terraform" {
  # Backend: read/write the tfstate object and take the lock.
  statement {
    sid       = "TfStateBucket"
    effect    = "Allow"
    actions   = ["s3:ListBucket", "s3:GetBucketVersioning", "s3:GetBucketLocation"]
    resources = [aws_s3_bucket.state.arn]
  }
  statement {
    sid       = "TfStateObjects"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.state.arn}/*"]
  }
  statement {
    sid       = "TfStateLock"
    effect    = "Allow"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:DescribeTable"]
    resources = [aws_dynamodb_table.state_lock.arn]
  }

  # The site bucket and its sub-resources (policy, CORS, lifecycle, encryption,
  # public-access block, tagging). Name comes from var.site_bucket_name.
  statement {
    sid       = "SiteBucket"
    effect    = "Allow"
    actions   = ["s3:ListBucket", "s3:GetBucketLocation", "s3:CreateBucket", "s3:DeleteBucket"]
    resources = ["arn:aws:s3:::${var.site_bucket_name}"]
  }
  statement {
    sid    = "SiteBucketConfig"
    effect = "Allow"
    actions = [
      "s3:GetBucketPolicy", "s3:PutBucketPolicy", "s3:DeleteBucketPolicy",
      "s3:GetBucketCORS", "s3:PutBucketCORS", "s3:DeleteBucketCors",
      "s3:GetLifecycleConfiguration", "s3:PutLifecycleConfiguration",
      "s3:GetEncryptionConfiguration", "s3:PutEncryptionConfiguration",
      "s3:GetBucketPublicAccessBlock", "s3:PutBucketPublicAccessBlock",
      "s3:GetBucketTagging", "s3:PutBucketTagging",
      "s3:GetBucketVersioning", "s3:PutBucketVersioning", "s3:GetAccelerateConfiguration",
      # Extra reads the provider performs when refreshing aws_s3_bucket.
      "s3:GetBucketAcl", "s3:GetBucketWebsite", "s3:GetBucketLogging",
      "s3:GetBucketRequestPayment", "s3:GetBucketNotification",
      "s3:GetBucketObjectLockConfiguration", "s3:GetReplicationConfiguration",
    ]
    resources = ["arn:aws:s3:::${var.site_bucket_name}"]
  }

  # CloudFront (distribution, OAC, functions, cache/header policies). Most
  # CloudFront actions do not support resource-level scoping, so this is "*".
  statement {
    sid       = "CloudFront"
    effect    = "Allow"
    actions   = ["cloudfront:*"]
    resources = ["*"]
  }

  # IAM objects the prod stack manages: the deploy role + its inline policy, and
  # (on fresh accounts) the OIDC provider.
  statement {
    sid    = "Iam"
    effect = "Allow"
    actions = [
      "iam:CreateRole", "iam:GetRole", "iam:DeleteRole", "iam:UpdateRole",
      "iam:UpdateAssumeRolePolicy", "iam:TagRole", "iam:UntagRole", "iam:ListRoleTags",
      "iam:PutRolePolicy", "iam:GetRolePolicy", "iam:DeleteRolePolicy",
      "iam:ListRolePolicies", "iam:ListAttachedRolePolicies", "iam:ListInstanceProfilesForRole",
      "iam:CreateOpenIDConnectProvider", "iam:GetOpenIDConnectProvider",
      "iam:DeleteOpenIDConnectProvider", "iam:TagOpenIDConnectProvider",
      "iam:ListOpenIDConnectProviders",
    ]
    resources = ["*"]
  }

  # Cost guardrails: SNS topic/policy/subscription + the monthly budget.
  statement {
    sid    = "Sns"
    effect = "Allow"
    actions = [
      "sns:CreateTopic", "sns:DeleteTopic", "sns:GetTopicAttributes", "sns:SetTopicAttributes",
      "sns:TagResource", "sns:UntagResource", "sns:ListTagsForResource",
      "sns:Subscribe", "sns:Unsubscribe", "sns:GetSubscriptionAttributes",
      "sns:ListSubscriptionsByTopic", "sns:ListTopics",
    ]
    resources = ["*"]
  }
  statement {
    sid    = "Budgets"
    effect = "Allow"
    actions = [
      "budgets:ViewBudget", "budgets:ModifyBudget", "budgets:CreateBudget",
      "budgets:DeleteBudget", "budgets:DescribeBudgets", "budgets:ListTagsForResource",
    ]
    resources = ["*"]
  }

  # --- save-products Lambda + API Gateway (issue #4) ------------------------

  # The function itself, its concurrency, tags and resource policy.
  statement {
    sid     = "SaveProductsLambda"
    effect  = "Allow"
    actions = ["lambda:*"]
    resources = [
      "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:riddhi-save-products",
      "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:riddhi-save-products:*",
    ]
  }

  # Let Terraform attach the execution role to the function.
  statement {
    sid       = "PassSaveProductsRole"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/riddhi-save-products-role"]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }

  # REST API, resources, methods, integrations, stage, usage plan, API key and
  # gateway responses. API Gateway uses path-style ARNs with no account id.
  statement {
    sid       = "SaveProductsApiGateway"
    effect    = "Allow"
    actions   = ["apigateway:*"]
    resources = ["arn:aws:apigateway:${var.region}::/*"]
  }

  # Backend secrets. Values are never written by Terraform (placeholders +
  # ignore_changes), but the resources themselves are managed here.
  statement {
    sid    = "BackendSecrets"
    effect = "Allow"
    actions = [
      "ssm:AddTagsToResource", "ssm:RemoveTagsFromResource", "ssm:ListTagsForResource",
      "ssm:GetParameter", "ssm:GetParameters", "ssm:PutParameter", "ssm:DeleteParameter",
    ]
    resources = ["arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter/riddhi/prod/*"]
  }

  # DescribeParameters is an account-level action with no resource scoping.
  statement {
    sid       = "BackendSecretsDescribe"
    effect    = "Allow"
    actions   = ["ssm:DescribeParameters"]
    resources = ["*"]
  }

  # The Lambda log group (retention + tags).
  statement {
    sid    = "SaveProductsLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup", "logs:DeleteLogGroup",
      "logs:PutRetentionPolicy", "logs:DeleteRetentionPolicy",
      "logs:TagResource", "logs:UntagResource", "logs:ListTagsForResource",
    ]
    resources = [
      "arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/riddhi-save-products",
      "arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/riddhi-save-products:*",
    ]
  }

  # DescribeLogGroups is account-level and does not support resource scoping.
  statement {
    sid       = "SaveProductsLogsDescribe"
    effect    = "Allow"
    actions   = ["logs:DescribeLogGroups"]
    resources = ["*"]
  }

  # Terraform reads the AWS-managed SSM key alias to scope the Lambda's
  # kms:Decrypt permission. ListAliases does not support resource scoping.
  statement {
    sid       = "ReadKmsAlias"
    effect    = "Allow"
    actions   = ["kms:ListAliases", "kms:DescribeKey"]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "terraform" {
  name   = "${var.terraform_role_name}-policy"
  policy = data.aws_iam_policy_document.terraform.json
  tags   = var.tags
}

resource "aws_iam_role_policy_attachment" "terraform" {
  role       = aws_iam_role.terraform.name
  policy_arn = aws_iam_policy.terraform.arn
}

# Issue #39 adds logging, dashboards, alarms and a Synthetics canary. Those
# permissions live in a second managed policy because the original policy is
# already near IAM's 6,144-character limit.
data "aws_iam_policy_document" "terraform_observability" {
  # S3 server access logging on the site bucket.
  statement {
    sid    = "SiteLogging"
    effect = "Allow"
    actions = [
      "s3:PutBucketLogging", "s3:GetBucketPolicyStatus",
      "s3:GetBucketOwnershipControls", "s3:GetBucketNotificationConfiguration",
    ]
    resources = ["arn:aws:s3:::${var.site_bucket_name}"]
  }

  # The dedicated log bucket. This is scoped to one bucket, but intentionally
  # broad enough to manage all of its configuration sub-resources.
  statement {
    sid    = "LogBucket"
    effect = "Allow"
    actions = [
      "s3:CreateBucket", "s3:DeleteBucket", "s3:ListBucket",
      "s3:GetBucket*", "s3:PutBucket*", "s3:DeleteBucket*",
      "s3:GetLifecycleConfiguration", "s3:PutLifecycleConfiguration",
      "s3:GetEncryptionConfiguration", "s3:PutEncryptionConfiguration",
      "s3:GetAccelerateConfiguration", "s3:GetReplicationConfiguration",
    ]
    resources = ["arn:aws:s3:::${var.logs_bucket_name}"]
  }
  statement {
    sid    = "EnquiriesBucket"
    effect = "Allow"
    actions = [
      "s3:CreateBucket", "s3:DeleteBucket", "s3:ListBucket",
      "s3:GetBucket*", "s3:PutBucket*", "s3:DeleteBucket*",
      "s3:GetLifecycleConfiguration", "s3:PutLifecycleConfiguration",
      "s3:GetEncryptionConfiguration", "s3:PutEncryptionConfiguration",
      "s3:GetAccelerateConfiguration", "s3:GetReplicationConfiguration",
    ]
    resources = ["arn:aws:s3:::${var.enquiries_bucket_name}"]
  }

  # IAM objects used by the observability stack.
  statement {
    sid       = "ApiGatewayRolePolicy"
    effect    = "Allow"
    actions   = ["iam:AttachRolePolicy", "iam:DetachRolePolicy"]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.save_products_function_name}-apigw-cloudwatch"]
  }
  statement {
    sid       = "ServiceLinkedRoles"
    effect    = "Allow"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/aws-service-role/*"]
  }
  statement {
    sid     = "PassObservabilityRoles"
    effect  = "Allow"
    actions = ["iam:PassRole"]
    resources = [
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.save_products_function_name}-apigw-cloudwatch",
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/riddhi-canary",
    ]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["apigateway.amazonaws.com", "synthetics.amazonaws.com", "lambda.amazonaws.com"]
    }
  }

  # The API Gateway access log group and its 429 metric filter.
  statement {
    sid    = "ApiAccessLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup", "logs:DeleteLogGroup",
      "logs:PutRetentionPolicy", "logs:DeleteRetentionPolicy",
      "logs:TagResource", "logs:UntagResource", "logs:ListTagsForResource",
      "logs:PutMetricFilter", "logs:DeleteMetricFilter", "logs:DescribeMetricFilters",
    ]
    resources = [
      "arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/apigateway/${var.save_products_function_name}-access",
      "arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/apigateway/${var.save_products_function_name}-access:*",
    ]
  }

  # CloudFront standard logging (v2) uses the CloudWatch Logs delivery APIs.
  statement {
    sid    = "CloudWatchLogDelivery"
    effect = "Allow"
    actions = [
      "logs:PutDeliverySource", "logs:GetDeliverySource", "logs:DeleteDeliverySource",
      "logs:DescribeDeliverySources",
      "logs:PutDeliveryDestination", "logs:GetDeliveryDestination",
      "logs:DeleteDeliveryDestination", "logs:DescribeDeliveryDestinations",
      "logs:CreateDelivery", "logs:GetDelivery", "logs:UpdateDeliveryConfiguration",
      "logs:DeleteDelivery", "logs:DescribeDeliveries",
      "logs:TagResource", "logs:UntagResource", "logs:ListTagsForResource",
    ]
    resources = ["*"]
  }

  # Dashboards and alarms.
  statement {
    sid    = "CloudWatchObservability"
    effect = "Allow"
    actions = [
      "cloudwatch:PutDashboard", "cloudwatch:GetDashboard", "cloudwatch:DeleteDashboards",
      "cloudwatch:ListDashboards",
      "cloudwatch:PutMetricAlarm", "cloudwatch:DescribeAlarms", "cloudwatch:DeleteAlarms",
      "cloudwatch:TagResource", "cloudwatch:UntagResource", "cloudwatch:ListTagsForResource",
    ]
    resources = ["*"]
  }

  # Synthetics creates and manages a Lambda function per canary under the
  # caller's identity when using the API.
  statement {
    sid    = "SyntheticsLambda"
    effect = "Allow"
    actions = [
      "lambda:CreateFunction", "lambda:AddPermission", "lambda:PublishVersion",
      "lambda:UpdateFunctionCode", "lambda:UpdateFunctionConfiguration",
      "lambda:GetFunction", "lambda:GetFunctionConfiguration",
      "lambda:GetFunctionConcurrency", "lambda:ListVersionsByFunction",
      "lambda:GetPolicy", "lambda:DeleteFunction",
      "lambda:ListTags", "lambda:TagResource", "lambda:UntagResource",
    ]
    resources = ["arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:cwsyn-*"]
  }
  statement {
    sid    = "SyntheticsLambdaLayers"
    effect = "Allow"
    actions = [
      "lambda:GetLayerVersion", "lambda:PublishLayerVersion", "lambda:DeleteLayerVersion",
    ]
    resources = [
      "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:layer:cwsyn-*",
      "arn:aws:lambda:${var.region}:*:layer:Synthetics:*",
      "arn:aws:lambda:${var.region}:*:layer:Synthetics_Selenium:*",
      "arn:aws:lambda:${var.region}:*:layer:AWS-CW-Synthetics*:*",
    ]
  }
  statement {
    sid       = "SyntheticsLambdaList"
    effect    = "Allow"
    actions   = ["lambda:ListFunctions"]
    resources = ["*"]
  }
  statement {
    sid       = "SyntheticsArtifactBucket"
    effect    = "Allow"
    actions   = ["s3:GetBucketLocation", "s3:ListAllMyBuckets"]
    resources = ["*"]
  }

  # Synthetic canary for the public site.
  statement {
    sid    = "SyntheticCanary"
    effect = "Allow"
    actions = [
      "synthetics:CreateCanary", "synthetics:GetCanary", "synthetics:UpdateCanary",
      "synthetics:DeleteCanary", "synthetics:StartCanary", "synthetics:StopCanary",
      "synthetics:TagResource", "synthetics:UntagResource", "synthetics:ListTagsForResource",
      "synthetics:DescribeCanaries", "synthetics:DescribeCanariesLastRun",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "terraform_observability" {
  name   = "${var.terraform_role_name}-observability-policy"
  policy = data.aws_iam_policy_document.terraform_observability.json
  tags   = var.tags
}

resource "aws_iam_role_policy_attachment" "terraform_observability" {
  role       = aws_iam_role.terraform.name
  policy_arn = aws_iam_policy.terraform_observability.arn
}