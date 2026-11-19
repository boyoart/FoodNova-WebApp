# Retained-orders PostgreSQL migration-only release

Branch: release/retained-orders-migration, based on origin/main be000c5f17ab11565f3d5f9f1fe91c1a4d51f52e, including PR #5/private receipt-copy release. Source: feat/customer-deletion-ledger. The migration file is copied unchanged. Only that script, tests/test_retained_orders_migration_release.py and this runbook belong to this release.

No application, model, API route, authentication, customer-security, checkout, payment/refund, invoice, receipt utility, frontend, dependency declaration or deployment configuration is changed. No full customer-deletion feature is included. No production connection, operational migration, environment change, deployment or merge into main is performed by this task.

## Schema and dependency audit

The script uses only argparse/os and existing SQLAlchemy. Production main declares Python 3.12.7, SQLAlchemy 2.0.36 and psycopg2-binary 2.9.10; no dependency update is needed. It imports no application/ORM/database configuration or receipt-copy module and cannot initialize the app. DATABASE_URL is read only after explicit --apply/--verify. The default is a no-connection plan. Errors print exception classes without driver details/credentials. No Cloudinary or filesystem-evidence operation exists in this script.

Required existing declarations were checked on current main: public.users(id, is_active, account_status, session_version); public.orders(id, customer_user_id); and order_id on public.order_items, cancellation_requests, payment_approval_logs and delivery_offers. The existing customer-security migration must already have been applied. The source script directly checks the two user security columns and existing trigger tables; the operator must check the complete prerequisite set/types below, not infer live schema from this source audit. No production schema query was performed here.

Adds four fields to existing orders:

| Column | Definition |
|---|---|
| operational_removed_at | TIMESTAMP NULL |
| personal_data_erased_at | TIMESTAMP NULL |
| retention_hold | BOOLEAN NOT NULL DEFAULT FALSE |
| retention_hold_reason | TEXT DEFAULT '' |

Installs three managed trigger functions and these six row-level BEFORE triggers:

| Table | Trigger | Events | Function |
|---|---|---|---|
| orders | foodnova_retained_order_guard | UPDATE, DELETE | foodnova_guard_retained_order |
| orders | foodnova_customer_order_guard | INSERT | foodnova_guard_customer_order |
| cancellation_requests | foodnova_refund_guard | INSERT, UPDATE, DELETE | foodnova_guard_retained_child |
| payment_approval_logs | foodnova_payment_guard | INSERT, UPDATE, DELETE | foodnova_guard_retained_child |
| delivery_offers | foodnova_offer_guard | INSERT, UPDATE, DELETE | foodnova_guard_retained_child |
| order_items | foodnova_item_guard | INSERT, UPDATE, DELETE | foodnova_guard_retained_child |

There are no UPDATE/INSERT/DELETE statements against existing business rows during migration. No customer names/emails/passwords, session versions, order/payment/refund states, financial records, invoice/receipt bytes or source references are erased or backfilled. Existing rows expose NULL timestamps, false hold and empty reason through the new defaults; they are not marked removed or erased. Reapplication preserves later hold/marker values, adds only missing fields, replaces the managed functions with the same reviewed definitions and skips existing triggers. Wrong existing trigger bindings/events or column types/nullability/hold default cause verification failure rather than a silent repair. No triggers are dropped/recreated automatically.

The database guards are active after commit even though app code is unchanged. With no erased/removed markers, ordinary existing-order operations remain allowed. New orders referencing inactive/deleted or missing users are rejected; current main already enforces active-customer checks for checkout/manual orders. The new related-record row locks can change concurrency/latency and expose legacy writers that bypass account rules. This is not a claim of zero database behavioral change or zero downtime: stage-test payment approval, receipt upload/logging, cancellation/refund, manual/guest checkout and dispatch before production approval. No customer-deletion UI/API or private receipt viewer is activated by this migration-only release.

## Transactions, locks and verification limits

All DDL/functions/triggers and final verification use one engine.begin transaction. PostgreSQL 11+ and current_schema()=public are required. The transaction sets a 5-second lock timeout and 60-second per-statement timeout and acquires nonblocking advisory transaction lock 187436922. A second migration must stop without DDL. These limits apply after initial catalog prerequisites, are not a total-run deadline and do not change global/runtime application timeouts.

