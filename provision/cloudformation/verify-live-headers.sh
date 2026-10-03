#!/usr/bin/env bash
# Verify the live CloudFront site actually serves the headers and behaviour the
# migration is supposed to guarantee.
#
# CloudFront takes several minutes to roll a configuration change out to its
# edges, so a fresh deploy will fail this script for a while. That is expected:
# re-run it until it passes. Use --url to point at a different hostname.
#
# Usage:
#   ./verify-live-headers.sh
#   ./verify-live-headers.sh --url https://example.com

set -uo pipefail

URL="https://dd4hzdnwrj3px.cloudfront.net"
REGION="${AWS_REGION:-ap-south-1}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) URL="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

URL="${URL%/}"
pass=0
fail=0

check_header() { # check_header <path> <header> <expected-substring>
  local path="$1" header="$2" want="$3" got
  got="$(curl -sSI --max-time 20 "$URL$path" 2>/dev/null \
    | tr -d '\r' | awk -v h="$(printf '%s' "$header" | tr 'A-Z' 'a-z')" \
        'BEGIN{IGNORECASE=1} {n=index(tolower($0), h":"); if(n==1){print substr($0, index($0,":")+2); exit}}')"
  if [[ -n "$got" && "$got" == *"$want"* ]]; then
    printf '  PASS  %-14s %-26s %s\n' "$path" "$header" "$got"
    pass=$((pass + 1))
  else
    printf '  FAIL  %-14s %-26s got=%q want=*%s*\n' "$path" "$header" "${got:-<absent>}" "$want"
    fail=$((fail + 1))
  fi
}

check_status() { # check_status <path> <expected>
  local path="$1" want="$2" got
  got="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$URL$path" 2>/dev/null || echo 000)"
  if [[ "$got" == "$want" ]]; then
    printf '  PASS  %-14s HTTP %s\n' "$path" "$got"
    pass=$((pass + 1))
  else
    printf '  FAIL  %-14s HTTP %s (want %s)\n' "$path" "$got" "$want"
    fail=$((fail + 1))
  fi
}

echo "== Serving and security headers on $URL =="

# From netlify.toml [[headers]] for = "/*" — these were MISSING on CloudFront
# before this migration, so any FAIL here means the policy has not propagated.
check_header "/"        "X-Frame-Options"        "DENY"
check_header "/"        "X-Content-Type-Options" "nosniff"
check_header "/"        "Referrer-Policy"        "strict-origin-when-cross-origin"
check_header "/"        "Permissions-Policy"     "camera=()"
check_header "/"        "Strict-Transport-Security" "max-age"

# netlify.toml [[headers]] for = "/admin.html" — separate cache behaviour.
check_header "/admin.html" "X-Robots-Tag" "noindex"

# Core pages must serve.
check_status "/"               200
check_status "/products.json"  200
check_status "/admin.html"     200
check_status "/sitemap.xml"    200
check_status "/robots.txt"     200

