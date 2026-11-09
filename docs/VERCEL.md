# Deploy IntentGuard web to Vercel

App root: **`apps/intentguard/web`** (Next.js 16).

## One-time auth

```bash
vercel login
```

Or set `VERCEL_TOKEN` from [Vercel Account → Tokens](https://vercel.com/account/tokens).

## CLI deploy (from repo)

```bash
cd apps/intentguard/web
npm install
vercel link    # first time: pick team + project name (e.g. intentguard)
npm run deploy
```

Production URL is printed at the end.

## Import from GitHub (Vercel dashboard)

1. **Add New Project** → import `injective-buildathon` (or your fork).
2. **Root Directory** → **Edit** → set to `apps/intentguard/web` → **Continue**
3. Framework: **Next.js** (auto-detected; `package.json` in that folder)
4. **Deploy** (build should take ~1–2 minutes, not a few seconds)

### Fix: deploy “succeeds” but site shows Vercel 404

That means Vercel built the **repo root**, not the Next app.

1. [Vercel Dashboard](https://vercel.com) → your project → **Settings** → **General**
2. **Root Directory** → `apps/intentguard/web` → **Save**
3. **Deployments** → latest → **⋯** → **Redeploy** (use existing commit)

Confirm build logs show `next build` and routes like `/`, `/trade`, `/history`.

Proofs page uses committed `public/spike/*.json` on Vercel (no local `.spike/`).

## Env

| Variable | Required | Purpose |
|----------|----------|---------|
| (none) | for demo | `/`, `/trade`, `/portfolio`, `/start`, `/history` — public LCD for grant audit |

### Production — remote sidecar proxy (required for hosted `/console`)

Set on Vercel so `/console` uses **Vercel proxy** (`/api/gateway`). Owner key stays on the server when set here:

| Variable | Example |
|----------|---------|
| `INTENTGUARD_GATEWAY_URL` | `https://your-tunnel-or-vpc:8787` (must be reachable from Vercel) |
| `INTENTGUARD_OWNER_API_KEY` | `own_…` from your sidecar |

Also set:

| Variable | Value |
|----------|--------|
| `NEXT_PUBLIC_INTENTGUARD_PROXY_DEFAULT` | `1` |

Check: `GET /api/hosted/status` → `proxyConfigured: true`.

Full topology: [DEPLOY-PRODUCTION.md](./DEPLOY-PRODUCTION.md).

Agent calls still send `Authorization: Bearer agt_…` from the client (localStorage). Owner routes use the server-injected owner key when the client does not send `own_…`.

Local development: run `npm run gateway` + `npm run web:dev`; use `http://127.0.0.1:8787` in Console (not the proxy).

Routes after deploy: `/`, `/start`, `/trade`, `/console`, `/portfolio`, `/history`, `/limitations`, `/api/hosted/status`, `/api/gateway/*` (when proxy env set).
