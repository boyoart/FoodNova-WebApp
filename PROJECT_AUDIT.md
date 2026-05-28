# FoodNova Project Audit

## Scope

This audit covers the customer shopping app migration from the existing FoodNova web application to the native Flutter Android app in `foodnova-customer-app`.

The web app and backend remain the source of truth. The Flutter app must consume existing backend APIs and database-backed behavior. It must not create a second backend, separate database, or duplicate order, payment, inventory, profile, or admin synchronization logic.

Explicitly out of scope for this customer app:

- Delivery rider systems
- Messenger systems
- Dispatch dashboards
- Rider onboarding or KYC
- Geofencing, panic alerts, rider location tracking
- Outsourced rider architecture

## Repository Structure

- `backend`: FastAPI backend with SQLAlchemy models, JWT authentication, customer shopping endpoints, admin endpoints, notifications, inventory, announcements, and file uploads.
- `frontend`: React/Vite web application and Capacitor wrapper. This is the current customer and admin source of truth.
- `foodnova-customer-app`: Flutter customer app shell. It already uses Riverpod, Dio, GoRouter, Flutter Secure Storage, Firebase packages, and a feature-first folder structure, but it is not yet feature-complete.
- `delivery-android`: Native delivery/rider Android app. This is outside the customer shopping scope.
- `frontend/android` and root `android`: Capacitor/native Android artifacts for the web app, not the Flutter customer app target.

## Backend Architecture

The active backend implementation is `backend/main.py`. The files in `backend/routes/*.py` appear to be an older router-style layer and are not the main live API surface used by the current web client.

Backend technology:

- FastAPI application
- SQLAlchemy ORM
- Database configured by `DATABASE_URL`, defaulting to SQLite through `backend/database.py`
- JWT bearer authentication using `JWT_SECRET`, `JWT_ALGORITHM`, and `JWT_EXPIRE_MINUTES`
- File uploads under `uploads/`, with optional Cloudinary integration
- Email notifications through `backend/email_service.py`
- Firebase Admin support for push messaging, currently most relevant to worker code, not fully exposed for customer FCM registration

Primary customer data models:

- `User`: customer/admin account data, password hash, active flag, role, permissions
- `Profile`: customer profile details and avatar
- `Address`: saved delivery addresses
- `Product`: grocery/foodstuff catalog, stock, category, image, active flag
- `Pack`: curated food packs, item list, image, active flag
- `Order`: order, payment, fulfillment, delivery, cancellation, and receipt state
- `OrderItem`: line items for products and packs
- `Notification`: customer notification center records
- `Announcement`: homepage banners, top bars, popups, and promotions
- `Broadcast`: admin-created customer broadcast messages
- `PaymentApprovalLog`: admin payment approval/rejection history
- `CancellationRequest`: customer cancellation/refund requests

## Authentication Flow

Web customer auth uses `frontend/src/services/api.js`, `frontend/src/store/authStore.js`, and `frontend/src/utils/sessionManager.js`.

Customer signup:

- Web endpoint: `POST /auth/register`
- Backend creates a `User` with role `customer`, creates a `Profile`, hashes password, and returns an auth response.
- Response includes token aliases such as `access_token` and `token`, plus user data.

Customer login:

- Web endpoint: `POST /auth/login`
- Supports email or phone payload fields, though the web login uses email.
- Rejects inactive, removed, deactivated, admin, messenger, and rider accounts from the customer app.
- Creates a JWT and returns user data.

Session persistence:

- Web persists token in `localStorage` keys `token` and `foodnova_token`.
- Web persists user in `user` and `foodnova_user`.
- Web session timeout uses `foodnova_last_activity`: 30 days for customers.
- Flutter currently persists only `access_token` in Flutter Secure Storage.

Token refresh:

- No explicit refresh-token endpoint was found.
- Current JWT expiry defaults to `JWT_EXPIRE_MINUTES=10080` unless configured.
- Mobile should treat 401 as session expiry and clear secure storage.

Logout:

- Web clears customer token/user keys.
- Flutter currently clears `access_token` through `SessionController`.

Forgot password:

- Flutter has a `forgot_password_screen.dart`.
- No active customer forgot-password/reset API was found in the backend or web API layer.
- This must be marked blocked until backend support exists, unless an existing private flow is later identified.

## API Endpoints

The web app primarily consumes root endpoints, not `/api` endpoints:

