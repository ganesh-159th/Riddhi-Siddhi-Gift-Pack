variable "bucket_name" {
  type        = string
  description = "Globally unique name of the state bucket."
  default     = "riddhi-terraform-state-352329341119"
}

variable "lock_table_name" {
  type        = string
  description = "Name of the DynamoDB lock table."
  default     = "terraform-state-lock"
}

variable "region" {
  type        = string
  description = "Region to hold the backend (recommended ap-south-1)."
  default     = "ap-south-1"
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to the state resources."
  default = {
    Project = "RiddhiSiddhi"
    Env     = "prod"
    IaC     = "terraform"
  }
}

# --- Terraform CI role (see cicd.tf) -----------------------------------------

variable "github_oidc_sub_prefix" {
  type        = string
  description = "Prefix of the OIDC `sub` GitHub emits for this repo, used to scope the Terraform CI role's trust policy. Repos created after 2026-07-15 emit the immutable form owner@ownerId/repo@repoId — read the exact value from GET /repos/{owner}/{repo}/actions/oidc/customization/sub."
  default     = "repo:ganesh-159th@112203904/Riddhi-Siddhi-Gift-Pack@1329157001"
}

variable "github_oidc_provider_arn" {
  type        = string
  description = "ARN of the existing GitHub OIDC provider the CI role federates to. Default is the live account's provider."
  default     = "arn:aws:iam::352329341119:oidc-provider/token.actions.githubusercontent.com"
}

variable "terraform_role_name" {
  type        = string
  description = "Name of the role GitHub Actions assumes to run Terraform."
  default     = "riddhi-terraform"
}

variable "site_bucket_name" {
  type        = string
  description = "Name of the production site bucket, for scoping the CI role's S3 permissions."
  default     = "riddhi-siddhi-gift-pack-prod"
}

variable "logs_bucket_name" {
  type        = string
  description = "Name of the central access-log bucket, for scoping the CI role's S3 permissions."
  default     = "riddhi-siddhi-gift-pack-logs"
}

variable "backup_bucket_name" {
  type        = string
  description = "Name of the private backup bucket, for scoping the CI role's S3 permissions."
  default     = "riddhi-siddhi-gift-pack-backups"
}

variable "save_products_function_name" {
  type        = string
  description = "Name of the save-products Lambda, used to scope API Gateway access-log permissions."
  default     = "riddhi-save-products"
}