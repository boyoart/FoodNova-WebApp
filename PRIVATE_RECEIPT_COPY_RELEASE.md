# Standalone private receipt copy release

Branch: release/private-receipt-copy. Base: fetched production origin/main at a20be35 (PR #3 merged). Source: feat/customer-deletion-ledger at 563929b. The two utility files are copied unchanged from that source. Only those files, the isolated test file and this runbook belong to this release. No models, API, authentication, receipt viewer, upload handler, frontend, dependency declaration or start/deploy configuration is changed.

## Compatibility and audit

Runtime dependencies are already on main: SQLAlchemy 2.0.36 and psycopg2-binary 2.9.10, plus Python standard library modules. Main declares Python 3.12.7, compatible with the utility. services/__init__.py is already present and empty. The utility imports no application/database configuration, ORM, FastAPI, Cloudinary SDK or feature-branch module beyond services/receipt_evidence.py. It cannot activate the new customer-deletion/retained-order backend.

Required existing production columns are orders.id, orders.receipt, payment_approval_logs.id, payment_approval_logs.order_id and payment_approval_logs.receipt_url. These are present in origin/main's model declarations and are the only data columns selected. The tests use just those five columns, without any retained-order fields, new tables or startup migration. This is source/schema-contract verification, not a live production schema query.

The utility reflects existing tables and selects all current/order-log receipt references. PostgreSQL transactions explicitly use REPEATABLE READ and SET TRANSACTION READ ONLY before reflection/selects; there is no DDL, DML, ORM session, commit, trigger installation, URL rewrite, customer/order removal or payment/refund action. SQL capture tests reject writes during local execution; a mocked PostgreSQL test checks transaction ordering. No production connection was made to confirm permissions or live data.

Cloudinary access is HTTP GET only to pinned HTTPS res.cloudinary.com/<cloud>/image/upload/v<version>/<original path>. Alternate accounts, transformations, unversioned paths, query strings, traversal and redirects fail preflight. No Cloudinary API credentials are required or sent. There is no rename, upload, delete, access-control, cache-invalidation or asset-overwrite operation. Unexpected/local/raw/data sources require a separately reviewed import; they are not silently omitted.

Files are content-addressed, SHA-256 checked after copying and before verification, capped at 10MB and published atomically without overwriting existing evidence. Duplicate runs reuse verified originals; corrupt copies fail rather than silently downloading/replacing them. Current and historical approval-log references are included and deduplicated. Manifests use hashes, counts and internal record IDs, without URLs, customer data, original filenames or driver error strings. SHA-256 validates the bytes received against private copies; no historical provider checksum was supplied to independently prove past asset contents.

## Existing Render disk

The operator reports an existing mount /var/data/foodnova and invoices in /var/data/foodnova/retained-invoices. Use the separate private sibling /var/data/foodnova/retained-receipts. It is under the reported mount and outside the application's public uploads directory. The utility uses standard Linux locking, hard links and fsync; creates a 0700 directory and 0600 data/index files. No disk/provider is provisioned or changed.

Render documents that persistence applies only beneath the mount, and that the disk is accessible only at service runtime—not in build/pre-deploy commands or a one-off job. Run approved copying from the existing disk-backed service's runtime shell. A disk-backed redeploy can briefly interrupt service, even when application files are unchanged. See [Render persistent disk documentation](https://render.com/docs/disks).

Compatibility is statically confirmed against the reported layout and repository runtime; actual mount ownership, free space, hard-link/fsync support, persistence and recoverable backups are NOT EXECUTED/verified here because production access is forbidden. Before an approved copy, the operator must verify those properties using the existing disk/service identity and an isolated staging rehearsal. Do not substitute an ephemeral directory or public uploads folder. Never restore an entire disk snapshot merely to undo a failed receipt copy; it can roll back unrelated retained invoices/files.

## Release commands and review gates

This task authorizes a release-branch push only. It does not authorize merging, deploying, setting production environment variables or copying production data. After reviewing the branch, separately approve making ONLY this utility release available through the existing production release process. Do not deploy feat/customer-deletion-ledger just to obtain these two files. Keep the current Render build/start commands and all running application environment settings unchanged; no startup hook invokes this utility.

Review a published release locally:

```sh
git fetch origin
git log -1 --oneline origin/release/private-receipt-copy
git diff --name-only a20be35..origin/release/private-receipt-copy
```

The diff must contain exactly:

```text
backend/scripts/migrate_receipt_evidence.py
backend/services/receipt_evidence.py
tests/test_private_receipt_copy_release.py
PRIVATE_RECEIPT_COPY_RELEASE.md
```

After a separately approved utility-only deployment, from repository root in the existing Render runtime shell, verify the deployed SHA matches the approved utility-only release. Do not print DATABASE_URL or credentials. Backup and test private storage before use. The following process-scoped variables do not change the running service's environment or behavior. The cloud name is a non-secret account identifier; obtain it from the existing provider configuration without printing API secrets.

```sh
# Plan only: no database/network/evidence-file operation
python backend/scripts/migrate_receipt_evidence.py

# Pin the existing cloud account, after operator verification.
read -r -p 'Existing Cloudinary cloud name: ' receipt_cloud_name
test -n "$receipt_cloud_name" || exit 1

# ONLY after explicit production-access/copy approval and backup:
env RETAINED_RECEIPT_STORAGE_DIR=/var/data/foodnova/retained-receipts \
    RETAINED_INVOICE_STORAGE_DURABLE=true \
    RETAINED_RECEIPT_CLOUD_NAME="$receipt_cloud_name" \
    python backend/scripts/migrate_receipt_evidence.py --apply \
    --expected-orders 22 --expected-order-receipts 7 --expected-log-receipts 7

# Require apply exit 0 and complete=true before this separately approved check.
# --verify reads the DB and private files, makes NO Cloudinary request,
# and writes a new non-sensitive verification manifest on the private disk.
env RETAINED_RECEIPT_STORAGE_DIR=/var/data/foodnova/retained-receipts \
    RETAINED_INVOICE_STORAGE_DURABLE=true \
    RETAINED_RECEIPT_CLOUD_NAME="$receipt_cloud_name" \
    python backend/scripts/migrate_receipt_evidence.py --verify \
    --expected-orders 22 --expected-order-receipts 7 --expected-log-receipts 7
unset receipt_cloud_name
```

Run one command at a time and inspect its exit status; stop on any nonzero result. If the runtime shell starts in backend/, use scripts/migrate_receipt_evidence.py instead. DATABASE_URL is read from the existing shell only with explicit --apply/--verify; there is no SQLite fallback. RETAINED_INVOICE_STORAGE_DURABLE=true is an operator attestation after checking this existing mount, not an automatic disk test. The counts 22/7/7 were previously reported by the operator and were not queried here: confirm them again in the approved window. Counts/references changing during the copy prevent a success result. Reconcile and explicitly review new expected counts instead of bypassing the check.

Inspect receipt-manifest-*.json only through a private authorized shell. Require complete=true and exit 0 for copy and verification, all expected references accounted for, correct order/log associations and no failed evidence. Unique sources may be fewer than row references; do not assume seven unique files. Back up blobs, indexes and manifests together and test recovery. Successful copies remain private; this release adds no HTTP reader for them.

## Failure, rollback and scope boundaries

Failed batches leave original Cloudinary assets and database records unchanged. Successful private copies remain for retry; interrupted publication may leave a private unreferenced blob. No cleanup/reset or source deletion is performed. A rerun resumes using verified copies; checksum corruption/conflicts require incident review and restoration from a verified private backup, not an overwrite flag.

Application rollback can restore the prior production commit while keeping private evidence untouched: no application runtime has started using it in this release. No database down migration is needed. Do not delete private evidence or restore unrelated database/invoice history as rollback. Backups and retention remain subject to the existing approved financial evidence policy.

IMPORTANT: this utility-only release does NOT include authenticated receipt viewing, private future uploads, retained-order fields/guards or customer deletion changes. It does NOT restrict old public Cloudinary delivery. Do not enable PRIVATE_RECEIPT_UPLOADS_ENABLED or RETAINED_PAYMENT_EVIDENCE_PROTECTED, change upload presets or restrict Cloudinary originals as part of this release: production's existing viewers still use those URLs. A later separately approved full feature release must coordinate authenticated viewing/private uploads, verify all copies, restrict original/derived CDN delivery and validate caches before declaring evidence protected. Copy success is not privacy completion.

## Validation

Isolated tests exercise the main-schema contract, read-only SQL/transaction ordering, default plan safety, idempotency, checksum corruption, partial-copy failure/resume, publication interruption, source/redirect validation, inventory drift, sanitized manifests/errors and public-path rejection. HTTP is mocked and database fixtures are local SQLite; no production connection, PostgreSQL rehearsal or real Cloudinary request occurs. Python syntax checks and Git whitespace/scope/source-identity checks are required. Frontend tests/build are unnecessary because frontend and application runtime files are unchanged.

Results: 20 isolated tests passed; Python syntax and isolated import/plan smoke checks passed without loading main/models/database/FastAPI; Git whitespace and scope checks passed. The two staged utility blobs match the feature branch exactly. Actual Render mount/permissions/persistence and PostgreSQL runtime execution remain NOT EXECUTED and require the later approved operator checks above.
