# FoodNova API Mapping

## Base URLs

Production backend:

- `https://foodnova-webapp.onrender.com`

Web env:

- `VITE_API_BASE_URL=https://foodnova-webapp.onrender.com`

Flutter env:

- `FOODNOVA_API_BASE_URL`, default `https://foodnova-webapp.onrender.com`

Important migration note:

- The web app uses root endpoints such as `/products`, `/orders/my`, and `/profile`.
- The Flutter app currently appends `/api` in `core/network/api_client.dart`.
- Some `/api` aliases exist, but not all customer behavior is available there. Use the web endpoint where parity requires it.

## Auth APIs

| Feature | Web Endpoint | Existing `/api` Alias | Flutter Current | Mobile Target |
|---|---:|---:|---:|---:|
| Register | `POST /auth/register` | `POST /api/auth/register` | `POST /api/auth/register` | `POST /auth/register` or verified alias |
| Login | `POST /auth/login` | `POST /api/auth/login` | `POST /api/auth/login` | `POST /auth/login` or verified alias |
| Current user | `GET /auth/me` | `GET /api/auth/me` | Not complete | `GET /auth/me` |
| Change password | `POST /auth/change-password` | None found | Not complete | `POST /auth/change-password` |
| Logout | Local session clear | None | Local secure-storage clear | Local secure-storage clear |
| Forgot password | Not found | Not found | Screen exists only | Blocked by backend |

Auth payloads:

```json
{
  "email": "customer@example.com",
  "password": "Password123"
}
```

Register payload:

```json
{
  "full_name": "Customer Name",
  "email": "customer@example.com",
  "phone": "08000000000",
  "password": "Password123",
  "confirm_password": "Password123"
}
```

Auth response includes token aliases:

- `access_token`
- `token`
- `user`
- `data`

## Catalog APIs

| Feature | Web Endpoint | Existing `/api` Alias | Flutter Current | Mobile Target |
|---|---:|---:|---:|---:|
| List products | `GET /products?search=` | `GET /api/products?search=` | `GET /api/products` | `GET /products` or verified alias |
| Product detail | `GET /products/{id}` | `GET /api/products/{id}` | `GET /api/products/{id}` | `GET /products/{id}` or verified alias |
| List packs | `GET /packs?search=` | None found | Missing | `GET /packs` |
| Pack detail | `GET /packs/{id}` | None found | Missing | `GET /packs/{id}` |
| Categories | `GET /categories` | `GET /api/categories` | `GET /api/categories` | `GET /categories` or verified alias |

Product fields:

```json
{
  "id": 1,
  "name": "Rice 5kg",
  "price": 8500,
  "stock_qty": 100,
  "stock": 100,
  "category": "Rice",
  "category_name": "Rice",
  "image_url": "https://...",
  "description": "",
  "is_active": true
}
```

Pack fields:

```json
{
  "id": 1,
  "name": "Starter Pack",
  "description": "...",
  "price": 12000,
  "image_url": "https://...",
  "items": ["Rice", "Palm Oil"],
  "is_active": true
}
```

Mobile normalization:

- Treat product and pack as separate purchasable item types.
- Use `type` or `item_type` set to `product` or `pack`.
- Filter inactive items client-side until backend guarantees filtering.
- Resolve `/uploads/...` against backend origin.

## Announcements And Promotions

| Feature | Web Endpoint | Flutter Current | Mobile Target |
|---|---:|---:|---:|
| Active announcements | `GET /announcements/active` | Missing | `GET /announcements/active` |
| Admin announcements | `GET /admin/announcements` | Admin only | Out of scope for customer app |

Announcement fields:

```json
{
  "id": 1,
  "title": "Promo",
  "message": "Message",
  "display_type": "top_bar",
  "button_text": "Shop now",
  "button_link": "/products",
  "image_url": "/uploads/announcements/file.png",
  "theme": "green",
  "priority": 0,
  "is_active": true,
  "start_date": null,
  "end_date": null
}
```

