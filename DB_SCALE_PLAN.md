# DB Scale Plan (SQLite/Postgres + Daily XLSX Snapshots)

This project currently uses Excel files as operational storage (MVP-friendly).
If write volume/concurrency grows, move operational reads/writes to DB and keep XLSX as export snapshots.

## Target architecture

1. Operational DB (SQLite for single-machine, Postgres for multi-user/production):
   - `people` (master list)
   - `locations`
   - `daily_status_entries` (one row per person per date)
2. API reads/writes hit DB only.
3. Daily XLSX export job creates `YYYY-MM-DD.xlsx` from DB state.
4. Optional sync to S3 (same file naming and retention policy).

## Migration phases

### Phase 1: Dual-write (safe transition)

1. Keep current Excel flow.
2. Add DB models + repository layer.
3. Write updates to both DB and Excel.
4. Add integrity check endpoint/job comparing DB day view vs XLSX day view.

### Phase 2: DB as source of truth

1. Read operations switch to DB.
2. Keep XLSX generation as export/snapshot only.
3. Keep one-way export to local/S3.

### Phase 3: Performance hardening

1. Add DB indexes:
   - `(date, person_id)` unique index for daily rows
   - `full_name` index for search
2. Add pagination/filter pushdown in API.
3. Add background worker for XLSX export (if needed).

## Data backfill

1. Load `people_master.xlsx` into `people`.
2. Load existing `snapshots/*.xlsx` into `daily_status_entries`.
3. Run consistency report before go-live.

## Operational checklist

1. Backup strategy:
   - DB backups (daily/incremental)
   - S3 versioning for exported snapshots
2. Monitoring:
   - API latency
   - DB errors
   - export job failures
3. Rollback:
   - Keep Excel write path until DB is validated in production.
