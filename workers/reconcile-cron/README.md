# reconcile-cron

Standalone Cloudflare Cron worker that keeps the hour-package limit timely.

Every minute it POSTs to `/api/cron/reconcile` on the main app, which caps any
running timer that crossed its active package's limit (exactly at the
boundary), marks the package depleted, activates the next queued package, and
emails the responsible admin. This is a *safety net* — the hard limit is also
enforced on start / pause / complete / project-page load, so no time is ever
billed past a package even if this worker is down.

It's a separate worker because the main app is built with OpenNext, whose
generated worker exports only a `fetch` handler and can't host `scheduled()`.

## Deploy

```bash
# 1. Shared secret on the MAIN app worker (so the endpoint accepts the poke)
wrangler secret put CRON_SECRET            # run at repo root, targets `studioservice`

# 2. This cron worker
cd workers/reconcile-cron
wrangler secret put CRON_SECRET            # same value as above
wrangler deploy
```

Change the cadence via `triggers.crons` in `wrangler.jsonc` (cron syntax; min
granularity 1 minute). Test the endpoint directly:

```bash
curl -X POST https://service.uriyaganor.com/api/cron/reconcile \
  -H "Authorization: Bearer <CRON_SECRET>"
```
