# Permissions for the backup stack (issue #41), kept in its own managed policy
# because the two existing CI policies are already close to IAM's size limit.
# Everything is scoped to the backup bucket, one Lambda and one EventBridge rule.

data "aws_iam_policy_document" "terraform_backup" {
  statement {
    sid    = "BackupBucket"
    effect = "Allow"
    actions = [
      "s3:CreateBucket", "s3:DeleteBucket", "s3:ListBucket",
      "s3:GetBucket*", "s3:PutBucket*", "s3:DeleteBucket*",
      "s3:GetLifecycleConfiguration", "s3:PutLifecycleConfiguration",
      "s3:GetEncryptionConfiguration", "s3:PutEncryptionConfiguration",
      "s3:GetAccelerateConfiguration", "s3:GetReplicationConfiguration",
    ]
    resources = [
      "arn:aws:s3:::${var.backup_bucket_name}",
      "arn:aws:s3:::${var.backup_bucket_name}/*",
    ]
  }

  statement {
    sid     = "BackupLambda"
    effect  = "Allow"
    actions = ["lambda:*"]
    resources = [
      "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:riddhi-backup-products",
      "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:riddhi-backup-products:*",
    ]
  }

  statement {
    sid       = "PassBackupRole"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/riddhi-backup-products-role"]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }

  statement {
    sid    = "BackupLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup", "logs:DeleteLogGroup",
      "logs:PutRetentionPolicy", "logs:DeleteRetentionPolicy",
      "logs:TagResource", "logs:UntagResource", "logs:ListTagsForResource",
    ]
    resources = [
      "arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/riddhi-backup-products",
      "arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/riddhi-backup-products:*",
    ]
  }

  statement {
    sid    = "BackupSchedule"
    effect = "Allow"
    actions = [
      "events:PutRule", "events:DeleteRule", "events:DescribeRule",
      "events:PutTargets", "events:RemoveTargets", "events:ListTargetsByRule",
      "events:TagResource", "events:UntagResource", "events:ListTagsForResource",
    ]
    resources = ["arn:aws:events:${var.region}:${data.aws_caller_identity.current.account_id}:rule/riddhi-backup-products-schedule"]
  }
}

resource "aws_iam_policy" "terraform_backup" {
  name   = "${var.terraform_role_name}-backup-policy"
  policy = data.aws_iam_policy_document.terraform_backup.json
  tags   = var.tags
}

resource "aws_iam_role_policy_attachment" "terraform_backup" {
  role       = aws_iam_role.terraform.name
  policy_arn = aws_iam_policy.terraform_backup.arn
}
