# FoodNova Flutter Feature Parity Checklist

Legend:

- `[x]` Existing in web/backend and mapped
- `[ ]` Pending Flutter implementation
- `[blocked]` Requires backend contract or confirmed API support
- `[n/a]` Out of scope for customer shopping app

## Scope Guardrails

- `[x]` Customer shopping app only
- `[x]` Web app is source of truth
- `[x]` Existing backend, APIs, database, order, payment, inventory, customer, and admin systems preserved
- `[x]` Delivery rider systems excluded
- `[x]` Messenger systems excluded
- `[x]` Dispatch systems excluded
- `[x]` Rider dashboards excluded
- `[x]` Rider KYC/onboarding excluded
- `[x]` Geofencing and panic systems excluded

## Documentation Milestone

- `[x]` Repository structure audited
- `[x]` Backend source-of-truth file identified
- `[x]` Web customer API usage audited
- `[x]` Flutter shell architecture audited
- `[x]` Unsupported/backend-blocked features identified
- `[ ]` Implementation phase started

## Architecture Foundation

- `[ ]` Centralized Flutter customer API endpoint map
- `[ ]` Dio base URL aligned with web source-of-truth endpoints
- `[ ]` Shared response normalization
- `[ ]` Shared API error handling
- `[ ]` 401/403 session removal handling
- `[ ]` Secure token storage fully wired
- `[ ]` Feature-first folder structure cleaned up
- `[ ]` Repository pattern used consistently
- `[ ]` Riverpod used consistently
- `[ ]` Loading states standardized
- `[ ]` Empty states standardized
- `[ ]` Error/retry states standardized
- `[ ]` Production-safe logging
- `[ ]` Environment configs for dev/staging/prod
- `[ ]` Offline-safe local storage policy

## Authentication

- `[x]` Backend login endpoint exists: `POST /auth/login`
- `[x]` Backend signup endpoint exists: `POST /auth/register`
- `[x]` Backend current user endpoint exists: `GET /auth/me`
- `[x]` Backend change password endpoint exists: `POST /auth/change-password`
- `[ ]` Native login UI implemented to production quality
- `[ ]` Native signup UI implemented to production quality
- `[blocked]` Forgot password API not found
- `[ ]` Session persistence with Flutter Secure Storage
- `[ ]` Launch-time session restore
- `[ ]` Auth route guards
- `[ ]` Logout
- `[ ]` Deleted/deactivated account handling
- `[ ]` Form validation and error messaging

## Onboarding

- `[ ]` Premium onboarding slides
- `[ ]` Store onboarding completion
- `[ ]` Notification permission prompt
- `[ ]` Permission denial handling
- `[ ]` Polished transition into auth or home

## Home Experience

- `[x]` Active announcements API exists: `GET /announcements/active`
- `[x]` Products API exists: `GET /products`
- `[x]` Packs API exists: `GET /packs`
- `[x]` Categories API exists: `GET /categories`
- `[ ]` Dynamic banners from announcements
- `[ ]` Promotions/special offers from announcements
- `[ ]` Category rail/grid
- `[ ]` Featured products carousel
- `[ ]` Recommended products section
- `[ ]` Product search entry
- `[ ]` Food packs surfaced as shopping items
- `[ ]` Pull-to-refresh
- `[ ]` Refresh on app resume for admin sync
- `[ ]` Remove rider/workforce language from customer home

## Product And Catalog System

- `[x]` Product list and detail APIs exist
- `[x]` Product image URL field exists
- `[x]` Product stock fields exist
- `[x]` Product category fields exist
- `[x]` Pack list/detail APIs exist
- `[ ]` Product grid/list UI
- `[ ]` Product details UI
- `[ ]` Product image loading/error states
- `[ ]` Quantity selector
- `[ ]` Add to cart
- `[blocked]` Product variations API not found
- `[blocked]` Wishlist API not found
- `[ ]` Related products using same-category products
- `[ ]` Stock display
- `[ ]` Low-stock and out-of-stock badges
- `[ ]` Product filtering
- `[ ]` Product search
- `[ ]` Category switching
- `[ ]` Price sorting
- `[ ]` Deleted/inactive product filtering
- `[ ]` Stale cache invalidation

## Cart

- `[x]` Web local cart logic exists
- `[x]` Backend server cart returns 501, so local mobile cart is expected
- `[ ]` Persistent native cart
- `[ ]` Product and pack item support
- `[ ]` Quantity update controls
- `[ ]` Stock ceiling enforcement
- `[ ]` Remove stale/deleted cart items
- `[ ]` Cart summary
- `[ ]` Empty cart state
- `[ ]` Cart survives app restart
- `[ ]` Cart validates against backend before checkout

## Checkout

