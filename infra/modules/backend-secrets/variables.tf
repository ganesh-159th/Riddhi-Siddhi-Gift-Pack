variable "region" {
  type        = string
  description = "AWS region, used to construct the out-of-band SecureString ARNs."
}

variable "name_prefix" {
  type        = string
  description = "SSM Parameter Store path prefix, e.g. /riddhi/prod. Parameters become <prefix>/GITHUB_TOKEN, <prefix>/GITHUB_REPO, <prefix>/JWT_SECRET and <prefix>/S3_BUCKET."
  default     = "/riddhi/prod"
}

variable "github_repo" {
  type        = string
  description = "owner/name of the GitHub repository the Lambda commits products.json to."
}

variable "s3_bucket" {
  type        = string
  description = "Site bucket that holds product photos (used by orphan cleanup)."
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to every parameter."
  default     = {}
}
