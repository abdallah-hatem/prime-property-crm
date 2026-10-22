#!/usr/bin/env bash
# Fail unless the backup bucket has an enabled lifecycle rule that expires backups after
# 30 days or fewer (spec: Data protection — 30 copies kept).
#
#   R2_ACCOUNT_ID=... R2_BUCKET=... AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \
#     scripts/check-r2-lifecycle.sh
#
# Offline (tests, or checking scripts/r2-lifecycle.json itself):
#   scripts/check-r2-lifecycle.sh --file scripts/r2-lifecycle.json
#
# A rule counts when it is Enabled, has Expiration.Days between 1 and MAX_DAYS, and its prefix
# covers BACKUP_PREFIX (an empty or absent prefix covers the whole bucket).
set -Eeuo pipefail

MAX_DAYS=${MAX_DAYS:-30}
BACKUP_PREFIX=${BACKUP_PREFIX:-prime-crm/}

die() { echo "::error::check-r2-lifecycle: $*" >&2; exit 1; }
command -v jq >/dev/null || die "jq not found"

if [[ "${1:-}" == "--file" ]]; then
  [[ -n "${2:-}" ]] || die "usage: check-r2-lifecycle.sh [--file <lifecycle.json>]"
  config=$(cat "$2")
  source_desc="file $2"
else
  command -v aws >/dev/null || die "aws cli not found"
  [[ -n "${R2_ACCOUNT_ID:-}" ]] || die "R2_ACCOUNT_ID is not set"
  [[ -n "${R2_BUCKET:-}" ]] || die "R2_BUCKET is not set"
  if ! config=$(aws s3api get-bucket-lifecycle-configuration \
      --bucket "$R2_BUCKET" \
      --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
      --region auto --output json 2>&1); then
    die "could not read the lifecycle configuration (none set, or the token lacks bucket admin read): $config"
  fi
  source_desc="bucket $R2_BUCKET"
fi

matching=$(jq -c --argjson max "$MAX_DAYS" --arg prefix "$BACKUP_PREFIX" '
  [ (.Rules // [])[]
    | select(.Status == "Enabled")
    | select((.Expiration.Days // 0) >= 1 and (.Expiration.Days // 0) <= $max)
    | (.Filter.Prefix // .Filter.And.Prefix // .Prefix // "") as $p
    | select($prefix | startswith($p))
    | { id: (.ID // "(no id)"), days: .Expiration.Days, prefix: $p } ]
' <<<"$config") || die "lifecycle configuration from $source_desc is not valid JSON"

if [[ "$matching" == "[]" ]]; then
  echo "Lifecycle configuration from $source_desc:" >&2
  echo "$config" >&2
  die "no enabled rule expires '$BACKUP_PREFIX' objects within $MAX_DAYS days"
fi

echo "OK: $source_desc expires '$BACKUP_PREFIX' objects within $MAX_DAYS days: $matching"
