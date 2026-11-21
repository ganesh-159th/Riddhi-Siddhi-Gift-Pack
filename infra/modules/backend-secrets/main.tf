# Backend secrets for the AWS admin API Lambda.
#
# The credentials (GITHUB_TOKEN, JWT_SECRET, ADMIN_TOKEN) are deliberately NOT
# managed here. Terraform refresh reads a parameter's current value into state
# even with `ignore_changes`, which would put the real secrets in the state file.
# They are created/rotated out-of-band by infra/scripts/set-secrets.sh instead,
# and this module only exposes their ARNs so the Lambda IAM policy can read them.
#
# Non-secret configuration (GITHUB_REPO, S3_BUCKET, ENQUIRIES_BUCKET) stays
# Terraform-managed so it can never drift from the rest of the stack.

data "aws_caller_identity" "current" {}

locals {
  secret_names = ["GITHUB_TOKEN", "JWT_SECRET", "ADMIN_TOKEN"]
  secret_arns = [
    for name in local.secret_names :
    "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter${var.name_prefix}/${name}"
  ]
}

resource "aws_ssm_parameter" "github_repo" {
  name  = "${var.name_prefix}/GITHUB_REPO"
  type  = "String"
  value = var.github_repo
  tags  = var.tags
}

resource "aws_ssm_parameter" "s3_bucket" {
  name  = "${var.name_prefix}/S3_BUCKET"
  type  = "String"
  value = var.s3_bucket
  tags  = var.tags
}

resource "aws_ssm_parameter" "enquiries_bucket" {
  name  = "${var.name_prefix}/ENQUIRIES_BUCKET"
  type  = "String"
  value = var.enquiries_bucket
  tags  = var.tags
}
