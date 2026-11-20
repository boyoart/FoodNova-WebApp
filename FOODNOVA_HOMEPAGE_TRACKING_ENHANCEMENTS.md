# FoodNova homepage and public tracking enhancements

> **Production-readiness review of a330d09: NO-GO for production activation.** Public-only client-identity defects have been fixed and regression-tested. The actual Render/Uvicorn trust configuration and origin-covered API abuse controls still require operator/staging evidence. Passing local tests does not establish those deployment facts. See the final review below; no feature redesign, merge, production migration or deployment was performed.

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

## Final production-readiness review of a330d09

### Decision and evidence boundary

**NO-GO for production activation until the ingress and abuse-control gates below are verified.** The code is suitable for a controlled staging rehearsal after the fixes in this review. This is not a claim that production proxy settings, WAF rules or PostgreSQL concurrency were tested: no production credentials, customer data, environment settings or database were accessed.

The repository contains a historical Render checklist with `uvicorn main:app --host 0.0.0.0 --port $PORT`, not an authoritative export of the running service configuration. No current Render Blueprint/start-command/environment evidence is available here. Therefore this review cannot confirm the real socket peer, forwarded-header rewriting, trusted CIDRs, effective FORWARDED_ALLOW_IPS, or API-origin WAF enforcement. These are explicit release blockers, not silently assumed successes.

### Defects reproduced and scoped fixes

Three new tests failed against a330d09 before changes:

1. **Multi-hop identity error:** with trusted peer `10.0.0.9` and chain `spoofed-prefix, 198.51.100.7, 10.0.0.8`, the application charged `10.0.0.8` instead of the actual client. Legitimate clients could share a proxy budget, making per-client throttling unreliable and allowing one visitor to exhaust the shared budget.
2. **IPv6 textual aliases:** compressed and expanded forms of the same address received different per-IP keys.
3. **IPv4-mapped aliases:** an IPv4 address and its IPv4-mapped IPv6 form received different per-IP keys. The network budget still bounded abuse, but the stated per-IP budget could be bypassed.

The fix is restricted to `services/public_order_tracking.py` and its public route caller. It canonicalizes IP addresses, collapses mapped IPv4, ignores identity headers from untrusted peers, and walks a bounded forwarded chain from right to left through explicitly trusted hops. It stops at the nearest untrusted client boundary and never trusts the caller-controlled prefix to its left. Duplicate X-Forwarded-For fields are treated as one chain. Unsafe universal/malformed application trust configuration, missing/invalid/all-trusted chains, scoped addresses and excessive chains fail closed with a generic 503 and no order query. Non-IP ASGI peers share a conservative unknown budget rather than inventing distinct identities.

The existing private tracking/token helper is unchanged. No authentication, customer-deletion, payment, receipt, invoice or dispatch implementation was rewritten. No new dependency, table, column, migration or environment variable was introduced.

### Public response, errors and enumeration assessment

