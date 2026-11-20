# FoodNova cinematic homepage production preparation

## Approval and production audit

Owner approved the localhost implementation at `7e235fa` on `feat/foodnova-cinematic-homepage`. Latest fetched `origin/main` remains `9f435af4b44a052a1475bc28e566184769095b4b`; it is already an ancestor of this branch. There are no incoming changes or merge conflicts. Main currently routes `/` to the original HomePage.jsx. This release changes the feature branch only; merging and deployment require a separate operator action.

The earlier audit traced the React/Vite AppLayout, CMS `/announcements/active`, existing product/category/pack APIs, Zustand cart, checkout-return authentication, consent analytics and shared navigation/tracking. The supplied 30.32-second reference video was reviewed locally; its cream/dark editorial composition and scroll-linked ingredient assembly informed motion using actual FoodNova packaged-product photographs. No reference images, generated product images or fictional products are used.

## Production routing and preservation

- `/` lazy-loads the approved CinematicHomePage through Suspense.
- `/preview/cinematic-homepage` redirects to `/` with history replacement. There is one homepage implementation, no duplicated loading/cart logic and no public preview banner.
- The root frame uses `cinematic-homepage-frame` for the previously approved footer wrapping and compact accessible tracking shortcut. Other routes do not receive these styles.
- Original `frontend/src/pages/HomePage.jsx` and `HomePage.css` remain byte-for-byte unchanged from main for rollback. They are not imported by the new App route, preventing legacy homepage CSS from affecting the cinematic page.
- Shared Navbar/Footer, catalogue API client, cart/auth stores, checkout, tracking, Admin, payment, customer deletion, receipt utilities, backend and database implementations remain unchanged.

## Catalogue and shopping contracts

The page renders the hero, five-product pantry assembly, CMS campaigns, three product stories, all active Food Packs, API category cards, eight photo-led pantry picks, existing ShoppingWidgets, trust copy and final CTA. Product names, photographs, weights, selected variant prices, pack contents and availability come from existing APIs. Missing prices remain unavailable. Genuine raster photographs are selected; missing category photos use text-led cards rather than invented images.

Audited real products include Foreign Rice, Honey Beans, Garri Ijebu, Palm Oil, Vegetable Oil, Grounded Egusi, Milk and Milo. Actual packs are Starter Pack, Gift Combo and Full Package. These are observations, not fixed prices or hardcoded stock. All active packs remain visible regardless of stock, with neutral enquiry where purchase is unavailable. Catalogue-only Cloudinary delivery optimization falls back to original photographs; it never transforms receipt media or branding artwork.

Add to Cart reuses existing fresh-price/stock revalidation and Zustand persistence. Changed prices require customer review before adding again. Product/category/pack links use existing catalogue routes. ShoppingWidgets reuses basket building, recently viewed and authenticated buy-again. No duplicate checkout or customer database exists.

## Motion and accessibility

GSAP/ScrollTrigger dynamically load when motion is allowed. Scoped matchMedia manages desktop/mobile/reduced-motion conditions. Desktop uses reserved-height CSS sticky scenes and scrubbed product transforms; mobile uses gentler transforms and ordinary document flow. No essential text starts transparent. Missing animation support leaves static content visible. Scoped teardown reverts transforms and triggers, disconnects ResizeObserver and cancels queued refresh on unmount. Refresh is coalesced through requestAnimationFrame; no global killAll or scroll hijacking is used.

## Validation

From repository root:

```powershell
npm --prefix frontend ci
npm --prefix frontend test -- --run --reporter=basic
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:cinematic
git diff --check
```

`test:cinematic` includes a fresh build and an isolated production-preview server on 5186. On Windows it uses installed Edge; elsewhere bundled Chromium, with optional PLAYWRIGHT_CHANNEL override. Browser tests block non-GET/HEAD/OPTIONS requests; they never submit live orders, registrations, payments or telemetry. They read public catalogue data only. API failures are browser-local intercepts, not server mutations.

Eight browser cases cover root layouts at 1440/1024/768/390/360px, actual photos/prices/categories/packs, tracking link, cart add/reload persistence, mobile menu, checkout entry, scrolling/unmount/remount/reduced motion, unavailable catalogue, preview redirect and initially reduced-motion mobile. Screenshot artifacts remain untracked under `.codex-attachments/cinematic-validation/`. These are viewport-emulated Edge checks, not physical iPhone/Android or Safari certification.

Current promotion validation results (19 November 2026):

- Complete frontend suite: **102 passed, 0 failed**.
- ESLint: passed.
- Fresh production build: passed (56.14 seconds).
- Production-build browser suite: **8 passed** across all five viewport widths, root shopping/cart/checkout checks, motion cleanup/reinitialization, runtime and initial reduced motion, API failure and preview redirect.
- Desktop and mobile captures visually reviewed; no review banner, missing hero images or horizontal overflow.
- Git whitespace checks passed. Protected application paths and original homepage match latest main; approved motion, catalogue helper and dependencies match `7e235fa`.
- No merge conflicts; main was already contained in the feature branch. Physical-device and Safari verification remain outside this emulated Edge run.

## Operator deployment checklist (not executed)

1. Review the final feature-branch commit and validation below. If main moves, reconcile it and rerun checks without overwriting production security/migration history.
2. Merge only after separate release authorization. This task neither merges nor deploys.
3. Use existing Vercel frontend build configuration: `npm --prefix frontend run build`, output `frontend/dist` when repository-root based (retain the currently configured frontend root/output if configured there). No environment variables or backend/Render release are required.
4. After an authorized frontend deployment, verify `/` headline and images at desktop/mobile widths; confirm `/preview/cinematic-homepage` reaches `/`, catalogue links, tracking, cart persistence, account/login and checkout entry. Test scrolling and reduced motion. Do not create live orders merely as a smoke test.
5. Monitor browser errors and API failures. Existing payment and customer-security flags must remain unchanged.

## Rollback

Keep the approved preview commit `7e235fa` and original HomePage.jsx/CSS. Preferred immediate operational rollback, when separately authorized, is Vercel's previous known-good frontend deployment. Do not roll back the backend, schema, receipt utilities or security settings for this UI change.

For source rollback on an isolated branch after this promotion commit is known:

```powershell
git fetch origin
git switch -c rollback/cinematic-homepage origin/main
git revert <production-homepage-promotion-commit>
npm --prefix frontend test -- --run --reporter=basic
npm --prefix frontend run lint
npm --prefix frontend run build
```

Review/release the rollback separately; never reset or force-push main. Reverting this single promotion restores the original root route and approved preview route/styles/notice together, with the untouched HomePage implementation. If later commits depend on new routing, resolve the revert deliberately. No database migration, data restoration, environment update or Cloudinary change is needed.

## Promotion changed-file manifest

- `frontend/src/App.jsx`: canonical route and preview redirect; original homepage import removed.
- `frontend/src/pages/CinematicHomePage.jsx`: review-only banner removed.
- `frontend/src/pages/CinematicHomePage.css`: root-only chrome class and obsolete preview-banner styles removed.
- `frontend/test/cinematic-homepage.test.mjs`: canonical/redirect contract.
- `frontend/e2e/cinematic.spec.js`: root-route browser checks, cleanup navigation and alias/reduced-motion coverage.
- `FOODNOVA_CINEMATIC_HOMEPAGE.md`: production preparation and rollback instructions.

Unrelated local/untracked work is preserved. No dependency changes are required for this promotion. Previously observed npm advisories were not addressed with unrelated upgrades.
