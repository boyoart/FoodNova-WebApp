# FoodNova cinematic homepage

## Audit before implementation

Branch `feat/foodnova-cinematic-homepage` starts at latest `origin/main` `9f435af` (receipt utility merge). `/` currently renders HomePage.jsx, with CMS banners from `/announcements/active`, public products/categories and separate packs. Public Navbar/Footer and floating cart/tracking are provided by AppLayout. The existing product detail flow lives inside ProductsPage; it is not an exported reusable card. Catalogue helpers normalize variants, availability and pack contents. ShoppingWidgets already provides fresh-price/stock revalidation, basket construction, pack comparison, recently viewed and authenticated buy-again. Zustand cart persistence, checkout-return authentication, tracking and consent analytics must be reused unchanged.

Public catalogue GET audit confirmed genuine product photographs for Foreign Rice, Honey Beans, Garri Ijebu, Palm Oil, Vegetable Oil, Grounded Egusi and other groceries. Some catalogue images are SVG illustrations; the cinematic photo selection must exclude placeholders/illustrations. Genuine active packs are Starter Pack, Gift Combo and Full Package, with configured components and Cloudinary photographs. All active packs remain displayed regardless of availability; unavailable purchases use existing neutral enquiry behavior. Category data contains overlapping legacy labels and illustration assets; category imagery should use only the API category photo or a photograph of an actual product in that category, with text-only cards where neither exists. No inferred family/singles categories or fictional discounts are justified.

Implementation boundaries: isolated preview route `/preview/cinematic-homepage`, lazy loaded; original `/`, HomePage.jsx and HomePage.css stay unchanged until explicit review/approval. Reuse existing API client, product helpers, cart and widgets. New page CSS stays under `.cinematic-homepage`, with `.cinematic-preview-frame` scoped footer wrapping and compact tracking-shortcut presentation only while the preview is mounted. GSAP/ScrollTrigger is the one motion dependency; scrubbed transforms and desktop sticky scenes must clean up through scoped matchMedia/context, respect reduced motion and retain visible static content if loading/initialization fails. Mobile motion is smaller with no forced desktop pinning. No backend, authentication, security, receipt, payment or database changes.

The owner subsequently supplied a Samsung Quick Share link to a 30.32-second screen recording. The original was downloaded and checksum verified, then eight evenly spaced frames were reviewed locally. The reference alternates cream and dark editorial food scenes, oversized headlines and scroll-linked separation/reassembly of ingredients. The preview adapts those principles to FoodNova's actual packaged-food photographs using a scrubbed five-product pantry assembly, product rotation/scale/depth, sticky desktop story scenes and smaller non-pinned mobile motion. Reference cooked-food imagery, advertising UI and video are not copied into the storefront or committed. Original packaged-product backgrounds remain intact; no cutouts or product images are generated.

## Implementation and data contracts

`CinematicHomePage.jsx` renders the hero, five-item pantry assembly, CMS campaigns, three API product stories, actual active Food Packs, API categories, eight photo-led pantry picks, existing shopping widgets, trust copy and final CTA. Navbar, canonical logo, Footer, tracking, consent and floating cart remain supplied by AppLayout. There is no second cart, checkout, authentication implementation or product database.

All product names, descriptions, weights, variant prices, availability, photographs, packs and components come from existing public endpoints. Featured selection prioritizes known staple names only when matching active API records with genuine raster photos exist; absent records are omitted. Pack names/descriptions/categories are never invented. Unknown prices stay unavailable rather than becoming zero. All active packs render regardless of component availability, with configured contents and the existing enquiry link when checkout is ineligible. Categories without genuine API/category-matched photographs remain text-led; legacy category overlap is a catalogue quality issue, not silently remapped data.

Products and packs use the existing fresh-stock/price validation helpers and Zustand addItem. A changed price is shown for review before a second add; stale/unavailable items cannot bypass validation. Product details link to existing `/products?product=<id>` and packs to the existing Food Packs search. Cart persistence, account creation/login return to checkout, payment and order submission remain untouched. Existing ShoppingWidgets supplies basket building, recently viewed and authenticated buy-again behavior.

