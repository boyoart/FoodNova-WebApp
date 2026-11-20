# Release A: direct production runbook

## Status and scope

**STOP: preparation only. No merge, production deployment, environment change,
database write or starter initialization is authorized yet.** The owner has
chosen direct production, without a staging environment. Identify the final
reviewed commit from the head of `release/foodnova-homepage-enhancements` and
PR #9; verify that its full SHA includes this runbook and the explicit Admin
initialization action. Do not deploy the
earlier `d0fbf5145487f0be1c744f6dfaa8f54eaabea5b8`, which initializes on GET.

Release A adds homepage category image fallbacks, removes one identified
promotional image, adds a CMS ticker and optional synthesized sound effects.
Background music remains disabled. No public number-only tracking backend,
tracking-specific UI, tracking email or tracking API configuration is added;
existing tracking links and authenticated flows remain unchanged. The separate
tracking branch is not activated.

The public announcement endpoint works with the old backend response: absent
`ticker_enabled` means enabled. The global switch and starter initialization
require this release's backend. Existing settings and announcement records are
not overwritten by initialization.

## Initialization behavior and decision

- Both `GET /announcements/active` and `GET /admin/announcements` only read
  announcements and settings; they do not initialize starter records. A fresh
  installation consequently has no ticker content until an authorized
  administrator explicitly initializes or creates it.
- The Admin Announcements page offers **Initialize starter announcements**
  only when the upgraded backend reports an uninitialized marker and the
  administrator has `announcements:manage`. Confirming invokes
  `POST /admin/announcements/initialize-ticker`. The backend enforces that
  permission independently.
- The action atomically claims the unique `homepage_ticker_initialized_v1`
  setting and, only if no top-bar record and no announcement deletion audit
  exists, creates five ordinary active, editable, prioritized CMS records.
  It does not modify website settings. Existing disabled or scheduled top-bar
  records also block seeding. Existing deletion history of any announcement
  conservatively blocks seeding. A repeated action cannot regenerate records.
  Top-bar create, edit and delete also claim the marker in their transaction.
- Responses distinguish `created`, `already_initialized`,
  `existing_announcements`, and `previous_deletion`. The administrator should
  inspect the result; a successful request does not necessarily mean five
  records were created. An audit entry is attempted using the existing
  best-effort audit mechanism; monitor backend logs for audit failures.
- Historical deletions outside retained audit history cannot be distinguished
  from a fresh CMS. Before approving initialization, the owner must review
  current records, disabled/scheduled items, audit retention and prior
  intentional removals. If history is uncertain, do not initialize: use normal
  Admin creation only after explicit content approval.
- Local SQLite tests cover atomic rollback, idempotency and concurrent
  initialization. Actual production PostgreSQL concurrency and configuration
  have not been tested; do not run concurrent initialization in production.

## Pre-release checklist: all gates required

1. Owner approves a specific final commit, production deployment window,
   named operator, rollback owner, customer-impact and no-staging risk. Review
   the full diff from the actually deployed backend and frontend commits, not
   just from `origin/main`: older deployed commits may lack other intervening
   changes. If the deployed versions or diff cannot be verified, stop.
2. Verify branch, commit and passing tests; inspect production Render service,
   linked repository/branch, root directory, build/start commands, health
   check, current deploy ID/SHA and auto-deploy setting. Record the current
   Vercel production deployment ID/SHA, domains, project and build settings.
   Do not copy secrets into tickets, logs or screenshots.
3. Check Render's current production schema and startup behavior against the
   target version. This release adds no schema migration, but that does not
   prove an older deployed backend is schema-compatible. Do not execute
   migrations or startup schema mutations without separate authorization.
4. Record existing active, inactive and scheduled announcements, priorities,
   relevant audit history and global website settings through authorized
   read-only Admin access. Do not publish customer or operational data.
   Decide separately whether the starter action is approved.
5. Complete and verify a restorable PostgreSQL backup below. Confirm operator
   access to both platforms and the rollback procedure. Do not proceed if any
   gate fails.

## PostgreSQL backup and verification

The production database and backups contain sensitive information. Use
approved access, encrypted storage, restricted permissions and the retention
policy; never paste credentials or data into chat. Capture backup time and
database identity without recording the connection string.

1. In Render Dashboard select the **existing production database > Recovery**.
   Confirm its identity, plan, PITR availability and recovery window. Paid
   Render Postgres supports PITR; free instances do not have Render logical
   exports. If available, click **Create export**, wait for completion and
   download the `.dir.tar.gz` to encrypted approved storage. If not available,
   an authorized operator can use version-compatible `pg_dump` against the
   production database and save an encrypted custom-format archive; do not
   change the database plan or expose the connection URL in command history.
2. Record timestamp, file size and a checksum. For Render's `.dir.tar.gz`,
   extract it into encrypted storage and run `pg_restore --list` against the
   extracted database directory, not the compressed tar file. For a
   custom-format `pg_dump` archive, run `pg_restore --list` on the archive
   itself. Use compatible PostgreSQL client tools. This is not proof that the
   archive can be restored.
3. Verify restore into an **isolated empty local PostgreSQL database** used
   solely for offline backup verification, not a staging application or
   production target. Use version-compatible `pg_restore --exit-on-error`,
   confirm successful exit, schema and representative table/count integrity
   without exposing personal data. Ensure the target is unquestionably not
   production, protect the local copy, and dispose of it per policy. If a
   restore drill cannot be performed, record the gap and stop for owner risk
   acceptance; a listing alone is not a verified restore.
