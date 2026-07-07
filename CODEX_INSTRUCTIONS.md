# CODEX / AI-Agent Instructions — FoodNova Rider App

Rules for any AI agent (or engineer) working in this repo.

## Golden rules
1. **Do NOT build or modify a backend.** This app is a client of the existing production backend
   `https://foodnova-webapp.onrender.com`. There is no backend to change here.
2. **Never hardcode** the base URL, tokens, or the Maps key in source. Use env + `app.json`.
3. **Rider routes are un-prefixed** (`/delivery/*`, `/notifications/*`, `/delivery-workers/*`) — not `/api/*`.
4. **All HTTP goes through `src/api/client.ts` + `src/api/endpoints.ts`.** Do not scatter `fetch` calls.
5. **Parse responses defensively** via `src/lib/normalize.ts` (`asList`, `asObject`, `pick`). Backend types are `any`.
6. **UI**: React Native only, tokens from `src/theme/tokens.ts`, brand green `#00C261`. Every interactive/informational element needs a `testID` (kebab-case by role). Use Toasts (not Alert).
7. **Maps**: `TrackingMap.tsx` (native, react-native-maps) + `TrackingMap.web.tsx` (fallback). Never import `react-native-maps` in web-shared code.
8. **Push/FCM & Maps are device-build only.** Guard native APIs with `Platform.OS !== 'web'` and try/catch.
9. **Permissions**: request contextually (location on Go Online, camera on selfie). Handle granted/denied/blocked; offer "Open Settings" when blocked.

## Conventions
- Money in Naira via `formatMoney` (`src/lib/format.ts`).
- Auth/session lives in `src/context/AuthContext.tsx`. Approval gating uses `approval_status|verification_status|status`.
- New screens → files under `app/` (expo-router). Shared code → `src/`.

## Before you finish
- `expo lint` clean, Metro bundles, one screenshot to confirm boot.
- Update `/app/memory/PRD.md` and relevant docs.
- Authenticated E2E requires an **approved rider** login (see `/app/memory/test_credentials.md`).

## Known constraints
- Backend CORS may block browser/web-preview origins (native build unaffected).
- No `GET /delivery/orders/{id}` — detail screen filters the list.
- No socket channel documented — offers via polling + FCM.
