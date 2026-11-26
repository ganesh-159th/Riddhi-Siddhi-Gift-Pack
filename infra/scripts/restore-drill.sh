#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
BACKUP_BUCKET="${BACKUP_BUCKET:-riddhi-siddhi-gift-pack-backups}"
SITE_BUCKET="${SITE_BUCKET:-riddhi-siddhi-gift-pack-prod}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DRILL_PREFIX="restore-drills/$STAMP"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

[[ "$BACKUP_BUCKET" != "$SITE_BUCKET" ]] || fail "backup bucket and site bucket must differ"
command -v aws >/dev/null 2>&1 || fail "aws CLI not found"
command -v python3 >/dev/null 2>&1 || fail "python3 not found"
aws sts get-caller-identity >/dev/null 2>&1 || fail "no usable AWS credentials"

tmpdir=$(mktemp -d)
cleanup() {
  rm -rf "$tmpdir"
  aws s3 rm "s3://$BACKUP_BUCKET/$DRILL_PREFIX/" --recursive --region "$REGION" --quiet >/dev/null 2>&1 || true
}
trap cleanup EXIT

latest=$(aws s3api list-objects-v2 --bucket "$BACKUP_BUCKET" --prefix "products/" \
  --region "$REGION" \
  --query "reverse(sort_by(Contents[?ends_with(Key, 'products.json')], &LastModified))[0].Key" \
  --output text)
[[ -n "$latest" && "$latest" != "None" ]] || fail "no products.json snapshot found"

image=$(aws s3api list-objects-v2 --bucket "$BACKUP_BUCKET" --prefix "images/" \
  --region "$REGION" \
  --query "reverse(sort_by(Contents[?ends_with(Key, '.webp') || ends_with(Key, '.jpg')], &LastModified))[0].Key" \
  --output text)
[[ -n "$image" && "$image" != "None" ]] || fail "no backed-up product image found"

echo "== Restore drill $STAMP =="
echo "  source snapshot: s3://$BACKUP_BUCKET/$latest"
echo "  source image:    s3://$BACKUP_BUCKET/$image"
echo "  staging prefix:  s3://$BACKUP_BUCKET/$DRILL_PREFIX/"

aws s3 cp "s3://$BACKUP_BUCKET/$latest" "$tmpdir/products.json" --region "$REGION" --quiet
python3 -m json.tool "$tmpdir/products.json" >/dev/null
count=$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))["products"]))' \
  "$tmpdir/products.json")

aws s3 cp "$tmpdir/products.json" "s3://$BACKUP_BUCKET/$DRILL_PREFIX/products.json" \
  --region "$REGION" --quiet
aws s3 cp "s3://$BACKUP_BUCKET/$DRILL_PREFIX/products.json" "$tmpdir/products-roundtrip.json" \
  --region "$REGION" --quiet
cmp -s "$tmpdir/products.json" "$tmpdir/products-roundtrip.json" \
  || fail "restored products.json differs from the snapshot"
echo "  PASS  catalogue restore round-trip ($count products)"

aws s3 cp "s3://$SITE_BUCKET/products.json" "$tmpdir/live.json" --region "$REGION" --quiet
if cmp -s "$tmpdir/products.json" "$tmpdir/live.json"; then
  echo "  PASS  restored catalogue matches the live products.json"
else
  echo "  NOTE  snapshot differs from live (a publish may have happened since the last backup)"
fi

aws s3 cp "s3://$BACKUP_BUCKET/$image" "$tmpdir/image" --region "$REGION" --quiet
aws s3 cp "$tmpdir/image" "s3://$BACKUP_BUCKET/$DRILL_PREFIX/image" \
  --region "$REGION" --quiet
aws s3 cp "s3://$BACKUP_BUCKET/$DRILL_PREFIX/image" "$tmpdir/image-roundtrip" \
  --region "$REGION" --quiet
cmp -s "$tmpdir/image" "$tmpdir/image-roundtrip" \
  || fail "restored image differs from the snapshot"
echo "  PASS  product image restore round-trip"

echo "OK. Restore drill passed; staging objects are removed on exit."
