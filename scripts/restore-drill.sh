#!/usr/bin/env bash
# Restore a backup into an EMPTY throwaway database and prove it holds the same rows as the
# source did when the dump was taken.
#
#   RESTORE_DATABASE_URL=postgresql://.../drill scripts/restore-drill.sh <name>.dump <name>.counts.tsv
#
# <name>.counts.tsv is written by scripts/backup-dump.sh from the dump's own snapshot, so the
# two must match exactly, table for table.
set -Eeuo pipefail

die() { echo "::error::restore-drill: $*" >&2; exit 1; }

[[ $# -eq 2 ]] || die "usage: restore-drill.sh <dump-file> <counts-file>"
[[ -n "${RESTORE_DATABASE_URL:-}" ]] || die "RESTORE_DATABASE_URL is not set"
dump_file=$1
expected=$2
[[ -s "$dump_file" ]] || die "dump file '$dump_file' is missing or empty"
[[ -s "$expected" ]] || die "counts file '$expected' is missing or empty"

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Refuse to restore over anything: the drill must start from an empty database.
existing=$(psql "$RESTORE_DATABASE_URL" -X -At -v ON_ERROR_STOP=1 -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")
[[ "$existing" == "0" ]] || die "target database is not empty ($existing tables in public)"

pg_restore --dbname="$RESTORE_DATABASE_URL" \
  --no-owner --no-privileges \
  --exit-on-error --single-transaction \
  "$dump_file"

psql "$RESTORE_DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1 -f "$script_dir/sql/row-counts.sql" \
  | tr '|' '\t' >"$work/actual.tsv"

if ! diff -u "$expected" "$work/actual.tsv" >"$work/diff.txt"; then
  echo "Expected (source, at dump time) vs actual (restored):" >&2
  cat "$work/diff.txt" >&2
  die "restored row counts differ from the source"
fi

tables=$(wc -l <"$work/actual.tsv")
rows=$(awk -F'\t' '{ s += $2 } END { print s + 0 }' "$work/actual.tsv")
echo "OK: restored $tables tables, $rows rows; every count matches the source."
cat "$work/actual.tsv"
