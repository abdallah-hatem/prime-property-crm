#!/usr/bin/env bash
# Dump the database and record its row counts from the very same snapshot.
#
#   DATABASE_URL=... scripts/backup-dump.sh <out-dir> <name>
#
# Writes <out-dir>/<name>.dump (pg_dump custom format, gzip level 9 inside the archive, so
# pg_restore reads it directly) and <out-dir>/<name>.counts.tsv ("table<TAB>rows", sorted).
#
# The counts are taken inside the REPEATABLE READ transaction whose snapshot pg_dump uses
# (--snapshot), so they describe exactly what is in the dump even while the app keeps writing.
# The restore drill compares a restored copy against this file.
#
# Use the UNPOOLED connection string: an exported snapshot needs one session held open.
set -Eeuo pipefail

die() { echo "::error::backup-dump: $*" >&2; exit 1; }

[[ $# -eq 2 ]] || die "usage: backup-dump.sh <out-dir> <name>"
[[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL is not set"
command -v psql >/dev/null || die "psql not found"
command -v pg_dump >/dev/null || die "pg_dump not found"
command -v pg_restore >/dev/null || die "pg_restore not found"

out_dir=$1
name=$2
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
counts_sql="$script_dir/sql/row-counts.sql"
dump_file="$out_dir/$name.dump"
counts_file="$out_dir/$name.counts.tsv"
mkdir -p "$out_dir"

work=$(mktemp -d)
session_pid=""
cleanup() {
  exec 3>&- 2>/dev/null || true
  if [[ -n "$session_pid" ]]; then kill "$session_pid" 2>/dev/null || true; fi
  rm -rf "$work"
}
trap cleanup EXIT

# 1. Open a session that holds a REPEATABLE READ transaction and exports its snapshot.
mkfifo "$work/ctl"
psql "$DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1 <"$work/ctl" >"$work/session.out" 2>"$work/session.err" &
session_pid=$!
exec 3>"$work/ctl"
echo "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;" >&3
echo "SELECT pg_export_snapshot();" >&3

snapshot=""
for _ in $(seq 1 120); do
  snapshot=$(head -n 1 "$work/session.out" 2>/dev/null || true)
  [[ -n "$snapshot" ]] && break
  kill -0 "$session_pid" 2>/dev/null || die "snapshot session exited: $(cat "$work/session.err")"
  sleep 0.5
done
[[ -n "$snapshot" ]] || die "timed out waiting for the exported snapshot"
echo "Exported snapshot $snapshot"

# 2. Dump from that snapshot.
pg_dump "$DATABASE_URL" \
  --format=custom --compress=gzip:9 \
  --no-owner --no-privileges \
  --snapshot="$snapshot" \
  --file="$dump_file"

# 3. Count rows in the same transaction, then end it.
{
  echo "\\o $work/counts.raw"
  cat "$counts_sql"
  echo "\\o"
  echo "COMMIT;"
  echo "\\q"
} >&3
exec 3>&-
wait "$session_pid" || die "snapshot session failed: $(cat "$work/session.err")"
session_pid=""

# psql -At separates columns with "|"; store as TSV.
tr '|' '\t' <"$work/counts.raw" >"$counts_file"

# 4. Refuse to call it a backup unless it is one.
[[ -s "$dump_file" ]] || die "dump file is empty"
[[ -s "$counts_file" ]] || die "no tables counted - is the schema empty?"
pg_restore --list "$dump_file" >/dev/null || die "pg_restore cannot read the archive"
grep -q $'^_prisma_migrations\t' "$counts_file" || die "_prisma_migrations missing - wrong database?"

echo "Dump: $dump_file ($(wc -c <"$dump_file") bytes)"
echo "Row counts ($(wc -l <"$counts_file") tables):"
cat "$counts_file"
