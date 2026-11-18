# Private retained payment receipt evidence

## Audit and scope

Extends feat/customer-deletion-ledger at e7f22a9. Operator-supplied production findings: 22 orders, 7 containing receipt data, and 7 approval logs containing public res.cloudinary.com/image/upload URLs; no local originals found. These findings were not independently queried in this task. Persistent mount /var/data/foodnova and invoice directory /var/data/foodnova/retained-invoices are operator-reported facts, not locally verified infrastructure.

Receipt flow: POST /orders/{id}/receipt and /api/orders/{id}/receipt authorize order access, call save_uploaded_receipt → upload_to_cloudinary (public upload, overwrite=false, local fallback), then store JSON on orders. create_payment_approval_log copies the original URL into payment_approval_logs. order_to_dict and payment_audit_log_to_dict expose metadata to their authorized callers. AdminOrders currently uses public img/window.open URLs for both latest and historical receipts. Customer OrderHistoryPage uploads and displays status, without a receipt download link. Payment approval/refund logic uses the existing order/payment log rows; no new payment database is appropriate. The retained ledger already requires Super Admin and guards account/order removal but previously used only an operator evidence-protection attestation.

No production database, Cloudinary account/assets or production URLs are accessed by implementation/testing. No migration, asset restriction, merge, push or deployment is authorized here.

The old backend/routes/orders.py receipt writer is not mounted by the active main.py application; it is not substituted for the active handlers. Public tracking returns receipt_uploaded only, without receipt URL/bytes. Flutter's tracking receipt flow uploads files and displays status; no mobile project is changed, rebuilt or deployed. Any externally deployed client that directly opens a receipt URL must nevertheless be tested before cutover.

## Implementation and data integrity

The existing orders.receipt and payment_approval_logs.receipt_url values remain authoritative source references. The new filesystem index contains only source SHA-256, byte SHA-256, byte count, MIME type and copy timestamp. It holds no payment state, balances, approval decisions, customer names/emails, source URLs or original filenames. It is evidence metadata, not a duplicate payment ledger. Sources shared by orders and logs are downloaded once; identical content shares a checksum-addressed blob. Historical log sources are copied even if the order's latest receipt differs.

Files live under an explicit absolute RETAINED_RECEIPT_STORAGE_DIR outside public uploads. On Linux the private directory is 0700 and newly published files 0600. An OS-released per-directory lock coordinates API workers; writes are fsynced and published atomically without overwriting existing evidence. Every access checks size, MIME magic and SHA-256. A corrupt existing copy fails rather than being overwritten/redownloaded. Copy SHA-256 is checked against the private file bytes; without a prior trusted provider checksum this establishes transport/copy integrity, not proof of what Cloudinary served in the past. No transformations or URL redirects are accepted. Only HTTPS res.cloudinary.com, the pinned cloud account, image/upload, an explicit version and a simple original public-ID path are allowed. HTTP, alternate hosts/accounts, query strings, transformations and traversal components are rejected; maximum size is 10MB. No application credentials are sent to the CDN.

The explicit utility uses SQLAlchemy Core reflection and read-only, repeatable-read PostgreSQL transactions. It does not import the application/models, start FastAPI, run DDL, update URLs, freeze orders, approve payments, change refunds or erase customers. It compares inventory before/after copying and cannot report completion if it changed. Manifests contain counts, internal order/log IDs, source IDs, checksums, sizes, types and non-sensitive failure codes; raw URLs, filenames, customer data and exception strings are omitted. Each run writes a uniquely named immutable receipt-manifest-*.json inside private storage; stdout prints only the summary/name. Back up the private index, blobs and manifests together.

Failed batches return nonzero while retaining verified successful copies. Retry resumes using validated copies, without network access for those sources. A failed index publication can leave a private unreferenced blob, which a retry can safely reuse. No failed batch rolls back or deletes original financial records or Cloudinary originals. Do not delete private artifacts automatically: reconcile them under the evidence-retention policy. Read-only `--verify` makes no Cloudinary request, but intentionally writes a new private verification manifest. Default invocation does not connect to a database, request a URL or write files.

