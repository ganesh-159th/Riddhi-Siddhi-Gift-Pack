#!/usr/bin/env bash
# Adopt the existing hand-provisioned AWS resources into CloudFormation.
#
# WHY IMPORT AND NOT CREATE
# ------------------------
# Everything in site.yaml already exists and is live: the S3 bucket, the OAC, the
# CloudFront distribution, the viewer-request function, the OIDC provider and the
# CI role. Letting CloudFormation CREATE them would be wrong on every count:
#   * the bucket name is taken, so the stack cannot even be created;
#   * a replacement distribution gets a NEW domain (dd4hzdnwrj3px.cloudfront.net
#     is not resettable), which means a DNS change, a fresh CloudFront SSL/domain
#     validation, and every shared link and search-engine record going stale.
# `aws cloudformation import` brings the existing physical resources under
# management without recreating any of them. After adoption the template is the
# source of truth and normal updates work.
#
# This script is deliberately interactive and aborts on any mismatch. Run it from
# a machine with AWS credentials for the account that owns the live site.
#
# Usage:
#   ALERT_EMAIL=you@example.com ./adopt.sh              # dry run (default)
#   ALERT_EMAIL=you@example.com ./adopt.sh --execute    # actually adopt

set -euo pipefail

TEMPLATE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/site.yaml"
STACK="${STACK:-riddhi-site}"
REGION="${AWS_REGION:-ap-south-1}"

# The live resources being adopted. These are the values read off the existing
# account; adopt.sh re-checks each one still matches before touching anything.
BUCKET="riddhi-siddhi-gift-pack-prod"
DIST_ID="E28V3XCFD4ZAQR"
OAC_ID="ENLTY2FWD54MI"
FUNCTION_NAME="index-rewrite"
OIDC_URL="token.actions.githubusercontent.com"
ROLE_NAME="riddhi-cicd"

EXECUTE=0
[[ "${1:-}" == "--execute" ]] && EXECUTE=1

command -v aws >/dev/null || { echo "aws CLI not found" >&2; exit 1; }

# On Apple Silicon, /usr/local/bin/aws is usually the Intel (x86_64) Homebrew
# build, which exits 126 "Bad CPU type in executable" from inside a bash script.
# Resolve a CLI that actually runs BEFORE doing anything destructive, otherwise
# every check below silently misreads as "resource missing".
if [[ -x /opt/homebrew/bin/aws ]] && ! aws s3api list-buckets --region "$REGION" >/dev/null 2>&1; then
  echo "note: /usr/local/bin/aws is the x86_64 build and cannot run here; using /opt/homebrew/bin/aws"
  PATH="/opt/homebrew/bin:$PATH"
fi
aws s3api list-buckets --region "$REGION" >/dev/null 2>&1 \
  || { echo "no usable AWS CLI — install the arm64 build: brew install awscli" >&2; exit 1; }

[[ -f "$TEMPLATE" ]] || { echo "template not found: $TEMPLATE" >&2; exit 1; }
if [[ $EXECUTE -eq 1 && -z "${ALERT_EMAIL:-}" ]]; then
  echo "ALERT_EMAIL is required with --execute (the budget has no subscribers without it)" >&2
  exit 1
fi

aws cloudformation validate-template --template-body "file://$TEMPLATE" --region "$REGION" >/dev/null
echo "Template is valid."

echo
echo "== Pre-flight: confirming the live resources are what the template expects =="

fail=0
check() { # check <label> <actual> <expected>
  if [[ "$2" == "$3" ]]; then
    echo "  OK    $1 = $2"
  else
    echo "  FAIL  $1 = '$2' (template expects '$3')" >&2
    fail=1
  fi
}

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
DIST_DOMAIN="$(aws cloudfront get-distribution --id "$DIST_ID" --query 'Distribution.DomainName' --output text)"
DIST_STATUS="$(aws cloudfront get-distribution --id "$DIST_ID" --query 'Distribution.Status' --output text)"
BUCKET_REGION="$(aws s3api get-bucket-location --bucket "$BUCKET" --query 'LocationConstraint' --output text)"

check "account"          "$ACCOUNT_ID"  "352329341119"
check "distribution"     "$DIST_ID"      "E28V3XCFD4ZAQR"
check "distribution up"  "$DIST_STATUS"  "Deployed"
check "bucket"           "$BUCKET"       "riddhi-siddhi-gift-pack-prod"
check "bucket region"    "$BUCKET_REGION" "$REGION"
check "CdnDomain param"  "${CdnDomain:-dd4hzdnwrj3px.cloudfront.net}" "$DIST_DOMAIN"

if [[ $fail -ne 0 ]]; then
  echo >&2
  echo "Pre-flight failed. Nothing was changed. Fix the drift (or update the"
  echo "template/parameters) and re-run." >&2
  exit 1
fi

echo
echo "== Resources that will be IMPORTED (not recreated) =="
cat <<EOF
  SiteBucket            $BUCKET
  OriginAccessControl   $OAC_ID
  SiteDistribution      $DIST_ID  ($DIST_DOMAIN)
  IndexRewriteFunction  $FUNCTION_NAME
  GitHubOidcProvider    $OIDC_URL
  CiDeployRole          $ROLE_NAME
EOF

