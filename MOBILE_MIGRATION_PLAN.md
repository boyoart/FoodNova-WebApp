# FoodNova Mobile Migration Plan

## Goal

Build a production-grade native Flutter Android customer shopping app that mirrors the current FoodNova web shopping experience at `foodnova.com.ng`.

The Flutter app must consume the existing backend and preserve:

- Authentication and customer accounts
- Product, pack, category, and inventory systems
- Cart-to-order checkout behavior
- Bank-transfer payment and receipt upload flow
- Customer profiles and addresses
- Orders, status updates, notifications, and admin synchronization
- FoodNova visual branding

## Non-Goals

Do not implement or migrate delivery workforce systems:

- No rider dashboards
- No messenger dashboards
- No delivery KYC
- No geofencing
- No panic button
- No rider tracking
- No dispatch portals

Any existing code for those systems is ignored unless it affects shared customer models or exclusions.

## Architecture Standard

Use the existing Flutter app in `foodnova-customer-app` as the target and evolve it into a clean, feature-first app.

Required stack:

- Riverpod for state management
- Dio for networking
- GoRouter for navigation
- Flutter Secure Storage for tokens and sensitive auth state
- Firebase Cloud Messaging for push once customer token registration is supported
- Feature-first clean architecture
- Repository pattern
- Centralized API layer
- Responsive widgets and shared design system
- Offline-safe local state where backend does not provide persistence

Recommended structure:

```text
lib/
  config/
  core/
    network/
    storage/
    errors/
    routing/
    theme/
    widgets/
  shared/
    models/
    utils/
  features/
    auth/
      data/
      domain/
      presentation/
    onboarding/
    home/
    catalog/
    product_detail/
    cart/
    checkout/
    orders/
    profile/
    addresses/
    notifications/
```

## API Strategy

The web app uses root endpoints for complete customer parity. The Flutter app currently uses `/api` as its base path. The migration must fix this mismatch.

Plan:

1. Set Dio base URL to the backend origin only, for example `https://foodnova-webapp.onrender.com`.
2. Centralize endpoint paths in one customer API contract file.
3. Use root endpoints where web parity requires them.
4. Use `/api` aliases only after verifying the alias has the same behavior.
5. Normalize responses consistently because backend responses mix raw arrays and wrapped objects.

Do not create new backend logic unless a feature is proven impossible with current backend endpoints.

## Migration Phases

### Phase 0 - Documentation And Contract Lock

Deliverables:

- `PROJECT_AUDIT.md`
- `MOBILE_MIGRATION_PLAN.md`
- `API_MAPPING.md`
- `FEATURE_PARITY_CHECKLIST.md`

Exit criteria:

- Customer app scope is clear.
- Unsupported features are identified.
- API paths and source-of-truth behavior are mapped.

### Phase 1 - Core App Foundation

Tasks:

- Correct Dio base URL strategy.
- Add typed API client wrappers for customer endpoints.
- Add shared response parsing and error mapping.
- Add media URL resolver for `/uploads/...`.
- Add session guard and 401 handling.
- Add environment profiles for dev/staging/prod.
- Add production-safe logging.

Bug fixes covered:

- Duplicate API calls
- Weak error handling
- Improper navigation flow
- Inconsistent backend contract usage

### Phase 2 - Authentication And Onboarding

Tasks:

- Implement premium onboarding slides.
- Store onboarding completion locally.
- Request notification permission at the right moment.
- Implement login and signup against existing backend.
- Persist token securely.
- Restore sessions on launch.
- Implement logout.
- Add account removal/deactivation handling.

Backend dependency:

- Forgot password/reset API is not currently available. Keep UI disabled or route to support until backend support exists.

Exit criteria:

- User can install, onboard, register, log in, relaunch, and remain signed in.
- Removed/deactivated accounts are cleared from device on 401/403 account status errors.

### Phase 3 - Shopping Home And Catalog

Tasks:

- Fetch active announcements for banners/promotions.
- Fetch products, packs, and categories.
- Build premium grocery home screen with dynamic banners, category rail, featured products, food packs, and search entry.
- Build catalog with product/pack tabs.
- Add filtering, sorting, category switching, search, and stock display.
- Implement pull-to-refresh and app-resume refresh.
- Filter inactive/deleted products client-side until backend guarantees this.

Exit criteria:

- Admin product/pack/announcement changes appear after refresh/resume.
- Deleted/inactive/out-of-stock states are handled cleanly.

### Phase 4 - Product Detail And Cart

Tasks:

- Build product detail with image, price, category, description, stock, quantity selector, and add-to-cart.
- Add pack detail where needed.
- Persist cart locally.
- Revalidate cart items against latest catalog.
- Enforce stock ceilings.
- Remove stale/deleted items with user-friendly messaging.
- Add cart quantity controls and order summary.

Backend dependency:

- Product variations and wishlist do not currently have identified backend contracts.
- Implement UI only when backend fields/endpoints exist. Otherwise mark blocked.

Exit criteria:

