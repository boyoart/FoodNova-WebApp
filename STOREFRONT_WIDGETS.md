# Storefront shopping tools

This document records the original shopping-tools release. The subsequent charcoal header, transparent mobile wrappers and animation lifecycle correction are documented in `BRANDING_CORRECTION.md` and supersede the colour/mobile status below.

This release reuses the existing product, pack, customer-order and cart services. No backend routes, inventory timing, prices, component configurations or checkout database were changed. Header colour is #FFCC16 with #075338 navigation and #0B8754 hover; the exact transparent approved logo sits directly on the header without a plate. The previous hero restoration and scroll reveals remain in place.

- Search debounces public catalogue queries, displays product/category suggestions and supports arrow keys, Enter and Escape. Product links open the existing catalogue details dialog.
- Basket builder uses the homepage catalogue response, allows variant/quantity selection, and reviews fresh per-item responses before adding to the existing cart. Changed prices require another review. Existing checkout remains authoritative for aggregate stock validation.
- Combo comparison uses configured API contents and current prices. Active packs remain visible; purchases recheck availability and use the existing cart. Other packs use the existing enquiry link, with no customer stock warnings.
- Tracking opens the authenticated My Orders flow. Buy Again reads only `/orders/my` after customer action, holds orders in memory, refreshes catalogue prices/variants, and requires review before cart insertion. Identity changes invalidate pending private results.
- Recently viewed stores at most eight numeric public product IDs in session storage; no order/customer/address data is stored by this feature.

## Delivery eligibility gap

The backend validates destinations through `validate_delivery_destination_for_zone` during order creation. Zone configuration is exposed only through permission-protected Admin endpoints. Google Places selects addresses but does not determine service eligibility. No reliable public address-validation/quote endpoint was found, so a standalone coverage checker is deferred. The homepage links to support and explains that eligibility is checked when placing an order; it makes no coverage or fee claims. A future backend feature would need a read-only address/coordinate validation contract, authoritative zone/fee semantics, privacy/rate limits and explicit authorization to implement it.

## Validation limits

Unit/contract tests and a production build validate the implementation. Browser automation has previously failed because the trusted bridge is unavailable, and Firefox automation was stopped by unsupported URL-policy enforcement. Do not interpret HTTP or asset checks as screenshots, authenticated acceptance, or verification of all viewport layouts. No mobile assets or applications are changed in this release.