## Authenticated access and upload cutover

- GET `/admin/orders/{id}/receipt-evidence` is for an authenticated Admin with payments:view or payments:approve. GET `/admin/historical-orders/{id}/receipt` always requires Super Admin. Both require Super Admin when the order is removed or customer identity erased.
- Optional `audit_log_id=<internal id>` selects a historical receipt only if that payment log belongs to the same order. The client never supplies a raw source URL or private filesystem path. GET `/admin/historical-orders/{id}/receipts` gives Super Admins checksum/availability metadata for all distinct sources.
- Missing/corrupt private evidence returns a generic 404 and an existing Admin Activity entry with unavailable outcome. Successful access records actor/role, internal record/source ID and authorization outcome, not source URL or customer information. No endpoint downloads or redirects to the CDN as a fallback. Responses are no-store/private, nosniff, attachment, sandboxed and no-referrer. No API token is placed in URLs. The access log records authorization/response creation, not a guarantee that the browser completed the transfer.
- All `/uploads/receipts` static access is denied; invoices remain protected by the existing ledger implementation. The private directory must never be mounted by StaticFiles, a proxy or a public CDN. FoodNova cannot revoke URLs served directly by Cloudinary: see the required provider phase below.
- Admin Orders uses the existing authenticated Axios client with responseType=blob for current and historical receipts. Images/PDFs open as short-lived local object URLs, revoked after a minute, rather than public img/window.open URLs. Admin receipt emails link to the authenticated Admin Orders page; no raw CDN or private-file URL is emailed. Approval/history rows and status logic are unchanged.
- PRIVATE_RECEIPT_UPLOADS_ENABLED=true stores future JPG/PNG/WEBP/PDF uploads directly on the same private disk, returning an internal opaque receipt reference through the existing order upload API. Existing payment approval logging carries that reference forward. Invalid bytes fail; disk/configuration failure returns 503 with no public fallback. With this flag false, the historical public upload flow remains available ONLY for the pre-cutover phase. If RETAINED_PAYMENT_EVIDENCE_PROTECTED=true while private uploads are false, uploads fail closed instead of accidentally recreating public evidence.
- On PostgreSQL, customer erasure/order removal now independently verifies all current and historical private receipt copies in addition to requiring the existing guards/storage/protection attestations. Setting a flag alone cannot bypass missing/corrupt evidence. No account, invoice, tracking, session, refund or checkout safeguard is relaxed.

## Staging rehearsal and later approved Render configuration

No new schema migration is necessary for receipt copies. The earlier retained-order columns/triggers remain prerequisites for customer/order destructive actions, and are not run by this utility. Use a separate isolated staging fixture and mocked/test assets before any approved production copy. Test current/log-only receipts, duplicate copies, partial failures, backend transaction rollback, evidence corruption, UI authorization, private upload and restore from backup. Real PostgreSQL retention-trigger concurrency and mount persistence remain separate staging gates.

The full branch backend still requires the earlier retained-order columns before its ORM/API is deployed. Follow that runbook's separately approved schema rollout first. The receipt utility plus services/receipt_evidence.py can be made available on the existing service independently: neither imports the new ORM, API or application startup. Do not deploy the full feature backend merely to make the copy utility available if its schema prerequisites are not yet installed.

Later, with explicit configuration/deployment approval, the existing persistent disk can host:

```text
RETAINED_INVOICE_STORAGE_DIR=/var/data/foodnova/retained-invoices
RETAINED_INVOICE_STORAGE_DURABLE=true
RETAINED_RECEIPT_STORAGE_DIR=/var/data/foodnova/retained-receipts
RETAINED_RECEIPT_CLOUD_NAME=<actual existing Cloudinary cloud name, no secret>
```

