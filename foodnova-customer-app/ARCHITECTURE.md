# FoodNova Customer App Architecture

## Phase 1 Scope

This app is the Android-first Flutter customer surface for FoodNova. It connects to the existing backend through standardized `/api/...` endpoints and keeps Phase 1 focused on shopping, cart, checkout, orders, tracking preparation, notifications, and profile.

## Layers

- `core`: networking, theme, app-wide state
- `config`: environment and runtime configuration
- `shared`: cross-feature models
- `features/*/data`: API repositories and state controllers
- `features/*/domain`: business entities and use-case placeholders
- `features/*/presentation`: screens and widgets
- `routes`: GoRouter configuration
- `services`: Firebase, analytics, crash, messaging, tracking adapters
- `widgets`: reusable design-system widgets

## API Contract

The app uses `/api` as its base path:

- `/api/auth/login`
- `/api/auth/register`
- `/api/auth/me`
- `/api/products`
- `/api/products/{id}`
- `/api/categories`
- `/api/orders`
- `/api/notifications`
- `/api/users/me`

Persistent server-side cart and Paystack initialization are explicitly reserved with `501` backend responses until those services are implemented. The customer app uses a local cart for Phase 1 checkout and posts final orders to the backend.

## Tracking

The tracking feature is structured so Socket.IO or Firebase Realtime Database can be added behind a repository without changing screen-level code.

## Notifications

Firebase Messaging is bootstrapped defensively. Android Firebase options, FCM token registration, Crashlytics, and Analytics event mapping should be wired during release setup.
