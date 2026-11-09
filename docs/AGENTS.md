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

## Idempotency

Send header `Idempotency-Key: <unique>` on `POST /v1/propose`. Same session + key returns the first response within 1 hour (`idempotentReplay: true`).

## Webhooks (optional)

Set on sidecar:

```bash
INTENTGUARD_WEBHOOK_URL=https://your-orchestrator/hooks/intentguard
```

JSON POST on `propose_allowed`, `propose_denied`, `execute_allowed`, `execute_denied`.

## Cursor MCP (`intentguard-policy`)

| Tool | Mode |
|------|------|
| `intentguard_propose` | Offline policy |
| `intentguard_gateway_propose` | Live sidecar (env below) |
| `intentguard_gateway_health` | Sidecar health |
| `intentguard_audit_grants` | LCD grant risk |
| `intentguard_plan_grant` | Typed grant plan JSON |

```json
"intentguard-policy": {
  "env": {
    "INTENTGUARD_GATEWAY_URL": "http://127.0.0.1:8787",
    "INTENTGUARD_AGENT_TOKEN": "agt_…"
  }
}
```

## CLI example

```bash
INTENTGUARD_URL=http://127.0.0.1:8787 AGENT_TOKEN=agt_… node examples/agent-propose.mjs
```

## Verify

```bash
npm run agent:verify
```

Release train includes `agent:verify` with other `*:verify` scripts.