- The SQL SELECT projects only the eight progress/completion fields listed in the implementation above. It does not materialize a full order/customer/rider object or read items, totals, payment state, receipts, invoices, PINs, GPS, addresses or profiles. Account deletion state is used only to exclude erased accounts.
- Success has exactly order_number, status, status_label, delivery_stage and timeline; each timeline member has only step, label and state. Labels come from fixed server mappings, not notes or submitted free text. Timestamps are used as completion evidence but never returned. No customer/rider/payment/PIN field is permitted by the response models.
- Unknown, archived, operationally removed, erased and deleted-account records are indistinguishable unavailable responses. Invalid/extra/oversized inputs do not echo submitted data. Storage and proxy failures produce fixed errors; logs contain event names, not payloads or identifiers. POST results are no-store/private and noindex; tracking HTML retains noindex/no-store/no-referrer controls.
- Quotas remain 30 valid lookups/IP/15min, 300/network/15min, and 300/reference/15min, stored atomically in the existing shared database table. All equivalent accepted reference forms normalize before counting. These are **fixed windows**, so up to two windows' allowance can be consumed across a boundary; this is not a rolling-window guarantee. Invalid bodies are bounded/rejected before the database limiter, so pre-validation flooding needs edge controls.
- **Enumeration is not prevented.** A single allowed budget may cover a small shop's sequential active references. Slow or distributed scans still discover order existence and general progress. The 200/404 distinction intentionally conveys that public information. Codes, link revocation and rate limits are not ownership authentication. Revoking a secure capability does not revoke general public progress.
- The allowlist and exclusion rules are sufficient to preserve the approved *limited public status* boundary. They are not sufficient to promise order-existence privacy or enumeration resistance. Do not expand this endpoint to items, timestamps, finances or identity data. Stronger privacy would require a separately approved high-entropy reference/capability policy, not an undisclosed extra verification field.
- Shared NAT/network budgets can cause false positives, and a distributed attacker can exhaust a reference budget for legitimate users. These are availability tradeoffs that must be exercised during staging; limits must not simply be removed to resolve them.

### Render/Uvicorn trust contract — operational blocker

Uvicorn 0.32.1 is the pinned and locally exercised version. Its proxy middleware can rewrite ASGI client metadata *before* application code runs. Trusting all upstreams can select an attacker-supplied leftmost IP: the new tests deliberately demonstrate that unsafe configuration, rather than pretending the application can repair lost socket provenance.

Preferred deployment contract for the whole existing application:

1. Uvicorn is the **single forwarding authority**: proxy headers enabled, FORWARDED_ALLOW_IPS restricted to the verified ingress peer/hop addresses or CIDRs, never an unverified wildcard.
2. `ORDER_TRACKING_TRUSTED_PROXIES` is empty in this mode. Both private and public application limiters use Uvicorn's already validated client metadata; public tracking canonicalizes the IP but does not re-parse an untrusted client's headers.
3. If an application-level forwarding mode is already in use, do not copy guessed Render/private/Cloudflare CIDRs. Review the complete real chain and upstream rewriting before approving it. The public resolver's synthetic multi-hop tests do not certify another endpoint's proxy policy.

An operator-approved start-command pattern is:

```bash
uvicorn main:app --host 0.0.0.0 --port "$PORT" --proxy-headers --forwarded-allow-ips "$FORWARDED_ALLOW_IPS"
```

Here FORWARDED_ALLOW_IPS must already contain the **verified** allowlist from the actual service topology. This command is documentation, not a change made in Render. Do not use documentation-only test ranges or `*`, `0.0.0.0/0`, `::/0` as a convenient production allowlist. The exact real allowlist cannot be provided honestly from this repository.

Required staging proof (synthetic orders, no real customer lookups):

- Record the effective Uvicorn version/start command, forwarding mode and privately reviewed hop contract. Do not add a public endpoint that echoes IPs, headers or configuration.
- From two independently controlled egress IPs, show that legitimate lookups use separate budgets. Rotate forged leftmost XFF, X-Real-IP, Forwarded, True-Client-IP and CF-Connecting-IP headers without changing the actual charged identity.
- In protected staging, verify request 31 within one fixed window is throttled for client A while client B remains eligible. Test before a window boundary. Verify IPv6/mapped representations, malformed chains and fail-closed errors. Repeat across two application workers sharing PostgreSQL; SQLite tests are not a real PostgreSQL/load rehearsal.
- Confirm no change to private tracking/ownership, checkout, payment approval, refunds, invoice access, dispatch/PIN completion or the existing customer-deletion activation gates.