- `GET /products`
- `GET /packs`
- `GET /categories`
- `POST /auth/login`
- `POST /auth/register`
- `GET /auth/me`
- `POST /auth/change-password`
- `GET /profile`
- `PATCH /profile`
- `POST /profile/avatar`
- `GET /profile/addresses`
- `POST /profile/addresses`
- `PATCH /profile/addresses/{id}`
- `DELETE /profile/addresses/{id}`
- `PATCH /profile/addresses/{id}/default`
- `POST /orders`
- `GET /orders/my`
- `GET /orders/{id}`
- `POST /orders/{id}/receipt`
- `POST /orders/{id}/confirm-delivery`
- `POST /orders/{id}/cancel-request`
- `GET /orders/{id}/cancel-request`
- `POST /track-order`
- `GET /notifications`
- `GET /notifications/unread-count`
- `PATCH /notifications/{id}/read`
- `PATCH /notifications/read-all`
- `DELETE /notifications/{id}`
- `DELETE /notifications`
- `GET /announcements/active`

The backend also exposes `/api/...` aliases for a subset of customer endpoints. Some are incomplete:

- `GET /api/cart` returns 501 because persistent server-side cart is not enabled.
- `POST /api/payments/initialize` returns 501 because Paystack initialization is reserved for Phase 2.
- `/api/orders` aliases `GET /orders/my` and `POST /orders`.

Migration decision:

- The Flutter app should use the same customer endpoints as the web app unless a verified `/api` alias has full feature parity.
- Current Flutter uses base URL `${backend}/api`, which causes gaps versus the web app. This needs correction or a compatibility layer inside the Flutter API client.

## Database Interactions

The backend is the only writer to the database. Flutter must never write directly to the database.

Important interactions:

- Registration creates `users` and `profiles`.
- Login reads `users` and verifies password hash.
- Product and pack listing reads `products` and `packs`.
- Categories are derived from product category fields.
- Order creation validates and deducts inventory from `products`.
- Order creation writes `orders` and `order_items`.
- Receipt upload writes receipt metadata into `orders.receipt`, sets `payment_status=receipt_submitted`, and creates notifications.
- Admin payment approval/rejection updates `orders.payment_status`, logs `payment_approval_logs`, and creates customer notifications.
- Admin product/pack changes update catalog tables and must be reflected in the app by refresh/invalidation.
- Profile/address operations read/write `profiles` and `addresses`.
- Notifications read/write `notifications`.
- Announcements read/write `announcements`.

## Product And Category Systems

Product fields surfaced by the backend:

- `id`
- `name`
- `price`
- `stock_qty`
- `stock`
- `category`
- `category_name`
- `image_url`
- `description`
- `is_active`
- `created_at`
- `updated_at`

Pack fields surfaced by the backend:

- `id`
- `name`
- `description`
- `price`
- `image_url`
- `items`
- `is_active`
- `created_at`
- `updated_at`

The web app normalizes products and packs into a shared cart item shape with `type` or `item_type`.

Current issues:

- The public `GET /products` and `GET /packs` endpoints return all rows from the DB in `backend/main.py`; they do not obviously filter `is_active`.
- Deleted/inactive products can still appear unless filtered by backend or client.
- Flutter `ProductRepository` caches product/category data in memory without robust invalidation.
- Flutter currently does not expose packs as a first-class shopping surface.

## Cart Logic

Web cart:

- Implemented in `frontend/src/store/cartStore.js` using Zustand and `localStorage`.
- Cart key: `cart`.
- Supports product and pack item types.
- Adds quantity when the same product/type already exists.
- Prevents product quantity above available stock.
- Blocks out-of-stock products.
- Does not persist cart server-side.

Backend cart:

- `GET /api/cart` returns 501: persistent server cart is not enabled.

Flutter cart:

- Implemented in `foodnova-customer-app/lib/features/cart/data/cart_controller.dart`.
- Currently memory-only Riverpod `StateNotifier<List<CartItem>>`.
- Does not persist to disk.
- Does not yet support pack item typing, stock ceiling, or stale cart reconciliation with the backend catalog.

Required migration:

- Use local persistent cart in Flutter because the backend has no cart service.
- Persist cart in device storage.
- Revalidate cart against latest product/pack data before checkout.
- Remove or flag inactive/deleted/out-of-stock items.

## Checkout Logic

Web checkout behavior:

