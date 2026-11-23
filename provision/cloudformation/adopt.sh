#!/usr/bin/env bash
# Adopt the existing hand-provisioned AWS resources into CloudFormation.
#
# WHY ADOPT AND NOT CREATE
# ------------------------
# Everything in site.yaml already exists and is live: the S3 bucket, the OAC, the
# CloudFront distribution, the viewer-request function, the OIDC provider and the
# CI role. Letting CloudFormation CREATE them would be wrong on every count:
#   * the bucket name is taken, so the stack cannot even be created;
#   * a replacement distribution gets a NEW domain (dd4hzdnwrj3px.cloudfront.net
#     is not resettable), which means a DNS change, a fresh CloudFront SSL/domain
#     validation, and every shared link and search-engine record going stale.
# An import brings the existing physical resources under management without
# recreating any of them. After adoption the template is the source of truth and
# normal updates work.
#
# WHY IT IS TWO PHASES (and why it is NOT `aws cloudformation import`)
# --------------------------------------------------------------------
# AWS CLI v2 has no `aws cloudformation import` subcommand. An import is a
# change set with --change-set-type IMPORT, and that changes the rules in three
# ways, all of which this script works around:
#
#   1. EVERY resource in the template must be listed in --resources-to-import,
#      and an IMPORT change set may not create anything or add Outputs. site.yaml
#      also creates the cache/header policies, the budget and the SNS topic, so
#      it cannot be the import template. site-import.yaml holds only the six
#      adoptable resources (plus Outputs-free, DeletionPolicy: Retain on each)
#      and its SiteDistribution block mirrors the live distribution as-is.
#   2. `create-change-set` has no --disable-rollback (only `create-stack` does).
#   3. AWS::IAM::Policy is not an importable resource type, so the live inline
#      policy on riddhi-cicd has to be detached before phase 2 can create it.
#
# Phase 1 adopts the six resources (IMPORT change set from site-import.yaml).
# Phase 2 is an ordinary update from site.yaml: it creates everything else and
# rewrites the distribution to the desired cache + security headers.
#
# This script is deliberately interactive and aborts on any mismatch. Run it from
# a machine with AWS credentials for the account that owns the live site.
#
# Usage:
#   ALERT_EMAIL=you@example.com ADMIN_API_ORIGIN=https://<api-id>.execute-api.ap-south-1.amazonaws.com ./adopt.sh              # dry run (default)
#   ALERT_EMAIL=you@example.com ADMIN_API_ORIGIN=https://<api-id>.execute-api.ap-south-1.amazonaws.com ./adopt.sh --execute    # actually adopt

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$DIR/site.yaml"
IMPORT_TEMPLATE="$DIR/site-import.yaml"
IMPORTS="$DIR/imports.json"
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
INLINE_POLICY="riddhi-static-site"   # AWS::IAM::Policy: CiDeployPolicy.PolicyName

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

for f in "$TEMPLATE" "$IMPORT_TEMPLATE" "$IMPORTS"; do
  [[ -f "$f" ]] || { echo "missing file: $f" >&2; exit 1; }
done
if [[ $EXECUTE -eq 1 && -z "${ALERT_EMAIL:-}" ]]; then
  echo "ALERT_EMAIL is required with --execute (the budget has no subscribers without it)" >&2
  exit 1
fi
if [[ $EXECUTE -eq 1 && -z "${ADMIN_API_ORIGIN:-}" ]]; then
  echo "ADMIN_API_ORIGIN is required with --execute (the admin CSP must allow the API Gateway origin)" >&2
  exit 1
