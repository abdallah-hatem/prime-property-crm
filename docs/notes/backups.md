# Backups

Spec: Data protection — a nightly full database copy to separate storage, 30 copies kept. Photos
are not backed up (they are protected by 30-day delayed deletion); Neon's point-in-time restore
covers the last 7 days on top of this.

## What runs

| Workflow | When | Does |
|---|---|---|
| `.github/workflows/backup.yml` | 00:30 UTC nightly + manual | `scripts/backup-dump.sh`: `pg_dump` 17, custom format with gzip-9 inside the archive, from one exported snapshot; row counts of every table taken in that same snapshot. Uploads `prime-crm/YYYY-MM-DD.dump` and `prime-crm/YYYY-MM-DD.counts.tsv` to R2 and checks the uploaded sizes. |
| `.github/workflows/backup-restore-drill.yml` | Sundays 03:00 UTC + manual (optionally a given date) | Downloads the newest backup (fails if it is more than 2 days old), restores it into a throwaway Postgres 17 service container with `scripts/restore-drill.sh`, and fails unless every table's row count equals the counts file. Then `scripts/check-r2-lifecycle.sh` fails unless the bucket still expires `prime-crm/` objects within 30 days. |

Failure is loud: the job fails, GitHub emails the repository's watchers, and a scheduled run that
fails opens an issue titled "Nightly backup failed (date)" or "Backup restore drill failed (date)".

The dump is restorable directly: `pg_restore --no-owner --no-privileges -d <url> YYYY-MM-DD.dump`
(the `.dump` is gzip-compressed inside the custom format; do not gunzip it).

## Current state: both workflows are disabled

Disabled on GitHub on 2026-10-23, at the owner's request, until Neon and R2 exist — without their
secrets every scheduled run would fail and open an issue. Turn them back on as the last step of the
setup below (step 6), once the secrets are in place:

```bash
gh workflow enable backup.yml -R abdallah-hatem/prime-property-crm
gh workflow enable backup-restore-drill.yml -R abdallah-hatem/prime-property-crm
```

## One-time setup (no values go in the repo)

1. **Cloudflare R2.** In the Cloudflare dashboard (free tier): R2 → Create bucket, e.g.
   `prime-crm-backups`, location hint Eastern Europe. Note the **Account ID** (R2 overview page).
2. **Backup token.** R2 → Manage API tokens → Create API token: permission **Object Read & Write**,
   scoped to that bucket only, no expiry (or set a reminder). Note the **Access Key ID** and
   **Secret Access Key** (shown once).
3. **Lifecycle rule (30 days).** Either in the dashboard (bucket → Settings → Object lifecycle
   rules → Add rule: prefix `prime-crm/`, delete objects after 30 days), or with the S3 API using a
   token that has **Admin Read & Write**:
   ```bash
   aws s3api put-bucket-lifecycle-configuration \
     --bucket <bucket> --region auto \
     --endpoint-url https://<account-id>.r2.cloudflarestorage.com \
     --lifecycle-configuration file://scripts/r2-lifecycle.json
   ```
   Verify with `scripts/check-r2-lifecycle.sh` (same `R2_ACCOUNT_ID`, `R2_BUCKET` and
   `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in the environment). It must print `OK`.
4. **Optional admin-read token for the drill.** If the drill's lifecycle check fails with
   AccessDenied, the object-scoped token cannot read bucket settings: create a second token with
   **Admin Read only** and add it as `R2_ADMIN_ACCESS_KEY_ID` / `R2_ADMIN_SECRET_ACCESS_KEY`. The
   drill uses it for that one step and falls back to the backup token when it is absent.
5. **GitHub secrets** (repo → Settings → Secrets and variables → Actions → New repository secret):
   - `DATABASE_URL` — the production Neon **unpooled** connection string
     (`DATABASE_URL_UNPOOLED` in Vercel). The dump holds one session open for its snapshot, which a
     transaction pooler can break.
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
6. **Enable and first run.** Enable both workflows (commands above), then Actions → Backup → Run
   workflow; check the summary lists the dump size and table
   count. Then Actions → Backup restore drill → Run workflow; it must end with
   `OK: restored N tables, M rows; every count matches the source.` and the lifecycle `OK`.
7. Record the bucket name, token names (not secrets) and the date of the first good drill in
   `CREDENTIALS.local.md`.

## Restoring for real

1. Download the chosen `prime-crm/YYYY-MM-DD.dump` from R2 (dashboard, or `aws s3 cp` with the
   endpoint above).
2. Prefer restoring into a **new** Neon branch or database, check it, then point the app at it,
   rather than restoring over production.
3. `pg_restore --no-owner --no-privileges --exit-on-error --single-transaction -d "<unpooled url>" YYYY-MM-DD.dump`
4. Compare with the matching `.counts.tsv`:
   `psql "<url>" -At -f scripts/sql/row-counts.sql | tr '|' '\t' | diff - YYYY-MM-DD.counts.tsv`
