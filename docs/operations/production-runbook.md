# Production runbook

## Required services

- One container deployment built from the repository-root `Dockerfile`.
- PostgreSQL with daily snapshots and point-in-time recovery.
- HTTPS at the edge.
- Error-log collection keyed by the `x-request-id` response header.

The current PostgreSQL adapter replaces the local file and provides a cross-process row lock for atomic game operations. It intentionally keeps the PoC state shape in one JSONB row for migration safety. Treat that as an initial launch adapter, not an unlimited-scale schema: load-test it, cap the first cohort, then normalize sessions, inventory, instances, trades and analytics before broad acquisition.

## Required environment

- `NODE_ENV=production`
- `DATABASE_URL`
- `DATABASE_SSL=1` when the provider supplies a trusted TLS certificate
- `DATABASE_POOL_SIZE=10` initially
- `KALPI_DEBUG=0`

The process fails closed when `DATABASE_URL` is absent. Studio, Presentation Studio, project documents, unlock/reset routes and simulated trade acceptance are unavailable in production.

The committed `.env` is the local/private-repo default (`kalpi` / `change-me` on `127.0.0.1`). It is not a cloud secret. Replace it on the production host. Quiz stays off until `QUIZ_ENABLED=1`.

## Pre-deploy

1. Run `npm ci` in `app/`.
2. Run `npm test`.
3. Run `npm run audit:launch`; do not launch while it exits non-zero.
4. Build the root Dockerfile.
5. Restore the latest database backup into staging and rehearse the migration.
6. Run `npm run verify:visual -- https://staging-host` and inspect every generated viewport.
7. Verify WhatsApp and Instagram sharing on a physical iPhone and Android device.
8. Run concurrent pack, reward and trade acceptance checks against staging.

## Deploy

1. Snapshot PostgreSQL.
2. Deploy one canary instance.
3. Confirm `/api/health` returns `200`.
4. Confirm a new session can settle one idle card and reload it.
5. Confirm a trade reserves one offered copy, expires after 24 hours, can be cancelled and transfers atomically.
6. Increase traffic gradually while watching error rate and PostgreSQL connection saturation.

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