- Cart survives app restart.
- Cart cannot exceed stock.
- Deleted products do not remain purchasable.

### Phase 5 - Checkout And Addresses

Tasks:

- Load customer profile and saved addresses.
- Add address list, create, edit, delete, and set default.
- Implement delivery and pickup checkout options.
- Validate required address and customer fields.
- Submit order to existing backend.
- Clear cart only after successful order creation.
- Refresh product inventory after order creation.

Backend constraints:

- Delivery fee is not calculated by backend. Current web flow says delivery fee is paid after delivery.
- Promo codes and tax are not currently supported by backend.

Exit criteria:

- Checkout matches web behavior.
- Orders are created in the same admin dashboard.
- Inventory deduction is backend-owned and visible after refresh.

### Phase 6 - Payments And Receipt Upload

Tasks:

- Show bank-transfer instructions after order creation and in order detail.
- Display FoodNova account details exactly as web app does.
- Implement receipt file/image upload to `POST /orders/{id}/receipt`.
- Show payment states: pending payment, receipt submitted, payment confirmed, payment rejected.
- Handle rejected payments with re-upload path.

Do not implement independent payment logic or a separate gateway.

Backend dependency:

- `POST /api/payments/initialize` returns 501 and is not active.

Exit criteria:

- Admin payment approval/rejection reflects in mobile order detail and notifications after refresh.

### Phase 7 - Orders, Tracking, Notifications

Tasks:

- Implement order history.
- Implement order detail and status timeline.
- Implement public/order-code tracking if needed.
- Implement cancellation/refund request flow.
- Implement delivery confirmation code entry only as a customer order completion feature.
- Implement notification center from backend notifications.
- Implement read, mark all read, delete, and clear.
- Poll/refresh order detail while active until true realtime support is verified.

Backend dependency:

- Flutter `RealtimeService` assumes Socket.IO, but no matching FastAPI Socket.IO endpoints were found.
- Customer FCM token registration endpoint was not found.

Exit criteria:

- Admin status changes are visible after refresh or polling.
- Notification center reflects backend updates.

### Phase 8 - Profile And Account Settings

Tasks:

- Profile view/edit.
- Avatar upload.
- Saved addresses management.
- Change password.
- Logout.
- Account settings and legal/support links.

Backend dependency:

- Forgot password remains blocked unless backend endpoint is added.

### Phase 9 - Production Hardening

Tasks:

- Add form validation coverage.
- Add loading, empty, and error states for every screen.
- Add retry affordances.
- Add analytics/crash reporting after Firebase config is provided.
- Add smoke tests for repositories and critical flows.
- Test Android release build.
- Test on small, medium, and large Android viewports.
- Verify admin sync workflows end to end.

## State Management Plan

Use Riverpod consistently:

- `AsyncNotifier` or `Notifier` for feature state.
- `FutureProvider` only for simple read-only data.
- Repository providers for API access.
- Separate local cache controllers for cart/session/onboarding.

Caching rules:

- Products/categories/announcements refresh on app resume and pull-to-refresh.
- Cart persists locally but validates against latest catalog before checkout.
- Orders and notifications refresh when screen opens and after mutations.
- Never show stale deleted products as purchasable.

## Navigation Plan

Route groups:

- Public: splash, onboarding, login, signup, forgot password/support fallback
- Shopping: home, catalog, search, product detail, cart
- Authenticated customer: checkout, orders, order detail, receipt upload, notifications, profile, addresses

Navigation guards:

- Redirect unauthenticated users away from checkout/orders/profile.
- Restore session before deciding initial route.
- Clear session on account removed/deactivated response.

## Design System Plan

Use the existing FoodNova tokens already mirrored in Flutter:

- Primary green: `#087A34`
- Dark green: `#065F2A`
- Fresh background: `#F8FAF7`
- Surface: `#FFFFFF`
- Accent gold: `#FFD23F`
- Muted text: `#64748B`

UI requirements:

- Native grocery app feel, not a template.
- Dense but polished shopping cards.
- Product images first.
- Clear price and stock state.
- Compact quantity steppers.
- Smooth route and cart animations.
- Strong trust cues in checkout and payment.
- No rider/delivery-workforce language in customer shopping surfaces.

## Backend Dependencies And Blockers

Currently blocked or unsupported by existing customer backend:

- Forgot password/reset flow
- Promo code validation
- Tax calculation
- Product variations
- Wishlist persistence
- Customer FCM token registration
- Verified customer realtime socket events
- Server-side persistent cart
- Active Paystack/card payment initialization

These should not be mocked as production features. They should remain unchecked in the parity checklist until a backend contract exists.

## Milestone Reporting Format

At every feature milestone, report:

- Completed work
- Modified files
- Pending work
- Architecture improvements
- Backend dependencies
- Unresolved blockers
- Verification performed

## Immediate Next Step After Docs

Begin Phase 1 by correcting the Flutter API contract and building the centralized customer API layer, then proceed feature-by-feature through auth, catalog, cart, checkout, orders, profile, and notifications.
