terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = ">= 2.4"
    }
  }

  # Remote state lives in the S3/DynamoDB backend created by infra/bootstrap.
  # Partial config only; the real values are passed at init time:
  #   terraform init -backend-config=backend.hcl
  backend "s3" {}
}