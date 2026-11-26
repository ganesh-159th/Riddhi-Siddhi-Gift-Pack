#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPORT_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --report)
      REPORT_FILE="$2"
      shift 2
      ;;
    *)
      echo "usage: verify-launch-gates.sh [--report FILE]" >&2
      exit 2
      ;;
  esac
done

REGION="${AWS_REGION:-ap-south-1}"
SITE_URL="${SITE_URL:-https://dd4hzdnwrj3px.cloudfront.net}"
SITE_BUCKET="${SITE_BUCKET:-riddhi-siddhi-gift-pack-prod}"
BACKUP_BUCKET="${BACKUP_BUCKET:-riddhi-siddhi-gift-pack-backups}"
ENQUIRIES_BUCKET="${ENQUIRIES_BUCKET:-riddhi-siddhi-gift-pack-enquiries}"
DISTRIBUTION_ID="${CLOUDFRONT_DISTRIBUTION_ID:-E28V3XCFD4ZAQR}"
API_BASE="${AWS_API_URL:-${ADMIN_API_ORIGIN:-}/prod}"
API_BASE="${API_BASE%/}"
ADMIN_API_ORIGIN="${ADMIN_API_ORIGIN:-${API_BASE%/prod}}"
ADMIN_API_ORIGIN="${ADMIN_API_ORIGIN%/prod}"

if [[ -n "${GITHUB_SERVER_URL:-}" && -n "${GITHUB_REPOSITORY:-}" && -n "${GITHUB_RUN_ID:-}" ]]; then
  EVIDENCE_URL="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
else
  EVIDENCE_URL="${EVIDENCE_URL:-local run}"
fi

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT
RESULTS=()
pass_count=0
fail_count=0
skip_count=0

record() {
  local gate="$1" status="$2" evidence="$3"
  RESULTS+=("${gate}|${status}|${evidence}")
  case "$status" in
    PASS) pass_count=$((pass_count + 1)) ;;
    FAIL) fail_count=$((fail_count + 1)) ;;
    SKIP) skip_count=$((skip_count + 1)) ;;
  esac
  printf '  %-4s %s\n' "$status" "$gate"
}

run_logged() {
  local name="$1"
  shift
  echo "== $name =="
  if "$@" >"$WORKDIR/$name.log" 2>&1; then
    cat "$WORKDIR/$name.log"
    return 0
  fi
  cat "$WORKDIR/$name.log"
  return 1
}

aws_ready=0
if command -v aws >/dev/null 2>&1 && aws sts get-caller-identity >/dev/null 2>&1; then
  aws_ready=1
fi

headers_ok=0
if ADMIN_API_ORIGIN="$ADMIN_API_ORIGIN" SITE_BUCKET="$SITE_BUCKET" AWS_REGION="$REGION" \
  run_logged live-headers "$ROOT/provision/cloudformation/verify-live-headers.sh"; then
  headers_ok=1
fi

if [[ "$headers_ok" == 1 ]] && curl -fsSI "$SITE_URL/" 2>/dev/null | tr -d '\r' \
  | grep -qi '^via: .*cloudfront'; then
  record "Site runs fully on AWS" PASS "live 200s, private S3 origin, CloudFront edge (${EVIDENCE_URL})"
else
  record "Site runs fully on AWS" FAIL "live header checks did not pass (${EVIDENCE_URL})"
fi

host=$(python3 -c 'from urllib.parse import urlparse; import sys; print(urlparse(sys.argv[1]).hostname or "")' "$SITE_URL")
if [[ -n "$host" && "$host" != *.cloudfront.net ]] && curl -fsSI "https://$host/" >/dev/null 2>&1; then
  record "SSL + custom domain active" PASS "HTTPS 200 on https://$host (${EVIDENCE_URL})"
else
  record "SSL + custom domain active" FAIL "SITE_URL is the default CloudFront domain, no ACM certificate or custom DNS (issue #129)"
fi

if [[ "$headers_ok" == 1 ]]; then
  record "Security headers + CSP" PASS "all live headers and exact admin connect-src pass (${EVIDENCE_URL})"
else
  record "Security headers + CSP" FAIL "verify-live-headers.sh failed (${EVIDENCE_URL})"
fi

waf_id=""
shield_count=""
if [[ "$aws_ready" == 1 ]]; then
  waf_id=$(aws cloudfront get-distribution-config --id "$DISTRIBUTION_ID" --region us-east-1 \
    --query 'DistributionConfig.WebACLId' --output text 2>/dev/null || true)
  shield_count=$(aws shield list-protections --region us-east-1 \
    --query 'length(Protections)' --output text 2>/dev/null || true)
