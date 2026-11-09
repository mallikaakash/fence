# IntentGuard — production topology

Real product = **two deployables**:

| Piece | Where | Role |
|-------|--------|------|
| **Sidecar gateway** | Railway / Render / Fly / your VPC (Docker) | Sessions, policy, optional execute — **holds secrets** |
| **Web console** | Vercel (`apps/intentguard/web`) | Owner UI + HTTPS proxy to your gateway |

Vercel does **not** run the gateway (state, keys, MsgExec). Do not treat the public site as “demo only” once proxy env is set — `/console` is your hosted control plane.

## 1. Deploy gateway (Docker)

```bash
cd apps/intentguard
```

**Railway:** connect repo, set root to `apps/intentguard`, use `Dockerfile`, add persistent volume at `/data`, set env from `.env.example` (production: `INTENTGUARD_REQUIRE_DATA_KEY=1`, `INTENTGUARD_DATA_KEY`, `INTENTGUARD_CORS_ORIGINS`).

**Render:** use [`render.yaml`](../apps/intentguard/render.yaml) → attach disk for `/data/.intentguard`.

After first boot, read `ownerApiKey` from `config.json` on the volume (or set `INTENTGUARD_OWNER_API_KEY` before deploy).

Set CORS to your Vercel origin(s):

```bash
INTENTGUARD_CORS_ORIGINS=https://your-app.vercel.app,https://your-app-*.vercel.app
```

## 2. Wire Vercel proxy

In the Vercel project for `apps/intentguard/web`:

| Variable | Value |
|----------|--------|
| `INTENTGUARD_GATEWAY_URL` | Public HTTPS URL of the sidecar (no trailing slash) |
| `INTENTGUARD_OWNER_API_KEY` | `own_…` (server-injected for owner routes — not stored in browser) |
| `NEXT_PUBLIC_INTENTGUARD_PROXY_DEFAULT` | `1` (console defaults to `/api/gateway`) |

Redeploy. Check:

```bash
curl -sS "https://YOUR_APP.vercel.app/api/hosted/status"
# proxyConfigured: true
```

## 3. Owner flow on hosted console

1. Open `https://YOUR_APP.vercel.app/console` → **Use Vercel proxy** (auto when env above is set).
2. Create session → copy `agt_…` to agents (`INTENTGUARD_GATEWAY_URL` = sidecar URL or proxy).
3. Sign typed grant on-chain → **Check grant** in console.
4. Enable execute only when ready: `INTENTGUARD_EXECUTE=1` on the sidecar + owner key hex.

Agents should call the **sidecar URL** directly (or your API), not the browser.

## 4. Pilot on one machine (tunnel)

For a single-node pilot before Railway/Render:

```bash
cd apps/intentguard
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
# in another terminal:
ngrok http 8787
```

Point `INTENTGUARD_GATEWAY_URL` at the ngrok HTTPS URL and set CORS to your Vercel app.

## Verify

```bash
cd apps/intentguard
npm run platform:verify
curl -sS "$GATEWAY_URL/health"
curl -sS "https://YOUR_APP.vercel.app/api/gateway/health"
```

Ops: [SRE.md](./SRE.md) · Install: [INSTALL.md](./INSTALL.md) · Vercel: [VERCEL.md](./VERCEL.md)
