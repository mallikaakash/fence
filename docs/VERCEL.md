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

No secrets required for the demo UI. Grant audit calls public Injective LCD from serverless functions.
