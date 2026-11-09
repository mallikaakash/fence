# IntentGuard — end-to-end checklist

Complete path from zero to agent trade (testnet).

## 1. Install sidecar

```bash
cd apps/intentguard
npm install
npm run gateway
```

Save `own_…` from `.intentguard/config.json`.

## 2. Create session

```bash
export OWNER_KEY="$(node -p "JSON.parse(require('fs').readFileSync('.intentguard/config.json')).ownerApiKey")"
curl -sS -X POST http://127.0.0.1:8787/v1/sessions \
  -H "Authorization: Bearer $OWNER_KEY" \
  -H "content-type: application/json" \
  -d @examples/session-testnet.json \
  | tee /tmp/ig-session.json
```

Replace `ownerInjectiveAddress` in the JSON first.

## 3. On-chain typed AuthZ

```bash
npm run grant:instructions -- /tmp/ig-session.json
```

Sign MsgGrant(s) as owner (Keplr, Leap, or `npm run spike` with funded `.spike/` keystore).

## 4. Verify grant

```bash
SESSION_ID="$(node -p "JSON.parse(require('fs').readFileSync('/tmp/ig-session.json')).session.sessionId")"
curl -sS -H "Authorization: Bearer $OWNER_KEY" \
  "http://127.0.0.1:8787/v1/sessions/$SESSION_ID/grant-status" | jq .
```

`grantStatus.ready` must be `true` before execute (default).

## 5. Agent policy check

```bash
export AGENT_TOKEN="$(node -p "JSON.parse(require('fs').readFileSync('/tmp/ig-session.json')).agentApiToken")"
INTENTGUARD_URL=http://127.0.0.1:8787 AGENT_TOKEN=$AGENT_TOKEN node examples/agent-propose.mjs
```

## 6. Live execute (optional)

```bash
export INTENTGUARD_EXECUTE=1
export INTENTGUARD_OWNER_PRIVATE_KEY_HEX= # owner hex — sidecar only
npm run gateway
```

```bash
curl -sS -X POST http://127.0.0.1:8787/v1/execute \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "content-type: application/json" \
  -d '{"intent":{"marketId":"…","margin":"1","leverage":1,"price":"1","quantity":"1"}}'
```

Skip on-chain grant check only if you accept risk: `INTENTGUARD_REQUIRE_ONCHAIN_GRANT=0`.

## 7. Owner console (local UI)

```bash
npm run web:dev
```

Open `http://localhost:3001/console` — same steps with grant-status button per session.

## 8. Cursor agent (MCP)

In `.cursor/mcp.json` env for `intentguard-policy`:

```json
"INTENTGUARD_GATEWAY_URL": "http://127.0.0.1:8787",
"INTENTGUARD_AGENT_TOKEN": "agt_…"
```

Tool: `intentguard_gateway_propose`.

## Verify release

```bash
npm test && npm run product:smoke
```
