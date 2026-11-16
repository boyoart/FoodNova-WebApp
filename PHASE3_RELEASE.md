# FoodNova Phase 3 release

Prepared 15 November 2026. Base: `e87cdca5118f52b2b3b19a9b85228683eeac3917`.

## Preserved work and scope

The existing Phase 3 working tree was reviewed and retained. The existing admin shell, dashboard crash hotfix, customer catalogue, inventory deduction/restoration, prices, and pack component configuration were preserved. No database migrations, environment values, dependencies, or hosting configuration were changed.

The old untracked `RELEASE_PREPARATION.md`, `.codex-remote-attachments/`, `.codex-worktrees/`, and two customer-app screenshots are excluded from this release and remain untouched.

## Combo Pack image lifecycle

Root cause: product and pack uploads shared the product multipart serializer, which sends `images`. The pack create/update endpoints accept one `image`. The pack-specific serializer now sends the correct field, including the first selected file, and preserves existing pack fields. Admin shows the saved current image and a replacement preview, and reloads its catalogue after save. The homepage promotion now renders each pack's API image.

The existing backend uploads through `save_uploaded_image`, commits `Pack.image_url`, and returns that reference through the admin response, public list, search and details endpoints. Customer Food Packs cards and details already use API image references; opening details refreshes the record. Regressions verify replacement reaches persisted data, list, search and details without changing price or component count.

Cloudinary uploads use unique public IDs and `overwrite=False`, producing new URLs rather than overwriting a cached image path. Current production catalogue references for Full Package, Gift Combo and Starter Pack are Cloudinary HTTPS URLs. Existing page data is loaded on mount and requires a refresh to observe edits made in another session; this release does not introduce realtime cross-session invalidation. Hardcoded generic placeholders remain only as fallbacks, not authoritative pack images. The service worker is an existing kill switch rather than an image cache.

### Storage decision

The existing provider is Cloudinary. Successful Cloudinary images are outside Render's instance filesystem and survive application redeployments; the database must also remain persistent. The current uploader silently falls back to local `/uploads/...` when Cloudinary is unconfigured or fails. Local fallback images cannot be guaranteed across Render deployments without a persistent disk mounted at the configured upload directory. No hosting account configuration or disk mount was available for independent verification.

No new provider or persistent-storage migration was introduced. Infrastructure follow-up: verify Cloudinary configuration/availability, decide whether production uploads should fail explicitly instead of falling back, or provision a Render persistent disk and back up/migrate existing local assets. Historical missing local files cannot be restored by a frontend change. Do not claim every future upload is durable until this is resolved.

## Analytics contract

- Dashboard totals use the server-side date-filtered report query over all matching non-deleted orders, not a paginated order list. Explicitly partial inventory/rider lists are rejected as unavailable.
- Revenue is gross paid order value, including paid cancellations, grouped by order creation date in UTC. Accepted payment aliases follow the backend's existing confirmed-payment set. Average order value uses the paid-order denominator.
- Refund amounts and payment-confirmation timestamps are not recorded. Net revenue and refund adjustment amounts remain unavailable; reconciliation order counts are provided. This is not a cash-receipt-date report.
- Date inputs use whole UTC dates, inclusive end dates, and reject reversed ranges. Period totals are unavailable when the selected range cannot cover the period start.
- Completed counts include delivered and customer-collected pickups. Current attention queues exclude completed and cancelled orders; cancelled unpaid orders are excluded from outstanding amounts.
- Inventory report counts use active variant quantities, matching catalogue serialization rather than stale parent quantities. Archived products are excluded.
- Rider availability excludes inactive/suspended lifecycle states even when KYC is approved. Missing metrics remain unavailable and the crash hotfix's null-safe rendering is preserved. An unvalidated synthetic health score was removed.
- Dashboard polling pauses while hidden and aborts requests when leaving. Order attention links feed the existing server search.

## Validation

- `npm --prefix frontend test -- --run --reporter=basic`: 54 passed.
- `npm --prefix frontend run lint`: passed.
- `npm --prefix frontend run build`: passed.
- `python -m pytest -q`: 171 passed and 16 subtests passed; existing stack deprecation warnings remain. Run outside the sandbox because Windows asyncio socketpair initialization stalls inside it.
- `git diff --check`: passed.
- Regression coverage includes a 105-order dataset, missing metrics, incomplete pagination, refunds/cancellations, date boundaries, variant stock, rider lifecycle, image replacement, and unchanged inventory behavior.

Browser connection was attempted but the installed browser bridge reported unavailable/untrusted. No fabricated authentication was used. Fresh visual/mobile/console verification and authenticated admin editor/dashboard acceptance remain unverified. Public production HTTP/API checks are reported separately after push; HTTP 200 for the SPA login route alone does not prove login functionality.

## Files in this release

```text
backend/main.py
frontend/src/pages/AdminDashboard.css
frontend/src/pages/AdminDashboard.jsx
frontend/src/pages/AdminExpansion.jsx
frontend/src/pages/AdminOrders.jsx
frontend/src/pages/AdminPages.css
frontend/src/pages/AdminStock.jsx
frontend/src/pages/HomePage.css
frontend/src/pages/HomePage.jsx
frontend/src/services/api.js
frontend/src/utils/adminDashboardMetrics.js
frontend/src/utils/adminPackFormData.js
frontend/src/utils/formatters.js
frontend/test/admin-dashboard-metrics.test.mjs
frontend/test/admin-shell.test.mjs
frontend/test/homepage-combo-packs.test.mjs
tests/test_admin_analytics.py
tests/test_combo_pack_inventory.py
PHASE3_RELEASE.md
```

## Deployment and rollback

Both Vercel frontend and Render backend must deploy this release because the dashboard depends on new report fields. Deploy backend before or alongside frontend where possible; during a staggered rollout missing fields display unavailable rather than invented values. No schema migration is required.

After push, verify remote main matches local main, hosting deployment status, public pack image URLs, frontend asset markers, login route and backend OpenAPI/report contract. Only perform authenticated checks with a valid authorized session. Do not modify production catalogue or customer records for acceptance.

Record the last healthy Vercel and Render deployment IDs before promotion. If needed, restore those deployments as a matched pair; no database reversal is required. Never reset the user's working tree as rollback.