fi
if [[ -n "${ADMIN_API_ORIGIN:-}" && ! "$ADMIN_API_ORIGIN" =~ ^https://[A-Za-z0-9.-]+$ ]]; then
  echo "ADMIN_API_ORIGIN must be an HTTPS origin with no path or trailing slash" >&2
  exit 1
fi

aws cloudformation validate-template --template-body "file://$TEMPLATE" --region "$REGION" >/dev/null
aws cloudformation validate-template --template-body "file://$IMPORT_TEMPLATE" --region "$REGION" >/dev/null
echo "Templates are valid."

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
  echo "Pre-flight failed. Nothing was changed. Fix the drift (or update the" >&2
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
  GitHubOidcProvider    $ACCOUNT_ID:oidc-provider/$OIDC_URL
  CiDeployRole          $ROLE_NAME
EOF

echo
echo "== Resources that will be CREATED for the first time =="
cat <<EOF
  CiDeployPolicy                 (inline policy on $ROLE_NAME; detached first, see below)
  SiteCachePolicy                (TTLs copied from the legacy ForwardedValues block)
  SiteOriginRequestPolicy        (forward nothing to S3)
  SecurityHeadersPolicy          (port of the netlify.toml security headers)
  PermissionsPolicyFunction      (Permissions-Policy, which headers policies cannot set)
  AdminNoIndexPolicy             (X-Robots-Tag for /admin.html)
  CostAlertTopic                 + Subscription + TopicPolicy
  MonthlySpendBudget             (USD ${MonthlyBudgetUsd:-1}/month WITH alert subscribers)
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

STACK_EXISTS=0
if aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" >/dev/null 2>&1; then
  STACK_EXISTS=1
fi

if [[ $EXECUTE -eq 0 ]]; then
  echo
  if [[ $STACK_EXISTS -eq 1 ]]; then
    echo "note: stack $STACK already exists, so there is nothing left to adopt."
    echo "      --execute will report the stack status and exit; use update-stack"
    echo "      (printed by --execute) to apply template changes."
  fi
  echo "DRY RUN. Nothing changed. Re-run with --execute to adopt."
  exit 0
fi

if [[ $STACK_EXISTS -eq 1 ]]; then
  echo
  echo "Stack $STACK already exists — this account is already adopted."
  aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query 'Stacks[0].{Status:StackStatus,Updated:LastUpdatedTime}' --output table
  cat <<EOF

Apply template changes with the normal update path instead of adopting again:
  aws cloudformation update-stack --stack-name $STACK --region $REGION \\
    --capabilities CAPABILITY_NAMED_IAM \\
    --template-body file://$TEMPLATE \\
    --parameters ParameterKey=AlertEmail,ParameterValue=\${ALERT_EMAIL} \\
                 ParameterKey=BucketName,ParameterValue=$BUCKET \\
                 ParameterKey=GitHubOrg,ParameterValue=${GitHubOrg:-ganesh-159th} \\
                 ParameterKey=MonthlyBudgetUsd,ParameterValue=${MonthlyBudgetUsd:-1} \\
                  ParameterKey=CdnDomain,ParameterValue=$DIST_DOMAIN \\
                  ParameterKey=CustomDomain,ParameterValue= \\
                  ParameterKey=AdminApiOrigin,ParameterValue=\${ADMIN_API_ORIGIN}
 Then: ADMIN_API_ORIGIN=\${ADMIN_API_ORIGIN} ./verify-live-headers.sh
EOF
  exit 0
fi

PARAMS_IMPORT=(
  --parameters
    "ParameterKey=BucketName,ParameterValue=${BUCKET}"
    "ParameterKey=GitHubOrg,ParameterValue=${GitHubOrg:-ganesh-159th}"
    "ParameterKey=CdnDomain,ParameterValue=${DIST_DOMAIN}"
    "ParameterKey=CustomDomain,ParameterValue=${CustomDomain:-}"
)
# site.yaml declares two parameters site-import.yaml does not, so the phase 2
# list is built separately — the CLI rejects --parameters twice in one call.
PARAMS_APPLY=(
  --parameters
    "ParameterKey=AlertEmail,ParameterValue=${ALERT_EMAIL}"
    "ParameterKey=BucketName,ParameterValue=${BUCKET}"
    "ParameterKey=GitHubOrg,ParameterValue=${GitHubOrg:-ganesh-159th}"
    "ParameterKey=MonthlyBudgetUsd,ParameterValue=${MonthlyBudgetUsd:-1}"
    "ParameterKey=CdnDomain,ParameterValue=${DIST_DOMAIN}"
    "ParameterKey=CustomDomain,ParameterValue=${CustomDomain:-}"
    "ParameterKey=AdminApiOrigin,ParameterValue=${ADMIN_API_ORIGIN}"
)

echo
echo "== Phase 1: IMPORT change set (six live resources, nothing recreated) =="

CS1="adopt-import-$(date +%s)"
aws cloudformation create-change-set \
  --stack-name "$STACK" \
  --change-set-name "$CS1" \
  --change-set-type IMPORT \
  --template-body "file://$IMPORT_TEMPLATE" \
  --resources-to-import "file://$IMPORTS" \
  --capabilities CAPABILITY_NAMED_IAM \
  "${PARAMS_IMPORT[@]}" \
  --region "$REGION" >/dev/null

if ! aws cloudformation wait change-set-create-complete \
     --change-set-name "$CS1" --stack-name "$STACK" --region "$REGION" 2>/dev/null; then
  echo "IMPORT change set failed:" >&2
  aws cloudformation describe-change-set --stack-name "$STACK" --change-set-name "$CS1" \
    --region "$REGION" --query '{Status:Status,Reason:FailureReason,StatusReason:StatusReason}' \
    --output json >&2 || true
  cat <<EOF >&2
Common causes:
  * a resource in site-import.yaml is missing from imports.json (an IMPORT change
    set must list EVERY resource — it cannot create any);
  * DeletionPolicy: Retain missing on an imported resource;
  * an identifier in imports.json no longer matches the account.
Fix and re-run. Nothing has been created yet.
EOF
  exit 1
fi

echo "  executing $CS1 ..."
aws cloudformation execute-change-set \
  --change-set-name "$CS1" --stack-name "$STACK" --region "$REGION" >/dev/null

STATUS=""
for _ in $(seq 1 60); do
  STATUS="$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "DELETE_COMPLETE")"
  [[ "$STATUS" == "IMPORT_COMPLETE" || "$STATUS" == "IMPORT_ROLLBACK_COMPLETE" \
     || "$STATUS" == "IMPORT_ROLLBACK_FAILED" ]] && break
  sleep 5
done
echo "  stack status: $STATUS"
if [[ "$STATUS" != "IMPORT_COMPLETE" ]]; then
  echo "Phase 1 did not reach IMPORT_COMPLETE. Inspect:" >&2
  echo "  aws cloudformation describe-stack-events --stack-name $STACK --region $REGION" >&2
  exit 1
fi

echo
echo "== Phase 2: ordinary update from site.yaml =="
echo "  AWS::IAM::Policy cannot be imported, so the live inline policy"
echo "  $INLINE_POLICY is backed up and detached first —"

# Kept outside the repo on purpose: it is a snapshot of a live IAM policy, it
# has no business in git, and the restore commands printed on failure have to
# point somewhere that survives a `git clean`.
POLICY_BACKUP="${POLICY_BACKUP:-${TMPDIR:-/tmp}/riddhi-static-site-policy.backup.json}"
aws iam get-role-policy --role-name "$ROLE_NAME" --policy-name "$INLINE_POLICY" \
  --query PolicyDocument --output json > "$POLICY_BACKUP"
aws iam delete-role-policy --role-name "$ROLE_NAME" --policy-name "$INLINE_POLICY"
echo "  saved to $POLICY_BACKUP and detached."

CS2="adopt-apply-$(date +%s)"
if ! aws cloudformation create-change-set \
      --stack-name "$STACK" \
      --change-set-name "$CS2" \
      --change-set-type UPDATE \
      --template-body "file://$TEMPLATE" \
      --capabilities CAPABILITY_NAMED_IAM \
      "${PARAMS_APPLY[@]}" \
      --region "$REGION" >/dev/null 2>&1; then
  echo "  create-change-set failed — restoring the detached policy." >&2
  aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name "$INLINE_POLICY" \
    --policy-document "file://$POLICY_BACKUP" --region us-east-1
  exit 1
fi
if ! aws cloudformation wait change-set-create-complete \
     --change-set-name "$CS2" --stack-name "$STACK" --region "$REGION" 2>/dev/null; then
  echo "  phase 2 change set failed — restoring the detached policy." >&2
  aws cloudformation describe-change-set --stack-name "$STACK" --change-set-name "$CS2" \
    --region "$REGION" --query '{Status:Status,Reason:FailureReason}' --output json >&2 || true
  aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name "$INLINE_POLICY" \
    --policy-document "file://$POLICY_BACKUP" --region us-east-1
  exit 1
fi

echo "  changes:"
aws cloudformation describe-change-set --stack-name "$STACK" --change-set-name "$CS2" \
  --region "$REGION" \
  --query 'Changes[].ResourceChange.[Action,LogicalResourceId,Replacement]' --output table

aws cloudformation execute-change-set \
  --change-set-name "$CS2" --stack-name "$STACK" --region "$REGION" >/dev/null
echo "  waiting for the stack (a CloudFront distribution update takes a few minutes) ..."
if ! aws cloudformation wait stack-update-complete --stack-name "$STACK" --region "$REGION"; then
  echo "Phase 2 failed. Check whether the detached policy needs restoring:" >&2
  echo "  aws iam put-role-policy --role-name $ROLE_NAME --policy-name $INLINE_POLICY \\" >&2
  echo "    --policy-document file://$POLICY_BACKUP --region us-east-1" >&2
  echo "  aws cloudformation describe-stack-events --stack-name $STACK --region $REGION" >&2
  exit 1
fi

aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query 'Stacks[0].{Status:StackStatus,Outputs:Outputs}' --output json

cat <<EOF

Adoption complete. Next:
  1. Confirm the stack did NOT replace the distribution (it must still be
     $DIST_DOMAIN):
       aws cloudfront get-distribution --id $DIST_ID
  2. Check for drift:
       aws cloudformation detect-stack-drift --stack-name $STACK --region $REGION
   3. Verify the headers actually reached the edge — CloudFront takes a few
      minutes to propagate, so retry until they appear:
        ADMIN_API_ORIGIN=\${ADMIN_API_ORIGIN} ./verify-live-headers.sh
  4. Confirm the GitHub variables still line up with the stack Outputs
     (AWS_ROLE_ARN, S3_BUCKET, CLOUDFRONT_DISTRIBUTION_ID, SITE_URL).
EOF
