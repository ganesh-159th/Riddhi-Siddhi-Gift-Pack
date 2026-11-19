#!/usr/bin/env bash
# Read-only verification of issue #41 backups. Makes no changes and costs no
# AWS charges beyond ordinary S3 GET/LIST requests (well inside the free tier).
#
# Usage:
#   BACKUP_BUCKET=riddhi-siddhi-gift-pack-backups \
#   SITE_BUCKET=riddhi-siddhi-gift-pack-prod \
#   ./infra/scripts/verify-backup.sh
#
# Exits non-zero if versioning is off, no snapshot exists, or the snapshot is
# not valid JSON. A snapshot that differs from the live file is only a warning:
# the admin may have published since the last scheduled run.

set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
BACKUP_BUCKET="${BACKUP_BUCKET:-riddhi-siddhi-gift-pack-backups}"
SITE_BUCKET="${SITE_BUCKET:-riddhi-siddhi-gift-pack-prod}"

command -v aws >/dev/null || { echo "aws CLI not found" >&2; exit 1; }
aws sts get-caller-identity >/dev/null 2>&1 || { echo "no usable AWS credentials" >&2; exit 1; }

echo "== Checking site-bucket versioning =="
status=$(aws s3api get-bucket-versioning --bucket "$SITE_BUCKET" \
  --query Status --output text --region "$REGION")
echo "  $SITE_BUCKET versioning: $status"
[[ "$status" == "Enabled" ]] || { echo "ERROR: versioning is not enabled" >&2; exit 1; }

echo "== Finding the newest products.json snapshot =="
latest=$(aws s3api list-objects-v2 --bucket "$BACKUP_BUCKET" \
  --prefix "products/" --region "$REGION" \
  --query "reverse(sort_by(Contents[?ends_with(Key, 'products.json')], &LastModified))[0].Key" \
  --output text)
if [[ -z "$latest" || "$latest" == "None" ]]; then
  echo "ERROR: no products.json snapshot found in s3://$BACKUP_BUCKET/products/" >&2
  exit 1
fi
echo "  s3://$BACKUP_BUCKET/$latest"

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
aws s3 cp "s3://$BACKUP_BUCKET/$latest" "$tmpdir/snapshot.json" \
  --region "$REGION" --quiet
python3 -m json.tool "$tmpdir/snapshot.json" >/dev/null
count=$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))["products"]))' \
  "$tmpdir/snapshot.json")
echo "  valid JSON, $count products"

echo "== Comparing with the live catalogue =="
aws s3 cp "s3://$SITE_BUCKET/products.json" "$tmpdir/live.json" \
  --region "$REGION" --quiet
if cmp -s "$tmpdir/snapshot.json" "$tmpdir/live.json"; then
  echo "  snapshot matches live products.json"
else
  echo "  WARNING: snapshot differs from live (a publish may have happened since the last run)"
fi

echo "== Image backups =="
images=$(aws s3api list-objects-v2 --bucket "$BACKUP_BUCKET" \
  --prefix "images/" --region "$REGION" \
  --query "length(Contents[?ends_with(Key, '.webp') || ends_with(Key, '.jpg')])")
echo "  $images backed-up image objects"

echo "OK. To restore, see README.md#backups--disaster-recovery-issue-41"