Display type mapping:

- `top_bar`: compact home banner
- `hero_banner`: home hero carousel card
- `popup`: one-time modal or sheet

## Cart APIs

| Feature | Web Endpoint | Existing `/api` Alias | Flutter Current | Mobile Target |
|---|---:|---:|---:|---:|
| Cart storage | Local `localStorage` | `GET /api/cart` returns 501 | Memory-only Riverpod | Local persisted cart |
| Add/update/remove | Local only | None | Memory-only | Local persisted cart with revalidation |

Backend does not provide server-side cart persistence. Mobile should use local device storage and validate against catalog before checkout.

## Checkout And Orders

| Feature | Web Endpoint | Existing `/api` Alias | Flutter Current | Mobile Target |
|---|---:|---:|---:|---:|
| Create order | `POST /orders` | `POST /api/orders` | `POST /api/orders` | `POST /orders` or verified alias |
| My orders | `GET /orders/my` | `GET /api/orders` | `GET /api/orders` | `GET /orders/my` |
| Order detail | `GET /orders/{id}` | `GET /api/orders/{id}` | `GET /api/orders/{id}` | `GET /orders/{id}` |
| Public tracking | `POST /track-order` | None found | Missing/partial | `POST /track-order` |
| Confirm delivery received | `POST /orders/{id}/confirm-delivery` | `POST /api/orders/{id}/confirm-delivery` | Missing/partial | Existing endpoint if needed |
| Cancellation/refund request | `POST /orders/{id}/cancel-request` | None found | Missing | Existing endpoint |
| View cancellation request | `GET /orders/{id}/cancel-request` | None found | Missing | Existing endpoint |

Order create payload from web:

```json
{
  "customer_name": "Customer Name",
  "customer_email": "customer@example.com",
  "customer_phone": "08000000000",
  "phone": "08000000000",
  "delivery_method": "delivery",
  "delivery_address_id": 12,
  "delivery_address": "Full address",
  "address": "Full address",
  "delivery_address_snapshot": {},
  "delivery_notes": "Notes",
  "items": [
    {
      "id": 1,
      "product_id": 1,
      "item_type": "product",
      "type": "product",
      "name": "Rice 5kg",
      "product_name": "Rice 5kg",
      "price": 8500,
      "unit_price": 8500,
      "quantity": 2,
      "qty": 2
    }
  ],
  "payment_method": "bank_transfer",
  "total_amount": 17000,
  "total": 17000
}
```

Order status fields:

- `status`
- `payment_status`
- `order_status`
- `fulfillment_status`
- `cancellation_status`
- `refund_status`

Payment statuses:

- `pending_payment`
- `receipt_submitted`
- `payment_confirmed`
- `payment_rejected`

Order statuses:

- `order_placed`
- `processing`
- `ready_for_pickup`
- `out_for_delivery`
- `delivered`
- `cancelled`

## Payment APIs

| Feature | Web Endpoint | Existing `/api` Alias | Flutter Current | Mobile Target |
|---|---:|---:|---:|---:|
| Bank transfer instruction | Static app copy | N/A | Partial | Static copy matching web |
| Receipt upload | `POST /orders/{id}/receipt` multipart field `file` | `POST /api/orders/{id}/receipt` | Missing/partial | `POST /orders/{id}/receipt` |
| Payment initialization | None active | `POST /api/payments/initialize` returns 501 | Not active | Blocked |

Payment instructions:

```text
Account Number: 6427173992
Bank: OPay
Account Name: FOODNOVA LIMITED
Reference: Use your Order Code after placing the order.
```

Receipt upload:

- Method: `POST`
- Content type: multipart
- Field: `file`
- Auth: bearer token should be sent from mobile

## Profile And Address APIs