- `[x]` Backend order creation exists: `POST /orders`
- `[x]` Backend inventory deduction happens during order creation
- `[x]` Backend saved address APIs exist
- `[x]` Web supports delivery and pickup
- `[ ]` Native checkout UI
- `[ ]` Saved address selection
- `[ ]` New address creation
- `[ ]` Default address selection
- `[ ]` Delivery method selection
- `[ ]` Pickup option
- `[ ]` Customer information validation
- `[ ]` Address validation
- `[ ]` Order summary
- `[ ]` Delivery information messaging
- `[blocked]` Promo code API not found
- `[blocked]` Tax calculation API not found
- `[ ]` Checkout error handling
- `[ ]` Clear cart only after successful order
- `[ ]` Refresh inventory after order

## Payments

- `[x]` Existing payment flow is bank transfer plus receipt upload
- `[x]` Receipt upload endpoint exists: `POST /orders/{id}/receipt`
- `[x]` Admin payment approval/rejection updates order and notifications
- `[ ]` Bank details UI
- `[ ]` Order-code reference instruction
- `[ ]` Receipt image/file picker
- `[ ]` Receipt upload
- `[ ]` Receipt submitted state
- `[ ]` Payment confirmed state
- `[ ]` Payment rejected/re-upload flow
- `[blocked]` Active payment initialization API returns 501

## Orders

- `[x]` My orders API exists: `GET /orders/my`
- `[x]` Order detail API exists: `GET /orders/{id}`
- `[x]` Public tracking API exists: `POST /track-order`
- `[x]` Cancellation request APIs exist
- `[x]` Delivery confirmation code endpoint exists as customer order completion flow
- `[ ]` Order history UI
- `[ ]` Order detail UI
- `[ ]` Status timeline
- `[ ]` Payment status labels
- `[ ]` Receipt upload from order detail
- `[ ]` Cancellation/refund request
- `[ ]` Track order by code/contact
- `[ ]` Polling or refresh for admin status changes
- `[blocked]` Verified realtime customer socket support not found

## Profile And Addresses

- `[x]` Profile get/update APIs exist
- `[x]` Avatar upload API exists
- `[x]` Address CRUD APIs exist
- `[ ]` Profile screen
- `[ ]` Edit profile
- `[ ]` Avatar upload
- `[ ]` Saved address list
- `[ ]` Add/edit/delete address
- `[ ]` Set default address
- `[ ]` Change password
- `[ ]` Account settings
- `[ ]` Logout

## Notifications

- `[x]` Backend notification list exists
- `[x]` Unread count exists
- `[x]` Mark read exists
- `[x]` Mark all read exists
- `[x]` Delete and clear exist
- `[ ]` Notification center UI
- `[ ]` Unread badge
- `[ ]` Mark read
- `[ ]` Mark all read
- `[ ]` Delete notification
- `[ ]` Clear all notifications
- `[ ]` Order/payment/broadcast filtering
- `[blocked]` Customer FCM token registration endpoint not found

## Admin Synchronization

- `[x]` Products and packs are backend/admin-driven
- `[x]` Announcements are backend/admin-driven
- `[x]` Orders and payments are backend/admin-driven
- `[x]` Notifications are backend/admin-driven
- `[ ]` Catalog refresh on resume
- `[ ]` Catalog refresh after checkout
- `[ ]` Announcements refresh on home
- `[ ]` Orders refresh on order screens
- `[ ]` Notifications refresh on notification screens
- `[ ]` Stale local cart reconciles with admin stock/catalog updates

## Design System

- `[x]` Web brand tokens identified
- `[x]` Flutter color tokens already partially mirror web
- `[ ]` Consistent spacing scale
- `[ ]` Consistent typography scale
- `[ ]` Product card component
- `[ ]` Quantity stepper component
- `[ ]` Price/stock badges
- `[ ]` Skeleton loaders
- `[ ]` Empty/error states
- `[ ]` Premium checkout components
- `[ ]` Smooth native animations
- `[ ]` Android viewport responsiveness verified
- `[ ]` Inconsistent rider/workforce visual language removed

## Critical Bug Fixes

- `[ ]` Inconsistent UI fixed
- `[ ]` Weak state management fixed
- `[ ]` Duplicate API calls reduced
- `[ ]` Stale cache issues fixed
- `[ ]` Deleted products no longer show as purchasable
- `[ ]` Weak loading states fixed
- `[ ]` Improper navigation flow fixed
- `[ ]` Poor error handling fixed
- `[ ]` Weak form validation fixed
- `[ ]` Inconsistent branding fixed

## Verification Checklist Per Feature

For every completed feature:

- `[ ]` UI implemented
- `[ ]` Backend connected
- `[ ]` API validated
- `[ ]` Loading state tested
- `[ ]` Error state tested
- `[ ]` Empty state tested
- `[ ]` Responsive layout tested
- `[ ]` Admin sync verified
- `[ ]` Checklist updated