The shared API client makes four parallel public GETs; each section tolerates independent failure and retry, and pending requests abort on unmount. No missing data is replaced with fixture products, estimates, testimonials or stock photos. The page is a merchandising selection, not an assertion that a paginated response represents business-wide metrics. CMS campaigns retain actual Admin copy/image/CTA through the existing normalizer; the fixed requested hero headline remains prominent.

GSAP and ScrollTrigger are dynamically imported only for the preview and only when motion is permitted. matchMedia scopes desktop/mobile/reduced-motion behavior; revert/unmount cleans up timelines and triggers without killing other pages' animations. Essential text never starts transparent. Motion is driven by scrolling, without autoplay, forced scrolling or a smooth-scroll dependency. CSS sticky positioning reserves desktop scene space; mobile and reduced motion use ordinary document flow. Standard/system typography, image aspect boxes, lazy below-fold photos and catalogue-only Cloudinary delivery optimization reduce overhead. An optimized product/pack photo falls back to its unmodified original if necessary; receipt media and logo assets are never transformed.

## Actual catalogue photographs used

Public API inspection on 19 November 2026 confirmed these active records. These are observed examples, not hardcoded application IDs/prices or a guarantee that the future catalogue remains identical. The exact `image_url` returned at runtime is authoritative.

| Product | API ID | Original API image filename |
|---|---:|---|
| Foreign Rice | 6 | product-b172252061774f1ca6fdd2df5325b6c1.png |
| Honey Beans | 7 | product-727ba88436734660951a333663632524.png |
| Garri Ijebu | 8 | product-d64cbb2a2fcb446da279e6887e28c1fd.png |
| Palm Oil | 24 | product-9cae93dc099346a2b2d1774b0f6ed329.png |
| Vegetable Oil | 15 | product-0f79c926269647f3a3ecf0a58dd2a7f7.png |
| Grounded Egusi | 23 | product-1977a1436501422383ac1cc35548c447.png |
| Milk | 25 | product-6e118128ed3247f6bf7f7cb069573767.jpg |
| Milo | 21 | product-6819348ea83145858bf55f14b1032c8c.jpg |

The three actual pack records are Starter Pack, Gift Combo and Full Package; their current API images and configured contents are used directly, including packs temporarily ineligible for online checkout. No fictional family/singles pack variants or discounts are introduced. Categories use matching actual photographs and retain their API names/filter links. The canonical approved FoodNova logo is reused through the unchanged existing branding components.

## Preview and rollback

From repository root:

```powershell
npm --prefix frontend ci
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5186 --strictPort
```

Open `http://127.0.0.1:5186/preview/cinematic-homepage`; `/` continues to render the original production homepage. This local server reads the configured existing public API; no production environment variable needs to change. Do not submit live orders while reviewing. Production-build preview is also supported through `npm --prefix frontend run build` then `npm --prefix frontend run preview -- --host 127.0.0.1 --port 5186 --strictPort`. Use a different free local port if necessary.

Only after design review and separate release approval should `/` be switched to the cinematic component. Retain the old HomePage.jsx/CSS and remove the preview notice as part of that separately reviewed promotion. Until then no root switch, main merge, production deployment or environment change is authorized. Rollback is removing the isolated preview route/files and associated dependency changes, or reverting this feature commit before any eventual promotion; no database migration or data rollback exists.

## Validation procedure

```powershell
npm --prefix frontend test -- --run --reporter=basic
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:cinematic
git diff --check
```

