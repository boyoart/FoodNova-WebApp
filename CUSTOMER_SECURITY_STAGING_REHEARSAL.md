# Customer-security PostgreSQL staging rehearsal

## Current result: NOT EXECUTED

Reviewed PR [#2](https://github.com/boyoart/FoodNova-WebApp/pull/2): open/unmerged, head `d38140ad49c0c64bbf1745636fea966c9e2b5e59`, base `512a76c0223c9ab8cf8ab08a9fbf143da8b88b94`. Local migration and runbook match that head. No configured staging PostgreSQL URL, Render connector/CLI, or psql executable was found in this environment. No database connection was attempted. A database display name alone does not prove isolation. Staging isolation, live prerequisites, transactions/locks/rollback, real apply/verify, data preservation and live backend compatibility are therefore **NOT EXECUTED**, not PASS.

Application and migration code remain unchanged. New preparation files are a standalone staging runner, offline safety tests, and this runbook. No branch, commit, PR, deployment or database is changed by preparing these files. Existing local/untracked work is retained. The runner is not a production deployment command and must never be invoked against production.

## Gate 1: independently prove isolation before connecting

In the authenticated Render control panel, select the existing resource **foodnova-staging-db**. Record its resource ID, host, logical database name, environment/project association and allowed users in a secure operator record. Verify the ID and endpoint are different from production using provider metadata only; **do not connect to production**. A hostname containing “staging” is insufficient evidence. Check that the staging backend and any workers point to this resource, not production. Use staging-only credentials that cannot access production. Do not paste connection URLs, passwords, customer records or screenshots containing secrets into reports.

If the resource, identity, independent endpoint or permissions cannot be verified, stop and retain NOT EXECUTED. The runner requires exact host and logical database pins obtained from this provider record; it rejects the known production logical name `foodnova`, generic system databases and libpq override URL options. If staging shares that logical name, this runner intentionally refuses it: do not rename/reset data to bypass this guard; request a separately reviewed DBA procedure.

## Gate 2: preserve staging and establish a quiet window

Obtain a staging backup/snapshot and document its identifier. Do not restore, truncate, delete, reset or reseed the existing staging database. Quiesce **only staging** application writers, workers and scheduled tasks through normal operator controls; prevent test traffic during the run. Do not deploy a new application or change production service settings. The rehearsal keeps additive migration results in staging after successful application. If already migrated, it stops rather than dropping fields to recreate a first-application test. Record that case and plan a separately approved isolated clone; do not reset this staging database.

Requires PostgreSQL 11+, existing SQLAlchemy/psycopg2 dependencies, public schema and schema-owner privileges for users/orders and creating the two new tables/indexes. Required prerequisites are users.id, users.is_active, users.session_version and orders.id, orders.manual_idempotency_key. The runner checks them through the reviewed migration before DDL and reports only pass/fail. For independent inspection, the following is read-only and must be executed **only in the identified staging SQL console**:

```sql
BEGIN READ ONLY;
SELECT current_database(), current_schema(), current_setting('server_version');
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'users' AND column_name IN ('id','is_active','session_version'))
    OR (table_name = 'orders' AND column_name IN ('id','manual_idempotency_key')))
ORDER BY table_name, column_name;
ROLLBACK;
```

Expect exactly those five column names across the two tables. A missing prerequisite is FAIL/STOP; do not alter unrelated production schemas to make this test pass.

## Exact staging commands (PowerShell, repository root)

These commands are prepared, not executed against PostgreSQL. Use the unchanged migration at `d38140a`. No automatic dependency installation, checkout, reset, merge, push or deployment is required. The new runner verifies a normalized SHA-256 of that migration before connecting. Do not update the pin merely to suppress a mismatch; review any changed migration first.

```powershell
python backend/scripts/rehearse_customer_security.py
# Prints NOT EXECUTED; no connection.

# Set pins from the independently verified Render staging resource metadata.
$env:STAGING_RESOURCE_NAME = 'foodnova-staging-db'
$env:EXPECTED_STAGING_HOST = Read-Host 'Verified staging host (no credentials)'
$env:EXPECTED_STAGING_DATABASE = Read-Host 'Verified staging logical database name'
$env:EXPECTED_STAGING_PORT = '5432'     # Use the port from the verified resource record
$env:STAGING_ISOLATION_CONFIRMED = 'yes'  # ONLY after Gate 1
$env:STAGING_WRITERS_PAUSED = 'yes'      # ONLY after Gate 2

# Secure prompt avoids putting the URL into shell history. Do not echo the variable.
$stagingSecret = Read-Host 'Staging-only PostgreSQL URL, with ?sslmode=require' -AsSecureString
try {
    $env:STAGING_DATABASE_URL = [System.Net.NetworkCredential]::new('', $stagingSecret).Password
    python backend/scripts/rehearse_customer_security.py --execute
    if ($LASTEXITCODE -ne 0) { throw 'Staging rehearsal failed; do not promote' }
} finally {
    Remove-Item Env:STAGING_DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Variable stagingSecret -ErrorAction SilentlyContinue
}
```

Do not set the application's DATABASE_URL to staging or production for this procedure. The runner uses only STAGING_DATABASE_URL and temporarily scopes the reviewed migration's CLI calls to it, restoring any prior process value. It never loads backend/.env, models or FastAPI, starts the backend, sends emails or calls payment providers. URL query options are limited to required TLS; driver exceptions and fingerprints are not printed. Use a clean shell without PG* environment variables: libpq options such as PGHOSTADDR/PGSERVICE could otherwise override endpoint selection, so the runner refuses them before connecting. Host, port and database must all match the independent provider record.

## What execution proves and leaves behind

1. Pin and connected database/version/public-schema checks, plus migration prerequisites. Provider isolation remains an independently recorded operator check, not something a SQL database name proves.
2. In-memory keyed fingerprints and row counts of **every existing public base table and every original column**, sorted deterministically. This covers users (including session versions), orders/payment fields, order_items, payment_approval_logs and any separate payment/invoice/delivery tables actually present. No assumption of a standalone payments table: current production stores payment state on orders and approval records. No rows or hash values are exported. All writers must stay paused; concurrent changes invalidate comparisons.
3. A held migration advisory lock must reject a second migration without changing schema/data.
4. A short ACCESS SHARE lock on users must force ALTER TABLE's lock wait to fail with PostgreSQL `55P03` after the script's five-second bound. The blocker is always rolled back. Schema, sequences and original data must match the baseline afterward. This is controlled blocking on isolated staging, not destructive SQL.
5. A real `SELECT 1 / 0` error (`22012`) injected after the migration's DDL/backfill/verification but before commit must roll everything back, including new tables/sequences. No DROP, DELETE, TRUNCATE or cleanup/reset statement is used.
6. Call the actual reviewed CLI `--apply`, then `--verify`, requiring exit 0. The verification path is read-only. Compare every original column/row with its baseline; check only the intended legacy status/verification defaults. Original records are not modified to manufacture test cases.
7. Call the same CLI `--apply` and `--verify` again. Complete migrated schema and all data must remain identical. Successful additive schema remains in staging. A later failure does not undo an already committed apply: inspect it securely and retain data; do not automatically clean up.

Sorting/fingerprinting reads full staging tables; the runner uses a 60-second per-statement limit for snapshots and keeps only counts/keyed digests in memory. It does not print or persist PII. Use a suitably sized quiet window. Existing migration locks/timeout semantics remain unchanged: 5s lock waits, 60s per statement, not a total-run deadline. On failure, do not increase timeouts or kill sessions automatically. Re-enable staging writers only through normal operator review after recording the result, including any partial application.

## Compatibility with production backend

Static compatibility: migration-only PR changes no authentication, models, routes, checkout, payment or order handlers. New fields are additive with defaults/nullability; new tables do not cascade into history. Existing users.session_version is reused, not changed. Baseline main remains `512a76c`; diff against it must list only the original migration/runbook/tests. The rehearsal preparation adds no runtime files. No feature backend is activated by applying this schema.

Runtime compatibility is a separate **staging** check, not inferred from schema equality. With current production backend code/configuration isolated on staging (external payment/email calls disabled through existing staging configuration), resume normal staging service and use existing authorized, non-mutating login/current-account, catalogue and order-list smoke checks. No destructive test orders, automatic startup/import checks (startup may mutate schema), or production API calls are part of this runner. Record these manual checks separately. Do not label overall readiness PASS until this check and the provider isolation evidence are complete.

## Concise result sheet

| Check | Current result |
|---|---|
| PR #2 unmerged, head d38140a | PASS (read-only GitHub inspection) |
| Migration/runbook review; runtime files unchanged | PASS (static) |
| Offline guard and migration tests | PASS — 29 tests; syntax and no-connection plan checks passed |
| Provider-confirmed staging isolation | NOT EXECUTED — no access |
| Live PostgreSQL prerequisite columns | NOT EXECUTED |
| Advisory/table locks and real failure rollback | NOT EXECUTED |
| --apply, --verify, repeatability | NOT EXECUTED |
| Customer/order/payment data unchanged | NOT EXECUTED |
| Existing backend staging runtime smoke checks | NOT EXECUTED |
| Overall PostgreSQL rehearsal | **NOT EXECUTED; not cleared for production** |

## Exact production commands — later approval only, DO NOT RUN NOW

After documented staging PASS, separate approval, production backup and a reviewed migration-only deployment (without activating the feature backend), use the **existing production Render service shell** at repository root. Verify its deployed SHA matches the approved PR #2 migration-only release through normal release controls. Keep its existing DATABASE_URL unchanged. Never copy the staging runner or staging credentials into production configuration.

```sh
python backend/scripts/migrate_customer_security.py
python backend/scripts/migrate_customer_security.py --apply
python backend/scripts/migrate_customer_security.py --verify
```

Require exit 0 for each step. If Render shell starts in backend/, use `python scripts/migrate_customer_security.py` with the same options. No PR merge or production deployment is performed by this preparation. Use CUSTOMER_SECURITY_MIGRATION_RELEASE.md for post-migration SQL verification and the additive-schema retention rollback policy. Feature activation requires its own approval/release.
