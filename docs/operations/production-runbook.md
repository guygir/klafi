# Production runbook

## Current public host (free)

- **Vercel Hobby** from GitHub `guygir/klafi`. Static files (HTML, JS, CSS, card art) are copied to `/public` at build time. `/api/*` rewrites to [api/index.js](../../api/index.js), which reuses `createKalpiApp`.
- **Supabase free Postgres** created on supabase.com (not Vercel Marketplace — Marketplace `free` is disabled and would bill through Vercel). Set `DATABASE_URL` only in the Vercel project (never commit the live URI).
  - Keep the **session pooler** URL on port **5432** (`*.pooler.supabase.com`) in `DATABASE_URL` so migrations can use session-scoped advisory locks.
  - On Vercel, application traffic automatically changes that URL to Supavisor **transaction mode** on port **6543**. Explicit `BEGIN`/`COMMIT` transactions, including `FOR UPDATE`, remain pinned to one database connection. Queries intentionally omit named prepared statements.
  - A deployment with missing migrations fails closed on transaction mode; run migrations through session mode before serving traffic.
  - `DATABASE_SSL=1`
  - `DATABASE_POOL_SIZE=5` (Vercel clamps each function instance to one client connection)
  - `NODE_ENV=production`, `KALPI_DEBUG=0`, `QUIZ_ENABLED=0`
  - Optional `STUDIO_SECRET` to open Studio unlock + set calendar in production (send as `x-kalpi-studio`, or open `/?studioKey=...` once). Leave unset to keep Studio closed.

The [Dockerfile](../../Dockerfile) remains the local/container path. Koyeb is a documented spare if we want an always-on Nano later.

## Required services

- Vercel Hobby (or one container from the repository-root `Dockerfile`).
- PostgreSQL with daily snapshots and point-in-time recovery (Supabase free for this step).
- HTTPS at the edge (Vercel).
- Error-log collection keyed by the `x-request-id` response header.

The PostgreSQL adapter now keeps player writes on their own tables (`kalpi_sessions`, inventory, instances, packs, trades, events, factions). A leftover `kalpi_runtime_state` JSONB row is imported once, then ignored. Studio release/unlock config persists in `kalpi_studio_config`. Guest play still uses the browser token; account bind is optional and not required. Gameplay has no application-level request ceiling. Granting endpoints serialize in PostgreSQL, and replay-sensitive writes use `x-idempotency-key`; anonymous-session denial-of-service protection belongs at the Vercel edge, where it cannot accidentally throttle a school or other shared network.

Home does not wait on the fat game function. Static `/shell.json` and `/catalog.json` (CDN) paint Home chrome and the Binder grid; `api/health.js` and `api/home.js` are small routes that only touch one session row and return that player's inventory plus its prepared idle schedule. The authoritative Node function preselects a strict queue of up to eight cards with fixed instance IDs and three-hour availability times. Prepared cards are not inventory until due; a browser may inspect or repaint its cache, but it cannot alter server ownership or queue order. Already-materialized cards reveal without a pull request on the tap path. Missing queues refill immediately, stale multi-card backlogs within 0.5–2.5 seconds, and healthy buffers after a 15–60 second jitter. Repeat-player Home refreshes are also staggered to avoid connection bursts. Optional events, trades, leaderboards, activity and specials reads remain delayed. Accepting a trade or claiming an event card is still a server write. The active tab is kept in `?view=`. Vercel Hobby does not pre-warm instances; Pro Fluid does. Cloudflare Workers Free exists (100k req/day, 10ms CPU) but is not an always-on Node box and cannot host this pack isolate as-is. The daily cron keeps `/api/warm` only as a low-frequency deployment health check.

## Required environment

- `NODE_ENV=production`
- `DATABASE_URL`
- `DATABASE_SSL=1` to require TLS. Supabase pooler uses a chain Node rejects with verify-full, so the adapter encrypts without CA pin.
- `DATABASE_POOL_SIZE=5` on Vercel (keep local at 10)
- `KALPI_DEBUG=0`

The process fails closed when `DATABASE_URL` is absent. Studio, Presentation Studio, project documents, unlock/reset routes and simulated trade acceptance are unavailable in production.

Local defaults live in [`.env.example`](../../.env.example) (`kalpi` / `change-me` on `127.0.0.1`). Do not commit `.env`. Live Supabase credentials live only in Vercel env. Quiz stays off until `QUIZ_ENABLED=1`.

## Pre-deploy

