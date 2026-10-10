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
      "s3:GetBucketVersioning", "s3:GetAccelerateConfiguration",
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
      "iam:ListRolePolicies", "iam:ListAttachedRolePolicies",
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
      "budgets:DeleteBudget", "budgets:DescribeBudgets",
    ]
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