# IntentGuard — web UX & limitations

## Surfaces

| Route | Mode | Secrets |
|-------|------|---------|
| `/portfolio` | Hosted OK | None |
| `/trade` | Offline or sidecar toggle | `agt_…` in localStorage when sidecar on |
| `/console` | **Local web + sidecar** or Vercel proxy | `own_…` / `agt_…` in browser localStorage |
| `/start` | Hosted OK | None |

## Owner console

- **Network badge** — from gateway `GET /health` (`testnet` / `mainnet`).
- **Clear stored keys** — wipes localStorage; use on shared machines or after demos.
- **Stale keys warning** — prompts after 24h since last save (cosmetic; not a security control).
- **Mixed content** — HTTPS hosted UI cannot call `http://127.0.0.1` from another machine; use **Vercel proxy** or run `npm run web:dev` locally.

## Policy simulator

- **Offline** — in-process policy only (default).
- **Sidecar** — calls real gateway when agent token + URL are set in Console.

## What we do not claim

- Browser storage is not a vault (XSS = key leak).
- No in-browser Keplr grant signing in v0.1.x (use grant tx plan + wallet).
- Hosted `/console` without proxy env is **read-only demos** only.

Verify UX artifacts: `npm run ux:verify`
