# Receipt-only Cloudinary restriction release

## Scope and status

Branch `security/cloudinary-receipt-restriction` starts from production `origin/main` at `d83b2fe663767b97a2d3a0b74848e04b81fa325f`. Adds only `backend/scripts/restrict_cloudinary_receipts.py`, isolated tests and this runbook. No application routes/models/frontend, dependencies, migrations, receipt-copy utilities, flags or existing evidence files are changed. No production database, Cloudinary account/asset or deployed website was accessed. No provider mutation, operational migration or deployment was executed.

The operator reports 22 orders, 7 current receipt references, 7 approval-log references and 7 unique public Cloudinary originals, copied/checksum-verified under `/var/data/foodnova/retained-receipts`. Authenticated viewing and private future uploads are reported working. These are supplied findings, not independently verified by this release. Independent backup/restore and PostgreSQL concurrency rehearsal remain unverified. Keep `PRIVATE_RECEIPT_UPLOADS_ENABLED=true`, `RETAINED_PAYMENT_EVIDENCE_PROTECTED=false` and `CUSTOMER_DELETION_ENABLED=false` during preparation. Do not activate deletion with this utility.

## Existing paths and selected approach

Active upload code uses the existing Cloudinary account variables, receipt folder `foodnova/receipts`, random receipt public IDs and overwrite=false. Current orders and immutable approval logs preserve their original source references. The unchanged `migrate_receipt_evidence.py` reads the production-compatible five receipt inventory columns using PostgreSQL read-only repeatable-read transactions. The unchanged evidence helper validates originals against `RETAINED_RECEIPT_CLOUD_NAME` and verifies private source indexes, byte counts, MIME magic and SHA-256 on every access. The new script reuses those reads/verifications, not application imports, payment writers or a second ledger.

The implemented mutation is a narrowly scoped Upload API **rename of the same provider-confirmed public ID**, `resource_type=image`, `type=upload`, `to_type=authenticated`, `overwrite=false`, `invalidate=true`. The immutable asset ID, public ID, image resource type, format and byte count must match before/after. A pre-existing authenticated target is a blocker. No destroy/delete, overwrite, upload, bulk/tag/folder mutation, global setting change or access-mode call exists.

Cloudinary documents authenticated originals and derivatives as requiring signed/token access. Rename invalidation is asynchronous and has account/CDN-specific exceptions, including older versioned paths and signed URLs. These facts do not prove this account's compatibility or coverage. There is no supported read-only API that proves an account can revoke every historical CDN route. The audit therefore reports the method as a **candidate, not account-confirmed**. An independent provider/account review must confirm conversion support, preservation of asset identity, invalidation coverage/propagation, known signed URLs, transformations, aliases/custom domains and related automation. Without a written account-specific confirmation covering historical routes, STOP before apply. Boolean attestations are recorded operator approvals, not independently verified provider guarantees.

An asset-level token-only `access_control` policy can be an alternative where the plan/CDN supports it, but this release does not automate that different mechanism. If conversion cannot meet coverage requirements, obtain a separately reviewed implementation; no silent fallback. Strict Transformations, private delivery alone, an upload preset or the deprecated `access_mode` are not sufficient release recipes.

