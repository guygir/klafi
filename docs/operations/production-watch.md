# Live-deploy watch

Checked 22 Sep 2026. Public host: https://klafi.vercel.app

This is the parked half of step 2 / step 16. It does **not** replace a real iPhone/Android WhatsApp tap. It records the five watch items so a bad release can be found and rolled back.

## Production URLs

Write these down before the next promote.

| Role | URL | Commit |
|---|---|---|
| Public | https://klafi.vercel.app | `0f8f300` (PR #25 on top of #24) |
| Current deployment | https://klafi-hovw1xwbo-guygirs-projects.vercel.app | `0f8f3001dde74ee8349ebeb476540371637b8809` |
| Previous deployment | https://klafi-7vwt5ypcw-guygirs-projects.vercel.app | `b87e926782e7fed21d8086dba26174e9a78948d0` |

Rollback: `vercel rollback https://klafi-7vwt5ypcw-guygirs-projects.vercel.app`

## Share (WhatsApp / Instagram crawlers)

What we can do from here: fetch the share pages with WhatsApp and Instagram crawler user-agents, and confirm title + image tags and that the image file exists.

| Surface | Result |
|---|---|
| `/share/binder` | 200. Title and image tags present. Static HTML had **relative** image URLs (`/design-assets/...`). WhatsApp often ignores those. This watch pass writes **absolute** `https://klafi.vercel.app/...` URLs. |
| `/share/YSR-M01-Q01` | **500 `FUNCTION_INVOCATION_FAILED`** on current production. The fat `/api` function crashed on boot because `docs/intake/research/set5-wip-pool.json` is not copied into the Hobby function, and `readJsonFile` threw instead of using its fallback. Card share, settle, leagues, and other fat routes are down until this ships. Slim `/api/health` and `/api/home` still work. |
| Card art file | `hero-art-gadi-eisenkot-slot1.png` is 328652 bytes, `image/png`, 864×1152. |

Still needed on a physical phone after this deploy: send one binder link and one card link through WhatsApp and Instagram on iOS and Android.

`npm run watch:production -- https://klafi.vercel.app`

## Idle stress

Not run against production (that would mint 1000 real guest sessions).

Local Postgres `kalpi_stress`, 1000 players, concurrency 50:

```json
{
  "baseUrl": "http://127.0.0.1:4350",
  "players": 1000,
  "concurrency": 50,
  "durationMs": 2488,
  "throughputPlayersPerSecond": 401.95,
  "errors": 0,
  "homeMs": { "p50": 54, "p95": 100, "p99": 129 },
  "settleMs": { "p50": 58, "p95": 110, "p99": 142 }
}
```

`PLAYERS=1000 CONCURRENCY=50 BASE_URL=http://127.0.0.1:4350 npm run stress:idle`

## Backup / restore drill

Dump of that 1000-session database, checksum, restore into disposable `kalpi_restore` (not the source URL):

- file `klafi-2026-09-22T15-18-26Z.dump`
- sha256 `86b2038c56cf68d38309538737a858377e7aa4e753c11a0d5af5989f1c8eb137`
- checksum verified
- restored 1000 sessions / 1000 inventory / 1000 instances
- orphan inventory 0, orphan instances 0, invalid inventory 0

`DATABASE_ADMIN_URL=... npm run backup:database`
`ALLOW_RESTORE_DRILL=1 BACKUP_FILE=... RESTORE_DATABASE_URL=... npm run restore:drill`

Production Supabase dump is not in this environment (no live `DATABASE_ADMIN_URL`). Run the same two commands against the session-pooler URL from a machine that has it.

## Error logs by `x-request-id`

- Fat `/api` already set `x-request-id` and logged `{ level, requestId, method, path, message }` on 500.
- 500 JSON now also returns `{ error: "SERVER_ERROR", requestId }` so a player report can be matched to a log line.
- Slim `/api/health`, `/api/home`, and `/api/community` now stamp the same header and log 500s with that id. Current production slim health is the older deploy, so it may not send the header until this ships.

`curl -sSI https://klafi.vercel.app/api/health | grep -i x-request-id`

## Repeat

1. `npm run watch:production -- https://klafi.vercel.app`
2. Confirm `/share/:cardId` is 200 after this deploy.
3. On a real phone, send binder + one card through WhatsApp and Instagram.
4. After a noisy week, dump production with `DATABASE_ADMIN_URL` and restore into a throwaway database.
