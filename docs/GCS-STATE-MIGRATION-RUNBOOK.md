# GCS API state migration runbook (hosted gateway)

**Scope:** One-time copy from FUSE path `.intentguard/state.json` to API path `intentguard/state.json`, then redeploy with `INTENTGUARD_STATE_BACKEND=gcs`.

**Do not delete** the original FUSE object (rollback reference only — do not switch back to file backend after GCS writes begin).

See [DEPLOY-GCP.md](./DEPLOY-GCP.md) for single-writer rollout and maintenance.

## Preconditions

- `bash scripts/validate-gateway-deploy.sh` passes.
- Aggregate state stats: 5 sessions, 0 in-flight execute records (re-verify before copy).
- Operator owner API key available locally (not committed).
- Gateway revision deployed with **freeze-aware shutdown** (shutdown flush does **not** bypass state-write freeze).

## Freeze semantics (process-local)

State-write freeze (`INTENTGUARD_STATE_WRITE_FREEZE=1` and/or `POST /v1/owner/state-write/freeze`) is **in-process only**:

| Mechanism | Scope |
|-----------|--------|
| `INTENTGUARD_STATE_WRITE_FREEZE=1` on a Cloud Run revision | Every **new** instance of that revision at startup |
| `POST /v1/owner/state-write/freeze` | Only the instance that handled the request |
| `activeMutations` / `persistInFlight` in status JSON | That instance only |

There is **no** cross-instance distributed freeze in the gateway today. A single healthy `GET /v1/owner/state-write/status` with `activeMutations: 0` is **not** proof that all writers are stopped.

### Required writer stop (all instances)

1. Set **`INTENTGUARD_EXECUTION_MAINTENANCE=1`** and **`INTENTGUARD_STATE_WRITE_FREEZE=1`** on the **traffic-bearing** service template (new revision).
2. Route **100% traffic** to that revision (no split to an old revision without env freeze).
3. Scale to **`maxScale: 1`** during the copy window (see `scripts/lib/gateway-cloudrun-scale.sh`) — **useful, not sufficient** on its own.
4. **Drain** previous revisions until Cloud Run reports **no** instances on old revisions (or wait max instance lifetime + graceful shutdown).

**Actual safety condition (not `maxScale` alone):** every process that could write state is either (a) running the **freeze-aware** gateway build with **`INTENTGUARD_STATE_WRITE_FREEZE=1`** active, or (b) **stopped** and **confirmed unable** to resume writing (no live instance, no draining old revision on a build that can still shutdown-flush or persist without freeze). Removing old revisions from traffic alone does not satisfy (b) until those instances have exited.
5. Optionally call owner freeze **on each instance** if you run multiple replicas — not sufficient alone.
6. Confirm **no** concurrent process holds a writer lease on shared file state (GCS backend uses generation fencing instead).

**Shutdown flush (post 3.1.3):** Draining instances with freeze active **do not** write on shutdown; they log `shutdown_persist_skipped`. Instances **without** env freeze can still write on shutdown — another reason to drain old revisions before copy.

## Zero-writer checklist (before GCS copy)

`INTENTGUARD_EXECUTION_MAINTENANCE=1` blocks **new** `POST /v1/execute` only. It does **not** block session create/revoke, propose, owner rotate, or startup hydrate.

Use **both**:

1. `INTENTGUARD_EXECUTION_MAINTENANCE=1`
2. `INTENTGUARD_STATE_WRITE_FREEZE=1` on the service (**required** for migration; operator HTTP freeze is optional audit)

Confirm on **each** instance you care about (or on the single scaled-down instance):

- `GET /health`: `stateWriteFreeze: true`, `executionMaintenance: true`
- `GET /v1/owner/state-write/status`: `frozen: true`, `persistInFlight: false`, `activeMutations: 0`
- Logs: no `persist_failed`; draining instances may show `shutdown_persist_skipped` (expected)
- **Queued / in-flight:** wait until `persistInFlight: false` on all live instances; do not copy while any instance shows `persistInFlight: true`
- **Old revisions:** verify Cloud Run has no serving revision without `INTENTGUARD_STATE_WRITE_FREEZE=1` (traffic + revision list)

Do **not** use MD5 match alone while an unfrozen revision could still restart or drain.

## Migration gate (operator approval before any GCP change)

All must be true before `gcloud storage cp` or GCS-backend deploy:

1. Freeze-aware gateway build **deployed** (post 3.1.3 shutdown behavior).
2. **`INTENTGUARD_EXECUTION_MAINTENANCE=1`** enabled on the service template in use.
3. **`INTENTGUARD_STATE_WRITE_FREEZE=1`** on **every** instance that could write (traffic revision; no unfrozen split).
4. **Old revisions and draining instances** stopped — not only removed from traffic (revision list + instance count).
5. **No active mutations** or persistence: `persistInFlight: false`, `activeMutations: 0` on the surviving writer(s) you operate under.
6. **Source FUSE object** generation, MD5, size, and schema (`version`, session count) captured **immediately before** copy.
7. **Destination** `intentguard/state.json` verified (generation, MD5, size, session count) **before** deploying the GCS-backed revision.
8. After GCS cutover deploy, **health** shows `stateBackend: "gcs"` and **all five** existing sessions present.

