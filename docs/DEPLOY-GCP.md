# IntentGuard on Google Cloud (Cloud Run)

Replaces **Vercel (web)** + **Railway (gateway)** with two **Cloud Run** services in one GCP project.

| Service | Image | Ingress | Persistence |
|---------|--------|---------|-------------|
| `intentguard-gateway` | `apps/intentguard/Dockerfile` | Public HTTPS (API keys) | **Authoritative `state.json`** via GCS JSON API; **FUSE mount** at `/data/.intentguard` for `config.json` and local aux files only |
| `intentguard-web` | `apps/intentguard/web/Dockerfile` | Public HTTPS | Stateless |

Cloud Run listens on **`PORT`** (default 8080). The gateway reads `PORT` automatically (`config.ts`).

## Prerequisites

- `gcloud` CLI, billing enabled on the project
- `gcloud auth login` and `gcloud config set project YOUR_PROJECT_ID`

`gcloud run deploy --source` uses **`apps/intentguard/.gcloudignore`** (and `web/.gcloudignore` for web) so `.env.deploy`, `.spike/`, `node_modules`, and `web/.next` are **not** uploaded. Deploy still writes `.env.deploy` locally for Secret Manager bootstrap — that file must never be committed.

Set these for the sections below:

```bash
export GCP_PROJECT_ID=your-project-id
export GCP_REGION=us-central1
export GW_SERVICE=intentguard-gateway
```

## Deploy targets (`INTENTGUARD_DEPLOY_TARGET`)

Controlled rollout uses three modes (default **`full`** for backward compatibility). Invalid values fail **before** any GCP call.

| Target | Deploys | Does **not** modify |
|--------|---------|---------------------|
| `full` | Gateway → web → gateway CORS | — (same as historical one-shot) |
| `gateway` | Gateway + CORS (uses **existing** web URL for `INTENTGUARD_CORS_ORIGINS`) | Web service, web traffic, web env |
| `web` | Web only (discovers existing gateway URL) | Gateway deploy, gateway env/secrets/scaling, GCS bucket, CORS |

### Full deployment (default)

```bash
chmod +x scripts/deploy-intentguard-gcp.sh
bash scripts/deploy-intentguard-gcp.sh
# equivalent:
INTENTGUARD_DEPLOY_TARGET=full bash scripts/deploy-intentguard-gcp.sh
```

### Gateway-only (Phase 3.9B)

Use after you need a new gateway image **without** touching the web service.

```bash
export GCP_PROJECT_ID=your-project-id
export GCP_REGION=us-central1
export INTENTGUARD_GCS_BUCKET=intentguard-state-${GCP_PROJECT_ID}

INTENTGUARD_DEPLOY_TARGET=gateway \
  bash scripts/deploy-intentguard-gcp.sh
```

Then verify gateway **before** web deploy:

```bash
bash scripts/verify-gateway-cloudrun-live.sh
```

Gateway deploy preserves: `INJECTIVE_NETWORK=testnet`, `INTENTGUARD_EXECUTE=1`, `INTENTGUARD_REQUIRE_ONCHAIN_GRANT=1`, `INTENTGUARD_STATE_BACKEND=gcs`, `INTENTGUARD_REQUIRE_GCS_STATE=1`, authoritative object `intentguard/state.json`, Secret Manager refs `intentguard-data-key:latest` and `intentguard-owner-api-key:latest`, and scaling from `scripts/lib/gateway-cloudrun-scale.sh` (service **max=1**, revision **max-instances=1**) on **both** `run deploy` and CORS `services update`.

### Web-only (Phase 3.9C)

Use only after gateway verification passes.

```bash
INTENTGUARD_DEPLOY_TARGET=web \
  bash scripts/deploy-intentguard-gcp.sh
```

Web deploy sets `INTENTGUARD_GATEWAY_URL` to the live gateway URL, `NEXT_PUBLIC_INTENTGUARD_PROXY_DEFAULT=1`, and `INTENTGUARD_OWNER_API_KEY` via **server-side** Secret Manager only (not in browser bundles or `NEXT_PUBLIC_*`).

