# FoodNova Staging E2E Validation Guide

Run this from a Windows machine that can reach:

`https://foodnova-backend-staging.onrender.com`

The runner can create its own isolated staging customer, admin, and approved rider when `FOODNOVA_E2E_SECRET` is configured on staging.

## Scope

The runner validates the database-driven staging lifecycle:

Customer -> order -> admin payment approval -> payment audit -> rider approval/login -> go online -> offer polling -> offer acceptance -> tracking -> PIN completion.

It does not require Firebase push success, live NIN verification, Cloudinary, Google Maps, or email configuration. Missing integrations are reported as configuration gaps unless they block the core lifecycle.

## Required Staging Secret

Set a strong secret in the staging Render service:

```text
FOODNOVA_E2E_SECRET=<strong random staging-only secret>
```

Do not configure this variable in production. The bootstrap endpoint returns 404 outside staging and 403 without the correct secret.

Set the same secret locally before running:

```powershell
$env:FOODNOVA_E2E_SECRET="<same staging-only secret>"
```

The runner will call `POST /internal/staging/e2e/bootstrap` to create/reset:

- one E2E customer
- one E2E super-admin
- one approved, KYC-complete rider
- default operational zone data if missing

Manual rider creation or manual approval is no longer required when the secret is configured.

## Basic Command

From the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\backend\scripts\run_staging_e2e.ps1 `
  -BaseUrl "https://foodnova-backend-staging.onrender.com"
```

The script writes a timestamped JSON report to:

```text
test_reports/staging-e2e/foodnova-staging-e2e-<run_id>.json
```

## Full Command With Explicit Values

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\backend\scripts\run_staging_e2e.ps1 `
  -BaseUrl "https://foodnova-backend-staging.onrender.com" `
  -CustomerEmail "codex.customer+staging@example.com" `
  -CustomerPassword "StagingPass123!" `
  -CustomerPhone "+15550010001" `
  -RiderPhone "+2348001000000" `
  -RiderPassword "StagingRider123!"
```

## Expected Output

Successful phases print lines like:

```text
wake_health_1                      200 OK
wake_health_2                      200 OK
wake_health_3                      200 OK
staging_e2e_bootstrap              200 OK
customer_register                  200 OK
customer_profile                   200 OK
customer_address_create            200 OK
products                           200 OK
order_create                       200 OK
admin_login                        200 OK
admin_payment_confirm              200 OK
payment_audit_order                200 OK
rider_login_existing               200 OK
rider_go_online                    200 OK
delivery_offers_poll               200 OK
offer_accept                       200 OK
delivery_status_arrived_at_pickup  200 OK
delivery_status_picked_up          200 OK
delivery_status_in_transit         200 OK
delivery_status_arrived            200 OK
pin_wrong                          400 FAIL
pin_correct                        200 OK
```

`pin_wrong` is expected to fail with a 4xx response. If it succeeds, the report records `WRONG_PIN_ACCEPTED`.

The script exits:

- `0` when the lifecycle passes without recorded failures.
- `2` when one or more lifecycle failures are recorded.
- non-zero if the wake-up gate fails or a required credential is missing.

## What The Report Contains

The report records:

- customer ID
- admin ID
- rider/worker ID when available
- order ID
- order code
- offer ID
- delivery PIN presence
- every endpoint called
- request payloads
- response bodies
- status values after lifecycle milestones
- tracking payloads
- failures and evidence

Sensitive values such as passwords, JWTs, tokens, and secrets are masked in the report.

## Wake-Up Behavior

Before E2E starts, the script requires three consecutive valid `/health` responses:

- HTTP 200
- JSON body
- `success=true`
- `status=ok`

It retries for up to 5 minutes by default.

## Rider Creation Notes

Because staging currently has no email or NIN provider credentials, fully automated rider account creation may be blocked by:

- `/delivery/auth/send-otp` returning email unavailable
- NIN verification requiring provider credentials
- admin approval blockers for missing KYC artifacts

This is not considered a core dispatch lifecycle failure for this staging phase. Use an existing staging rider account and `-SkipRiderCreation` to validate dispatch.

## Manual Admin/Rider Setup If Needed

If the runner reports `RIDER_CREATION_BLOCKED_BY_EMAIL`:

1. Create a staging rider through the Dispatch app or Admin workflow.
2. Complete/approve the rider in the Admin panel.
3. Confirm the rider can log in.
4. Set:

```powershell
$env:FOODNOVA_STAGING_RIDER_PHONE="approved rider phone"
$env:FOODNOVA_STAGING_RIDER_PASSWORD="approved rider password"
```

5. Rerun with `-SkipRiderCreation`.

## Production Gate

Do not merge to `main` until the JSON report shows:

- customer registration/login passed
- order creation passed
- admin payment confirmation passed
- payment audit endpoint returns the audit record
- approved rider login passed
- go online passed
- `/delivery/offers` returns the staging offer
- offer accept passed
- status sequence reaches `ARRIVED`
- wrong PIN is rejected
- correct PIN completes delivery
- admin/customer/rider final states agree

After a successful run and one staging restart, run schema drift validation. If no drift is reported, set:

```text
ALLOW_STARTUP_SCHEMA_MUTATIONS=false
```

for staging.