4. Confirm PITR recovery and application reconnection steps with the operator.
   A database restore can discard orders and other changes since backup; it
   is a last-resort incident decision, not a normal application rollback.

Reference: [Render PostgreSQL backups](https://render.com/docs/postgresql-backups).

## Render backend deployment (only after approval)

1. Ensure the final approved commit is accessible in the service's linked
   repository. Recheck the backup, actual deployed SHA, schema compatibility,
   existing environment and rollback target. Do not edit environment variables
   or change the service branch as part of this plan.
2. In the production web service's **Deploys** page select **Manual Deploy >
   Deploy a specific commit**, enter the final approved full SHA, verify it,
   then select **Deploy Commit**.
   **Render documents that this action disables automatic deploys.** Obtain
   explicit approval for that side effect and record the prior state before
   proceeding. Do not re-enable it without a separate decision: Render may then
   deploy the linked branch's latest commit.
3. Watch build/deploy logs and health checks until live; confirm the actual
   deployed commit through Render, not merely the requested SHA. Stop and roll
   back on build, startup, health, schema or elevated-error failures.

Reference: [Render deploys](https://render.com/docs/deploys).

## Live backend and CMS checks

1. Read `GET /announcements/active` once and confirm HTTP 200, existing
   announcement data and `ticker_enabled`; absence of the field indicates the
   expected backend is not serving. Compare existing records and website
   settings against the pre-release snapshot. No GET initializes starters.
2. In Admin, verify existing records and settings remain unchanged. The
   existing production frontend may not yet have the initialization button:
   backend verification does not require initialization. If and only if
   separately approved after the history review, initialize once after the
   frontend rollout using **Initialize starter announcements**, or before
   frontend rollout through an authorized secure API client calling
   `POST /admin/announcements/initialize-ticker` with a current Admin token
   having `announcements:manage`. Do not expose the token in command history
   or logs. Inspect the returned status (or Admin notification), logs and,
   for `created`, five editable records. Preserve existing records if the
   result says they blocked initialization. Empty data with unknown history
   must not be assumed safe to seed.
3. Exercise edits, ordering, activation and the global switch only if the
   owner explicitly approves temporary live CMS writes. Use a uniquely named,
   non-sensitive test announcement, restore any changed settings, and remove
   only the test record after recording its ID. **Creating a top-bar test
   record permanently claims the initialization marker**, even after deletion;
   decide and approve initialization first. Never edit real announcements as
   test fixtures. Avoid payments, real orders, dispatch and customer data.
4. Check Render errors and existing operational health. Stop before frontend
   rollout if any verification fails or unexpected data changes are observed.

## Vercel frontend deployment (after backend verification and approval)

1. In the existing project inspect the release branch's Preview deployment,
   confirm it is for the final approved SHA, and capture the current Production
   deployment ID and domains for rollback. Review desktop and mobile
   appearance, navigation, ticker pause/focus/reduced motion and disabled music.
   Preview may use a different backend and is not proof of production data.
2. On the reviewed Preview deployment choose **Promote to Production** and
   verify the domains in the confirmation before proceeding. Vercel rebuilds a
   promoted Preview using **Production** environment variables, not Preview
   variables. Inspect the existing production settings without changing them;
   stop if the rebuilt target/backend cannot be verified. Promotion is a
   production deployment, requiring explicit approval.
3. Verify the resulting deployment/SHA and production domains, public API,
   desktop/mobile display and existing safe navigation. Monitor logs and
   errors. Do not create real orders, charge payments or dispatch riders.

Reference: [Vercel promotion](https://vercel.com/docs/deployments/promoting-a-deployment).

## Rollback

- **Frontend:** in Vercel select the recorded prior eligible production
  deployment and use **Instant Rollback**. Confirm production domains and
  traffic return to that deployment, then check homepage and navigation. This
  reuses its existing build and does not restore database data.
- **Backend:** in Render redeploy the recorded prior known-good commit using
  **Manual Deploy > Deploy a specific commit**, observe the auto-deploy
  side effect, and verify health, announcement feed and errors. Roll back
  frontend first if it relies on backend behavior not supported by the prior
  version; the ticker itself accepts the older response.
- The marker, starter records, Admin edits and settings persist after code
  rollback. Do not delete the marker or records automatically: administrators
  may have edited them and deleting the marker risks reinitialization. Any
  selective cleanup requires a separately approved, ID-specific review.
  Never restore a backup over the live database as a routine rollback.

## Release B: still blocked

Public number-only tracking remains inactive. Before any future activation,
independently verify Render proxy trust and Uvicorn forwarded headers,
API-origin WAF and direct Render hostname bypass, IPv4/IPv6 rate limits,
PostgreSQL concurrency and sequential-number enumeration risk. No staging
environment is planned under this decision; a separately approved safe
verification approach and explicit residual-risk acceptance are required.

## Final gate

**NO-GO until** the final commit is reviewed and approved, deployed-version
diff and schema compatibility are known, backup restoration is verified, CMS
history is reviewed, operational rollback is ready, Render's auto-deploy side
effect is approved, and the owner explicitly authorizes production rollout.
