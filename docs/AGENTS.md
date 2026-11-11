# IntentGuard — AI & agent integrators

## Credentials

| Role | Header | Capabilities |
|------|--------|----------------|
| Owner | `Authorization: Bearer own_…` | Sessions, revoke, audit, grant plans |
| Agent | `Authorization: Bearer agt_…` | `POST /v1/propose`, optional `POST /v1/execute` |

Never put grantee or owner **chain** private keys in the agent process.

## Status machine

```
POST /v1/propose  →  phase: policy_check  →  chainEffect: none  →  signed/broadcast: false
POST /v1/execute  →  phase: chain_broadcast  →  may broadcast MsgExec (sidecar + on-chain grant)
```

| Field | propose | execute |
|-------|---------|---------|
| `status` | `allowed` \| `denied` | `allowed` \| `denied` |
| `wouldSign` | true only if policy OK | N/A |
| `dryRun` | always `true` | N/A |
| `broadcast` | always `false` | true when tx sent |
| `txHash` | absent | present when broadcast |

**Common mistake:** treating `propose` `allowed` + `wouldSign: true` as an on-chain fill. Always check `phase` and `broadcast`.

## HTTP client

```typescript
import { createGatewayClient } from "../src/client/gateway.ts";

const client = createGatewayClient({
  baseUrl: "http://127.0.0.1:8787",
  agentApiToken: process.env.AGENT_TOKEN,
});

const { json } = await client.propose(intent, {
  idempotencyKey: "order-123",
});
```

OpenAPI: `GET /v1/openapi.json` (schemas for `ProposeResponse`, `ExecuteResponse`, `TradeIntent`).

## Propose → execute binding (Phase 2A.3)

1. `POST /v1/propose` — on `status: allowed`, capture `proposalId` and `proposalExpiresAt`.
2. `POST /v1/execute` with body `{ "proposalId", "intent" }` — **intent must match** the approved fingerprint (same fields as propose).
3. Header **`Idempotency-Key` required** on execute (1–128 printable ASCII). Same session + key + payload replays the stored outcome.

See [INTENTGUARD-EXECUTE-SAFETY.md](./INTENTGUARD-EXECUTE-SAFETY.md) for state machine, `broadcast_unknown`, and **single-instance** concurrency limits.

## Idempotency

- **Propose:** optional `Idempotency-Key` — same session + key returns the first response within 1 hour (`idempotentReplay: true`), including the same `proposalId` when stored.
- **Execute:** **required** `Idempotency-Key` — prevents duplicate broadcasts; see execute safety doc.

## Webhooks (optional)

Set on sidecar:

```bash
INTENTGUARD_WEBHOOK_URL=https://your-orchestrator/hooks/intentguard
```

JSON POST on `propose_allowed`, `propose_denied`, `execute_allowed`, `execute_denied`.

## Agent SDK

```typescript
import {
  createGatewayClient,
  DEFAULT_INJ_PERP_MARKET_ID,
} from "../apps/intentguard/src/agent-sdk/index.ts";

const client = createGatewayClient({
  baseUrl: process.env.INTENTGUARD_GATEWAY_URL!,
  agentApiToken: process.env.INTENTGUARD_AGENT_TOKEN,
});

await client.agentSession();
const { json: prop } = await client.propose(
  { marketId: DEFAULT_INJ_PERP_MARKET_ID, margin: "2", leverage: 2, price: "10", quantity: "0.1" },
);
await client.execute(
  { proposalId: prop.proposalId, intent: { /* same intent */ } },
  { idempotencyKey: "attempt-1" },
);
```

Examples: `apps/intentguard/examples/` (`agent-bot.mjs`, `agent-curl.sh`).

## Cursor MCP

### `intentguard-agent` (reference — agt_ + live API only)

| Tool | HTTP |
|------|------|
| `intentguard_agent_health` | `GET /health` |
| `intentguard_agent_session` | `GET /v1/agent/session` |
| `intentguard_agent_propose` | `POST /v1/propose` |
| `intentguard_agent_execute` | `POST /v1/execute` |

```json
"intentguard-agent": {
  "env": {
    "INTENTGUARD_GATEWAY_URL": "https://intentguard-web-2lcs3sivbq-uc.a.run.app/api/gateway",
    "INTENTGUARD_AGENT_TOKEN": "agt_…"
  }
}
```

### `intentguard-policy` (offline policy + grant audit + same live tools)

| Tool | Mode |
|------|------|
| `intentguard_propose` | Offline policy |
| `intentguard_gateway_propose` | Live `POST /v1/propose` |
| `intentguard_gateway_execute` | Live `POST /v1/execute` |
| `intentguard_gateway_session` | Live `GET /v1/agent/session` |
| `intentguard_gateway_health` | Sidecar health |
| `intentguard_audit_grants` | LCD grant risk |
| `intentguard_plan_grant` | Typed grant plan JSON |

## CLI example

```bash
INTENTGUARD_URL=http://127.0.0.1:8787 AGENT_TOKEN=agt_… node examples/agent-propose.mjs
```

## Verify

```bash
npm run agent:verify
```

Release train includes `agent:verify` with other `*:verify` scripts.
