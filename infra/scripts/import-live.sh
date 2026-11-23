#!/usr/bin/env bash
# Adopt the existing hand-provisioned AWS resources into Terraform state.
#
# Terraform equivalent of provision/cloudformation/adopt.sh. The live site
# (bucket riddhi-siddhi-gift-pack-prod, distribution E28V3XCFD4ZAQR, OAC
# ENLTY2FWD54MI, GitHub OIDC provider + riddhi-cicd role) is already running and
# currently managed by the "riddhi-site" CloudFormation stack. Importing brings
# those resources under Terraform management WITHOUT recreating any of them — a
# recreated distribution would get a NEW *.cloudfront.net domain.
#
# IMPORTANT — remove the CloudFormation stack FIRST. The template marks every
# resource DeletionPolicy: Retain, so the stack can be deleted without touching
# them:
#   aws cloudformation delete-stack --stack-name riddhi-site --region ap-south-1
# Terraform and CloudFormation must never manage the same resource simultaneously.
#
# Imports go straight into the shared S3 backend (run infra/bootstrap first), so
# the state CI reads is the same state this writes — no local-to-remote migrate.
#
# Usage (from infra/):
#   ./scripts/import-live.sh            # dry run (default)
#   ./scripts/import-live.sh --execute  # actually import
#
# Skips anything already present in state, so it is safe to re-run.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_DIR="$DIR/environments/prod"
REGION="${AWS_REGION:-ap-south-1}"
STATE_BUCKET="${TF_STATE_BUCKET:-riddhi-terraform-state-352329341119}"
STATE_KEY="${TF_STATE_KEY:-riddhi-site/prod/terraform.tfstate}"
LOCK_TABLE="${TF_LOCK_TABLE:-terraform-state-lock}"

ACCOUNT_ID="352329341119"
BUCKET="riddhi-siddhi-gift-pack-prod"
DIST_ID="E28V3XCFD4ZAQR"
OAC_ID="ENLTY2FWD54MI"
OIDC_URL="token.actions.githubusercontent.com"
ROLE_NAME="riddhi-cicd"
BUDGET_NAME="riddhi-site-monthly-spend"

EXECUTE=0
[[ "${1:-}" == "--execute" ]] && EXECUTE=1

command -v terraform >/dev/null || { echo "terraform not found — install from https://developer.hashicorp.com/terraform/install" >&2; exit 1; }
command -v aws >/dev/null || { echo "aws CLI not found" >&2; exit 1; }

# On Apple Silicon, /usr/local/bin/aws is usually the Intel (x86_64) build.
if [[ -x /opt/homebrew/bin/aws ]] && ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "note: /usr/local/bin/aws is the x86_64 build; using /opt/homebrew/bin/aws"
  PATH="/opt/homebrew/bin:$PATH"
fi
aws sts get-caller-identity >/dev/null 2>&1 \
  || { echo "no usable AWS CLI credentials" >&2; exit 1; }

# The prod root requires alert_email (budget notifications). Accept it from a
# terraform.tfvars in the env dir, or from the TF_VAR_alert_email env var.
if [[ -z "${TF_VAR_alert_email:-}" && ! -f "$ENV_DIR/terraform.tfvars" ]]; then
  echo "ERROR: no budget alert address. Set TF_VAR_alert_email or create $ENV_DIR/terraform.tfvars (see terraform.tfvars.example)." >&2
  exit 1
fi

echo "== Pre-flight: confirming the live resources =="
fail=0
check() {
  if [[ "$2" == "$3" ]]; then
    echo "  OK    $1 = $2"
  else
    echo "  FAIL  $1 = '$2' (expected '$3')" >&2
    fail=1
  fi
}
check "account" "$(aws sts get-caller-identity --query Account --output text)" "$ACCOUNT_ID"
check "bucket"  "$BUCKET" "$BUCKET"
check "region"  "$(aws s3api get-bucket-location --bucket "$BUCKET" --query 'LocationConstraint' --output text)" "$REGION"
if ! aws cloudfront get-distribution --id "$DIST_ID" --query 'Distribution.Status' --output text 2>/dev/null | grep -q Deployed; then
  echo "  FAIL  distribution $DIST_ID is not Deployed" >&2; fail=1
else
  echo "  OK    distribution = $DIST_ID"
fi
[[ $fail -ne 0 ]] && { echo "Pre-flight failed. Nothing changed." >&2; exit 1; }

if [[ $EXECUTE -eq 0 ]]; then
  echo
  echo "DRY RUN. Nothing changed. Re-run with --execute to import."
  echo "Reminder: delete the CloudFormation stack riddhi-site FIRST (resources"
  echo "are retained by the template), or Terraform and CloudFormation will fight."
  exit 0
fi

cd "$ENV_DIR"
echo
echo "== initializing the S3 backend so imports write straight to shared state =="
terraform init -reconfigure \
  -backend-config="bucket=${STATE_BUCKET}" \
  -backend-config="key=${STATE_KEY}" \
  -backend-config="region=${REGION}" \
  -backend-config="dynamodb_table=${LOCK_TABLE}" \
  -backend-config="encrypt=true" >/dev/null

import() {
  local addr="$1" id="$2"
  if terraform state list 2>/dev/null | grep -qx "$addr"; then
    echo "  skip  $addr (already in state)"
    return
  fi
  echo "  ->    $addr  ($id)"
  terraform import -lock=false "$addr" "$id"
}