**Separation:** Injective typed AuthZ grants for live execute are a **different** blocker — do not combine grant setup with this storage migration.

**Rollback:** Keep original `.intentguard/state.json` in the bucket. Once the GCS-backed revision writes the canonical `intentguard/state.json`, do **not** treat FUSE as authoritative; fix-forward or restore from a verified GCS backup only.

**Note:** Local regression tests (e.g. shutdown/freeze suites) prove code behavior only. They do **not** prove Cloud Run has reached a globally frozen, zero-writer state — that is established live during this window.

## Commands (operator approval required)

Replace `PROJECT`, `REGION`, `GW_SERVICE`, `BUCKET`, `GW_URL`, `WEB_URL` as needed.

### A — Maintenance + freeze (new revision)

```bash
source scripts/lib/gateway-cloudrun-scale.sh
export GCP_PROJECT_ID=project-bf77a013-c0b3-413c-a75
export GCP_REGION=us-central1
export GW_SERVICE=intentguard-gateway

gcloud run services update "$GW_SERVICE" \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --quiet \
  "${GW_CLOUDRUN_SCALE_FLAGS[@]}" \
  --update-env-vars "INTENTGUARD_EXECUTION_MAINTENANCE=1,INTENTGUARD_STATE_WRITE_FREEZE=1"
```

```bash
curl -sS "${GW_URL}/health" | jq '{ok,executionMaintenance,stateWriteFreeze,sessions}'
```

Optional operator freeze (audit entry; **per-instance** only):

```bash
curl -sS -X POST "${GW_URL}/v1/owner/state-write/freeze" \
  -H "Authorization: Bearer $INTENTGUARD_OWNER_API_KEY"
```

Drain old revisions (operator verifies in console or `gcloud run revisions list` + traffic targets) before step B.

### B — Capture source + copy (no gateway mutations during copy)

```bash
export BUCKET=intentguard-state-project-bf77a013-c0b3-413c-a75
gcloud storage objects describe "gs://${BUCKET}/.intentguard/state.json" \
  --project="$GCP_PROJECT_ID" \
  --format='yaml(name,generation,size,md5_hash,crc32c_hash)'

gcloud storage cp \
  "gs://${BUCKET}/.intentguard/state.json" \
  "gs://${BUCKET}/intentguard/state.json" \
  --project="$GCP_PROJECT_ID"

gcloud storage objects describe "gs://${BUCKET}/intentguard/state.json" \
  --project="$GCP_PROJECT_ID" \
  --format='yaml(name,generation,size,md5_hash,crc32c_hash)'
```

Integrity: **md5_hash and size** must match source at copy time.

Session count check (no secrets printed):

```bash
gcloud storage cat "gs://${BUCKET}/intentguard/state.json" --project="$GCP_PROJECT_ID" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('version',d.get('version'),'sessions',len(d.get('sessions',[])))"
```

Expect `version 2`, `sessions 5`.

### C — Deploy aligned gateway (maintenance + freeze still on)

```bash
export INTENTGUARD_GCS_BUCKET="$BUCKET"
bash scripts/deploy-intentguard-gcp.sh
# Deploy must include GCS env + scale flags; keep maintenance/freeze until verification completes.
```

### D — Post-deploy verification

```bash
bash scripts/verify-gateway-cloudrun-live.sh
curl -sS "${WEB_URL}/api/gateway/health" | jq '{
  ok, network, executeEnabled, requireOnChainGrant,
  executionMaintenance, stateWriteFreeze, stateBackend, stateLocation, sessions
}'
```

Expect `stateBackend: "gcs"`, `sessions: 5`, `stateLocation` ending in `/intentguard/state.json`.

Re-confirm all five sessions via owner API or exported state (no secret material in logs).

### E — Clear maintenance + freeze

Only after destination integrity and session checks pass:

```bash
gcloud run services update "$GW_SERVICE" \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --quiet \
  "${GW_CLOUDRUN_SCALE_FLAGS[@]}" \
  --remove-env-vars "INTENTGUARD_EXECUTION_MAINTENANCE,INTENTGUARD_STATE_WRITE_FREEZE"
```

```bash
curl -sS -X POST "${GW_URL}/v1/owner/state-write/unfreeze" \
  -H "Authorization: Bearer $INTENTGUARD_OWNER_API_KEY"
```

## Rollback (before GCS backend serves traffic)

If **no** successful persist on `intentguard/state.json` from the new revision:

1. Revert traffic to prior revision **only if** it still uses **file** backend and FUSE path was not mutated after copy.
2. Do **not** point a file-backend revision at stale FUSE after the GCS revision has written `intentguard/state.json`.
3. If GCS revision already claimed ownership, rollback = fix-forward (restore from backup copy of JSON), not FUSE path.

## Rollback after GCS writes (fix-forward)

1. Re-freeze maintenance + env freeze; drain writers per checklist above.
2. Export `intentguard/state.json` generation + body backup.
3. Redeploy known-good revision or restore object from pre-migration backup (same bucket, operator copy).
4. Do not delete FUSE archive `.intentguard/state.json` — compare hashes for forensics only.
