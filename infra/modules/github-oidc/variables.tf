variable "github_oidc_sub_prefix" {
  type        = string
  description = "Prefix of the OIDC `sub` GitHub emits for this repo. Repos created after 2026-07-15 emit the immutable form owner@ownerId/repo@repoId (see GET /repos/{owner}/{repo}/actions/oidc/customization/sub); older repos emit repo:owner/repo."
  default     = "repo:ganesh-159th@112203904/Riddhi-Siddhi-Gift-Pack@1329157001"
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