fi
if [[ -n "$waf_id" && "$waf_id" != "None" && "$shield_count" =~ ^[0-9]+$ && "$shield_count" -gt 0 ]]; then
  record "WAF + DDoS protection active" PASS "CloudFront WebACL ${waf_id}, ${shield_count} Shield protection(s)"
elif [[ "$aws_ready" == 0 ]]; then
  record "WAF + DDoS protection active" SKIP "AWS credentials unavailable"
else
  record "WAF + DDoS protection active" FAIL "WebACLId=${waf_id:-none}, Shield=${shield_count:-not subscribed} (issue #128)"
fi

login_code="000"
admin_html=$(curl -fsS "$SITE_URL/admin.html" 2>/dev/null || true)
admin_js=$(printf '%s' "$admin_html" | grep -oE 'src="[^"]+\.js"' | head -1 | cut -d'"' -f2 || true)
if [[ -n "$admin_js" ]] && curl -fsS "$SITE_URL/$admin_js" 2>/dev/null | grep -qi 'admin password'; then
  probe_args=(-s -o /dev/null -w '%{http_code}' -X POST "$API_BASE/api/admin-login"
    -H 'Content-Type: application/json' -d '{"password":"__launch_gate_probe__"}')
  if [[ -n "${AWS_API_KEY:-}" ]]; then
    probe_args+=(-H "x-api-key: ${AWS_API_KEY}")
  fi
  login_code=$(curl "${probe_args[@]}" 2>/dev/null || true)
fi
if [[ "$login_code" != "000" && "$login_code" != "200" ]]; then
  record "Admin panel requires login" PASS "admin UI gated, invalid login rejected with HTTP ${login_code} (${EVIDENCE_URL})"
else
  record "Admin panel requires login" FAIL "admin login probe returned HTTP ${login_code} (${EVIDENCE_URL})"
fi

audit_rc=0
for attempt in 1 2 3; do
  if npm audit --prefix "$ROOT" --audit-level=high --json >"$WORKDIR/audit.json" 2>"$WORKDIR/audit.err"; then
    audit_rc=0
    break
  fi
  audit_rc=$?
  sleep 5
done
counts=$(python3 -c 'import json,sys; v=json.load(open(sys.argv[1])).get("metadata",{}).get("vulnerabilities",{}); print(v.get("high",0), v.get("critical",0))' \
  "$WORKDIR/audit.json" 2>/dev/null || true)
if [[ "$counts" =~ ^[0-9]+[[:space:]]+[0-9]+$ ]]; then
  read -r high critical <<<"$counts"
  if [[ "$high" == 0 && "$critical" == 0 && "$audit_rc" == 0 ]]; then
    record "Zero high/critical vulnerabilities" PASS "npm audit high=0 critical=0 (${EVIDENCE_URL})"
  else
    record "Zero high/critical vulnerabilities" FAIL "npm audit high=${high} critical=${critical}, exit ${audit_rc}"
  fi
else
  record "Zero high/critical vulnerabilities" SKIP "npm audit output unavailable"
fi

backup_ok=0
drill_ok=0
if AWS_REGION="$REGION" SITE_BUCKET="$SITE_BUCKET" BACKUP_BUCKET="$BACKUP_BUCKET" \
  run_logged verify-backup "$ROOT/infra/scripts/verify-backup.sh"; then
  backup_ok=1
fi
if AWS_REGION="$REGION" SITE_BUCKET="$SITE_BUCKET" BACKUP_BUCKET="$BACKUP_BUCKET" \
  run_logged restore-drill "$ROOT/infra/scripts/restore-drill.sh"; then
  drill_ok=1
fi
alarm_count=0
subscription_count=0
if [[ "$aws_ready" == 1 ]]; then
  alarm_count=$(aws cloudwatch describe-alarms --region "$REGION" --query 'length(MetricAlarms)' --output text 2>/dev/null || echo 0)
  us_alarm_count=$(aws cloudwatch describe-alarms --region us-east-1 --query 'length(MetricAlarms)' --output text 2>/dev/null || echo 0)
  alarm_count=$((alarm_count + us_alarm_count))
  subscription_count=$(aws sns list-subscriptions --region "$REGION" --output json 2>/dev/null \
    | python3 -c 'import json,sys; print(sum(1 for s in json.load(sys.stdin)["Subscriptions"] if s.get("SubscriptionArn") != "PendingConfirmation"))' 2>/dev/null || echo 0)
  us_subscription_count=$(aws sns list-subscriptions --region us-east-1 --output json 2>/dev/null \
    | python3 -c 'import json,sys; print(sum(1 for s in json.load(sys.stdin)["Subscriptions"] if s.get("SubscriptionArn") != "PendingConfirmation"))' 2>/dev/null || echo 0)
  subscription_count=$((subscription_count + us_subscription_count))