Playwright is a development-only integration/screenshot dependency. Its isolated production-preview server uses port 5186, one worker and installed Edge on Windows (bundled Chromium elsewhere); `PLAYWRIGHT_CHANNEL` can select another installed channel. Install Playwright Chromium separately when using a machine without a compatible browser. The in-app browser bridge was unavailable, and the desktop automation fallback was unreliable. A minimal isolated renderer check worked, but the installed Chrome channel stalled on localhost navigation; isolated Edge successfully loaded the same local application. Responsive checks therefore use Edge, without customer authentication. The test harness blocks all non-GET/HEAD/OPTIONS requests, preserving live orders, registrations, payments and analytics. API failure cases intercept only local test browser responses. No authentication is simulated as evidence of production authorization.

The implemented browser suite targets 1440, 1024, 768, 390 and 360px layouts, headline/image rendering, overflow, scroll-transform changes, reduced motion, API failure visibility, actual API-driven cart additions, reload persistence, mobile menu controls and anonymous checkout registration/login choices. Capture outputs go to `.codex-attachments/cinematic-validation/`, not Git. Viewport-sized hero/pack/product/finale captures avoid the memory overhead and misleading blank pin-spacing of whole-page captures; visible lazy images are awaited before section screenshots. Tracing is disabled for this resource-constrained host. This is viewport emulation, not a claim of physical Android/iPhone or Safari validation. Device checks and final owner approval remain release gates.

## Final validation results

- Complete frontend suite: **102 passed**. ESLint and fresh production build passed.
- All seven browser cases passed their assertions: 1440, 1024, 768, 390 and 360px; scrolling, cleanup and reduced motion; unavailable catalogue fallback. The runner exited successfully with 7 passed; isolated Edge teardown required closing its stalled test process after all assertions completed.
- Browser checks compare actual public API photographs, prices, active packs and categories; verify Add to Cart, reload persistence, mobile menu and checkout registration/login entry. No order is submitted. No uncaught JavaScript page errors were observed by the assertions.
- Screenshot review corrected final-heading contrast, hero badge spacing, photo decode timing and a 1024px footer overflow. A preview-only compact tracking shortcut preserves its accessible name and route while avoiding CTA obstruction. Shared Navbar/Footer/tracking source files remain unchanged.
- ScrollTrigger uses scoped matchMedia cleanup and one ResizeObserver with coalesced animation-frame refresh. Tests verify scroll transforms, removal of inline transforms on navigation, and visible static content under reduced motion.
- Screenshots are local, untracked review artifacts under `.codex-attachments/cinematic-validation/`: before-1440/390, after-1440/1024/768/390/360, packs/products/finale-1440/390, scroll-assembly-1440 and reduced-motion-1440 PNGs. Physical devices and Safari remain untested; owner design approval is required before promoting this preview.
- Original `/`, backend, migrations, receipt utilities, authentication, cart store, checkout and payment implementations are preserved. No production deployment, database access or main merge is part of this release.

## Intended changed-file manifest

1. `.gitignore`: generated browser-report exclusions.
2. `FOODNOVA_CINEMATIC_HOMEPAGE.md`: audit, implementation and review instructions.
3. `frontend/package.json` and `frontend/package-lock.json`: pinned motion and development browser-test dependencies and test command.
4. `frontend/src/App.jsx`: lazy isolated preview and preview-only frame class.
5. `frontend/src/components/CinematicMotion.jsx`: scoped accessible scroll motion.
6. `frontend/src/pages/CinematicHomePage.jsx` and `CinematicHomePage.css`: cinematic catalogue presentation.
7. `frontend/src/pages/cinematicCatalogue.js`: existing API data normalization and safe catalogue-photo selection.
8. `frontend/test/cinematic-homepage.test.mjs`: eight focused contracts.
9. `frontend/playwright.cinematic.config.mjs` and `frontend/e2e/cinematic.spec.js`: seven browser cases and screenshots.

Commit and push only these twelve files to `feat/foodnova-cinematic-homepage`. Preserve unrelated untracked files. Future promotion must deliberately apply the preview frame styling to the promoted route and remove the preview notice; it is a separate review and release.

npm reported 13 existing advisories before and after Playwright (5 moderate, 8 high); no unrelated automatic dependency upgrades were applied.
