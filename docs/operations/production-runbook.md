# Production runbook

## Current public host (free)

- **Vercel Hobby** from GitHub `guygir/klafi`. Static files (HTML, JS, CSS, card art) are copied to `/public` at build time. `/api/*` hits [api/[...path].js](../../api/[...path].js), which reuses `createKalpiApp`.
- **Supabase free Postgres** created on supabase.com (not Vercel Marketplace — Marketplace `free` is disabled and would bill through Vercel). Set `DATABASE_URL` only in the Vercel project (never commit the live URI).
  - Prefer the **session pooler** on port **5432** (`*.pooler.supabase.com`). Vercel functions are IPv4; the direct `db.*:5432` host is often IPv6-only.
  - Do **not** use the transaction pooler on port **6543**. It can break `FOR UPDATE` and advisory locks.
  - `DATABASE_SSL=1`
  - `DATABASE_POOL_SIZE=5`
  - `NODE_ENV=production`, `KALPI_DEBUG=0`, `QUIZ_ENABLED=0`

The [Dockerfile](../../Dockerfile) remains the local/container path. Koyeb is a documented spare if we want an always-on Nano later.

## Required services

- Vercel Hobby (or one container from the repository-root `Dockerfile`).
- PostgreSQL with daily snapshots and point-in-time recovery (Supabase free for this step).
- HTTPS at the edge (Vercel).
- Error-log collection keyed by the `x-request-id` response header.

The current PostgreSQL adapter replaces the local file and provides a cross-process row lock for atomic game operations. It intentionally keeps the PoC state shape in one JSONB row for migration safety. Treat that as an initial launch adapter, not an unlimited-scale schema: load-test it, cap the first cohort, then normalize sessions, inventory, instances, trades and analytics before broad acquisition.

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
8. Run concurrent pack, reward and trade acceptance checks against staging.

## Deploy

1. Import `guygir/klafi` into a Vercel Hobby project (GitHub).
2. In Vercel env, set:
   - `DATABASE_URL` = Supabase **session** pooler URI (`*.pooler.supabase.com:5432`, not `:6543`)
   - `DATABASE_SSL=1`
   - `DATABASE_POOL_SIZE=5`
   - `NODE_ENV=production`
   - `KALPI_DEBUG=0`
   - `QUIZ_ENABLED=0`
3. Deploy from `main`. First function boot runs the Postgres migration.
4. Confirm `https://<project>.vercel.app/api/health` returns `{"status":"ok","backend":"postgres"}`.
5. Confirm a new session can settle one idle card and reload it.
6. Confirm Studio and `/api/quiz` stay closed. Confirm `KALPI_DEBUG` routes stay 404.
7. Open the same URL on a phone.

## Rollback

1. Route traffic to the previous immutable image.
2. Do not roll the database backward blindly.
3. If a migration is incompatible, restore the pre-deploy snapshot to an isolated database first and validate inventory/trade counts.
4. For visual regressions, switch Studio flags independently to `classic-v1`, `classic-v1`, `compact-v1`, and/or `fade-v1`.
5. Keep event records `blocked` until content, art and timing are re-approved.

## Backup and recovery

- Keep daily snapshots for at least 30 days.
- Enable point-in-time recovery with a recovery-point objective of 15 minutes or less.
- Rehearse a restore before public launch and weekly during the election campaign.
- Export a daily inventory/trade consistency report to storage separate from the primary database.

## Go/no-go owner checks

- Editorial: final CEC letters, direct source, quote classification and Hebrew.
- Art/legal: exact file, likeness/mark rights and approved output.
- Engineering: tests, launch audit, migration, backup restore and rollback.
- Operations: event windows, moderation contact and incident channel.