Web-only does **not** run gateway CORS updates; if the web origin changes, run a **gateway** deploy or a documented manual CORS update **with** `"${GW_CLOUDRUN_SCALE_FLAGS[@]}"`.

### Required environment

- `GCP_PROJECT_ID` or `gcloud config set project`
- `GCP_REGION` (default `us-central1`)
- `INTENTGUARD_GCS_BUCKET` (default `intentguard-state-${GCP_PROJECT_ID}`) for **full** and **gateway**
- Optional: `INTENTGUARD_GW_SERVICE`, `INTENTGUARD_WEB_SERVICE`

### Secrets (no routine rotation)

Routine deploy **reuses** existing Secret Manager versions. The script does **not** call `gcloud secrets versions add` unless you explicitly set:

```bash
INTENTGUARD_DEPLOY_ROTATE_SECRETS=1
```

Never enable rotation for ordinary rollouts.

### Local validation (no GCP)

```bash
bash scripts/validate-gateway-deploy.sh
INTENTGUARD_DEPLOY_DRY_RUN=1 bash scripts/test/deploy-target-dryrun.sh
```

### Rollback precautions

- **Traffic:** Prefer rolling traffic back to a known-good Cloud Run revision; do not widen gateway scaling during env-only updates.
- **State:** Authoritative session state is **`gs://BUCKET/intentguard/state.json`**. Never restore an older FUSE-mounted copy or local file over GCS as source of truth.
- **Secrets:** Rolling back images does not require new secret versions; avoid `INTENTGUARD_DEPLOY_ROTATE_SECRETS=1` unless intentionally rotating keys.

### What `full` runs

1. Enables required APIs (incl. Storage for gateway)
2. Creates the GCS bucket if missing
3. Ensures Secret Manager secrets (create only if missing; otherwise reuse)
4. Deploys the gateway with GCS volume + authoritative JSON state
5. Deploys the web app with gateway URL + owner secret for `/api/gateway`
6. Updates gateway `INTENTGUARD_CORS_ORIGINS` to the web URL (with scale flags)

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

After typed MsgGrant is on-chain and the **session grantee** has INJ for MsgExec gas:

```bash
chmod +x scripts/enable-gcp-execute.sh
./scripts/enable-gcp-execute.sh
```

The script passes **service `--min 1 --max 1`** and **revision `--min-instances 0 --max-instances 1`** (see below).  
**Owner private key** in Secret Manager is **optional** (address validation only). Keplr sessions broadcast via the **grantee** signer.

Console **Execute readiness** panel shows whether execute is enabled.

Full checklist (grantee gas, subaccount margin, first live order): [GO-LIVE-TESTNET.md](./GO-LIVE-TESTNET.md).

## Execute on-chain (manual env)

Same as local: fund grantee + margin, typed MsgGrant, then set on the **gateway** service only:

- `INTENTGUARD_EXECUTE=1`
- Optional: `INTENTGUARD_OWNER_PRIVATE_KEY_HEX` via Secret Manager (never on web)

### CORS / env-only updates (scaling regression)

`deploy-intentguard-gcp.sh` ends with a **CORS** `gcloud run services update`. Any gateway `services update` that **omits** service `--max 1` or revision `--max-instances 1` can widen scaling (revision templates often default to **maxScale=100** unless set).

Repository scripts source `scripts/lib/gateway-cloudrun-scale.sh` and pass `"${GW_CLOUDRUN_SCALE_FLAGS[@]}"` on **every** gateway deploy and update. After **any** manual `gcloud run services update`, re-verify live scale (below).

Local check (no GCP credentials):

```bash
bash scripts/validate-gateway-deploy.sh
```

## Authoritative state (GCS JSON API — Phase 2B.3.4)

Hosted gateways **must not** treat the FUSE path as the source of truth for execution safety state.

| Item | Value |
|------|--------|
| Backend | `INTENTGUARD_STATE_BACKEND=gcs` (auto when `DOCKER=1` and bucket env set) |
| Bucket | `INTENTGUARD_GCS_STATE_BUCKET` (deploy script sets to the same bucket as the volume) |
| Object | `INTENTGUARD_GCS_STATE_OBJECT` default `intentguard/state.json` |
| Strict hosted | `INTENTGUARD_REQUIRE_GCS_STATE=1` — startup **fails** if GCS backend cannot be created |
| Writer lease file | Disabled when `state_backend=gcs` (fencing uses `writerEpoch` + `ifGenerationMatch`) |

