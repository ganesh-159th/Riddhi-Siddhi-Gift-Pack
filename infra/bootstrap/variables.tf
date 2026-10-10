variable "bucket_name" {
  type        = string
  description = "Globally unique name of the state bucket."
  default     = "riddhi-terraform-state"
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

variable "github_repo" {
  type        = string
  description = "GitHub <owner>/<repo> allowed to assume the Terraform CI role."
  default     = "ganesh-159th/riddhi-siddhi-gift-pack"
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