Do not add API secrets to VITE_* variables or manifests. Keep DATABASE_URL, JWT_SECRET and existing payment/Resend configuration unchanged. The supplied mount path is not proof of backup/restoration: verify service-user ownership, private permissions, free space, restart persistence and a recoverable backup. All API workers must see this same mounted directory. Separate replicas without shared evidence fail closed and need an approved storage plan; no new storage provider is introduced here.

## Explicit copy commands — prepared, NOT RUN

After staging PASS, backup, approved release of the utility to the existing service, and separate production-access authorization, run from repository root in the existing Render shell. Use its existing DATABASE_URL without printing it. In a controlled quiet window, confirm the expected counts again: the numbers below are the operator's supplied snapshot, not hardcoded facts. Unexpected new orders/receipt logs require reviewed refreshed counts and a rerun, never suppressing the inventory-change failure. Avoid receipt uploads/approval changes during final verification/cutover.

```sh
# Plan only: no DB/HTTP/filesystem access
python backend/scripts/migrate_receipt_evidence.py

# Explicit private copy; DB read-only, source assets unchanged
python backend/scripts/migrate_receipt_evidence.py --apply --expected-orders 22 --expected-order-receipts 7 --expected-log-receipts 7

# Check every current/log reference locally; no Cloudinary request
python backend/scripts/migrate_receipt_evidence.py --verify --expected-orders 22 --expected-order-receipts 7 --expected-log-receipts 7
```

Require exit 0 and complete=true for both explicit runs. Inspect the private manifests through an authorized shell, not a public download. Fourteen row references do not necessarily mean fourteen originals: unique_sources is measured by URL/reference identity and content blobs are deduplicated further. Do not assume seven unique files without the resulting inventory. Test representative Super Admin latest/historical downloads and an authenticated payment-reviewer active-order download, plus negative unauthenticated, wrong-order log, missing/corrupt evidence and retained non-Super cases. Compare private file checksums and verify original DB receipt/approval/refund/invoice/audit records are unchanged.

Migration alone is not privacy completion. First release the authenticated backend viewer and copied evidence, then coordinate the new frontend and PRIVATE_RECEIPT_UPLOADS_ENABLED=true so new submissions remain private. Existing local receipt URLs are intentionally unavailable after this backend release; the supplied production finding is that none exist. If staging/updated inventory finds local/data/raw/transformed sources, stop and prepare a separately reviewed import; the utility will not silently skip or fetch unsupported sources. Refresh Admin browsers to the new viewer bundle before restricting old URLs. Do not turn on RETAINED_PAYMENT_EVIDENCE_PROTECTED until the following provider phase passes.

## Separate Cloudinary restriction phase — approval required, not automated

A private filesystem copy, an upload preset change or Strict Transformations does NOT revoke an existing `/image/upload` original. Cloudinary's authenticated delivery type protects original and derived assets; private delivery alone can leave derived assets public. See [access-control documentation](https://cloudinary.com/documentation/control_access_to_media).

An authorized Cloudinary administrator must identify ONLY the original receipt assets in the pinned account using the existing order/log references, keeping actual URLs/public IDs out of general reports. Inventory derived formats, alternate/versioned URLs, custom domains, caches and unsigned upload presets. After checksum copies, private restore test and authenticated viewer acceptance, use an account-supported restriction mechanism:

1. Prefer changing each selected receipt asset's delivery type from upload to authenticated via the documented Upload API rename operation with `resource_type=image`, source `type=upload`, target `to_type=authenticated`, and `invalidate=true`. This is a **separate provider mutation**, not part of the copy utility. Use a reviewed public-ID mapping that cannot overwrite/collide with an existing authenticated asset; do not rename/delete/overwrite unrelated product or hero assets. Asset bytes and original accounting references are preserved. The old DB URL stays as the immutable source-index key; the application no longer fetches it. [Rename API parameters](https://cloudinary.com/documentation/image_upload_api_reference#rename_method).
2. If the account supports asset-level token access_control, a provider-approved Restricted/token-only policy without anonymous access windows is another option. Validate plan/CDN support with Cloudinary first. Do not use the deprecated access_mode parameter as a release recipe. [Current Admin API](https://cloudinary.com/documentation/admin_api), [asset access control](https://cloudinary.com/documentation/control_access_to_media).

Changing delivery type without cache invalidation is insufficient. Verify propagation and cache policy with Cloudinary, including all old versioned URLs, already-generated transformations and aliases; changing originals does not recall previously downloaded emails/browser copies. See [CDN invalidation considerations](https://cloudinary.com/documentation/invalidate_cached_media_assets_on_the_cdn). After the operator-approved provider phase, test anonymously from fresh unauthenticated contexts that old original/derived URLs return denial/not-found rather than 200, and that FoodNova still serves the exact verified private bytes to authorized users. Do not log response bodies, URLs, credentials or receipt screenshots in general reports. Keep assets restricted and investigate any remaining public 200. Product images must remain unaffected.

Only after those checks, a separately approved operator may set RETAINED_PAYMENT_EVIDENCE_PROTECTED=true. The utility never renames, deletes, invalidates, changes access controls or overwrites Cloudinary assets. No Cloudinary setting has been inspected or changed during this task.

## Rollback and retention

No database URLs, payment approvals, refunds or invoices are rewritten by this copy operation, so there is no database down migration. A failed run returns nonzero and leaves source originals plus successful private copies intact for retry. A later order-transaction rollback can leave an unreferenced private object; it is inaccessible through order endpoints without a matching authorized DB reference. Do not auto-delete potential evidence. Restore corrupted copies from a verified private backup under a separate incident procedure; the utility refuses immutable conflicts and never repairs them by silently replacing bytes.

Do not roll the frontend back to public receipt links or disable private uploads after declaring protected mode. Keep the authenticated viewer/backend compatibility patch and private disk/index on any rollback. Do not make restricted originals public to work around a broken viewer. If copies or auth are unavailable, pause receipt viewing/uploads/destructive actions, retain safeguards and forward-fix or restore the private backup. A source asset restriction rollback is a separately approved Cloudinary operation, not part of application rollback. Retain finite approved financial-evidence retention/access rules and backups from CUSTOMER_DELETION_LEDGER_RELEASE.md; no new evidence purge job is introduced.

## Changed files and validation

backend/services/receipt_evidence.py (private store/integrity/allowlisted copy); backend/scripts/migrate_receipt_evidence.py (explicit read-only inventory/copy/verify/manifests); backend/routes/retained_orders.py (authenticated receipt endpoints); backend/services/retained_orders.py (coverage gating); backend/main.py (private future uploads/static denial); backend/email_service.py (authenticated review links); frontend/src/services/api.js and frontend/src/pages/AdminOrders.jsx (authorized blob viewing); tests/test_receipt_evidence.py and frontend/test/receipt-evidence.test.mjs (regressions); CUSTOMER_DELETION_LEDGER_RELEASE.md and this runbook.

Validation uses only mocked HTTP, temporary private directories and local test databases. Real Cloudinary downloads, migration of the reported seven assets, provider restriction/cache checks, production permissions/persistence and browser/mobile acceptance are NOT EXECUTED. Existing PostgreSQL concurrency rehearsal remains opt-in; no production access, migration, deployment, merge or push occurs in this task.

Automated results: full backend suite 290 passed plus 16 subtests, with the existing real-PostgreSQL test skipped; 24 focused receipt tests passed (overlapping the full suite and covering the additional final policy/upload guards); final locked-download/role checks also passed; 94 frontend tests, lint and production build passed. Python syntax and whitespace checks passed. Existing framework/UTC warnings remain non-blocking. Before cutover, confirm all approval-log references belong to the expected original orders; orphan/unexplained relationships need reconciliation, not replacement accounting rows.