**IAM (Cloud Run runtime SA):** `roles/storage.objectUser` on the bucket, or custom role with `storage.objects.get`, `storage.objects.create`, `storage.objects.update` on `intentguard/state.json` only.

**Verify active writer:** `GET /health` → `stateBackend: "gcs"`, `stateLocation: "gs://BUCKET/intentguard/state.json"`. Inspect object metadata generation in Cloud Console after deploy.

**Generation conflict (412):** Gateway returns `persist_failed` / 503 on mutations. Operator: ensure single traffic target, use state-write freeze, reload — **do not** delete the object. See [STATE-PERSISTENCE-GCS-DESIGN.md](./STATE-PERSISTENCE-GCS-DESIGN.md) §migration.

**Migration from FUSE `state.json`:** Copy `/data/.intentguard/state.json` bytes to `gs://BUCKET/intentguard/state.json` **once**, with zero writers. First GCS-backed revision claims `writerEpoch+1` on first persist. Do not keep writing both paths.

**Live GCS tests:** See [GCS-LIVE-TEST.md](./GCS-LIVE-TEST.md) (dedicated test SA, mandatory prod bucket guard, no Owner ADC).

Design + security review: [STATE-PERSISTENCE-GCS-DESIGN.md](./STATE-PERSISTENCE-GCS-DESIGN.md), [STATE-PERSISTENCE-GCS-SECURITY-REVIEW.md](./STATE-PERSISTENCE-GCS-SECURITY-REVIEW.md).

## Single-Writer Guarantee and Cloud Run Limitations

Execution safety state is committed through **`GcsConditionalStateStore`** (`file.save` + `preconditionOpts.ifGenerationMatch`). The **GCS FUSE** mount at `/data` remains for **`config.json`** and operator files — it must **not** receive authoritative `state.json` writes in hosted mode.

Scaling still assumes **one logical writer** per bucket; conditional GCS commits are the backstop when two revisions overlap briefly.

### What repository scaling configures

Scripts source `scripts/lib/gateway-cloudrun-scale.sh`:

| Flag (layer) | Value | Role |
|--------------|-------|------|
| `--min` / `--max` | **1 / 1** | **Service-level** cap — at most one container instance **among revisions that share traffic** (Google divides the budget by traffic split). |
| `--min-instances` | **0** | **Revision-level** — drained revisions can scale to **zero** (old templates with `min-instances: 1` stay warm until retired). |
| `--max-instances` | **1** | **Revision-level** — each new revision template caps at one instance. |

Warm capacity for production uses **service `--min 1`**, not revision `min-instances: 1`, so traffic cutover does not leave a second always-on writer on a drained revision.

### What Cloud Run guarantees (and does not)