1. Run `npm ci` in `app/`.
2. Run `npm test`.
3. Run `npm run audit:launch`; do not launch while it exits non-zero.
4. `git push` to `main` (Vercel) or build the root Dockerfile.
5. Confirm Vercel env has the Supabase session-pooler URL.
6. Run `npm run verify:visual -- https://staging-host` and inspect every generated viewport.
7. Verify WhatsApp and Instagram sharing on a physical iPhone and Android device.
8. Run `PLAYERS=1000 CONCURRENCY=50 BASE_URL=https://staging-host npm run stress:idle`.
9. Create a verified backup with `DATABASE_ADMIN_URL=... npm run backup:database`.
10. Record the current and immediately previous production deployment URLs before promotion.

## Deploy

1. Import `guygir/klafi` into a Vercel Hobby project (GitHub).
2. In Vercel env, set:
   - `DATABASE_URL` = Supabase **session** pooler URI (`*.pooler.supabase.com:5432`, not `:6543`)
   - `DATABASE_SSL=1`
   - `DATABASE_POOL_SIZE=5`
   - `NODE_ENV=production`
   - `KALPI_DEBUG=0`
   - `QUIZ_ENABLED=0`
  - `STUDIO_SECRET` only if you want production Studio (unlock cards, flip release sets)
3. Deploy from `main`. First function boot runs the Postgres migrations, including the normalized writer tables.
4. Confirm `https://<project>.vercel.app/api/health` returns `{"status":"ok","backend":"postgres"}`.
5. Confirm a new session can settle three starter idle cards and reload them.
6. Confirm Studio and `/api/quiz` stay closed. Confirm `KALPI_DEBUG` routes stay 404.
7. Open the same URL on a phone.

## Rollback

1. Run `npm run verify:release -- https://current-production-url` and retain its output with the incident.
2. On Vercel Hobby, route traffic to the immediately previous production deployment with `vercel rollback <previous-production-url>`, then confirm with `vercel rollback status`. The routing change reuses the immutable deployment; it does not rebuild.
3. Run `npm run verify:release -- https://public-host` after the rollback and manually settle a test session (three starter cards on a new session).
4. Do not roll the database backward blindly. Migrations must remain additive and backward-compatible with the immediately previous deployment.
5. If data restoration is required, restore the pre-deploy dump to an isolated database first with `ALLOW_RESTORE_DRILL=1 BACKUP_FILE=... RESTORE_DATABASE_URL=... npm run restore:drill`; inspect the reported integrity counts before any production decision.
6. For visual regressions, switch Studio flags independently to `classic-v1`, `classic-v1`, `compact-v1`, and/or `fade-v1`.
7. A Vercel rollback disables normal production auto-assignment. After the fix is validated, restore it deliberately with `vercel promote <validated-deployment-url>`.

## Backup and recovery

- Keep daily snapshots for at least 30 days.
- Enable point-in-time recovery with a recovery-point objective of 15 minutes or less.
- Rehearse a restore before public launch and weekly during the election campaign.
- Export a daily inventory/trade consistency report to storage separate from the primary database.
- `DATABASE_ADMIN_URL=... npm run backup:database` creates a custom-format `pg_dump` plus a SHA-256 manifest under the ignored `backups/` directory. Copy both files to storage outside the primary database host.
- Restore only into a disposable database: `ALLOW_RESTORE_DRILL=1 BACKUP_FILE=../backups/<file>.dump RESTORE_DATABASE_URL=... npm run restore:drill`. The drill refuses a destination matching `DATABASE_URL`/`DATABASE_ADMIN_URL`, verifies the checksum, restores with `--exit-on-error`, and checks for orphaned or invalid inventory rows.

## Correction queue

- Every card detail has `דיווח על טעות בקלף`. The browser writes the report to local storage before sending and retries after network recovery.
- `POST /api/reports` is idempotent by `reportId` and stores the report in `kalpi_reports`; a lost response cannot create a duplicate or lose the pending browser copy.
- Review the oldest open items through `GET /api/studio/reports` with the Studio secret. Update an item with `POST /api/studio/reports/<reportId>` and `{ "status": "reviewing|resolved|rejected", "reviewerNote": "..." }`.
- Never mark a factual correction resolved until the canonical source data is changed, rebuilt, and the public card is verified.

## Go/no-go owner checks

- Editorial: final CEC letters, direct source, quote classification and Hebrew.
- Art/legal: exact file, likeness/mark rights and approved output.
- Engineering: tests, launch audit, migration, backup restore and rollback.
- Operations: event windows, moderation contact and incident channel.