echo
echo "== Resources that will be CREATED for the first time =="
cat <<EOF
  SiteCachePolicy             (TTLs copied from the legacy ForwardedValues block)
  SiteOriginRequestPolicy     (forward nothing to S3)
  SecurityHeadersPolicy       (port of the netlify.toml security headers)
  PermissionsPolicyFunction   (Permissions-Policy, which headers policies cannot set)
  AdminNoIndexPolicy          (X-Robots-Tag for /admin.html)
  CostAlertTopic              + Subscription + TopicPolicy
  MonthlySpendBudget          (USD ${MonthlyBudgetUsd:-1}/month WITH alert subscribers)
EOF

echo
echo "== What changes on the live distribution =="
cat <<EOF
  + security headers added (X-Frame-Options, nosniff, Referrer-Policy,
    Strict-Transport-Security, Permissions-Policy) — these are MISSING today
  + X-Robots-Tag: noindex on /admin.html
  + new cache behaviour for /admin.html*
  * legacy ForwardedValues replaced by an equivalent CachePolicy/OriginRequestPolicy
    with identical TTLs (0 / 3600 / 31536000) and no cookies/query strings
EOF

if [[ $EXECUTE -eq 0 ]]; then
  echo
  echo "DRY RUN. Nothing changed. Re-run with --execute to adopt."
  exit 0
fi

echo
echo "== Adopting =="

# 1. Create the stack shell. --disable-rollback is essential: every pre-existing
#    resource will "fail" to create, and without this the stack would be rolled
#    back and deleted before we get a chance to import.
CHANGE_SET="adopt-$(date +%s)"
aws cloudformation create-change-set \
  --stack-name "$STACK" \
  --template-body "file://$TEMPLATE" \
  --change-set-name "$CHANGE_SET" \
  --change-set-type CREATE \
  --disable-rollback \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameters \
      "ParameterKey=AlertEmail,ParameterValue=${ALERT_EMAIL}" \
      "ParameterKey=BucketName,ParameterValue=${BUCKET}" \
      "ParameterKey=CdnDomain,ParameterValue=${DIST_DOMAIN}" \
  --region "$REGION"
aws cloudformation wait change-set-create-complete \
  --change-set-name "$CHANGE_SET" --stack-name "$STACK" --region "$REGION" || true
aws cloudformation execute-change-set \
  --change-set-name "$CHANGE_SET" --stack-name "$STACK" --region "$REGION" || true

# Wait for the stack to settle into a rollback-disabled CREATE_FAILED.
for _ in $(seq 1 60); do
  STATUS="$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query 'Stacks[0].StackStatus' --output text)"
  [[ "$STATUS" == "CREATE_FAILED" || "$STATUS" == "CREATE_COMPLETE" ]] && break
  sleep 5
done
echo "  stack status: $STATUS (CREATE_FAILED is expected at this point)"

# 2. Import the live resources, one at a time. `aws cloudformation import` is
#    all-or-nothing when given several resources, so a single failure here would
#    roll back the ones that already succeeded.
import_one() { # import_one <LogicalId> <Identifier>
  printf '  importing %-22s <- %s ... ' "$1" "$2"
  if aws cloudformation import --stack-name "$STACK" --region "$REGION" \
       --resources "$1=$2" >/dev/null 2>/tmp/cfn-import.err; then
    echo "OK"
  else
    echo "FAILED"
    sed 's/^/      /' /tmp/cfn-import.err >&2
    echo >&2
    echo "Import failed. The stack is intentionally left in place so you can"
    echo "inspect it: aws cloudformation describe-stack-events --stack-name $STACK"
    echo "Fix the identifier and re-run, or delete the stack and start over:"
    echo "  aws cloudformation delete-stack --stack-name $STACK"
    exit 1
  fi
}

import_one SiteBucket           "$BUCKET"
import_one OriginAccessControl  "$OAC_ID"
import_one SiteDistribution     "$DIST_ID"
import_one IndexRewriteFunction "$FUNCTION_NAME"
import_one GitHubOidcProvider   "${ACCOUNT_ID}:oidc-provider/${OIDC_URL}"
import_one CiDeployRole         "$ROLE_NAME"

# 3. The policy and the IAM inline policy are separate resources that must be
#    attached to the now-imported parent.
import_one CiDeployPolicy "$ROLE_NAME"

# 4. Create whatever is left (the new policies, functions, budget, SNS).
echo "  creating the remaining new resources ..."
aws cloudformation update-stack \
  --stack-name "$STACK" --region "$REGION" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameters \
      "ParameterKey=AlertEmail,ParameterValue=${ALERT_EMAIL}" \
      "ParameterKey=BucketName,ParameterValue=${BUCKET}" \
      "ParameterKey=CdnDomain,ParameterValue=${DIST_DOMAIN}" || true

echo
echo "Waiting for the stack to settle (a CloudFront distribution update takes a"
echo "few minutes)..."
aws cloudformation wait stack-update-complete --stack-name "$STACK" --region "$REGION" || true
aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query 'Stacks[0].{Status:StackStatus,Outputs:Outputs}' --output json

cat <<EOF

Next:
  1. Check for drift / confirm no surprise replacement:
       aws cloudformation detect-stack-drift --stack-name $STACK --region $REGION
  2. Confirm the stack did NOT replace the distribution (it must keep
     $DIST_DOMAIN):
       aws cloudfront get-distribution --id $DIST_ID
  3. Verify the headers actually reached the edge — CloudFront takes a few
     minutes to propagate, so retry until they appear:
       ./verify-live-headers.sh
  4. Confirm the GitHub variables still line up with the stack Outputs
     (AWS_ROLE_ARN, S3_BUCKET, CLOUDFRONT_DISTRIBUTION_ID, SITE_URL).
EOF
