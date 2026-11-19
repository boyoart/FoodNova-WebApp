# Final customer-deletion and archived-order release

## Integration record and scope

Feature branch: `feat/customer-deletion-ledger`, previously `563929bf42e8198b818232ab8827e1531c778029`. Production integration base: `origin/main` at `182b0fa` (retained-orders migration PR #6, including private receipt-copy PR #5). Main merged cleanly without replacing feature code. The production versions of `backend/scripts/migrate_customer_security.py`, `backend/scripts/migrate_retained_orders.py`, `backend/scripts/migrate_receipt_evidence.py` and `backend/services/receipt_evidence.py` remain byte-identical to this main base. The merge adds the two standalone release runbooks and their isolated regression tests. This checklist is the only new release-preparation implementation file.

No production connection, migration, provider mutation, environment change, main merge or deployment is performed by this preparation. A script merged into main is not evidence that its schema was applied. Earlier runbooks describe their own historical release scope; this checklist governs the combined feature cutover. Follow [schema procedure](RETAINED_ORDERS_MIGRATION_RELEASE.md), [receipt procedure](RETAINED_RECEIPTS_RELEASE.md), [standalone copy](PRIVATE_RECEIPT_COPY_RELEASE.md), [account-security procedure](CUSTOMER_SECURITY_RELEASE.md) and [ledger policy](CUSTOMER_DELETION_LEDGER_RELEASE.md) for details.

## Compatibility and safeguards reviewed

- The feature ORM requires `orders.operational_removed_at` and `personal_data_erased_at` (nullable timestamps), `retention_hold` (boolean, not null, false default) and `retention_hold_reason` (text, empty default). Existing `users.session_version` is reused. No new schema change is introduced here.
- All six production guards remain authoritative: `foodnova_retained_order_guard`, `foodnova_customer_order_guard`, `foodnova_refund_guard`, `foodnova_payment_guard`, `foodnova_offer_guard`, `foodnova_item_guard`. They protect retained orders and financial children, and serialize customer/order creation. Verify their actual events, bindings, enabled state and function definitions against the migration before deploying the feature.
- Account deletion and operational order removal require server-side Super Admin authorization, exact typed confirmation, a reason, transaction-local lock timeouts, row locks and the existing activity log. Operational removal keeps the order row and accounting relationships; normal archived/search views exclude it. No payment/invoice/refund cascade deletion is added.
- Cancelled unpaid closed orders can qualify. Cancellation alone does not settle a paid order: pending/approved refunds, unknown/disputed payment states, unsettled collections, legal holds and active fulfilment/assignments block removal with order/request identifiers and remedies. Paid cancellations without recorded processed refunds deliberately remain blocked; alternative settlement policy requires a separate reviewed change.
- Customer erasure revokes sessions and recovery/tracking tokens, replaces login identity with a random non-identifying internal tombstone, clears profile/contact/address data and contact copies, and preserves restricted original invoices, receipt evidence, financial rows and audit history. Historical ownership uses internal user IDs; re-registration with the former email must not grant old-order access. External media, backups and retained invoices require an approved finite retention policy, not an assertion that every copy of personal data disappears.
- Private receipt endpoints use existing payment permissions for active orders and Super Admin access for retained/erased orders. Historical log IDs must belong to the requested order. Verified private bytes only: no CDN redirect/fallback, public static receipt/invoice access, or credentials in URLs. Missing/corrupt evidence fails closed. On PostgreSQL, receipt-bearing destructive actions additionally require the protection attestation and verification of every current/historical copy.
- Existing checkout idempotency, inventory, payment/refund state transitions, invoice originals, dispatch, email verification and tracking authorization are preserved. Unit/contract regressions do not replace a real PostgreSQL concurrency and deployment rehearsal.

## Mandatory release gates — STOP until signed off

1. Rehearse on an isolated PostgreSQL staging database: schema prerequisites, apply/reapply/verify, DDL rollback, advisory-lock contention, customer-delete versus checkout races, child-trigger enforcement and ordinary checkout/payment/refund/receipt/invoice/dispatch paths. The opt-in real PostgreSQL test is not a substitute for complete operational acceptance. Never point test commands at production.
2. Obtain approved database and private-disk backups, verify restoration in isolation, document RPO/RTO, service ownership, capacity and restart persistence. Preserve private source indexes, blobs and manifests together. Confirm all workers see the same existing Render mount; independent replicas require an approved storage plan.
3. Independently confirm the production schema and prerequisite tables. Main's published migration is not proof of live installation. Verify original financial counts/references and invoice/receipt hashes before and after approved cutover. Do not log credentials or customer data.
4. Approve finite financial/legal evidence retention, access and backup-expiry procedures. Resolve orphan/unsupported receipt references; never skip them, fabricate settlement, disable triggers or overwrite originals to pass checks.
5. Verify authenticated UI/role behavior on staging, desktop and mobile: archived removal, exact blockers, customer disappearance, revoked sessions, same-email re-registration isolation, active versus retained receipt access, audit persistence, checkout cart preservation, payment approval/refunds/invoices/dispatch. Use synthetic customers/orders; no live destructive smoke tests.

## Exact activation order — operator instructions, NOT executed

Keep destructive customer/archive operations under an explicit operational freeze until final sign-off. There is no global deletion-enable flag: the evidence flag gates receipt-bearing records, not every no-receipt account.

1. Obtain separate production deployment/migration/provider approvals after staging PASS and backup/restore PASS. Verify the approved commit and retain the current known-good release. Do not change authentication/payment/email secrets, start commands, or migration history.
2. Before deploying the full feature ORM, use the already released standalone tools on the existing Render service to verify prerequisites and schema. From repository root in its runtime Shell (never echo `DATABASE_URL`):

   ```sh
   python backend/scripts/migrate_retained_orders.py
   python backend/scripts/migrate_retained_orders.py --verify
   ```

   If verification fails because the approved additive migration is not installed, STOP. Only after explicit migration approval and the complete preflight in its runbook:

   ```sh
   python backend/scripts/migrate_retained_orders.py --apply
   python backend/scripts/migrate_retained_orders.py --verify
   ```

   Require success and independently review all four fields, six triggers and three function bodies. Never drop/recreate fields/guards to force a clean result. No schema command was executed during release preparation.
3. Verify the existing persistent mount and private original invoice location. Configure the following backend-only settings through the separately approved deployment process, preserving invoice filenames/bytes and private permissions:

   ```text
   RETAINED_INVOICE_STORAGE_DIR=/var/data/foodnova/retained-invoices
   RETAINED_INVOICE_STORAGE_DURABLE=true
   RETAINED_RECEIPT_STORAGE_DIR=/var/data/foodnova/retained-receipts
   RETAINED_RECEIPT_CLOUD_NAME=<verified existing account name>
   PRIVATE_RECEIPT_UPLOADS_ENABLED=false
   RETAINED_PAYMENT_EVIDENCE_PROTECTED=false
   ```

   Durable=true is an operator attestation after persistence/restore checks, not a feature that provisions storage. If original invoices are elsewhere, reconcile and preserve them before switching paths. Do not expose these directories via StaticFiles/proxy/CDN. Do not introduce a new provider.
4. Copy all existing current and approval-log receipt originals with the standalone utility. Re-census under an approved quiet window. These example counts are operator-reported historical figures, not newly verified facts; replace only with reviewed current counts if they changed:

   ```sh
   python backend/scripts/migrate_receipt_evidence.py
   python backend/scripts/migrate_receipt_evidence.py --apply --expected-orders 22 --expected-order-receipts 7 --expected-log-receipts 7
   python backend/scripts/migrate_receipt_evidence.py --verify --expected-orders 22 --expected-order-receipts 7 --expected-log-receipts 7
   ```

   Require exit 0 and complete=true, stable inventory, verified hashes, non-sensitive manifests and a private restore test. The DB is read-only and Cloudinary originals unchanged. Verify writes a private manifest; it is not filesystem-read-only. Failed batches retain successful copies for retry and must not be declared complete. Counts of row references do not prove the number of unique originals.
5. Deploy the approved full backend and matching frontend together through normal reviewed Render/Vercel procedures, after schema verification. Keep destructive actions frozen and evidence-protected=false. Existing public static receipt URLs become unavailable: verify all source inventories and the authenticated viewer first. Refresh Admin browsers to the new bundle. Preserve existing `VITE_API_BASE_URL`, backend CORS/link origins, `DATABASE_URL`, `JWT_SECRET`, payment, Resend, analytics and consent settings. No new frontend flag is required.
6. With private directories and the authenticated viewer verified, enable backend `PRIVATE_RECEIPT_UPLOADS_ENABLED=true`; keep `RETAINED_PAYMENT_EVIDENCE_PROTECTED=false`. Test a synthetic private upload, approval-history reference, authorized private viewing and backup recovery on staging. Verify no public fallback and no new public originals. During the approved quiet window copy/verify any final public-upload delta and re-census. Existing live financial state must not be changed as a smoke test.
7. Separately authorized Cloudinary administrators must restrict only the inventoried original receipt assets and their derived/alternate deliveries. Follow the provider procedure in RETAINED_RECEIPTS_RELEASE.md: account-supported authenticated delivery conversion with cache invalidation, or a reviewed token-only access-control policy. Private delivery or Strict Transformations alone does not prove original/derived access is restricted. Do not change unrelated product/hero assets, use deprecated access_mode, or make guessed asset changes. Confirm anonymously that every old original, derived/versioned alias and cache route is denied, while authorized FoodNova viewing returns the exact private bytes. No Cloudinary operation is part of this repository release.
8. LAST, after private-copy completeness, restore, viewer, private future uploads and provider/cache restriction PASS, enable backend `RETAINED_PAYMENT_EVIDENCE_PROTECTED=true`. Re-run private verification against current counts. Protected=true with private uploads disabled deliberately makes uploads fail closed; never bypass this by restoring public uploads. Only now release the operational freeze after final sign-off. Missing/corrupt copies or absent storage/DB guards must continue blocking affected destructive actions.
9. Keep `CUSTOMER_EMAIL_VERIFICATION_REQUIRED` at its existing value during this rollout; new registrations are already enforced. Changing legacy grace requires a separately announced/tested cutover. Preserve `ORDER_TRACKING_LINKS_ENABLED` until the existing tracking token/rate-limit table prerequisites are independently confirmed. Preserve existing email settings (`EMAIL_ENABLED`, `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_URL`) and trusted proxy/rate-limit configuration; do not place secrets in VITE variables. Missing configuration is a STOP, not permission to weaken verification or tracking.

## Post-deployment verification and rollback

- Confirm the approved backend/frontend commit/build, health, login, authorization and no unexpected error/lock spikes. Use authorized read-only counts, activity entries and private evidence checks. Confirm public catalog images/checkout entry remain intact and archived/erased records stay excluded from normal views. Destructive behavior, real refunds, paid orders and delivery completion are validated with isolated staging fixtures, not live customer records.
- Reject unauthenticated and wrong-role retained receipt access, cross-order log IDs and expired/revoked sessions. Confirm direct static invoice/receipt URLs remain denied. Do not publish receipt screenshots, source URLs, tokens, manifests or customer identifiers in the release report.
- On failure pause affected writes/destructive operations and forward-fix or restore private evidence from verified backups. A rollback must preserve additive columns/triggers, erased identities, session revocations, financial/audit rows and restricted original evidence. Do not run a destructive down migration, disable guards, restore erased PII or make Cloudinary originals public.
- Do not blindly roll back to a backend exposing static evidence or a frontend opening public receipt links. Keep the authenticated viewer/private-upload compatibility code and configuration on any application rollback, or pause those workflows. Restore evidence indexes/blobs consistently; do not overwrite immutable copies with guessed downloads. Rehearse this compatibility rollback on staging before approving production.

## Validation record

Local results: `python -m pytest -q --disable-warnings` passed **341 tests plus 16 subtests**, with **1 skipped** opt-in real PostgreSQL test and existing framework/UTC warnings. The run used an isolated SQLite test configuration and disabled email, not a production connection. This includes the **29 retained-orders migration** and **20 standalone private receipt-copy** regressions. Frontend `npm --prefix frontend test -- --run --reporter=basic` passed **94 tests**; `npm --prefix frontend run lint` and `npm --prefix frontend run build` passed. Python AST syntax checks passed for nine reviewed security/retention/receipt modules and release test files. Git whitespace checks and production-script equality checks passed.

The full backend suite includes security, ledger, receipt and standalone migration regressions; the frontend suite covers role-gated removal, blockers, authenticated receipt viewing, cart/auth/tracking and existing operational UI contracts. Real PostgreSQL concurrency, production schema/storage/Cloudinary state and live browser acceptance are not claimed by local automated success and remain operator gates. The final merge commit is reported separately so this document does not require a self-referential commit hash.
