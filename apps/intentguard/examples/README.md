# IntentGuard agent examples (agt_ only)

No grantee or owner keys — only `Authorization: Bearer agt_…` against the gateway.

| File | Use |
|------|-----|
| `agent-propose.mjs` | Single `POST /v1/propose` |
| `agent-bot.mjs` | Session + propose + optional `EXECUTE=1` |
| `agent-bot-sdk.mjs` | Same flow via `createGatewayClient` |
| `agent-curl.sh` | Copy-paste curl + jq |

```bash
cd apps/intentguard
export INTENTGUARD_URL="https://intentguard-web-2lcs3sivbq-uc.a.run.app/api/gateway"
export AGENT_TOKEN="agt_…"   # from Protect → Connect your agent

node examples/agent-propose.mjs
node examples/agent-bot.mjs
node --experimental-strip-types examples/agent-bot-sdk.mjs
chmod +x examples/agent-curl.sh && ./examples/agent-curl.sh
```

MCP (Cursor): configure **`intentguard-agent`** in `.cursor/mcp.json` with the same env vars — tools `intentguard_agent_propose`, `intentguard_agent_execute`, `intentguard_agent_session`, `intentguard_agent_health`.

Full integrator doc: [docs/AGENT-INTEGRATION.md](../../../docs/AGENT-INTEGRATION.md).
