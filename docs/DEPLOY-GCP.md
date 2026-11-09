# IntentGuard on Google Cloud (Cloud Run)

Replaces **Vercel (web)** + **Railway (gateway)** with two **Cloud Run** services in one GCP project.

| Service | Image | Ingress | Persistence |
|---------|--------|---------|-------------|
| `intentguard-gateway` | `apps/intentguard/Dockerfile` | Public HTTPS (API keys) | GCS bucket mounted at `/data` |
| `intentguard-web` | `apps/intentguard/web/Dockerfile` | Public HTTPS | Stateless |

Cloud Run listens on **`PORT`** (default 8080). The gateway reads `PORT` automatically (`config.ts`).

## Prerequisites

- `gcloud` CLI, billing enabled on the project
- `gcloud auth login` and `gcloud config set project YOUR_PROJECT_ID`

## One-shot deploy

```bash
export GCP_PROJECT_ID=your-project-id
export GCP_REGION=us-central1   # optional
chmod +x scripts/deploy-intentguard-gcp.sh
./scripts/deploy-intentguard-gcp.sh
```

The script:

1. Enables required APIs
2. Creates a GCS bucket for gateway state (`.intentguard/` on disk)
3. Stores `INTENTGUARD_DATA_KEY` and `INTENTGUARD_OWNER_API_KEY` in Secret Manager
4. Deploys the gateway with a GCS volume at `/data`
5. Deploys the web app with `INTENTGUARD_GATEWAY_URL` + owner secret for `/api/gateway`

## After deploy

```bash
curl -sS "https://YOUR-WEB-URL.run.app/api/hosted/status"
curl -sS "https://YOUR-WEB-URL.run.app/api/gateway/health"
```

Open `https://YOUR-WEB-URL.run.app/console` (proxy default when env is set).

## Custom domain

```bash
gcloud run domain-mappings create --service intentguard-web --domain console.yourdomain.com --region $GCP_REGION
```

Map DNS per gcloud instructions. Add the web URL to gateway `INTENTGUARD_CORS_ORIGINS`.

## Migrating off Vercel

1. Deploy GCP (above)
2. Point users to the `intentguard-web` Cloud Run URL
3. Remove or archive the Vercel project when satisfied

## Cost (rough)

- Cloud Run with **min instances = 0**: pay per request; gateway cold starts may add latency
- **Min instances = 1** on gateway (~$10–15/mo region-dependent) for steadier owner console
- GCS bucket: cents for testnet state

## Enable execute (MsgExec)

After grants are on-chain and the owner wallet is funded:

```bash
# Owner hex in Secret Manager (never in git):
printf '%s' "$OWNER_HEX" | gcloud secrets create intentguard-owner-private-key --data-file=-
chmod +x scripts/enable-gcp-execute.sh
./scripts/enable-gcp-execute.sh
```

Console **Execute readiness** panel shows whether execute is enabled.

## Execute on-chain (manual env)

Same as local: fund wallets, typed MsgGrant, then set on the **gateway** service only:

- `INTENTGUARD_EXECUTE=1`
- `INTENTGUARD_OWNER_PRIVATE_KEY_HEX` via Secret Manager (never on web)

## Ops

Logs: Cloud Logging → filter `resource.type="cloud_run_revision"`.  
Runbook: [SRE.md](./SRE.md).
