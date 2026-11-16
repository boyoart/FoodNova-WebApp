# Branding and scroll reveal correction

Customer header: #171B19, secondary surfaces #202723, white navigation, #F5CB29 hover/active accents, #075338 search action. Existing sticky offset, compact navigation, search, authentication and cart logic remain unchanged.

The canonical original artwork is `frontend/public/branding/foodnova-logo.png` (828 × 394 RGBA). Its alpha channel already includes transparency, with transparent corners. White background plates came from `BrandLogo.css`, Flutter's DecoratedBox and the Expo Logo wrapper. Those wrappers are now transparent. The original white lettering details and wheel centres are preserved; no image pixels, colours or proportions were changed. Header/footer, customer auth/reset, Admin login/sidebar and mobile web share the canonical component; the app landing preview also references the canonical asset.

The previous reveal effect captured a fixed DOM snapshot, omitted lazy-loaded shopping widgets and restarted on catalogue count changes, cancelling running effects. One observer now lives for the homepage mount. A scoped child-list MutationObserver discovers asynchronously mounted cards and shopping panels, with WeakSet deduplication. IntersectionObserver triggers once at viewport entry, including tall sections; Web Animations applies a 650 ms fade-up and sibling stagger. Content has no hidden base state or animation fill. Reduced motion disconnects observers and cancels animations; unmount cleans up both observers.

## Mobile status and native follow-up

Both mobile projects are present. Flutter customer splash/login branding uses the existing transparent 828 × 394 approved asset through FoodNovaLogo; the shared white plate is removed and BoxFit.contain retained. Expo dispatch Logo uses the identical approved asset, now without its normal/inverse white plate. Expo splash configuration now references that approved asset with contain sizing instead of the old dispatch illustration. Package identifiers and app functionality are unchanged.

No mobile build, prebuild or deployment was performed. Checked-in Android dispatch density-specific `splashscreen_logo.png` files still contain the older illustration and must be regenerated through the established Expo native workflow during the next approved native release; they are also referenced by the launcher background, so blindly replacing them with a horizontal wordmark would risk Android masking/cropping. Flutter Android/iOS launcher icons and iOS launch image sets, Expo adaptive/notification icons and web favicon are not replaced with a tiny horizontal logo. A confirmed approved symbol-only master is needed before changing those platform icons. iOS icon opacity and Android adaptive safe areas require native release validation.

## Validation limits

The trusted browser connection failed. No responsive screenshots, runtime scroll recordings, actual 1440/1024/768/390/360 viewport checks or console/authenticated browser verification are claimed. Unit tests exercise observer entry, once-only behavior, late-mounted cards, cleanup, reduced motion and failure visibility; frontend tests/lint/build and public deployed asset checks provide separate release evidence.
