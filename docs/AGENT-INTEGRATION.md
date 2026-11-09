# Integrate an agent (MCP, script, or bot)

**Testnet only** — [NETWORK.md](./NETWORK.md). Target user: **Injective agent operators** who want capped delegation without putting the **grantee private key** in the agent process.

## How this differs from stock AutoSign

| Stock Injective AutoSign / MCP `authz_grant` | IntentGuard |
|-----------------------------------------------|-------------|
| **GenericAuthorization** (message types + expiry) | **Typed** exchange AuthZ + **gateway** notional / daily margin |
| Grantee key often lives with the automation | **Grantee key on gateway only** — agent gets `agt_…` Bearer token |
| No central propose/deny API | `POST /v1/propose` then optional `POST /v1/execute` |

Hummingbot-style typed grants are the low-level building block; IntentGuard adds **economics + isolation + hosted API**.

## Path A — Hosted (recommended for demo)

1. **Protect** on the web app: [Protect](https://intentguard-web-2lcs3sivbq-uc.a.run.app/start) → Keplr grant → **Done**.
2. Browser stores `agt_…` and session id in localStorage (same origin).
3. Call the **browser proxy** (no raw gateway URL in the agent if you run tools from the user's machine with cookies — for server agents use Path B).

Proxy base (hosted):

```text
https://intentguard-web-2lcs3sivbq-uc.a.run.app/api/gateway
```

## Path B — Your agent calls the gateway directly

1. Owner creates a session (`POST /v1/sessions` with owner key) — or use **Protect** which does this for you.
2. Copy **`agentApiToken`** (`agt_…`) — **never** share `own_…` or grantee hex with the agent.
3. Set `Authorization: Bearer agt_…` on agent traffic.

OpenAPI: `GET /v1/openapi.json` on the gateway.

## Core API (agent token)

### Session summary

```bash
curl -sS "$BASE/health"
curl -sS -H "Authorization: Bearer $AGT" "$BASE/v1/agent/session"
```

### Propose (policy only, no chain tx)

```bash
curl -sS -X POST "$BASE/v1/propose" \
  -H "Authorization: Bearer $AGT" \
  -H "Content-Type: application/json" \
  -d '{
    "intent": {
      "marketId": "0xdc70164d7120529c3cd84278c98df4151210c0447a65a2aab03459cf328de41e",
      "margin": "5",
      "leverage": 2,
      "price": "10",
      "quantity": "1",
      "side": "long"
    }
  }'
```

Response envelope: `phase: "policy_check"`, `status: "allowed" | "denied"`, `decisionReasons[]`.

Optional: `Idempotency-Key` header for safe retries.

### Execute (MsgExec broadcast — sidecar must have `INTENTGUARD_EXECUTE=1`)

Call **only after** a successful allow. Same `intent` body as propose.

```bash
curl -sS -X POST "$BASE/v1/execute" \
  -H "Authorization: Bearer $AGT" \
  -H "Content-Type: application/json" \
  -d '{ "intent": { ... } }'
```

On failure, check `userHint` and `errorCode` in the JSON (gas, margin, grant).

## Rate limits

Per IP: `INTENTGUARD_RATE_LIMIT_PER_MIN` (default 120).

Per agent token:

- Propose: `INTENTGUARD_AGENT_PROPOSE_PER_MIN` (default 90)
- Execute: `INTENTGUARD_AGENT_EXECUTE_PER_MIN` (default 30)

HTTP `429` with `retryAfterSeconds`.

## MCP (Cursor)

| Server | When |
|--------|------|
| **`intentguard-agent`** | Reference bot — only `agt_` + `/v1/propose` \| `/v1/execute` \| session |
| **`intentguard-policy`** | Plus offline policy, grant audit, grant plans |

Set in MCP env (never commit tokens):

```json
"INTENTGUARD_GATEWAY_URL": "https://intentguard-web-2lcs3sivbq-uc.a.run.app/api/gateway",
"INTENTGUARD_AGENT_TOKEN": "agt_…"
```

SDK + scripts: `apps/intentguard/examples/README.md` · `npm run agent:verify` in `apps/intentguard`.

Trading MCP **`authz_grant`** is **not** a substitute for IntentGuard policy; use IntentGuard for **capped** agent sessions.

## Security checklist

- [ ] Agent env has **`agt_…` only** — no grantee mnemonic, no `own_…`
- [ ] Owner signed **typed** grant with expiry
- [ ] Revoke: web **Turn off protection** or `POST /v1/sessions/{id}/revoke` (owner)
- [ ] Audit: `GET /v1/audit/events` (owner) or web **Activity log**

## More

- End users: [END-USERS.md](./END-USERS.md)
- Live demo script: [DEMO-WEB.md](./DEMO-WEB.md)
- Ops: [RUNBOOK.md](./RUNBOOK.md)