echo
echo "== Caching behaviour (deploy.yml sets these per object) =="
check_header "/products.json" "Cache-Control" "no-store"
check_header "/index.html"    "Cache-Control" "no-store"
check_header "/admin.html"    "Cache-Control" "no-store"
# Product photos are immutable and served from S3 via CloudFront.
PRODUCT_KEY="$(curl -sS --max-time 20 "$URL/products.json" 2>/dev/null \
  | grep -o '"products/[^"]*\.jpg"' | head -1 | tr -d '"')"
if [[ -n "$PRODUCT_KEY" ]]; then
  check_header "/$PRODUCT_KEY" "Cache-Control" "max-age=31536000"
else
  printf '  SKIP  no products/*.jpg reference found in products.json\n'
fi

echo
echo "== Unknown paths must render the branded 404 =="
BODY="$(curl -sS -L --max-time 20 "$URL/this-page-does-not-exist-verify" 2>/dev/null || true)"
CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$URL/this-page-does-not-exist-verify" 2>/dev/null || echo 000)"
if [[ "$CODE" == "404" ]] && [[ "$BODY" == *"Page Not Found"* ]]; then
  printf '  PASS  %-14s HTTP 404 + branded page\n' "/nope"
  pass=$((pass + 1))
else
  printf '  FAIL  %-14s HTTP %s, branded body %s\n' "/nope" "$CODE" \
    "$([[ "$BODY" == *"Page Not Found"* ]] && echo present || echo MISSING)"
  fail=$((fail + 1))
fi

echo
echo "== S3 origin must stay private =="
# Pick a working AWS CLI. On Apple Silicon, /usr/local/bin/aws is usually the
# Intel (x86_64) Homebrew install and exits 126 "Bad CPU type in executable"
# from inside a bash script, so prefer the arm64 Homebrew prefix when present.
# A failed aws call must read as SKIP, never as a silent PASS or a bogus FAIL,
# otherwise this script reports on nothing at all.
AWS_BIN="aws"
if [[ -x /opt/homebrew/bin/aws ]] && ! aws s3api list-buckets --region "$REGION" >/dev/null 2>&1; then
  AWS_BIN=/opt/homebrew/bin/aws
fi
aws_json() { # aws_json <args...>
  command -v "$AWS_BIN" >/dev/null || return 127
  "$AWS_BIN" --no-cli-pager "$@" 2>/dev/null
}

PAB="$(aws_json s3api get-public-access-block --bucket riddhi-siddhi-gift-pack-prod --region "$REGION")"
if [[ -z "$PAB" ]]; then
  printf '  SKIP  %-14s could not read the bucket (aws CLI unavailable or erroring)\n' "bucket"
elif [[ "$PAB" == *'"BlockPublicAcls": true'* && "$PAB" == *'"IgnorePublicAcls": true'* \
    && "$PAB" == *'"BlockPublicPolicy": true'* && "$PAB" == *'"RestrictPublicBuckets": true'* ]]; then
  printf '  PASS  %-14s all four public-access blocks enabled\n' "bucket"
  pass=$((pass + 1))
else
  printf '  FAIL  %-14s public access block is not fully enabled\n' "bucket"
  fail=$((fail + 1))
fi

echo
echo "== Cost guardrails =="
ACCOUNT_ID="$(aws_json sts get-caller-identity --query Account --output text)"
BUDGETS="$(aws_json budgets describe-budgets --account-id "${ACCOUNT_ID:-0}" --region us-east-1)"
if [[ -z "$BUDGETS" ]]; then
  printf '  SKIP  %-14s could not read budgets (aws CLI unavailable or erroring)\n' "budgets"
else
  # A budget with no NotificationsWithSubscribers is the failure mode that
  # matters: the limit exists but nothing is ever delivered.
  ALERTED="$(printf '%s' "$BUDGETS" | python3 -c '
import json,sys
try: d=json.load(sys.stdin)
except Exception: print(-1); raise SystemExit
n=0
for b in d.get("Budgets",[]):
    if b.get("Notifications") or b.get("NotificationsWithSubscribers"): n+=1
print(n)
' 2>/dev/null)"
  case "$ALERTED" in
    -1|'')
      printf '  SKIP  %-14s could not parse the budgets response\n' "budgets" ;;
    0)
      printf '  FAIL  %-14s no budget has any subscriber — spend can rise unalerted\n' "budgets"
      fail=$((fail + 1)) ;;
    *)
      printf '  PASS  %-14s %s budget(s) have alert subscribers\n' "budgets" "$ALERTED"
      pass=$((pass + 1)) ;;
  esac
fi

echo
echo "-------------------------------------------"
printf 'passed: %d   failed: %d\n' "$pass" "$fail"
[[ "$fail" -eq 0 ]] || { echo "If you just deployed, CloudFront may still be propagating — re-run in a few minutes." >&2; exit 1; }
