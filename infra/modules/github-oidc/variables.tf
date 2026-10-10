variable "github_org" {
  type        = string
  description = "GitHub owner. The OIDC trust policy trusts `repo:<owner>/*`."
  default     = "ganesh-159th"
}

variable "role_name" {
  type        = string
  description = "Name of the CI deploy role. Set this ARN as the AWS_ROLE_ARN GitHub secret."
  default     = "riddhi-cicd"
}

variable "bucket_arn" {
  type        = string
  description = "ARN of the S3 bucket the deploy workflow syncs to (static-site module output)."
}

variable "distribution_id" {
  type        = string
  description = "ID of the CloudFront distribution the deploy workflow invalidates (static-site module output)."
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to the role."
  default     = {}
}