Per [Cloud Run autoscaling](https://cloud.google.com/run/docs/about-instance-autoscaling) and [max instances](https://cloud.google.com/run/docs/configuring/max-instances):

1. **Revision `--max-instances`** limits **that revision only**. During deploy or traffic split, **two revisions can each run instances** — total instance count can exceed one.
2. **Service `--max`** limits instances **allocated to revisions in the traffic split**. It can be changed **without** a new revision.
3. **Tagged revisions not in the traffic split** may still start instances (e.g. tag URL health checks). They **do not** count toward service `--max` the same way as split traffic — **`--no-traffic` does not mean no instance can start**.
4. **There is no supported Cloud Run mode** that guarantees “at most one gateway process” across **all** revisions, tags, and deploy overlap while mounting the **same** GCS bucket.
5. **Traffic migration does not instantly terminate** old processes; in-flight requests and shutdown persistence can still write `state.json`.

### GCS FUSE and maintenance

- **Atomic rename** on one mount does not serialize two containers.
- **`INTENTGUARD_EXECUTION_MAINTENANCE=1`** pauses **new executes** on **that revision’s env only**. It does **not** stop: session create, propose, revoke, audit append, startup `hydrate()` recovery persist, or shutdown flush — all can still mutate `state.json` (see [INTENTGUARD-EXECUTE-SAFETY.md](./INTENTGUARD-EXECUTE-SAFETY.md)).
- **Never** run two Cloud Run **services** against the same state bucket.

### Before enabling execute (operator)

1. **Local (no GCP):** `bash scripts/validate-gateway-deploy.sh`
2. **Live (read-only, optional):** `bash scripts/verify-gateway-cloudrun-live.sh` — does **not** modify Cloud Run; exit non-zero if warnings
3. Confirm **service `--max 1`**, **latest revision `maxScale` 1**, **single traffic target at 100%** (no tag split)
4. Confirm **one** gateway service per GCS bucket
5. Plan rollouts using **serial writer** steps below — do not rely on tag-based candidates on the production bucket

### Multiple gateway instances (future)

Would require **non–file-backed** coordination (external DB/lock, chain-only state, or object-generation preconditions). Not in v0.2 scope.

### Verify scale (live; NOT run by agents in 2B)

```bash
# Service-level (primary budget):
gcloud run services describe "$GW_SERVICE" \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --format='value(metadata.annotations.run.googleapis.com/maxScale)'
# Expect: 1

# Latest revision template:
gcloud run services describe "$GW_SERVICE" \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --format='value(spec.template.metadata.annotations["autoscaling.knative.dev/maxScale"])'
# Expect: 1

# Or JSON report:
bash scripts/verify-gateway-cloudrun-live.sh
```

**Correct hosted scaling** (operator; may create a revision for template flags; service `--max` applies immediately):

```bash
gcloud run services update "$GW_SERVICE" \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --min 1 \
  --max 1 \
  --min-instances 0 \
  --max-instances 1
```

See also [INTENTGUARD-EXECUTE-SAFETY.md](./INTENTGUARD-EXECUTE-SAFETY.md) (state mutations, concurrency, maintenance).

## State Write Freeze and Cross-Revision Ownership

Before shifting traffic, operators should:

1. `INTENTGUARD_EXECUTION_MAINTENANCE=1` — stop new executes.
2. **State write freeze** — `INTENTGUARD_STATE_WRITE_FREEZE=1` on the traffic revision, or owner `POST /v1/owner/state-write/freeze` (persists audit, then blocks mutations).
3. Wait for in-flight work; confirm health shows `stateWriteFreeze: true`.
4. Optional hosted: `INTENTGUARD_WRITER_LEASE_MODE=file` (same data dir) + `INTENTGUARD_REQUIRE_WRITER_LEASE=1` for fencing before each persist.

**Deploy handoff:** Only one process may write `state.json`. Freeze the writer, migrate traffic using the **serial writer** steps below, wait until the old revision is not serving requests, then unfreeze on the sole surviving revision. Traffic migration alone does not prove the old process exited.

**Recovery after interrupted deploy:** If freeze env is left on, the gateway serves 503 on mutations until `POST /v1/owner/state-write/unfreeze` or env is cleared and redeployed. If a stale revision restarts with an old lease token, persistence fails with `writer_lease_lost` — intentional fail-closed behavior.

Full mutation inventory: `apps/intentguard/src/persistence/stateMutationInventory.ts`.

## Deploy / rollback — pause executes (maintenance)

`INTENTGUARD_EXECUTION_MAINTENANCE=1` makes `POST /v1/execute` return **`503`** / **`execution_maintenance`** on **that revision only**. Propose, health, revoke, and read APIs keep working.

### How Cloud Run treats environment variables

- **`gcloud run deploy`** and **`gcloud run services update`** both create a **new revision**. They do **not** change env vars on an already-created revision.
- During rollout, **multiple revisions can be running** (traffic split, draining old revision, or `--no-traffic` candidate).
- Any revision that **receives execute traffic** without maintenance can still accept `POST /v1/execute` until drained. You must ensure **every revision that can take traffic during the transition** was built with `INTENTGUARD_EXECUTION_MAINTENANCE=1` (or accept the risk on an older revision’s frozen env).

### Variables

```bash
GW_URL="$(gcloud run services describe "$GW_SERVICE" \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --format='value(status.url)')"
```

### Unsafe pattern (do not use on production GCS bucket)

- **`gcloud run deploy --no-traffic --tag=candidate`** plus **health checks on the tag URL** while the prior revision is still running — starts a **second** process that can read/write `state.json`.
- **Revision `--min-instances 1` on multiple revisions** — drained revisions can remain warm and write on shutdown or stray requests.

Image smoke against a **separate** Cloud Run service and **empty staging bucket** is fine; do not mount production `state.json` from two revisions.

### Recommended rollout (serial writer, shared GCS)

Accept **brief** overlap while Cloud Run shifts traffic (Google can run old and new revisions concurrently during deploy). Minimize overlap duration and **avoid tag/candidate URLs** on the production bucket.

| Step | Action |
|------|--------|
| 0 | Preconditions: live verify service `--max 1`, one gateway per bucket, agents idle |
| 1 | **Maintenance** on traffic-serving revision (scale flags + env) |
| 2 | Wait for in-flight **executes** to finish (maintenance blocks new ones) |
| 3 | **Deploy new image to 100% traffic** with maintenance still on (mirror `deploy-intentguard-gcp.sh` + `INTENTGUARD_EXECUTION_MAINTENANCE=1`) — **no `--tag` / `--no-traffic` candidate** on this bucket |
| 4 | Confirm **one** traffic target at 100%, logging quiet on prior `revision_name` |
| 5 | Wait until you accept only the new revision is serving production URLs |
| 6 | Clear maintenance (scale flags on every update) |
| 7 | Re-run live verify + `/health` |

**Step 1 — maintenance + scaling (creates a new revision)**

```bash
gcloud run services update "$GW_SERVICE" \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --min 1 \
  --max 1 \
  --min-instances 0 \
  --max-instances 1 \
  --update-env-vars "INTENTGUARD_EXECUTION_MAINTENANCE=1"
```

```bash
curl -sS "${GW_URL}/health" | jq '{executionMaintenance, executeEnabled, ok}'
```

**Step 3 — deploy new revision (100% traffic, maintenance on)**

From `apps/intentguard`, mirror `scripts/deploy-intentguard-gcp.sh` gateway deploy and add `INTENTGUARD_EXECUTION_MAINTENANCE=1` to env. Include `"${GW_CLOUDRUN_SCALE_FLAGS[@]}"` (or explicit `--min 1 --max 1 --min-instances 0 --max-instances 1`). Do **not** pass `--no-traffic` or `--tag` for production state.

**Step 6 — clear maintenance**

```bash
gcloud run services update "$GW_SERVICE" \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --min 1 \
  --max 1 \
  --min-instances 0 \
  --max-instances 1 \
  --remove-env-vars "INTENTGUARD_EXECUTION_MAINTENANCE"
```

```bash
curl -sS "${GW_URL}/health" | jq '{executionMaintenance, ok}'
```

### Rollback

Revisions are **immutable**. Safe rollback mirrors the serial writer flow:

1. Maintenance + scaling on the **current** traffic holder (step 1).
2. `gcloud run services update-traffic … --to-revisions=REVISION_NAME=100` **only** if that revision was built with maintenance (inspect env on the revision).
3. Wait for the failed revision to stop receiving traffic; prefer revisions with **`min-instances 0`** so drained instances can exit.
4. Clear maintenance only when a **single** revision serves 100% traffic and live verify is clean.

```bash
gcloud run revisions list \
  --service "$GW_SERVICE" \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION"
```

Avoid `--to-latest` without maintenance. Avoid tag-based rollback that hits a second writer on GCS.

### What maintenance does **not** do

- It does **not** block all `state.json` writes (sessions, propose, revoke, audit, recovery, shutdown).
- It does **not** synchronize across revisions.
- It does **not** cancel chain transactions past the broadcast boundary.
- It does **not** replace service **`--max 1`**, revision **`max-instances 1`**, or serial rollout discipline.

## Ops

Logs: Cloud Logging → filter `resource.type="cloud_run_revision"`.  
Runbook: [SRE.md](./SRE.md).
