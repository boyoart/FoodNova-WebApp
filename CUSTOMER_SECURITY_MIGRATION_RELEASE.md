# Migration-only customer-security release

Branch: `release/customer-security-migration`, based on production main `512a76c0223c9ab8cf8ab08a9fbf143da8b88b94`. Adapted from feature `e1b3b94`; no feature runtime code is included. Only this document, the standalone migration script, and its isolated tests change. All existing untracked files are preserved.

## Scope and compatibility audit

The feature migration imports new ORM classes absent from main. This release replaces that dependency with local SQLAlchemy Core table declarations matching the feature schema. It never imports application models, database configuration, FastAPI, authentication, routes or email services. No new dependencies, startup hooks, migrations on import, or application behavior changes are introduced. It reads DATABASE_URL only when explicitly invoked with --apply or --verify, with no fallback database. Credentials and driver error strings are never printed. Existing users.session_version is required and never altered. Existing orders.manual_idempotency_key is required and reused by the later backend, not recreated here.

Adds users.account_status VARCHAR(24) NOT NULL DEFAULT 'active'; account_status_reason TEXT DEFAULT ''; account_deleted_at TIMESTAMP NULL; email_verified_at TIMESTAMP NULL; email_verification_required BOOLEAN NOT NULL DEFAULT FALSE. Adds orders.checkout_request_hash VARCHAR(64) NULL. Creates email_verification_tokens with id serial primary key, user_id nonnull users.id FK (no cascade), token_hash unique indexed VARCHAR(64), email_digest VARCHAR(64), expiry/used/created timestamps and user/expiry indexes. Creates account_action_limits with key_hash VARCHAR(64) primary key, nonnull integer count and indexed expiry timestamp. Timestamp types match the feature's naive UTC ORM fields; created_at is supplied by the feature ORM, not a database default.

Only newly introduced account_status is backfilled: existing inactive users become deactivated. Names, email addresses, hashes, session versions, orders, payments and deliveries are untouched. No customer is marked verified, blocked, suspended or logged out by this migration. Legacy verification_required defaults false; new registration enforcement comes from the later backend, not this release. Repeated application preserves subsequent statuses and verification state. Schema checks reject missing/incompatible fields, required defaults, indexes, keys and token foreign key rather than silently repairing drift.

## PostgreSQL locking audit

Requires PostgreSQL 11+; constant defaults avoid a table rewrite on those versions, but ALTER TABLE still requires ACCESS EXCLUSIVE locks. The inactive-customer backfill scans users and updates matching rows, producing WAL/dead tuples. Locks last until the single transaction commits, including new-table/index creation and verification. New-table indexes do not scan existing orders. Foreign-key creation also needs locks on users. Do not call this zero-downtime or lock-free.

The transaction uses a 5-second lock timeout, 60-second per-statement timeout, and a nonblocking advisory transaction lock to reject concurrent copies of this script. These are not an overall transaction deadline. Any error on PostgreSQL rolls the transaction back; there is no automatic retry or session termination. Use a quiet maintenance window; rehearse on a PostgreSQL staging backup with realistic row counts and long-running transactions first. Do not increase timeouts or kill blockers without DBA review. Confirm PostgreSQL version and permissions (ALTER users/orders, CREATE tables/indexes, REFERENCES users, sequence creation) first.

References: [PostgreSQL constant-default behavior](https://www.postgresql.org/docs/current/ddl-alter.html) and [ALTER TABLE locking](https://www.postgresql.org/docs/current/sql-altertable.html).

## Exact operator release and migration procedure

Nothing in this task authorizes an automatic push, merge, Render deployment or production database execution. Review the local commit first. Ensure Render auto-deploy is disabled or controlled during the approved release. After separate approval, publish and release ONLY this migration commit on top of the production main baseline using the normal reviewed workflow. Do not merge/deploy feat/customer-security-tracking. Keep existing Render start/build commands and environment unchanged. Deploying this migration-only commit makes the script available; it does not run it.

In the existing Render service shell, locate the repository root (the directory containing backend/). The commands below assume that root. Verify the deployed Git SHA matches the approved migration-only commit and that the shell's service DATABASE_URL points to foodnova, using the Render service/database UI without printing credentials. Take and verify a database backup/snapshot. Do not paste a database URL into terminal history. Existing DATABASE_URL supplies the connection.

Plan only (no database connection, safe before approval):

```sh
python backend/scripts/migrate_customer_security.py
```

After backup, staging rehearsal and explicit production execution approval:

```sh
python backend/scripts/migrate_customer_security.py --apply
```

Require exit status 0 and `Migration committed`. On failure, stop; do not activate the feature backend. A generic failure hides credentials intentionally; inspect locks/schema securely with the DBA. Rerun only after resolving the cause.

Read-only post-migration verification (exit 0 required):

```sh
python backend/scripts/migrate_customer_security.py --verify
```

Using the authorized database SQL console, run these read-only queries. Compare users/orders counts and session-version aggregates with a pre-migration snapshot taken during the same write-quiesced window; normal traffic otherwise makes aggregate comparisons inconclusive. Do not export individual customer records.

```sql
SELECT current_database(), current_setting('server_version');
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND ((table_name = 'users' AND column_name IN
    ('session_version','account_status','account_status_reason','account_deleted_at',
     'email_verified_at','email_verification_required'))
    OR (table_name = 'orders' AND column_name = 'checkout_request_hash')
    OR table_name IN ('email_verification_tokens','account_action_limits'))
ORDER BY table_name, ordinal_position;
SELECT count(*) AS customers, sum(session_version::bigint) AS versions FROM users;
SELECT count(*) AS orders FROM orders;
SELECT account_status, is_active, email_verification_required,
       count(*) AS accounts, count(email_verified_at) AS verified
FROM users GROUP BY account_status, is_active, email_verification_required;
SELECT count(*) FROM email_verification_tokens;
SELECT count(*) FROM account_action_limits;
```

For a first application before feature activation, token/limit tables are empty, verification timestamps null and required false; inactive users have deactivated status. Do not expect these values after later feature activation or alter real accounts to force a match. Smoke-test existing login, catalogue and checkout with normal authorized procedures; do not place destructive production test orders. Keep feature activation a separate release and approval.

## Rollback

Before commit, any PostgreSQL failure rolls back all migration changes. After success, retain additive schema and roll back only this migration-only application commit to baseline if necessary. Baseline ignores the new fields/tables; do not drop schema, undo customer data or restore the whole database for an application rollback. Do not run the full feature branch rollback procedure here: no verification/security enforcement was activated. If the full feature backend has subsequently been activated, use its separate security-aware rollback plan instead.

## Validation

Tests cover no-connection plan mode, explicit PostgreSQL-only execution, repeatability, preserved customers/session versions/orders, legacy inactive defaults, missing prerequisites, incompatible schema, feature-compatible PostgreSQL DDL and absence of application imports. SQLite execution and PostgreSQL compilation do not prove live PostgreSQL locking/transaction behavior. No production connection or migration is performed. PostgreSQL staging rehearsal remains a required operator gate.

Results: 10 focused tests passed; 17 existing production order-schema/index migration tests passed (the combined earlier run was 24 passes before the final three focused cases were added). Python syntax checks and plan-only execution passed. Read-only CLI, credential-error redaction and concurrent migration refusal are covered. One existing Pydantic configuration deprecation warning remains. No frontend tests/build are needed because frontend/runtime application files are unchanged.
