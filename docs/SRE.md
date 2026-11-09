# IntentGuard — SRE / platform operations

Sidecar gateway ops for single-node pilots and Docker compose. Not a hosted multi-tenant SLA (see [PRICING.md](./PRICING.md)).

## Probes

| Endpoint | Use | Returns |
|----------|-----|---------|
| `GET /health` | Summary | version, network, session count, encryption |
| `GET /health/live` | Liveness (K8s) | `{ ok: true }` while process up |
| `GET /health/ready` | Readiness | data dir, hydration, optional LCD probe |

**LCD probe:** set `INTENTGUARD_READY_LCD=1` to fail readiness when Injective LCD is unreachable (use when traffic should pause during outages).

## Logs

Structured **JSON lines** on stdout/stderr:

- `request` — method, path, status, `durationMs`, `requestId` (echoed as `x-request-id` when client sends it)
- `startup`, `shutdown` — lifecycle

Ship to your aggregator (CloudWatch, Datadog, Loki) via container log driver — no separate metrics agent in v0.1.x.

## Persistence

- **Atomic writes:** `state.json` via temp file + rename ([`persist.ts`](../apps/intentguard/src/server/persist.ts)).
- **Serialized saves:** concurrent HTTP handlers queue `persist()` — no last-writer races inside one process.
- **Graceful shutdown:** `SIGTERM` / `SIGINT` → stop accepting connections → drain in-flight → flush state.

## Docker

```bash
cd apps/intentguard
docker compose up -d --build
docker compose ps   # HEALTH column uses /health/ready
```

| Env | Notes |
|-----|--------|
| `DOCKER=1` | Binds `0.0.0.0` (see [config.ts](../apps/intentguard/src/server/config.ts)) |
| Volume `intentguard-data` | Maps to `/data/.intentguard` |
| Node | Image uses Node 22 + `--experimental-strip-types` — document in change management |

## CI / release verify

```bash
cd apps/intentguard
npm run platform:verify   # probes, shutdown, optional docker build
```

Full release train (with AppSec, protocol, GTM):

```bash
npm run check && npm test
npm run product:smoke && npm run security:verify && npm run e2e:protocol && npm run gtm:verify && npm run platform:verify && npm run ux:verify && npm run agent:verify && npm run legal:verify
npm run web:build
```

GitHub Actions: [`.github/workflows/intentguard-ci.yml`](../.github/workflows/intentguard-ci.yml)

## Runbook snippets

### Restart sidecar (data preserved)

```bash
docker compose restart intentguard-gateway
# or: systemctl restart intentguard
```

### Rotate owner HTTP key

```bash
curl -sS -X POST http://127.0.0.1:8787/v1/owner/rotate-api-key \
  -H "Authorization: Bearer $OWNER_KEY" | jq .
```

Update automations and Console localStorage.

### Disk full / corrupt state

1. Stop gateway.
2. Backup `state.json` and `config.json`.
3. Restore from backup or delete `state.json` to start fresh (sessions lost; on-chain grants remain — revoke if needed).

### Rate limit storm

`429` includes `retryAfterSeconds`. Raise `INTENTGUARD_RATE_LIMIT_PER_MIN` only behind a reverse proxy with auth.

## Not in v0.1.x

- Horizontal scaling (single writer store)
- Prometheus `/metrics`
- Webhook delivery SRE
- Multi-AZ hosted gateway
