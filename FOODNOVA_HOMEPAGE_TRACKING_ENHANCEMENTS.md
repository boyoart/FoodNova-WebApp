# FoodNova homepage and public tracking enhancements

## Audit before implementation

Latest fetched main: 6b10d3e (PR #8, includes approved 0e4a9d6). New branch: feat/foodnova-homepage-tracking-enhancements. Unrelated local/untracked files preserved.

React/Vite AppLayout owns shared Navbar, Footer and TrackingProvider. CinematicHomePage loads products, packs, categories and CMS hero announcements. Category fallback currently uses numbers and hides broken images. Four legacy categories (Beans/Garri/Oil/Rice) have no matching product-category association in the public API; related-looking names alone are not evidence of catalogue membership. Existing categories and exact API product associations must remain authoritative.

The large campaign section is driven by CMS hero_banner records. Public catalogue audit identifies announcement 2, announcement-78637d94fa75434594d783495a18d2c9.png, as the current legacy promotional artwork. Its asset must remain available to other surfaces. Other CMS campaign functionality must be retained.

Announcements already support text, links, priority, active state and schedules with existing authorization/audit logs. Website Settings persist JSON in the existing app_settings store; an additive tickerEnabled setting needs no schema migration. A shared homepage CMS read will serve ticker and campaigns, avoiding duplicate polling.

FastAPI routes/order_tracking.py currently provides authenticated ownership lookup and hashed expiring revocable email capabilities through /tracking/lookup and /tracking/progress. Legacy /track-order requires phone/email. New /tracking/public will be a separate allowlisted progress response and will not weaken these private endpoints. Existing order_tracking_limits provides atomic shared database abuse counters. Missing limiter storage must fail closed. Only counters may change; no order/payment/customer mutation is permitted.

Order generation next_public_order_code uses sequential FN-NNN codes under a PostgreSQL advisory lock. Numbers are identifiers, not secrets: even rate-limited public status reveals a small amount of order activity to a determined guesser. No number generation or existing identifiers will change. Public responses will exclude timestamps, payments, items, PII, rider/location data and internal IDs. Archived/removed/erased orders and deleted customer accounts must be inaccessible. Assignment/offer acceptance must not imply dispatch; completed delivery requires existing recorded completion evidence. Status mapping reads existing fields only.

Current public UI asks for email; authenticated order history and secure-fragment confirmation links already exist and must be retained. Footer currently links tracking to /orders, which must be corrected. No approved local audio asset exists. Music controls must disclose the missing asset; optional original synthesized interaction feedback can use one controller with explicit opt-in and cleanup.

Implementation and executed validation results follow below. No production DB access, migration, deployment, flag changes or main merge is authorized.

## Homepage implementation

- Category cards prefer a genuine category photograph, then photos from active products explicitly linked by category ID or exact normalized category name. Failed sources advance to the next associated photo. Loading/missing/broken sources show the existing approved FoodNova logo on a branded panel. No numbered placeholders, guessed category aliases or unrelated images remain. Category names and existing query-string navigation are unchanged. Fixed image aspect ratios prevent layout shifts.
- Only the audited mobile-mockup announcement artwork is suppressed on this homepage, identified by its exact asset basename. Other hero campaigns, original files, Admin records and legacy homepage assets are retained. The matching artwork was visually inspected locally; no production CMS record was edited.
- One shared homepage announcement read supplies both ticker and campaigns. It refreshes every 60 seconds while visible and on visibility changes; in-flight reads and timers clean up on navigation. Independent catalogue reads still use the existing API and cart helpers.
- The ticker uses existing `top_bar` announcements and priority ordering, with client-side schedule checks to expire stale notices even during a network failure. It is sticky below the measured Navbar; Navbar/mobile menus remain above it. Scene/anchor offsets include measured ticker height. Hover, keyboard focus and an explicit pause control stop motion. Focus reveals wrapped links, and reduced motion displays static wrapped text. Duplicate visual text is hidden from accessibility tools and has no duplicate interactive links.
- Admin Announcements retains create/edit/active/priority/start/end/link controls. Four requested draft choices populate an inactive form only; nothing is auto-published or seeded. Website Settings exposes `tickerEnabled` through existing permission-protected PATCH and audit logging. The existing settings JSON stores this additive boolean; existing announcements and clients remain compatible. No schema migration is introduced.

## Audio and licensing

Audio is off on every mount. The visible Sound toggle requires a real user click before creating/resuming the single shared AudioContext. Confirmation/important CTA tones are original synthesized sine envelopes, limited to one per 900ms; a selected story entrance may sound once, only if already opted in. Visual feedback is always preserved. Hide/navigation suspends or disposes audio, timers, observers and sources; visibility returning never restarts audio automatically.

No approved music asset exists in the repository. The Music control is intentionally disabled with an explanation. The shared controller supports explicit, configured music playback with low-volume fade in/out and cleanup, but no recording is fetched or played. Before enabling music, commit an owner-approved original/licensed asset and licence/attribution, wire that asset into this controller, and review playback on real devices. Do not substitute an unlicensed track or enable autoplay.

## Public tracking contract

`POST /tracking/public` follows existing Render API naming (no new `/api` prefix). Body:

```json
{"order_number":"FN-001"}
```

No token, login, email, phone or OTP is required or accepted as a verification field. Whitespace/case are normalized; printed numeric references of at least three digits accept the FN prefix automatically. Recognized stored forms are `FN-` followed by 3–20 alphanumeric characters; other legacy formats require explicit review rather than silently rewriting stored identifiers. Lookups use the existing indexed exact order_code column, not a sequential list endpoint.

Success schema has exactly these fields:

```json
{
  "order_number":"FN-001",
  "status":"preparing",
  "status_label":"Preparing your order",
  "delivery_stage":"Preparing your order",
  "timeline":[
    {"step":"order_placed","label":"Order received","state":"completed"},
    {"step":"preparing","label":"Preparing your order","state":"current"},
    {"step":"ready_for_dispatch","label":"Ready for dispatch","state":"pending"},
    {"step":"out_for_delivery","label":"Out for delivery","state":"pending"},
    {"step":"delivered","label":"Delivered","state":"pending"}
  ]
}
```

This is a schema example, not a live order or inferred progress. A dedicated SQL projection and Pydantic allowlist avoid loading/serializing customer, item, financial, receipt, invoice, PIN, rider or location details. No timestamps/internal record IDs/tokens are returned. Unknown, archived, removed, personally erased and deleted-account orders receive the same generic unavailable response. Limit counters are the only database writes; orders and all financial records are read-only.

### Status mapping

| Actual recorded fields | Public stage |
|---|---|
| order_placed / pending / payment-related legacy states | Order received (no payment disclosure) |
| accepted / confirmed / preparing / processing | Preparing your order |
| ready / packed / ready_for_pickup / ready_for_dispatch | Ready for dispatch, or Ready for pickup for pickup orders |
| Rider assigned / offer accepted / arrival at pickup only | Does not advance fulfilment stage |
| picked_up / in_transit / en_route_to_customer / out_for_delivery / arrival at customer | Out for delivery, for delivery orders only |
| delivered plus delivery_confirmed_at | Delivered |
| picked_up_by_customer (or pickup picked_up) plus delivery_confirmed_at | Picked up |
| Completion status without confirmation evidence | Completion update pending |
| cancelled/canceled | Cancelled |
| Failed/returned/unknown lifecycle values | Generic recorded update; contact support |

`delivery_completed_at` alone is insufficient: legacy Admin updates may set it without the PIN workflow. Public mapping does not change dispatch transitions, rider assignment, GPS, delivery PIN checks or statuses. No stage is inferred from elapsed time. Authenticated full order history, ownership checks, expiring/revocable fragment capabilities and private tracking APIs remain separate and functional.

### Abuse prevention and residual risk

- Reuse atomic shared `order_tracking_limits` counters, HMAC-hashed with the existing server secret. Limits: 30 valid lookups/IP/15min, 300/network/15min (IPv4 /24 or IPv6 /64), 300 per order reference/15min. These additional aggregate limits can cause conservative false positives on shared networks or popular references. Old secure-link limits remain separate.
- Trust forwarded addresses only through the existing explicit `ORDER_TRACKING_TRUSTED_PROXIES` policy. Operator must verify actual trusted Render ingress CIDRs/forwarding order; never guess a CIDR or trust arbitrary X-Forwarded-For. Until correct, shared-proxy traffic may be conservatively grouped and throttled. Use provider/WAF request-size and bot limits for distributed/invalid traffic; application valid-request counters alone cannot stop a distributed attacker.
- Bounded 1KiB request parsing and generic validation errors avoid echoing extra submitted data. Storage failures return generic 503; missing rate-limit storage fails closed. 429 supplies Retry-After. Logs record non-sensitive event names only, not numbers, IP addresses, credentials or payloads.
- API responses use no-store/private, no-referrer and noindex headers. Vercel tracking-page headers and a temporary robots meta tag prevent indexing/caching results. Order input stays in memory, not URLs/localStorage/analytics. Public refresh is once per minute, pauses while hidden and retains only last-known general progress.
- **Residual privacy risk:** current references are sequential identifiers, not secrets. A determined distributed or slow guesser can learn limited order existence/progress despite limits. This is inherent in the approved number-only workflow. No claim is made that an order number authenticates ownership. Full details remain protected. A separate high-entropy public reference for future orders would need an explicit business decision; this release does not change existing numbers or require another verification field.

## UI and links

`/track-order` shows the requested heading, one Order Number input, Track Order, status/timeline, refresh, generic errors and support link without a pre-lookup login prompt. Shared Navbar and Footer link to it. Existing secure email fragment links already target this page and remain usable. Order-placed confirmation emails now also fall back to this public page when no capability is issued, without adding an email or changing invoice links. Logged-in customers retain private history/details below the public entry; unauthorized visitors never receive that data. No customer-security or receipt-security flags are changed.

## Validation commands and results

From repository root (all backend tests use isolated fixtures; never supply production DATABASE_URL):

```powershell
npm --prefix frontend test -- --run --reporter=basic
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:cinematic
$env:DATABASE_URL='sqlite:///./test_foodnova_contracts.db'
python -m pytest -q --disable-warnings tests/test_public_order_tracking.py tests/test_website_analytics_tracking.py tests/test_customer_security.py
python -m py_compile backend/main.py backend/email_service.py backend/routes/order_tracking.py backend/routes/public_order_tracking.py backend/services/public_order_tracking.py
git diff --check
```

Final executed results and changed-file manifest are recorded below before commit. The browser harness blocks live non-read requests. Number-only API, CMS changes and failure cases use browser-local fixtures; the existing catalogue/cart suite reads genuine public catalogue data and does not submit orders. Emulated Edge viewports include 320, 390, 768, 1024 and 1440px. No authenticated production, physical-device, Safari or PostgreSQL load test is claimed.

## Local and Vercel preview

```powershell
npm --prefix frontend ci
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5191 --strictPort
```

Open `http://127.0.0.1:5191/`. For a production build use `npm --prefix frontend run build`, then `npm --prefix frontend run preview -- --host 127.0.0.1 --port 5191 --strictPort`. Homepage catalogue GETs use the existing configured API. The new public endpoint is **not** available on the old production backend merely because a frontend preview runs. Use the isolated test suite for fixture tracking, or an explicitly approved staging API via VITE_API_BASE_URL for a full-stack rehearsal. No real customer lookup or production write was used during implementation.

Pushing this feature branch can create a Vercel preview only if the repository's existing integration does so. An operator may open that branch deployment in Vercel, set only approved preview-scoped VITE_API_BASE_URL to the staging backend, and verify its existing CORS policy permits that preview. This task does not change Vercel/Render settings or trigger a production deployment. No preview URL is promised unless independently observed.

## Backend prerequisites, deployment order and rollback

No new migration is required. Existing production customer-security/retention columns and `order_tracking_limits` must exist. Do not run `backend/scripts/migrate_order_tracking.py` casually: that existing utility executes create_all immediately and has no plan-only flag. If its tables are missing, stop and arrange a separately reviewed additive prerequisite migration/backup; do not auto-create schema on request or at startup for this feature.

After separate release authorization:

1. Review the exact feature commit, tests, sequential-reference residual risk and trusted-proxy/WAF readiness. Rehearse against isolated staging PostgreSQL; review backups and main drift. Keep customer deletion and all receipt-security activation flags unchanged.
2. Deploy the backward-compatible backend first. Existing frontend/private tracking, checkout, payment and dispatch endpoints remain unchanged. Confirm limiter prerequisites, trusted ingress, public response allowlist and rate limiting using synthetic staging orders. Do not probe real customer identifiers for a smoke test.
3. Deploy the frontend after backend readiness. Old backend plus new frontend fails with a generic unavailable state, never a login requirement or leaked error. No new frontend secret or audio setting is needed.
4. Through the existing CMS, save top_bar announcements with explicit Active state, priority and optional schedules/links. Use draft choices only after review. Confirm tickerEnabled in Website Settings. Publishing is a normal authorized Admin action, not a migration or automatic seed in this task.
5. Verify approved homepage, header/mobile menu, ticker pause/keyboard/reduced motion, category fallback, packs/prices, cart/reload/checkout entry and public tracking privacy on synthetic staging records before production approval.

Rollback the frontend to its previous known-good deployment first, restoring the previous guest email-link UI. Then, if needed, roll back this additive backend change to main at 6b10d3e. The old backend ignores the retained tickerEnabled JSON property. Counters are transient existing infrastructure; no order/financial data rollback or schema removal is necessary. Use a reviewed git revert on a separate branch for source rollback, never reset/force-push main. Music remains unavailable until a separately approved asset is supplied.

## Changed-file manifest

Backend:

- `backend/main.py`: additive ticker setting/payload and active-announcement response flag.
- `backend/email_service.py`: public tracking fallback for the existing order-placed email.
- `backend/routes/order_tracking.py`: include the new narrow public route; private routes are retained.
- `backend/routes/public_order_tracking.py`: bounded request validation, shared limits, projection and response allowlist.
- `backend/services/public_order_tracking.py`: reference normalization and conservative public lifecycle mapping.

Frontend:

- `frontend/src/App.jsx`: share homepage CMS data with the ticker and cinematic page.
- `frontend/src/components/CategoryPhoto.jsx`: loaded/broken/missing photo handling with the approved branded fallback.
- `frontend/src/components/CinematicAudio.jsx` and `frontend/src/utils/cinematicAudio.js`: opt-in shared audio controller/controls.
- `frontend/src/components/HomepageTicker.jsx`, `HomepageTicker.css` and `frontend/src/utils/homepageAnnouncements.js`: shared CMS reads, safe links, schedules, pause/focus/reduced-motion behavior and exact legacy-campaign exclusion.
- `frontend/src/components/Navbar.jsx` and `Footer.jsx`: direct public tracking links.
- `frontend/src/components/OrderTracking.jsx`, `OrderTracking.css` and `frontend/src/pages/TrackOrderPage.jsx`: number-only public entry, limited results and existing private experience.
- `frontend/src/pages/AdminExpansion.jsx`: inactive draft choices, compatible display types and global ticker control in existing CMS.
- `frontend/src/pages/CinematicHomePage.jsx`, `CinematicHomePage.css` and `cinematicCatalogue.js`: genuine category candidates, targeted banner removal, audio feedback and ticker-aware scene offsets.
- `frontend/src/services/api.js`: number-only public call without Authorization; existing calls retain their behavior.
- `frontend/vercel.json`: tracking-page noindex/no-store/no-referrer headers only; rewrites and build settings retained.

Tests and documentation:

- `frontend/e2e/cinematic.spec.js`: add the 320px viewport to existing live-catalogue/cart checks.
- `frontend/e2e/homepage-tracking.spec.js`: fixture CMS/category/audio and number-only tracking checks at 320/1440px.
- `frontend/playwright.cinematic.config.mjs`: include both browser test files.
- `frontend/test/cinematic-homepage.test.mjs`: shared CMS prop contract.
- `frontend/test/homepage-tracking-enhancements.test.mjs`: eight focused unit/contracts covering imagery, ticker, safe links, audio and public/private API separation.
- `tests/test_public_order_tracking.py`: isolated privacy/security/lifecycle/CMS/email regressions.
- `FOODNOVA_HOMEPAGE_TRACKING_ENHANCEMENTS.md`: this audit and release runbook.

No dependency, model, database, migration, checkout, inventory, payment, dispatch or receipt-security implementation is changed. Existing local files and untracked attachments remain outside the commit.

## Validation notes

The first complete browser attempt passed all nine live catalogue/cart/motion cases, then caught a queued ResizeObserver callback dereferencing the ticker's cleared ref after global disable. The fix captures the measured element, ignores disconnected elements and marks the observer stopped on cleanup. The failing no-JavaScript-error assertion remains intact. Long focused announcement links also receive constrained wrapping on mobile. An isolated Edge worker required termination after that failed run stalled in cleanup; this was not counted as a passing suite.

Post-fix validation is complete, as recorded below. Remaining release limitations are explicit: approved music is missing; legacy categories without genuine associated photos use the branded fallback until an administrator assigns an approved category photo; sequential references retain enumeration risk; trusted proxy/WAF and staging PostgreSQL readiness need operator review. No production deployment is performed by this task.


## Final executed results — 20 November 2026

| Check | Result |
|---|---|
| Complete frontend suite after fixes | 110 passed, 0 failed |
| ESLint | Passed |
| Fresh production frontend build | Passed; final build 23.53 seconds |
| Complete production-build Edge suite | 13 passed, process exit 0 (5.1 minutes) |
| Focused new feature browser rerun | 4 passed (covered again by the complete suite) |
| Final complete relevant backend regression set | 93 passed, 0 failed |
| Final actual-ASGI/guest/pickup/CMS/email checks | 7 passed |
| Backend module import/syntax validation | Passed through pytest imports and py_compile |
| Git whitespace and protected-path checks | Passed |

Backend runs overlap and must not be added as a unique-test total. Tests use isolated in-memory SQLite fixtures; no direct production database connection or live customer/order lookup was made. The actual production ASGI wrapper/middlewares were exercised with fixture SessionLocal and without startup/lifespan or network services. The final checks cover case/whitespace-normalized pickup methods, scheduled/inactive announcements, old secure confirmation links, the new public email fallback, and capability-safe email failures.

The strengthened mobile checks caught two further presentation issues before release: the final global Navbar style uses z-index 1200, so the ticker now sits at 1100; and wrapping focused announcements could move the pause button during a click, so that control is anchored at the top. Tests retain real pointer clicks, long-link bounds, keyboard focus/Escape, computed stacking order and the no-uncaught-JavaScript-error assertion. No tests were weakened or bypassed. The final 93-test backend run repeats all public tracking, legacy secure tracking/analytics and customer-security cases against the finished tree. Reduced motion, image fallback, audio default-off/single-context/disposal, tracking error states and cart/checkout behavior passed.

Screenshots remain local, untracked review artifacts:

- `.codex-attachments/cinematic-validation/after-1440.png`, `after-1024.png`, `after-768.png`, `after-390.png`, `after-360.png`, `after-320.png` plus motion/section captures.
- `.codex-attachments/cinematic-phase2-validation/ticker-mobile-menu-320.png`.
- `.codex-attachments/cinematic-phase2-validation/categories-ticker-320.png` and `categories-ticker-1440.png`.
- `.codex-attachments/cinematic-phase2-validation/public-tracking-320.png` and `public-tracking-1440.png`.

CMS/tracking failure scenarios use synthetic browser-local fixtures. Real catalogue tests use only public GET data and local cart state; all live non-read requests are blocked. Native Edge AudioContext opt-in and cleanup were checked; no music recording was played and audible sound quality/physical devices/Safari are not claimed.

A revoked/expired email capability still cannot access its secure endpoint. As intentionally required by this release, it does not make general number-only progress private: only archive/removal/erasure exclusion or an unavailable protected service prevents that public lookup. The sequential-reference enumeration risk and proxy/WAF/staging checks above remain production review items. No merge, production deployment, environment update, schema migration or customer/order/receipt mutation was performed.