ALTER TABLE/trigger installation still require locks; schedule a short approved maintenance window and review blockers/long-running transactions beforehand. Constant defaults avoid a full-table rewrite on supported PostgreSQL versions, but do not make ALTER TABLE lock-free. Child/customer guards use SELECT FOR UPDATE; concurrency conflicts/deadlocks must roll back, never bypass retention checks. See [PostgreSQL locking](https://www.postgresql.org/docs/current/explicit-locking.html), [ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html) and [trigger behavior](https://www.postgresql.org/docs/current/trigger-definition.html).

--verify opens a read-only transaction, checks four column types/nullability and false hold default, then verifies all six enabled row triggers, their parent tables, functions and event sets. It accepts PostgreSQL's canonical event ordering. It does not prove the app's full production behavior, compare existing data to a backup, or replace the complete preflight/source review. No live PostgreSQL execution is claimed: isolated SQLite tests prove local transactional DDL rollback and original-data preservation; mocks test PostgreSQL sequencing/bindings/advisory failures. A real PostgreSQL staging rehearsal remains required.

## Exact release and Render Shell procedure — NOT EXECUTED

1. Review the three-file branch diff and checks. After separate staging access approval, take an isolated staging backup, verify the prerequisites and rehearse --apply twice, --verify, injected post-DDL failure rollback, advisory-lock contention and actual checkout/payment/refund/delivery lock scheduling. Compare original customer/order/payment/refund data and invoice/receipt checksums with preflight snapshots. Do not reset or delete staging data to make a rehearsal pass. No staging URL or production data is used in this preparation.
2. Obtain separate production merge/deployment approval. Make ONLY this migration-only release available on the current Render service through the approved release process. Keep the existing build/start commands, environment and runtime app unchanged. Do not deploy feat/customer-deletion-ledger. Deploying a new script does not execute it. Do not add it to startup/build/pre-deploy hooks.
3. Obtain separate production read/migration approval and a verified backup. In the existing Render service runtime Shell, locate repository root and verify the deployed SHA against the approved release commit. Use the existing DATABASE_URL; do not print/paste credentials or change environment variables. Use an authorized read-only SQL console to check the following before migration:

```sql
BEGIN READ ONLY;
SELECT current_database(), current_schema(), current_setting('server_version');
WITH required(table_name, column_name) AS (VALUES
 ('users','id'), ('users','is_active'), ('users','account_status'), ('users','session_version'),
 ('orders','id'), ('orders','customer_user_id'), ('order_items','order_id'),
 ('cancellation_requests','order_id'), ('payment_approval_logs','order_id'), ('delivery_offers','order_id')
)
SELECT r.table_name, r.column_name AS missing_column
FROM required r LEFT JOIN information_schema.columns c
 ON c.table_schema='public' AND c.table_name=r.table_name AND c.column_name=r.column_name
WHERE c.column_name IS NULL;
ROLLBACK;
```

Expect the intended foodnova database, public schema, PostgreSQL 11+, and **zero missing-column rows**. Independently check users.is_active is boolean, account_status textual, session_version integer, and order/user IDs compatible integers. A missing or incompatible prerequisite is STOP; do not run the migration or alter unrelated schemas to force success. If the four new fields/triggers already exist, review their definitions and use the idempotent path only after approval; never drop them to create a fresh test.

Use an approved existing database role with ownership/ALTER rights on orders, TRIGGER rights on the five target tables, CREATE FUNCTION in public and required catalog/related-row privileges. Future invoking roles need the existing SELECT/row-lock privileges on users/orders. Do not grant new privileges automatically or embed alternate credentials in the command. Review actual function/column definitions in preflight; the script's verification checks type families/bindings, not an independently signed function-body digest.

From repository root, one command at a time:

```sh
# Safe plan only: no database connection
python backend/scripts/migrate_retained_orders.py

# ONLY after staging PASS, backup and explicit production migration approval
python backend/scripts/migrate_retained_orders.py --apply

# Require apply exit 0, then perform read-only schema verification
python backend/scripts/migrate_retained_orders.py --verify
```

If Shell starts in backend/, use python scripts/migrate_retained_orders.py with the same options. Require exit 0 and the explicit committed/verification-passed messages. On any failure stop; do not deploy/activate the full feature or increase timeouts/kill sessions automatically. The CLI intentionally hides detailed driver messages; investigate securely with the DBA.

4. Confirm new field values reflect only defaults and existing original fields/counts/financial references match the approved preflight snapshot. Existing holds/markers must be preserved on repeat application. Inspect all six pg_trigger bindings/enabled states and the three managed function definitions against this reviewed source. Verify ordinary customer-security/checkout/payment/refund/receipt/invoice/dispatch paths with authorized non-destructive checks. No live deletion, refund transfer or paid order creation is an acceptable automatic smoke test.
5. Keep the full deletion/ledger backend and its storage/privacy flags out of this release. The private receipt-copy utility and all private evidence files remain unchanged; do not run receipt copying, modify Cloudinary access or toggle PRIVATE_RECEIPT_UPLOADS_ENABLED/RETAINED_PAYMENT_EVIDENCE_PROTECTED as part of this migration-only rollout. A later feature activation requires its own approvals and evidence/storage gates.

## Rollback precautions

An error before commit rolls PostgreSQL DDL back. After successful commit, retain additive fields/functions/triggers, rows and financial/audit evidence. Reverting this script-only application release does not remove database guards. There is no automatic destructive down migration, trigger-disable step, data restore, cascade deletion or customer erasure in this release.

Prefer a forward fix. If an installed guard exposes an unexpected legacy writer, pause the affected workflow and obtain a reviewed DBA plan; do not automatically drop/disable the guard or fabricate settlement state. If a future full feature has set removed/erased markers, removing guards or restoring pre-erasure backups can violate historical-record/privacy protections. Use that feature's security-aware rollback plan then. This migration never supplies a reason to reset a database or overwrite invoice/receipt backups.

## Manifest and validation

Exactly three changed files: backend/scripts/migrate_retained_orders.py (unchanged source copy), tests/test_retained_orders_migration_release.py (isolated contracts), RETAINED_ORDERS_MIGRATION_RELEASE.md (this runbook). Dependencies, app/models/routes/frontend, and both private receipt-copy files remain byte-identical to production base.

Validation covers the four exact definitions, six trigger contracts, declared main-schema prerequisites, missing fields/tables, existing-data preservation, idempotency, post-DDL rollback, PostgreSQL advisory/schema/version failures, trigger verification and read-only CLI behavior. Real production/staging PostgreSQL migration, mount/storage verification, environment changes and deployment are NOT EXECUTED. Record actual live rehearsal results before approving production execution.

Results: 29 isolated migration tests and the 20 existing standalone receipt-copy tests passed (49 total). Python syntax checks, isolated import/plan smoke checks, dependency verification and Git whitespace/scope checks passed. The staged migration blob matches the source branch exactly. No new dependencies or frontend tests/build are needed for this script-only release.
