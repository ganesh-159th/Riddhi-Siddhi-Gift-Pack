#!/usr/bin/env bash
#
# generate-policies.sh — Generates the exact IAM policy JSON needed for the
# Riddhi Siddhi Gift & Pack GitHub Actions OIDC deploy (issue #36).
#
# The script only PRINTS the policies — it does not require AWS credentials
# and makes no changes. You paste the output into the AWS console when
# creating the OIDC role.
#
# Usage:
#   ./generate-policies.sh
#
# You will be prompted for your AWS account ID, bucket name and CloudFront
# distribution ID. You can also pass them inline:
#   ACCOUNT_ID=123456789012 BUCKET=mysite-prod CF_DIST=E2EXAMPLE ./generate-policies.sh
#
set -euo pipefail

GITHUB_REPO="${GITHUB_REPO:-ganesh-159th/Riddhi-Siddhi-Gift-Pack}"
ACCOUNT_ID="${ACCOUNT_ID:-}"
BUCKET="${BUCKET:-}"
CF_DIST="${CF_DIST:-}"

if [[ -z "$ACCOUNT_ID" ]]; then
  read -rp "AWS account ID (12 digits): " ACCOUNT_ID
fi
if [[ -z "$BUCKET" ]]; then
  read -rp "S3 bucket name (e.g. riddhi-siddhi-gift-pack-prod): " BUCKET
fi
if [[ -z "$CF_DIST" ]]; then
  read -rp "CloudFront distribution ID (e.g. E2EXAMPLEID): " CF_DIST
fi

echo "################################################################"
echo "# 1) TRUST POLICY — paste into the 'Trust relationships' tab   #"
echo "################################################################"
cat <<TRUST
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
        "StringLike": { "token.actions.githubusercontent.com:sub": "repo:${GITHUB_REPO}:*" }
      }
    }
  ]
}
TRUST

echo
echo "################################################################"
echo "# 2) PERMISSIONS POLICY — attach to the role                   #"
echo "################################################################"
cat <<PERM
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3StaticSite",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::${BUCKET}",
        "arn:aws:s3:::${BUCKET}/*"
      ]
    },
    {
      "Sid": "CloudFrontInvalidation",
      "Effect": "Allow",
      "Action": "cloudfront:CreateInvalidation",
      "Resource": "arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${CF_DIST}"
    }
  ]
}
PERM
