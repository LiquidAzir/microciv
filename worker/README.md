# MicroCiv cloud-save worker (optional)

Automatic phone↔PC↔glasses save sync is **opt-in**. By default `config.js`
reuses a shared worker, so you don't have to deploy anything. Deploy your own
only if you want a dedicated, isolated store.

It's a ~40-line Cloudflare Worker backed by a KV namespace. Free tier is plenty
for one player.

## Deploy (5 minutes, run in your own terminal)

```sh
cd "C:/Development/Meta Display Apps/microciv/worker"
npx wrangler login                       # opens a browser → click Allow
npx wrangler kv namespace create SAVES   # paste the printed id into wrangler.toml
npx wrangler deploy                      # prints https://microciv-saves.<you>.workers.dev
```

Then put that URL into `../config.js`:

```js
window.MICROCIV_CONFIG = { cloudUrl: 'https://microciv-saves.<you>.workers.dev' };
```

Commit + redeploy the site. Done — every device that opens your `?u=<id>` link
(copy/scan it from the in-game **Cloud Sync** screen) shares one save.

## API

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `GET`  | `/v1/save?u=<id>` | — | `{ t, data }` or `{ data: null }` |
| `PUT`  | `/v1/save?u=<id>` | JSON envelope `{ t, z }` | `{ ok: true, t }` |

`data` is the app's compressed save envelope. The id `u` is the only secret.

## Troubleshooting

- **`PUT` returns 503 "write failed"** — almost always the free-tier KV daily
  write limit (~1,000 writes/day, account-wide, resets 00:00 UTC). Reads keep
  working. Wait for the reset, or upgrade to Workers Paid ($5/mo → ~1M writes/mo).
  For one player you'll never hit the cap in normal play.
- **`PUT` returns `error code: 1101`** — an *older* worker without the try/catch
  around `env.SAVES.put()`; redeploy this `worker.js`, which converts that into a
  clean 503 so the client can surface "writes failing" instead of an opaque error.