fi
if [[ "$backup_ok" == 1 && "$drill_ok" == 1 && "$headers_ok" == 1 && "$alarm_count" -gt 0 && "$subscription_count" -gt 0 ]]; then
  record "Backups + monitoring + alerts live" PASS "backup verified, restore drill passed, ${alarm_count} alarms, ${subscription_count} confirmed SNS subscribers, budget alerts subscribed"
else
  record "Backups + monitoring + alerts live" FAIL "backup=${backup_ok} drill=${drill_ok} alarms=${alarm_count} confirmed subscribers=${subscription_count} budget=${headers_ok}"
fi

cwv_ok=0
if SITE_URL="$SITE_URL" CWV_REPORT="$WORKDIR/lighthouse.json" \
  run_logged core-web-vitals npm run --prefix "$ROOT" test:cwv; then
  cwv_ok=1
fi
if [[ "$cwv_ok" == 1 ]]; then
  cwv_line=$(grep -m1 '^CWV_RESULT ' "$WORKDIR/core-web-vitals.log" || true)
  record "Core Web Vitals green" PASS "${cwv_line:-Lighthouse thresholds met} (${EVIDENCE_URL})"
else
  record "Core Web Vitals green" FAIL "Lighthouse thresholds not met (${EVIDENCE_URL})"
fi

ci_line=""
security_line=""
if command -v gh >/dev/null 2>&1; then
  ci_line=$(gh run list --repo ganesh-159th/Riddhi-Siddhi-Gift-Pack --workflow ci.yml --branch main \
    --limit 1 --json conclusion,url --jq '.[0] | "\(.conclusion) \(.url)"' 2>/dev/null || true)
  security_line=$(gh run list --repo ganesh-159th/Riddhi-Siddhi-Gift-Pack --workflow security.yml --branch main \
    --limit 1 --json conclusion,url --jq '.[0] | "\(.conclusion) \(.url)"' 2>/dev/null || true)
fi
if [[ "$ci_line" == success* && "$security_line" == success* ]]; then
  record "Tests passing in CI" PASS "CI ${ci_line#success }, security ${security_line#success }"
else
  record "Tests passing in CI" SKIP "latest CI=${ci_line:-unknown} security=${security_line:-unknown}"
fi

migration_ok=0
products=$(curl -fsS "$SITE_URL/products.json" 2>/dev/null \
  | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["products"]))' 2>/dev/null || echo 0)
images=0
enquiries_bucket_ok=0
if [[ "$aws_ready" == 1 ]]; then
  images=$(aws s3api list-objects-v2 --bucket "$SITE_BUCKET" --prefix 'products/' --region "$REGION" \
    --query "length(Contents[?ends_with(Key, '.webp') || ends_with(Key, '.jpg')])" --output text 2>/dev/null || echo 0)
  if aws s3api head-bucket --bucket "$ENQUIRIES_BUCKET" --region "$REGION" >/dev/null 2>&1; then
    enquiries_bucket_ok=1
  fi
fi
if [[ "$products" -gt 0 && "$images" -gt 0 && "$enquiries_bucket_ok" == 1 ]]; then
  migration_ok=1
fi
if [[ "$migration_ok" == 1 ]]; then
  record "Data migration verified" PASS "live catalogue ${products} products, ${images} AWS-hosted images, AWS enquiries bucket present"
else
  record "Data migration verified" FAIL "products=${products} images=${images} enquiries bucket=${enquiries_bucket_ok}"
fi

render() {
  echo "# Launch gate verification"
  echo
  echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Commit: $(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "Evidence: ${EVIDENCE_URL}"
  echo
  echo "| Gate | Status | Evidence |"
  echo "| --- | --- | --- |"
  local gate status evidence
  for result in "${RESULTS[@]}"; do
    IFS='|' read -r gate status evidence <<<"$result"
    echo "| ${gate} | ${status} | ${evidence} |"
  done
  echo
  echo "Passed: ${pass_count}  Failed: ${fail_count}  Skipped: ${skip_count}"
}

if [[ -n "$REPORT_FILE" ]]; then
  mkdir -p "$(dirname "$REPORT_FILE")"
  render | tee "$REPORT_FILE"
else
  render
fi

if (( fail_count > 0 || skip_count > 0 )); then
  exit 1
fi