- Requires customer auth.
- Loads profile and saved addresses.
- Supports delivery and pickup.
- Supports saved address or new manual/Google-assisted address.
- Can save new addresses and mark default.
- Requires state, city, full address, and landmark for delivery.
- Builds `OrderPayload` and posts to `POST /orders`.
- Sets `payment_method=bank_transfer`.
- Sends subtotal as `total_amount` and `total`.
- Delivery fee is not included in product total. Web copy says delivery fee is paid after delivery.
- Clears local cart after order creation.

Backend checkout behavior:

- Normalizes items.
- Validates and deducts inventory.
- Creates order code `FN-xxxxx`.
- Saves delivery address snapshot and line items.
- Creates customer and admin order notifications/emails.

Current gaps:

- Promo codes are not backed by an API.
- Tax calculations are not visible in backend checkout.
- Delivery fee calculation is not backed by a customer API; web uses "paid after delivery" messaging.
- Flutter checkout posts through `/api/orders`, which aliases order creation, but the rest of its order/profile flow is incomplete.

## Payment Flow

Existing production flow is bank transfer plus receipt upload:

- Account Number: `6427173992`
- Bank: `OPay`
- Account Name: `FOODNOVA LIMITED`
- Reference: customer should use order code after placing the order.

Flow:

1. Customer places order.
2. Backend creates order with `payment_status=pending_payment`.
3. Customer transfers to FoodNova bank account.
4. Customer uploads receipt through `POST /orders/{order_id}/receipt`.
5. Backend sets `payment_status=receipt_submitted`.
6. Admin reviews payment in the admin dashboard.
7. Admin updates order payment to `payment_confirmed` or `payment_rejected`.
8. Backend creates notifications and payment audit logs.

Backend `POST /api/payments/initialize` returns 501, so online card/Paystack initialization is not active for customer parity.

## Promotions And Announcements

Promotional surfaces are powered by announcements:

- Public endpoint: `GET /announcements/active`
- Admin endpoints manage `Announcement` records.
- Supported display types include top bar, hero banner, and popup.
- Announcement fields include title, message, button text/link, image URL, theme, priority, active dates, and active flag.

The web homepage uses announcements as dynamic banners/promotions.

Mobile must implement:

- Top banner or hero carousel from active announcements.
- Popup or modal treatment where appropriate.
- Image URL resolution for `/uploads/...`.
- Admin sync by refreshing active announcements.

## Inventory Systems

Inventory is managed through backend product stock fields and admin stock screens.

Order creation calls backend inventory validation and deduction:

- Product lookup by `product_id` or name.
- Requested quantity is compared with available stock.
- Insufficient stock returns an error.
- Successful order creation deducts stock.
- Low/out-of-stock events can trigger admin alerts.

Mobile must:

- Display stock state.
- Block adding more than available stock.
- Revalidate stock before checkout.
- Refresh catalog after admin changes and after order placement.
- Remove inactive/deleted products from UI and cart.

## Customer Profile Systems

Profile endpoints:

- `GET /profile`
- `PATCH /profile`
- `POST /profile/avatar`
- `GET /profile/addresses`
- `POST /profile/addresses`
- `PATCH /profile/addresses/{id}`
- `DELETE /profile/addresses/{id}`
- `PATCH /profile/addresses/{id}/default`

Web behavior:

- Loads profile and addresses together.
- Supports avatar upload.
- Supports local fallback addresses if remote address calls fail.

Mobile migration note:

- Native app should avoid hiding backend failures with silent local-only profile/address data, because that can cause checkout mismatches.
- Offline drafts can exist, but they must be labeled pending sync and validated before checkout.

## Notifications

Backend notifications:

- Customer notifications are stored in `notifications`.
- Order placement, receipt upload, payment updates, delivery/order status updates, cancellation requests, and admin service notes create notifications.
- Customer notification endpoints support list, unread count, mark read, mark all read, delete, and clear.

Web also derives local notifications from orders and local broadcast storage. Native should prefer backend notifications as source of truth and only derive local display badges when clearly marked as local UI state.

FCM:

- Flutter includes Firebase Messaging dependencies and a defensive bootstrap.
- No customer FCM token registration endpoint was found. Existing token registration is for delivery workers.
- Push notifications for customers require backend support before production parity.

## Admin Synchronization

Admin dashboard changes affect customer app through shared backend tables:

