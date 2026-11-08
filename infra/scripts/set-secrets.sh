#!/usr/bin/env bash
# Create/rotate the backend secrets the save-products Lambda reads at runtime.
#
# These two SecureString parameters are intentionally NOT managed by Terraform:
# Terraform refresh would pull their current values into the state file even
# with `ignore_changes`. This script creates them (put-parameter with
# --overwrite creates when absent) so real values never pass through Terraform
# state or CI logs. Run it once after the first apply, and again on rotation.
#
# Usage (from the repo root):
#   GITHUB_TOKEN=ghp_... JWT_SECRET="$(openssl rand -hex 32)" ./infra/scripts/set-secrets.sh
#   PREFIX=/riddhi/prod AWS_REGION=ap-south-1 ./infra/scripts/set-secrets.sh
# (From infra/, drop the leading infra/:  ./scripts/set-secrets.sh)
#
# JWT_SECRET MUST be the same value configured in Netlify site settings, or the
# Lambda rejects every admin session token issued by admin-login. To reuse the
# existing Netlify secret:
#   export JWT_SECRET="$(netlify env:get JWT_SECRET)"
#
# GITHUB_REPO and S3_BUCKET are managed by Terraform; do not set them here.

set -euo pipefail

PREFIX="${PREFIX:-/riddhi/prod}"
REGION="${AWS_REGION:-ap-south-1}"

command -v aws >/dev/null || { echo "aws CLI not found" >&2; exit 1; }

put() {
  local name="$1" value="$2"
  if [[ -z "$value" || "$value" == "REPLACE_ME" ]]; then
    echo "skip: $name (no value provided)" >&2
    return 0
  fi
  aws ssm put-parameter \
    --region "$REGION" \
    --name "$name" \
    --type SecureString \
    --overwrite \
    --value "$value" >/dev/null
  echo "set: $name"
}

put "$PREFIX/GITHUB_TOKEN" "${GITHUB_TOKEN:-}"
put "$PREFIX/JWT_SECRET" "${JWT_SECRET:-}"

echo "done. GITHUB_REPO and S3_BUCKET are managed by Terraform."