Official references reviewed: [media access control](https://cloudinary.com/documentation/control_access_to_media), [rename parameters](https://cloudinary.com/documentation/image_upload_api_reference#rename_method), [immutable asset-ID details and derivative pagination](https://cloudinary.com/documentation/admin_api#get_details_of_a_single_resource_by_asset_id), [CDN invalidation limitations](https://cloudinary.com/documentation/invalidate_cached_media_assets_on_the_cdn). The installed, declared Cloudinary Python SDK 1.41.0 already supports the needed asset-ID reads, derivative cursors, versions and exact rename options; no dependency addition is needed.

## Safety model and files

- No arguments: offline plan; no DB, provider, HTTP or filesystem operations. Explicit `--audit`: database/provider reads only, plus new private report/plan files. It never restricts media. Production credentials are loaded only from existing server environment variables, with explicit cloud-name equality and fixed API endpoint. No dotenv/app startup is imported.
- Obtain exact immutable asset IDs through the authorized Cloudinary console/provider inventory and map them to source SHA-256 values from the existing private copy manifest. The tool does not guess public IDs from URLs, perform broad asset searches, or infer resource/delivery/version data from ambiguous source paths. Asset-ID GET responses must confirm the exact stored original HTTPS URL, version, resource/delivery type, format, byte count and receipt-only namespace. Unexpected names/formats, transformed/unversioned/query-bearing sources, wrong accounts or incomplete derivative/version pagination fail closed.
- `orders.receipt` and `payment_approval_logs.receipt_url` are inventoried and deduplicated. New internal private receipt references are excluded from the historical public target set but remain part of the database fingerprint. Every public target must have an exact mapping, matching copy-manifest row references and an intact private index/blob. Mapping extras/duplicates, missing files or unsupported sources cannot authorize a subset silently. Audit completion requires exactly `--expected-sources` (default 7). Do not change this expectation to hide an unexplained asset.
- PostgreSQL access is read-only. Inventory fingerprints are checked around audit and before apply/verify. There are no database writes, source-reference rewrites, payment changes or evidence repairs. A quiet window for order/receipt/approval writes is required; the utility does not lock the production application or alter flags itself.
- A reviewed audit report hashes a private execution plan. The external reviewed SHA-256, exact ordered allowlist, separate expiring approval document, exact confirmation string, provider guarantee, private viewing, private future uploads and independent backup or explicit documented risk exception are all required. **All assets preflight before the first provider mutation.** Re-checks and target collision checks reduce races, but Cloudinary rename lacks an asset-ID compare-and-swap. Provider writers, media editors, automations/webhooks that could change these identities must be quiesced under the separately confirmed provider write freeze. If that cannot be established, STOP.
- The private execution plan contains source URLs, public IDs and immutable IDs needed for exact execution. It is not a shareable audit report. Only counts, hashes, fixed reason codes and outcomes appear in the non-sensitive report/journal/stdout. Do not print either private input or plan, enable SDK HTTP debug/shell tracing, upload screenshots, or paste receipts/credentials/IDs into tickets. Source/asset hashes are pseudonymous correlators and still require restricted access.
- New artifacts live only in `.../retained-receipts/restriction-control/`, directory 0700/files 0600 on Render/Linux. Linux input files must have no group/other permissions. Existing copy manifests, indexes and blobs are only read. A process lock prevents simultaneous utility runs on the same disk; every run ID must be new. Immutable fsynced event files record intent before mutation and outcome afterwards. Preserve the whole control directory in independent backups.

## Prepared production commands — NOT EXECUTED

Obtain separate release/deployment and production-read approvals first. Make this utility available through the normal reviewed release process; **do not add it to startup/build/pre-deploy hooks**. In the existing Render runtime Shell, work from repository root using existing `DATABASE_URL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `RETAINED_RECEIPT_CLOUD_NAME`, `RETAINED_RECEIPT_STORAGE_DIR` and durable-storage configuration. Never echo credentials or introduce browser/VITE secrets. Stop if the cloud pins differ, mount is not durable/private, required settings are absent, or the deployed commit is unapproved.

1. Prepare a private input directory, using an approved shell procedure and mode 0700. Place input files there with mode 0600, never in the Git checkout/public uploads. Example `.../restriction-inputs/asset-map.json` structure (replace placeholders privately, not in shared logs):

   ```json
   {"assets":[{"source_id":"<64-hex source hash from copy manifest>","asset_id":"<exact 32-hex immutable Cloudinary asset ID>","receipt_exclusive":true,"additional_routes":[]}]}
   ```

   Include exactly seven reviewed receipt sources. `receipt_exclusive=true` requires checking the account inventory/use so none is a reused product/banner/profile asset. `additional_routes` lists any known original/derived/versioned/signed public URLs absent from provider metadata. Only plain HTTP/HTTPS `res.cloudinary.com` routes for that pinned asset are supported. Custom domains, query-token routes or ambiguous paths are blockers: do not omit them to make a run pass; this utility needs a separate extension/provider-supported procedure for those accounts. Provider confirmation must establish that no unhandled routes exist.
2. Select the actual successful existing `receipt-manifest-*.json` containing all seven original references. Its `complete` and `inventory_unchanged` must be true, and each selected entry must match current DB references and the checksum-verified private copy. Do not edit an existing manifest or create a fake copy success.
3. Exact read-only audit command (replace only the actual reviewed copy-manifest filename; input preparation does not authorize apply):

   ```sh
   python backend/scripts/restrict_cloudinary_receipts.py --audit --asset-map /var/data/foodnova/retained-receipts/restriction-inputs/asset-map.json --copy-manifest /var/data/foodnova/retained-receipts/receipt-manifest-REVIEWED.json --expected-sources 7 --run-id receipt-audit-001
   ```

   Expect exit 0, `audit_complete=true`, 7 eligible assets and 7 verified private copies, zero unsupported/ambiguous entries, and the approved database counts. Review the private `restriction-control/receipt-audit-001-report.json` and its hashed `receipt-audit-001-plan.json` under authorized access. The report lists candidate/unsupported methods, impact and rollback limitations; it does not claim the account supports conversion. Save the printed report SHA-256 independently with the change approval. Run `sha256sum` on the non-sensitive report to confirm the exact file hash. Do not print/hash-dump the sensitive plan's contents.
4. A separate reviewer must verify the private plan's exact provider identities, all originals/derived versions and aliases, receipt exclusivity, provider confirmation, quiet/provider-write freeze, authenticated viewer, private future uploads and recovery plan. Place `allowlist.json` equal to the report's `allowlist` array **exactly**, with no extra/missing/reordered entries. Place a separately approved `approval.json` alongside it:

   ```json
   {
     "reviewed_manifest_sha256":"<independently reviewed report SHA-256>",
     "operator_approval":true,
     "method":"authenticated_delivery_with_invalidation",
     "provider_compatibility_confirmed":true,
     "historical_routes_guaranteed":true,
     "route_inventory_complete":true,
     "receipt_exclusive_confirmed":true,
     "provider_write_freeze_confirmed":true,
     "provider_confirmation_reference":"<non-personal approved support/change reference>",
     "independent_backup_verified":true,
     "backup_verification_reference":"<approved independent restore-test reference>",
     "quiet_window_confirmed":true,
     "private_viewer_verified":true,
     "expires_at":"<future ISO-8601 timestamp with UTC offset>"
   }
   ```

   Do not copy these true values as a checklist bypass. Require independent private-disk/index/blob/manifest restore proof. If separately authorized to accept its absence for **this restriction operation only**, set `independent_backup_verified=false` and add `risk_exception_approved=true` plus a nonempty `risk_exception_reference` pointing to a documented, separately approved exception. The exception does not prove a backup exists, satisfy the PostgreSQL rehearsal or authorize customer erasure. Missing/expired/false approval prerequisites stop the entire batch before mutation. OS permissions and review procedures establish operator authorization; the JSON is not a cryptographic multi-party signature.
5. Controlled provider activation, ONLY after explicit separate mutation approval, reviewed hash, exact allowlist and every prerequisite PASS:

   ```sh
   python backend/scripts/restrict_cloudinary_receipts.py --apply --manifest /var/data/foodnova/retained-receipts/restriction-control/receipt-audit-001-report.json --plan /var/data/foodnova/retained-receipts/restriction-control/receipt-audit-001-plan.json --copy-manifest /var/data/foodnova/retained-receipts/receipt-manifest-REVIEWED.json --allowlist /var/data/foodnova/retained-receipts/restriction-inputs/allowlist.json --approval /var/data/foodnova/retained-receipts/restriction-inputs/approval.json --manifest-sha256 REVIEWED_REPORT_SHA256 --confirm RESTRICT_ONLY_REVIEWED_RECEIPTS --run-id receipt-apply-001
   ```

   Substitute the independently recorded report hash; there is no default confirmation. This reads the DB, original private evidence and copy manifest, then mutates only approved provider identities. There is no SQL mutation or source URL rewrite. Require all conversions confirmed, but **apply success is not privacy success**: the report deliberately keeps `privacy_verified=false`.
6. After the provider-approved invalidation propagation period, exact anonymous verification command:

   ```sh
   python backend/scripts/restrict_cloudinary_receipts.py --verify --manifest /var/data/foodnova/retained-receipts/restriction-control/receipt-audit-001-report.json --plan /var/data/foodnova/retained-receipts/restriction-control/receipt-audit-001-plan.json --run-id receipt-verify-001
   ```

   Every asset must already be authenticated before probing; verify never converts or repairs it. It rechecks DB/private/provider identity and issues unauthenticated HEAD **and GET** requests without reading/storing bodies, cookies, authentication, redirects, proxy credentials, or cache-busting queries. All inventoried original/derived/known version URLs, unversioned/v1 forms, HTTP and HTTPS, old upload and unsigned authenticated routes must return 401/403/404/410. Fresh authenticated provider-returned versions/routes are also checked. A public 200/206, redirect, rate limit, server error, timeout or unsupported route is FAIL, not a private asset. No GET retry/download fallback or CDN invalidation is performed in verify.

   Require `all_inventoried_routes_denied=true` and independently reconcile the specific denial codes with provider origin/CDN confirmation (a 404 can have unrelated causes). Repeat from independent fresh regions/contexts after cache propagation, without sharing receipt URLs or bodies. Finite probes cannot enumerate all historical transformations, cached POPs, alternate formats/domains or already-downloaded browser/email copies; the account-specific coverage confirmation remains mandatory. If Cloudinary cannot guarantee denial of the historical public routes, STOP, retain safeguards, and obtain a reviewed provider solution. Never delete originals or label finite probes as a universal privacy guarantee.

## Failures, retries and rollback limitations

Before any mutation, invalid identity/evidence/inventory/approval/collision causes STOP for the entire batch. After conversion begins, Cloudinary has no atomic multi-asset transaction: a later provider failure, lost response, journal disk failure or process crash can leave a partially converted set. The fsynced per-asset intent/outcome journal supports reconciliation; errors contain no provider response/URL/PII. Stop on the first uncertain mutation; do not continue blindly or undo successful restrictions.

Inspect asset state through the same immutable-ID API and private journal. After remediation, renew the separate approval if expired and rerun the **same reviewed audit/plan/allowlist** with a **new run ID**. A still-matching authenticated asset is verified and skipped; an unchanged public asset is eligible for its exact approved conversion. Identity, version/derivative, DB or evidence drift requires new review. Never re-run the mutation for already-converted assets just to repeat cache invalidation. Provider cache remediation is a separately reviewed action. New authenticated versions can be safely verified; no original accounting URL is rewritten.

There is no automatic rollback, deletion, overwrite or republication command. Reversing delivery type could re-expose evidence and leave inconsistent caches; it requires separate security/provider approval, not a convenience rollback. Keep restricted originals and verified private copies; forward-fix the viewer or restore private evidence under incident controls. Preserve invoices, refunds, payment approval rows, audit logs and manifests. Previously downloaded copies cannot be recalled. If provider preservation/coverage cannot be guaranteed, do not begin conversion.

## Subsequent application activation — separate approval

This utility never sets environment variables or enables destructive actions. Only after private copies/restore, provider coverage and anonymous/multi-region denial checks pass may an authorized operator separately consider `RETAINED_PAYMENT_EVIDENCE_PROTECTED=true`, with `PRIVATE_RECEIPT_UPLOADS_ENABLED=true` maintained. Keep `CUSTOMER_DELETION_ENABLED=false` until the independently unverified backup/restore and PostgreSQL concurrency rehearsal, financial retention policy and all gates in [CUSTOMER_DELETION_FINAL_RELEASE.md](CUSTOMER_DELETION_FINAL_RELEASE.md) are signed off. Customer deletion is enabled LAST through that reviewed backend process, not by this script. No live deletion/order/refund mutation is an acceptable utility smoke test.

## Local validation

Tests use synthetic local receipts, temporary private files, SQLite inventory and mocked Cloudinary APIs/anonymous HTTP. They cover offline/read-only behavior, exact allowlisting, account/URL/identity validation, missing/corrupt evidence, approvals/exceptions, drift, all-assets preflight, partial failure, idempotent retries, durable-journal failure, unknown provider responses, cache/derivative checks, zero unrelated media mutation and unchanged production-schema inventory. Existing receipt-copy and retained migration regressions are included. No live provider/account capability, actual seven-asset restriction, production schema/storage, backup, cache propagation or PostgreSQL concurrency PASS is claimed. See the final release report for actual test counts and commit.

Final local results: **109 tests passed** (60 new restriction cases, 20 existing standalone receipt-copy cases and 29 retained-orders migration cases). Python AST syntax checks, the offline no-argument plan smoke check, installed dependency verification and Git whitespace/scope checks passed. Protected production scripts/helpers and application/dependency/frontend files remain unchanged. No frontend build is needed for this three-file standalone release; no frontend change is included.
