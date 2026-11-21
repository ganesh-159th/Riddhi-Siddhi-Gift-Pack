#!/usr/bin/env bash
# Create/rotate the backend secrets the admin API Lambda reads at runtime.
#
# These two SecureString parameters are intentionally NOT managed by Terraform:
# Terraform refresh would pull their current values into the state file even
# with `ignore_changes`. This script creates them (put-parameter with
# --overwrite creates when absent) so real values never pass through Terraform
# state or CI logs. Run it once after the first apply, and again on rotation.
#
# Usage (from the repo root):
#   GITHUB_TOKEN=ghp_... JWT_SECRET="$(openssl rand -hex 32)" \
#     ADMIN_TOKEN="$(openssl rand -hex 32)" ./infra/scripts/set-secrets.sh
#   PREFIX=/riddhi/prod AWS_REGION=ap-south-1 ./infra/scripts/set-secrets.sh
# (From infra/, drop the leading infra/:  ./scripts/set-secrets.sh)
#
# ADMIN_TOKEN is the admin password; JWT_SECRET signs the session tokens issued
# by /api/admin-login and verified by every other admin route.
# GITHUB_REPO, S3_BUCKET and ENQUIRIES_BUCKET are managed by Terraform; do not set them here.

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
put "$PREFIX/ADMIN_TOKEN" "${ADMIN_TOKEN:-}"

echo "done. GITHUB_REPO, S3_BUCKET and ENQUIRIES_BUCKET are managed by Terraform."