| Feature | Web Endpoint | Existing `/api` Alias | Flutter Current | Mobile Target |
|---|---:|---:|---:|---:|
| Get profile and addresses | `GET /profile` | `GET /api/users/me` | Missing/partial | `GET /profile` |
| Update profile | `PATCH /profile` | `PATCH /api/users/me` | Missing | `PATCH /profile` |
| Upload avatar | `POST /profile/avatar` | None found | Missing | `POST /profile/avatar` |
| List addresses | `GET /profile/addresses` | `GET /api/users/addresses` | Missing | `GET /profile/addresses` |
| Create address | `POST /profile/addresses` | `POST /api/users/addresses` | Missing | `POST /profile/addresses` |
| Update address | `PATCH /profile/addresses/{id}` | None found | Missing | `PATCH /profile/addresses/{id}` |
| Delete address | `DELETE /profile/addresses/{id}` | None found | Missing | `DELETE /profile/addresses/{id}` |
| Set default | `PATCH /profile/addresses/{id}/default` | None found | Missing | Existing endpoint |

Address required fields for delivery checkout in web:

- `state`
- `city`
- `address_line`
- `landmark`

Other supported fields:

- `label`
- `recipient_name`
- `phone`
- `street`
- `area`
- `lga`
- `country`
- `postal_code`
- `google_place_id`
- `latitude`
- `longitude`
- `is_default`

## Notification APIs

| Feature | Web Endpoint | Existing `/api` Alias | Flutter Current | Mobile Target |
|---|---:|---:|---:|---:|
| List notifications | `GET /notifications` | `GET /api/notifications` | Partial | `GET /notifications` |
| Unread count | `GET /notifications/unread-count` | None found | Missing | Existing endpoint |
| Mark read | `PATCH /notifications/{id}/read` | `PATCH /api/notifications/{id}/read` | Partial | Existing endpoint |
| Mark all read | `PATCH /notifications/read-all` | None found | Missing | Existing endpoint |
| Delete one | `DELETE /notifications/{id}` | None found | Missing | Existing endpoint |
| Clear all | `DELETE /notifications` | None found | Missing | Existing endpoint |

Notification categories:

- `order`
- `payment`
- `delivery`
- `service`
- `broadcast`

## Unsupported Or Blocked APIs

These features are in the requested product vision but are not currently backed by identified customer APIs:

| Feature | Status | Required Backend Contract |
|---|---|---|
| Forgot password | Blocked | Request reset, validate token/OTP, set new password |
| Promo codes | Blocked | Validate code, discount amount, order payload support |
| Tax calculations | Blocked | Tax quote in checkout summary |
| Product variations | Blocked | Variation schema on product detail and order items |
| Wishlist | Blocked | List/add/remove wishlist items per customer |
| Customer FCM registration | Blocked | Register/update/delete customer device token |
| Realtime customer order updates | Unverified | Socket/SSE/FCM event contract |
| Server cart | Not available | Cart CRUD endpoints |
| Paystack/card payments | Reserved | Payment initialize/verify flow |

Do not mock these as completed production features.

## Admin Sync Mapping

| Admin Action | Backend Table | Customer Mobile Effect |
|---|---|---|
| Create/update/delete product | `products` | Refresh catalog and cart validation |
| Create/update/delete pack | `packs` | Refresh pack catalog and cart validation |
| Stock update | `products.stock_qty`, `products.stock` | Update stock badge and quantity limits |
| Announcement update | `announcements` | Refresh home promotions |
| Payment approval/rejection | `orders`, `payment_approval_logs`, `notifications` | Refresh order detail/history and notifications |
| Order status update | `orders`, `notifications` | Refresh order timeline and notifications |
| Broadcast | `broadcasts`, `notifications` | Refresh notification center |

Recommended mobile sync behavior:

- Refresh products/packs/announcements on app resume and pull-to-refresh.
- Refresh orders/notifications on screen open and after mutations.
- Poll active order detail while detail screen is open until realtime is verified.
- Invalidate cart product snapshots after catalog refresh.
