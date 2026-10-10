output "oidc_provider_arn" {
  value       = aws_iam_openid_connect_provider.github.arn
  description = "ARN of the GitHub OIDC provider"
}

output "ci_role_arn" {
  value       = aws_iam_role.ci.arn
  description = "ARN of the CI deploy role. Set as the AWS_ROLE_ARN GitHub secret."
}

output "ci_role_name" {
  value       = aws_iam_role.ci.name
  description = "Name of the CI deploy role"
}