- Product create/update/delete changes `products`.
- Pack create/update/delete changes `packs`.
- Stock updates change `stock_qty` and `stock`.
- Announcement changes affect `GET /announcements/active`.
- Payment/order updates affect `orders`, `notifications`, and payment logs.
- Broadcasts create customer notification rows.

No verified customer Socket.IO server endpoints were found in FastAPI. Flutter contains `RealtimeService` using Socket.IO events like `order:subscribe`, but backend support was not found in the audited FastAPI app.

Required mobile sync strategy:

- Use refresh-on-resume.
- Use pull-to-refresh.
- Invalidate product/category/order/notification caches after mutations.
- Poll order detail or order list while an order detail screen is open until real realtime support is verified.
- Treat Socket.IO as experimental until backend events are confirmed.

## Reusable Business Logic

Reusable logic to mirror in Flutter repositories/controllers:

- API response normalization: web handles arrays, `{data}`, `{products}`, `{orders}`, etc.
- Media URL resolution: absolute URLs, data/blob URLs, `/uploads/...`, and `uploads/...`.
- Product normalization: name, price, image, category, stock, low-stock state, item type.
- Cart quantity and stock rules.
- Checkout address formatting and validation.
- Order status and payment status labels.
- Receipt upload validation.
- Notification merging/read/delete semantics, preferably backend-first.
- Session expiry and account removal handling.

Business logic that must stay backend-owned:

- Password hashing and auth verification
- JWT creation
- Inventory deduction
- Order code generation
- Payment approval/rejection
- Payment audit logs
- Admin permissions
- Product, pack, and announcement writes
- Customer data persistence

## UI Branding Patterns

Web design tokens from `frontend/src/index.css`:

- Background: `#F8FAF7`
- Surface: `#FFFFFF`
- Secondary surface: `#F2FAF3`
- Text/heading: `#103820`
- Muted: `#64748B`
- Border: `#DDE8DD`
- Primary: `#087A34`
- Primary dark: `#065F2A`
- Accent: `#FFD23F`
- Accent green: `#A7D948`
- Success: `#06A77D`
- Danger: `#D62839`
- Warning: `#F77F00`

Flutter already mirrors these tokens in `foodnova-customer-app/lib/core/theme/colors.dart`.

Brand feel:

- Foodstuff/grocery shopping
- Clean, green, fresh, premium
- Rounded cards and soft shadows
- Prominent product images
- Clear stock badges
- Strong checkout trust and bank-transfer instructions

Current Flutter UI issue:

- Some existing copy still references delivery/rider concepts. Customer app copy should be shopping and order-focused, not rider-system-focused.

## Environment Configs

Backend:

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_ALGORITHM`
- `JWT_EXPIRE_MINUTES`
- `FRONTEND_URL`
- `FRONTEND_ORIGIN`
- `CORS_ORIGINS`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- Firebase Admin service account values
- NIN provider variables exist but are outside customer shopping scope

Frontend web:

- `VITE_API_BASE_URL=https://foodnova-webapp.onrender.com`
- Firebase web messaging keys are present but empty in the checked env file.
- Optional Google Maps key is referenced by address autocomplete.

Flutter:

- `FOODNOVA_API_BASE_URL` compile-time define defaults to `https://foodnova-webapp.onrender.com`.
- Current Dio base URL appends `/api`; this needs review because the web app uses root customer endpoints for complete parity.

## Key Risks

- Flutter currently uses partial `/api` aliases, while the web source of truth uses root endpoints.
- Server-side cart, promo codes, tax, wishlist, variations, customer FCM token registration, forgot password, and Paystack initialization are not currently backed by complete customer APIs.
- Public catalog endpoints may return inactive products/packs unless filtered.
- Flutter cart is memory-only and can become stale.
- Existing Flutter realtime Socket.IO service has no verified backend counterpart.
- Silent local fallbacks from web profile/address behavior should not be copied blindly into native checkout.

## Recommended First Implementation Direction

1. Align Flutter API client with web endpoints and response normalization.
2. Build a backend-backed catalog repository for products, packs, categories, and announcements.
3. Replace memory cart with persisted local cart plus server revalidation before checkout.
4. Implement customer auth and session guard with secure storage.
5. Implement shopping home, catalog, product detail, cart, checkout, orders, profile, addresses, and notifications feature-by-feature.
6. Keep unsupported features documented as blocked by backend contract rather than mocking them.
