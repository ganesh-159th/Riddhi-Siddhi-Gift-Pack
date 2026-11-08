output "parameter_arns" {
  value = concat(
    local.secret_arns,
    [aws_ssm_parameter.github_repo.arn, aws_ssm_parameter.s3_bucket.arn],
  )
  description = "ARNs of every backend parameter, for the Lambda IAM policy. The SecureString ARNs are constructed because those parameters are created out-of-band."
}

output "parameter_names" {
  value = {
    GITHUB_TOKEN = "${var.name_prefix}/GITHUB_TOKEN"
    GITHUB_REPO  = aws_ssm_parameter.github_repo.name
    JWT_SECRET   = "${var.name_prefix}/JWT_SECRET"
    S3_BUCKET    = aws_ssm_parameter.s3_bucket.name
  }
  description = "Parameter names by environment-variable key."
}
