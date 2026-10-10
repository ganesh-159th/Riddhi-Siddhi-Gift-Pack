# GitHub Actions OIDC — no long-lived AWS keys in CI.
#
# The trust policy scopes to this repository's OIDC subject (the immutable
# `repo:owner@ownerId/repo@repoId` form GitHub emits for repos created after
# 2026-07-15) for all events in the repo. Deployment assumes the role via
# `sts:AssumeRoleWithWebIdentity` with audience sts.amazonaws.com, so no AWS
# access keys are ever stored in GitHub.

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

data "aws_iam_policy_document" "ci_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["${var.github_oidc_sub_prefix}:*"]
    }
  }
}

resource "aws_iam_role" "ci" {
  name                 = var.role_name
  max_session_duration = 3600
  assume_role_policy   = data.aws_iam_policy_document.ci_assume_role.json
  tags                 = var.tags
}

data "aws_iam_policy_document" "ci_permissions" {
  statement {
    sid       = "S3StaticSite"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
    resources = [var.bucket_arn, "${var.bucket_arn}/*"]
  }
  statement {
    sid     = "CloudFrontInvalidation"
    effect  = "Allow"
    actions = ["cloudfront:CreateInvalidation"]
    # Scoped to this distribution rather than "*" so a compromised workflow
    # cannot invalidate (and so bill) another account's CDNs.
    resources = [
      "arn:${data.aws_partition.current.partition}:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/${var.distribution_id}"
    ]
  }
}

# AWS::IAM::Policy in CloudFormation; an inline (role-attached) policy in
# Terraform. Import id is "<role>:<name>".
resource "aws_iam_role_policy" "ci" {
  name   = "riddhi-static-site"
  role   = aws_iam_role.ci.name
  policy = data.aws_iam_policy_document.ci_permissions.json
}