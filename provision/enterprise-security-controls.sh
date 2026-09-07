#!/usr/bin/env bash
#
# enterprise-security-controls.sh — Generates the AWS CLI commands that set up
# the free-tier enterprise security controls for Riddhi Siddhi Gift & Pack.
#
# This covers:
#   1. IAM password policy (strong passwords, 90-day expiry, no reuse)
#   2. IAM Access Analyzer (detect exposed/cross-account resources)
#   3. Access Analyzer → EventBridge → SNS email alerts (all findings)
#   4. S3 lifecycle rule for rollback backups (auto-delete after 7 days)
#
# All commands are FREE to create — no monthly charges.
#
# Like generate-cost-guardrails.sh, this script only PRINTS the commands.
# Copy-paste the output into a terminal with `aws configure` credentials
# (with AdministratorAccess or equivalent).
#
# Usage:
#   ./enterprise-security-controls.sh
#
# Or pass values inline:
#   BUCKET=riddhi-siddhi-gift-pack-prod ALERT_EMAIL=you@example.com \
#     REGION=ap-south-1 ./enterprise-security-controls.sh
#
set -euo pipefail

REGION="${REGION:-ap-south-1}"
BUCKET="${BUCKET:-}"
ALERT_EMAIL="${ALERT_EMAIL:-}"

if [[ -z "$BUCKET" ]]; then
  read -rp "S3 bucket name (e.g. riddhi-siddhi-gift-pack-prod): " BUCKET
fi
if [[ -z "$ALERT_EMAIL" ]]; then
  read -rp "Alert email for Access Analyzer findings (e.g. you@example.com): " ALERT_EMAIL
fi

comment() { printf '\n# %s\n' "$1"; }

# ──────────────────────────────────────────────────────────────────────────────
# 1. IAM Password Policy
# ──────────────────────────────────────────────────────────────────────────────
comment "1) IAM password policy — enforce strong passwords across the account"
cat <<'EOF'
aws iam update-account-password-policy \
  --minimum-password-length 14 \
  --require-symbols \
  --require-numbers \
  --require-uppercase-characters \
  --require-lowercase-characters \
  --allow-users-to-change-password \
  --max-password-age 90 \
  --password-reuse-prevention 24
EOF

# ──────────────────────────────────────────────────────────────────────────────
# 2. IAM Access Analyzer
# ──────────────────────────────────────────────────────────────────────────────
comment "2) IAM Access Analyzer — continuously scan for exposed/cross-account resources"
cat <<EOF
aws accessanalyzer create-analyzer \\
  --type ACCOUNT \\
  --analyzer-name enterprise-access-analyzer \\
  --region $REGION
EOF

# ──────────────────────────────────────────────────────────────────────────────
# 3. SNS topic + email subscription for Access Analyzer alerts
# ──────────────────────────────────────────────────────────────────────────────
comment "3) SNS topic for security alerts"
cat <<EOF
TOPIC_ARN=\$(aws sns create-topic \\
  --name aws-security-alerts \\
  --region $REGION \\
  --query 'TopicArn' --output text)
echo "Created SNS topic: \$TOPIC_ARN"

aws sns subscribe \\
  --topic-arn "\$TOPIC_ARN" \\
  --protocol email \\
  --notification-endpoint "$ALERT_EMAIL" \\
  --region $REGION
echo "CHECK YOUR EMAIL and click the confirmation link from AWS."
EOF

# ──────────────────────────────────────────────────────────────────────────────
# 4. EventBridge rule to forward Access Analyzer findings to SNS
# ──────────────────────────────────────────────────────────────────────────────
comment "4) EventBridge rule — Access Analyzer findings → SNS → email"
cat <<EOF
aws events put-rule \\
  --name access-analyzer-findings-notify \\
  --event-pattern '{"source":["aws.access-analyzer"],"detail-type":["Access Analyzer Finding","Internal Access Finding","Unused Access Finding for IAM entities"]}' \\
  --region $REGION \\
  --description "Notify email when IAM Access Analyzer generates new findings"

# Allow EventBridge to publish to the SNS topic
aws sns set-topic-attributes \\
  --topic-arn "\$TOPIC_ARN" \\
  --attribute-name Policy \\
  --attribute-value '{"Version":"2012-10-17","Statement":[{"Sid":"AllowEventBridgeToPublish","Effect":"Allow","Principal":{"Service":"events.amazonaws.com"},"Action":"sns:Publish","Resource":"\$TOPIC_ARN"}]}' \\
  --region $REGION

# Connect the rule to the SNS topic
aws events put-targets \\
  --rule access-analyzer-findings-notify \\
  --targets "Id=1,Arn=\$TOPIC_ARN" \\
  --region $REGION
EOF

# ──────────────────────────────────────────────────────────────────────────────
# 5. S3 lifecycle rule — auto-delete old rollback backups after 7 days
# ──────────────────────────────────────────────────────────────────────────────
comment "5) S3 lifecycle rule — auto-delete rollback backups older than 7 days"
cat <<EOF
aws s3api put-bucket-lifecycle-configuration \\
  --bucket '$BUCKET' \\
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "DeleteOldRollbacks",
        "Status": "Enabled",
        "Filter": { "Prefix": "rollbacks/" },
        "Expiration": { "Days": 7 }
      }
    ]
  }'
EOF

# ──────────────────────────────────────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────────────────────────────────────
comment "Summary of what you get (all free tier)"
cat <<'EOF'
# - Password policy: 14-char minimum, symbols+numbers+case, 90-day expiry, no reuse of last 24
# - Access Analyzer: scans for exposed S3 buckets, cross-account IAM roles, etc.
# - EventBridge + SNS: email alerts whenever Access Analyzer finds a new issue
# - S3 lifecycle: rollback backups auto-deleted after 7 days (no storage bloat)
# - CloudTrail Event History: free 90-day API audit log (auto-enabled, nothing to set)
#
# After running these commands:
#   1. Confirm the email subscription from SNS (AWS Security Alerts).
#   2. Go to IAM Access Analyzer → Findings in the AWS console to review.
#   3. The deploy.yml workflow also prunes rollback folders on each deploy (7-day rule).
EOF