Official references: [Uvicorn proxy trust](https://uvicorn.dev/deployment/#proxies-and-forwarded-headers), [Uvicorn settings](https://uvicorn.dev/settings/), [Render's client-IP and targeted-abuse guidance](https://render.com/articles/how-render-handles-ddos-attacks). Render documents built-in DDoS protection but leaves targeted application abuse to the application/operator; it does not establish that FoodNova has custom API WAF rules.

### Required API edge/WAF policy — coverage not verified

These are review requirements/proposed initial policy, **not rules installed by this task**. Apply to the real API ingress, not just the Vercel storefront. The frontend currently calls the Render API directly. A WAF on www.foodnova.com.ng alone does not cover that request path.

| Scope | Required behavior |
|---|---|
| Host/origin coverage | Cover the deployed API hostname, direct onrender alias and any alternate route to the same public endpoint. Prove an attacker cannot bypass a custom-domain WAF by using the origin. |
| Path | Match normalized `/tracking/public` and its trailing-slash variant; include a gateway `/api` alias only if actually configured. No blanket rules over checkout, callbacks, payment or dispatch routes. |
| Methods/CORS | Permit valid POST and required OPTIONS preflights; reject unsupported methods without returning tracking data. Do not count normal preflights as lookups. |
| Request size/type | Reject decoded bodies over 1024 bytes, including chunked requests; require the supported JSON content type and reject unsupported encodings. Count malformed/rejected traffic at the edge too. |
| Burst limit | Initial staging policy: at most 6 POSTs/min/IP, with a 15min mitigation interval. Normal public polling is once/min. Validate shared-NAT impact before production. |
| Sustained limit | At most 30 POSTs/15min/IP at ingress, preferably rolling where supported; retain the application's shared IP/network/reference budgets. Edge rules complement rather than replace them. |
| Distributed abuse | Monitor global volume, high unavailable/429 ratios and automated sequential scans; use the provider's approved bot/abuse controls. No claim that per-IP throttling stops a botnet. |
| Privacy | Do not log bodies, order references, query values, auth headers or customer information. Keep only necessary short-retention operational aggregates/correlation data. |

Render custom domains can retain a directly reachable onrender alias; [Render documents alias control](https://render.com/docs/custom-domains#disabling-your-onrendercom-subdomain). That alone is not proof that every alternate path to a custom origin is protected. Existing Vercel/Render account capabilities and any origin-authentication/access controls need operator verification. If the current plan/topology cannot enforce these controls, report that fact and obtain an approved equivalent design; do not silently add a proxy/provider, disable an origin or change environment settings.

### CMS durability and music

The new review test invokes the real existing announcement create/edit/list handlers and Website Settings PATCH with fixture sessions. Unauthenticated, customer and stock-manager writes are denied. The existing broadcast-manager role can create an inactive draft, edit text/link/priority/schedule, publish it and disable the ticker. Fresh database sessions and a second client read the persisted revision/flag; the three existing audit-log entries also persist. An unauthorized overwrite leaves the stored revision intact. This proves real transaction/persistence behavior in isolated fixtures, not an undisclosed production CMS write.

The ticker still shares the existing announcement read with campaigns and refreshes without a frontend rebuild. No duplicate admin system/storage exists. Music remains disabled and unconfigured. Default mount does not fetch/create/play a recording. A new missing/rejected-asset regression confirms that even a future configured asset failure is caught without breaking other feedback or cleanup. No audio file or licence was added; the approved-asset requirement is unchanged.

### Exact release sequence and rollback

1. **Do not deploy while the above gates are unverified.** Review the fix commit and test evidence. Check the existing order_tracking_limits schema/primary key, retention columns and unchanged security flags through an authorized read-only operational review. Do not run any migration for this fix.
2. Rehearse the actual ingress/proxy and API-origin edge policy on approved staging with synthetic records, shared PostgreSQL and multiple workers. Verify CMS persistence, generic failures, private workflows and quotas there. Keep production credentials/data out of the rehearsal.
3. Obtain the normal release authorization only after gate evidence supports GO. Coordinate independent deployments: hold frontend production promotion while deploying the approved backend commit to Render. If a main merge auto-deploys both platforms, establish that release control before merging; this task does not change it.
4. Validate backend health, schema prerequisites, public allowlist/no-store headers and old authenticated/capability endpoints first. Use an approved synthetic record; never enumerate real production orders as a smoke test. The old frontend continues to work with the additive backend.
5. Promote the frontend to Vercel only after backend readiness. A new frontend against an old backend shows generic public-tracking unavailability, not private data or an auth bypass; this fallback is not a successful release. Preserve the approved API base/CORS settings and all customer-deletion, payment and receipt-security flags.
6. Through the authorized CMS, review/publish actual top_bar announcements and the global switch; wait for the existing visible-page refresh or reload. Keep Music disabled. Smoke-test public UI, existing cart/auth/checkout entry, mobile navigation and reduced motion without creating live orders.

Rollback: restore the last known-good Vercel frontend first, then restore its compatible backend deployment (pre-feature main is 6b10d3e). Retain independently validated proxy/WAF protections; do not blindly restore an unsafe forwarding configuration. The new client-identity fix requires no schema rollback, counter deletion, customer restoration or receipt changes. Keep all retention migrations and private evidence utilities intact. Old code ignores the ticker JSON setting. For source rollback create a separate reviewed revert branch; never reset/force-push main. No rollback/deployment action was executed during this review.

### Review validation and scope

The reviewed frontend runtime source/assets/package lock/Vercel config are byte-for-byte unchanged from a330d09; only an additional music-failure test was added. The implementation was not recreated or redesigned. A fresh production compilation was performed for validation.

Executed review checks:

| Check | Result |
|---|---|
| Focused public tracking and readiness tests | 61 passed, including 22 new readiness cases; the three identity regressions failed before the fix |
| Backend suite: `python -m pytest -q --disable-warnings tests --ignore=tests/test_retained_orders_postgres.py` | 482 passed; 16 subtests passed; 3463 existing framework warnings |
| `npm --prefix frontend test -- --run --reporter=basic` | 111 passed, zero failures |
| `npm --prefix frontend run lint` | Passed |
| Fresh Vite production build | Passed, 1544 modules transformed |
| Python syntax: public route, public helper and new readiness tests | Passed |
| `npm --prefix frontend run test:cinematic` (fresh build + Edge/Playwright) | 13 passed, runner exit 0; 4.2min browser run |
| `git diff --check` | Passed |

Backend tests used isolated SQLite fixtures (`DATABASE_URL=sqlite:///./test_foodnova_contracts.db`, no production connection) and an empty application proxy allowlist unless a test explicitly supplied synthetic peers. The opt-in live PostgreSQL module was excluded: no migration, multi-worker PostgreSQL concurrency or deployed ingress rehearsal is claimed.

The browser suite exercised the fresh local production bundle at 1440, 1024, 768, 390, 360 and 320px: real catalogue reads/prices/photos, cart persistence/checkout entry, scroll/reduced-motion states, catalogue failure, canonical preview redirect, CMS ticker fixtures, disabled music/fallbacks, and number-only public tracking fixtures. Existing page-error and overflow assertions passed. Browser POST responses for tracking and CMS changes were isolated fixtures, not production writes or proof of deployed authorization. Captures remain under `.codex-attachments/cinematic-validation` and `.codex-attachments/cinematic-phase2-validation`, excluded from Git.

Review changed-file manifest: this document, `backend/routes/public_order_tracking.py`, `backend/services/public_order_tracking.py`, `tests/test_public_tracking_readiness.py`, and `frontend/test/homepage-tracking-enhancements.test.mjs`. Build output, captures and unrelated local files are not part of the release commit.

An AST comparison against pre-feature main 6b10d3e shows that the only changed backend/main.py definitions are default_website_settings, normalize_website_settings, WebsiteSettingsPayload and get_active_announcements. Payment, dispatch and order lifecycle functions are identical. Models, authentication, checkout/cart state, customer-deletion/retention services, private receipt services and production migration utilities remain unchanged. The intentional order-placed email CTA change in a330d09 remains; recipient, payment approval and invoice logic were not changed by this review.
