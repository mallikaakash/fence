# IntentGuard — install and run (v0.1.0)

IntentGuard is a **sidecar policy gateway** for Injective trading agents. You run it beside your agent; the agent gets an API token, never the MsgExec grantee key.

## Who runs what

| Component | Where | Secrets |
|-----------|--------|---------|
| **Gateway** | Your server / K8s / Docker | Owner API key, grantee keys (auto), optional owner chain key for execute |
| **Web console** | Local or Vercel (read-heavy) | Owner API key only if proxied; prefer local console for secrets |
| **Agent** | Your LLM runtime | `agt_…` token only |

## Option A — Node (fastest)

Requirements: **Node 20+**

```bash
cd apps/intentguard
npm install
cp .env.example .env   # optional — keys can live in .intentguard/ instead
npm run gateway
```

On first start the gateway writes:

- `.intentguard/config.json` — `ownerApiKey` (`own_…`)
- `.intentguard/state.json` — sessions + audit

Save the owner key in your password manager.

### Create a session (owner)

```bash
export OWNER_KEY="$(node -p "JSON.parse(require('fs').readFileSync('.intentguard/config.json')).ownerApiKey")"
curl -sS -X POST http://127.0.0.1:8787/v1/sessions \
  -H "Authorization: Bearer $OWNER_KEY" \
  -H "content-type: application/json" \
  -d @examples/session-testnet.json
```

Use `examples/session-testnet.json` in this repo (market + limits).

Give the response `agentApiToken` to the agent process only.

### Agent propose (policy gate)

```bash
curl -sS -X POST http://127.0.0.1:8787/v1/propose \
  -H "Authorization: Bearer agt_…" \
  -H "content-type: application/json" \
  -d '{"intent":{"marketId":"…","margin":"5","leverage":2,"price":"1","quantity":"2"}}'
```

### Live execution (optional)

After the owner has signed **typed AuthZ** on-chain for the session grantee:

1. Set `INTENTGUARD_EXECUTE=1`
2. Set `INTENTGUARD_OWNER_PRIVATE_KEY_HEX` (or place hex in `.intentguard/owner-private-key.hex`)
3. Fund grantee with testnet INJ for gas; fund owner subaccount with quote for margin

```bash
curl -sS -X POST http://127.0.0.1:8787/v1/execute \
  -H "Authorization: Bearer agt_…" \
  -H "content-type: application/json" \
  -d '{"intent":{"marketId":"…","margin":"1","leverage":1,"price":"1","quantity":"1"}}'
```

Oversized notional still **denies before broadcast**.

## Option B — Docker

```bash
cd apps/intentguard
docker compose up -d --build
```

Mount persists at volume `intentguard-data`. Set `INTENTGUARD_OWNER_API_KEY` in `docker compose` env or `.env` for reproducible ops.

## Option C — Web UI

```bash
# Terminal 1
npm run gateway

# Terminal 2
npm run web:dev
```

Open `http://localhost:3001/console` — connect gateway URL + owner key (stored in browser localStorage).

Public routes without secrets:

- **Simulate** — offline policy demo
- **Grant Audit** — read-only AuthZ risk scan
- **Proofs** — bundled testnet spike artifacts

Hosted Vercel: set `INTENTGUARD_GATEWAY_URL` + `INTENTGUARD_OWNER_API_KEY` only if the gateway is reachable from Vercel (usually use local console instead).

## Verify install

```bash
npm run product:smoke   # from apps/intentguard
npm test
```

From repo root:

```bash
npm run intentguard:smoke
```

## Grant Auditor wedge (no agent)

```bash
curl -sS "http://127.0.0.1:8787/v1/audit/grants?granter=inj1YOUR…"
```

Or use the web **Grant Audit** page.

## Security checklist

- Never commit `.intentguard/`, `.spike/`, or owner hex keys
- Rotate `agt_` tokens by revoking sessions and creating new ones
- Revoke on-chain AuthZ when offboarding an agent
- Keep `INTENTGUARD_EXECUTE=0` until grants + funding are correct

## Support path for paying customers

1. Sidecar + Grant Auditor (week 1)
2. Typed grant onboarding call (owner signs MsgGrant once)
3. Enable execute on testnet → mainnet
4. Optional hosted gateway later (same API)

See [PRODUCT.md](./PRODUCT.md) for architecture tiers.
