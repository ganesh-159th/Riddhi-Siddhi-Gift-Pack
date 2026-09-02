#!/usr/bin/env bash
#
# generate-cost-guardrails.sh — Generates the AWS CLI commands that set up the
# cost guardrails for the Riddhi Siddhi Gift & Pack static site (issue #42).
#
# Goal: keep monthly AWS cost at $0.00 by staying strictly within the AWS free
# tier. Everything generated here (Budgets, tags, S3 lifecycle, Cost Anomaly
# alerts) is FREE to create — none of it adds monthly charges.
#
# This script only PRINTS the commands — it requires no AWS credentials and
# makes NO changes. Copy-paste the output into a terminal that already has
# `aws configure` credentials (with the right permissions, e.g. running from
# your own IAM user) and run it.
#
# Usage:
#   ./generate-cost-guardrails.sh
#
# You will be prompted for your AWS account ID, region, the S3 bucket name and
# the email that should receive the budget/anomaly alerts. You can also pass
# them inline:
#   ACCOUNT_ID=123456789012 REGION=ap-south-1 BUCKET=mysite-prod \
#     ALERT_EMAIL=you@example.com ./generate-cost-guardrails.sh
#
set -euo pipefail

ACCOUNT_ID="${ACCOUNT_ID:-}"
REGION="${REGION:-ap-south-1}"
BUCKET="${BUCKET:-}"
ALERT_EMAIL="${ALERT_EMAIL:-}"

if [[ -z "$ACCOUNT_ID" ]]; then
  read -rp "AWS account ID (12 digits): " ACCOUNT_ID
fi
if [[ -z "$BUCKET" ]]; then
  read -rp "S3 bucket name (e.g. riddhi-siddhi-gift-pack-prod): " BUCKET
fi
if [[ -z "$ALERT_EMAIL" ]]; then
  read -rp "Alert email for budgets + anomaly detection: " ALERT_EMAIL
fi

el() { printf 'echo "%s"\n' "$1"; }
comment() { printf '\n# %s\n' "$1"; }
export el

comment "Configure the AWS CLI defaults (this shell only)"
echo "aws configure set region '$REGION'"
echo "aws configure set output json"

comment "0) Cost tags applied to every resource (Project=RiddhiSiddhi, Env=prod)"
echo "echo \"Tag ALL resources you create (bucket, distribution\u2026) with: Project=RiddhiSiddhi Env=prod\""
echo "aws s3api put-bucket-tagging --bucket '$BUCKET' --tagging 'TagSet=[{Key=Project,Value=RiddhiSiddhi},{Key=Env,Value=prod}]'"

comment "1) AWS Budget: hard \$0.01 alert (any real spend = \${} > free tier)"
echo "aws budgets create-budget --account-id '$ACCOUNT_ID' --budget '{
  \"BudgetName\": \"free-tier-guard\",
  \"BudgetLimit\": { \"Amount\": 0.01, \"Unit\": \"USD\" },
  \"TimeUnit\": \"MONTHLY\",
  \"BudgetType\": \"COST\",
  \"CostFilters\": {},
  \"Notification\": {
    \"ComparisonOperator\": \"GREATER_THAN\",
    \"Threshold\": 100,
    \"ThresholdType\": \"PERCENTAGE\",
    \"NotificationType\": \"ACTUAL\"
  },
  \"CostTypes\": { \"IncludeTax\": true, \"IncludeSubscription\": true }
}' --notifications '[
  { \"Notification\": { \"ComparisonOperator\": \"GREATER_THAN\", \"Threshold\": 100, \"ThresholdType\": \"PERCENTAGE\", \"NotificationType\": \"ACTUAL\" },
    \"Subscribers\": [ { \"SubscriptionType\": \"EMAIL\", \"Address\": \"$ALERT_EMAIL\" } ] }
]'"

comment "2) AWS Budget: soft 50/80/100\\% of the free-tier guard (informational)"
echo "aws budgets create-budget --account-id '$ACCOUNT_ID' --budget '{
  \"BudgetName\": \"free-tier-thresholds\",
  \"BudgetLimit\": { \"Amount\": 0.01, \"Unit\": \"USD\" },
  \"TimeUnit\": \"MONTHLY\",
  \"BudgetType\": \"COST\",
  \"CostTypes\": { \"IncludeTax\": true, \"IncludeSubscription\": true },
  \"PlannedBudgetLimits\": { \"0.0075\": { \"Amount\": 0.0075, \"Unit\": \"USD\" } }
}' --notifications '[{ \"Notification\": { \"ComparisonOperator\": \"GREATER_THAN\", \"Threshold\": 50, \"ThresholdType\": \"PERCENTAGE\", \"NotificationType\": \"ACTUAL\" }, \"Subscribers\": [ { \"SubscriptionType\": \"EMAIL\", \"Address\": \"$ALERT_EMAIL\" } ] },
{ \"Notification\": { \"ComparisonOperator\": \"GREATER_THAN\", \"Threshold\": 80, \"ThresholdType\": \"PERCENTAGE\", \"NotificationType\": \"FORECASTED\" }, \"Subscribers\": [ { \"SubscriptionType\": \"EMAIL\", \"Address\": \"$ALERT_EMAIL\" } ] }]'"

comment "3) S3 lifecycle: tier old rollback backups to Glacier then expire (cost control)"
echo "aws s3api put-bucket-lifecycle-configuration --bucket '$BUCKET' --lifecycle-configuration '{
  \"Rules\": [
    {
      \"Id\": \"rollback-backups\",
      \"Status\": \"Enabled\",
      \"Filter\": { \"Prefix\": \"rollbacks/\" },
      \"Transitions\": [
        { \"Days\": 7,  \"StorageClass\": \"GLACIER\" },
        { \"Days\": 30, \"StorageClass\": \"DEEP_ARCHIVE\" }
      ],
      \"Expiration\": { \"Days\": 90 }
    }
  ]
}'"

comment "4) Cost Anomaly Detection: enable the service monitor + alert"
echo "aws cost-anomaly-detection start-anomaly-monitoring"
echo "aws cost-anomaly-detection get-anomaly-monitors --output table"

comment "5) Summary of what will stay at \$0 on free tier"
printf '\n# This site uses S3 + CloudFront (static only).\n'
printf '#   - S3            : 5 GB free, 20k GET/2k PUT free -> covered (site is tiny)\n'
printf '#   - CloudFront    : 1 TB transfer + 10M requests free -> covered\n'
printf '#   - IAM / Budgets / Lifecycle / Cost Explorer : free\n'
printf '# NO Route 53 zone (would cost $0.50/mo) - using free *.cloudfront.net domain.\n'
printf '# NO WAF (would cost ~$5/mo), NO Lambda/APIGW needed for a static site.\n'
