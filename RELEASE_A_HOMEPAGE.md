# Release A — Homepage enhancements

## Scope and compatibility

Release A contains only the cinematic homepage improvements: category-image source fallback, suppression of the one identified legacy promotional image on the homepage, CMS-backed sticky announcements, and user-opt-in synthesized sound effects. Music is unavailable and has no configured asset. Existing catalog, cart, checkout, authentication, payment, dispatch, and customer-security flows are not intentionally changed.

The ticker reads the existing public `GET /announcements/active` endpoint and accepts the legacy `announcements`/`data` response. If the optional `ticker_enabled` response field is absent, the ticker defaults to enabled. Existing CMS announcement creation, scheduling, priority, and activation continue to work without a database migration.

The global CMS ticker switch is an additive backend compatibility change in `backend/main.py`: it adds a defaulted `tickerEnabled` setting and returns its value as `ticker_enabled`. Deploy that backend change before using the global switch. Until then, the frontend keeps the ticker enabled and the Admin page explains that the switch is unavailable; the current announcement editor remains usable.

Read-only compatibility check on 2026-11-20: production `GET /announcements/active` returned HTTP 200 and the legacy announcement fields, with no `ticker_enabled` field. The ticker content can use the deployed contract; the persistent global on/off switch requires the additive backend deployment above.

No public number-only tracking route, tracking email change, tracking-only UI, or tracking API configuration is part of Release A. Release B remains on `feat/foodnova-homepage-tracking-enhancements` and is not activated by this release.

## Vercel preview

1. Push `release/foodnova-homepage-enhancements` and locate its Preview deployment in the existing FoodNova Vercel project. Do not promote it to Production.
2. Before interactive preview acceptance, point the **Preview-only** `VITE_API_BASE_URL` at an approved staging backend. Do not change Production environment values. If staging is unavailable, use the browser fixtures and limit the preview to visual checks; do not exercise order creation, payment, or dispatch workflows.
3. If validating the CMS global switch, first deploy this branch's additive backend change to staging and verify the staged `/announcements/active` response contains `ticker_enabled`. No database migration is required.
4. Review the Preview URL at desktop and mobile widths, test schedules, pause/focus/reduced-motion behavior, category fallbacks, sound opt-in, and existing shopping navigation. Keep Music disabled.

The repository does not establish whether the current Vercel Git integration auto-creates Preview deployments on branch pushes. Confirm the deployment type and URL in Vercel; no production deployment or promotion is authorized here.

## Release B staging gates

- Record the actual Render service start command and Uvicorn version; review `--proxy-headers`, `FORWARDED_ALLOW_IPS`, the real ingress chain, and `ORDER_TRACKING_TRUSTED_PROXIES`. Never infer CIDRs or allow all upstreams.
- From two controlled staging egress addresses, test forged forwarding headers, separate client budgets, IPv6 textual aliases, and IPv4-mapped IPv6 normalization without returning identity diagnostics publicly.
- Verify API-origin edge/WAF enforcement on `/tracking/public`, including the direct `onrender.com` hostname and every alternate origin path. Confirm limits, body/type controls, preflight behavior, logging redaction, and bypass resistance.
- On staging PostgreSQL shared by multiple workers, test concurrency, per-IP/network/reference quotas, fixed-window boundary behavior, and shared-NAT impact using synthetic orders.
- Have the product owner explicitly accept the residual risk that sequential order numbers reveal existence and limited progress. Preserve the one-field, no-login user experience and the response allowlist; do not represent rate limiting as ownership verification.
- After approval, deploy backend before frontend, validate with synthetic orders, and retain authenticated order history and secure capability tracking unchanged.

## Rollback

For a preview-only issue, stop using that Preview and return to the last approved production deployment; Production is not changed by this release branch. If the backend additive change is later deployed to staging and causes an issue, redeploy the prior staging backend. The change is additive, has no schema migration, and existing clients ignore the added response field. Any production rollback requires separate authorization and a reviewed revert; do not reset or force-push shared branches.