echo
echo "== Importing static site (S3 + CloudFront) =="
import "module.static_site.aws_s3_bucket.site" "$BUCKET"
import "module.static_site.aws_s3_bucket_public_access_block.site" "$BUCKET"
import "module.static_site.aws_s3_bucket_server_side_encryption_configuration.site" "$BUCKET"
import "module.static_site.aws_s3_bucket_cors_configuration.site" "$BUCKET"
import "module.static_site.aws_s3_bucket_lifecycle_configuration.site" "$BUCKET"
# Versioning is newly managed (issue #41). If it was already enabled manually,
# import the existing configuration instead of letting apply try to create it.
versioning_status=$(aws s3api get-bucket-versioning --bucket "$BUCKET" \
  --query Status --output text 2>/dev/null || true)
if [[ "$versioning_status" == "Enabled" ]]; then
  import "module.static_site.aws_s3_bucket_versioning.site" "$BUCKET"
fi
import "module.static_site.aws_s3_bucket_policy.site" "$BUCKET"
import "module.static_site.aws_cloudfront_origin_access_control.s3" "$OAC_ID"
import "module.static_site.aws_cloudfront_function.index_rewrite" "index-rewrite"
import "module.static_site.aws_cloudfront_function.permissions_policy" "permissions-policy"

echo
echo "== Discovering CloudFront policy IDs created by CloudFormation phase 2 =="
cache_policy_id=$(aws cloudfront list-cache-policies --query \
  "CachePolicyList.Items[?CachePolicy.CachePolicyConfig.Name=='RiddhiSiteCachePolicy'].CachePolicy.Id" --output text)
orq_policy_id=$(aws cloudfront list-origin-request-policies --query \
  "OriginRequestPolicyList.Items[?OriginRequestPolicy.OriginRequestPolicyConfig.Name=='RiddhiSiteOriginRequestPolicy'].OriginRequestPolicy.Id" --output text)
sec_headers_id=$(aws cloudfront list-response-headers-policies --query \
  "ResponseHeadersPolicyList.Items[?ResponseHeadersPolicy.ResponseHeadersPolicyConfig.Name=='RiddhiSecurityHeaders'].ResponseHeadersPolicy.Id" --output text)
admin_noindex_id=$(aws cloudfront list-response-headers-policies --query \
  "ResponseHeadersPolicyList.Items[?ResponseHeadersPolicy.ResponseHeadersPolicyConfig.Name=='RiddhiAdminNoIndex'].ResponseHeadersPolicy.Id" --output text)
if [[ -z "$cache_policy_id" || -z "$orq_policy_id" || -z "$sec_headers_id" || -z "$admin_noindex_id" ]]; then
  echo "ERROR: could not discover one or more CloudFront policies (was the CloudFormation stack deleted?)." >&2
  exit 1
fi
import "module.static_site.aws_cloudfront_cache_policy.site" "$cache_policy_id"
import "module.static_site.aws_cloudfront_origin_request_policy.site" "$orq_policy_id"
import "module.static_site.aws_cloudfront_response_headers_policy.security" "$sec_headers_id"
import "module.static_site.aws_cloudfront_response_headers_policy.admin_no_index" "$admin_noindex_id"
import "module.static_site.aws_cloudfront_distribution.site" "$DIST_ID"

echo
echo "== Importing GitHub OIDC deploy role =="
import "module.github_oidc.aws_iam_openid_connect_provider.github" \
  "arn:aws:iam::${ACCOUNT_ID}:oidc-provider/${OIDC_URL}"
import "module.github_oidc.aws_iam_role.ci" "$ROLE_NAME"
import "module.github_oidc.aws_iam_role_policy.ci" "${ROLE_NAME}:riddhi-static-site"

echo
echo "== Importing cost guardrails =="
topic_arn=$(aws sns list-topics --query \
  "Topics[?ends_with(TopicArn, ':riddhi-cost-alerts')].TopicArn" --output text)
sub_arn=$(aws sns list-subscriptions --query \
  "Subscriptions[?TopicArn=='${topic_arn}'].SubscriptionArn" --output text)
if [[ -z "$topic_arn" ]]; then
  echo "ERROR: SNS topic riddhi-cost-alerts not found." >&2
  exit 1
fi
import "module.cost_guardrails.aws_sns_topic.cost" "$topic_arn"
import "module.cost_guardrails.aws_sns_topic_policy.cost" "$topic_arn"
if [[ -z "$sub_arn" || "$sub_arn" == "PendingConfirmation" ]]; then
  echo "  WARN  subscription not found / pending — terraform will create it; confirm the email to start alerts."
else
  import "module.cost_guardrails.aws_sns_topic_subscription.email" "$sub_arn"
fi
import "module.cost_guardrails.aws_budgets_budget.monthly" "${ACCOUNT_ID}:${BUDGET_NAME}"

cat <<EOF

Import complete — state now lives in s3://${STATE_BUCKET}/${STATE_KEY}.
Next steps:
  1. terraform plan        # should show no create/replace, only the drift the
                           # import left behind (Terraform re-derives config
                           # that the hand-built account never had)
  2. Commit any config changes the plan surfaces, then push — CI plans against
     this same state from now on.
  3. Verify at the edge: ADMIN_API_ORIGIN=\${ADMIN_API_ORIGIN} provision/cloudformation/verify-live-headers.sh
EOF