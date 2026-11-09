# IntentGuard — getting started (buyers & operators)

## Pick your path

| You are… | Start here | Time |
|----------|------------|------|
| **Curious wallet owner** | [Grant Audit](/portfolio) on the web app — paste `inj1…` | 2 min |
| **Agent team evaluating** | Policy simulator + [PROTOCOL.md](./PROTOCOL.md) | 10 min |
| **Ready to integrate** | Sidecar install below | ~1 day |
| **Design partner** | [CUSTOMER-DISCOVERY.md](./CUSTOMER-DISCOVERY.md) + book onboarding | 1 week |

## Sidecar install (integration path)

```bash
git clone https://github.com/mallikaakash/injective-buildathon.git
cd injective-buildathon/apps/intentguard
npm install
cp .env.example .env   # set INTENTGUARD_DATA_KEY (openssl rand -hex 32)
npm run gateway
```

Full loop: [E2E.md](./E2E.md)

## Web UI (local with sidecar)

```bash
# terminal 1: gateway (above)
# terminal 2:
npm run web:dev
```

Open `http://localhost:3001/start` for the checklist, then `/console`.

**Hosted Vercel site:** Grant Audit, simulator, and proofs work without a sidecar. Owner console needs your gateway reachable from the browser (usually **local only** unless you expose the sidecar with TLS). See [VERCEL.md](./VERCEL.md).

## Agent integration

```bash
export AGENT_TOKEN=agt_…   # from POST /v1/sessions
INTENTGUARD_URL=http://127.0.0.1:8787 node examples/agent-propose.mjs
```

Cursor MCP: set `INTENTGUARD_GATEWAY_URL` + `INTENTGUARD_AGENT_TOKEN` on `intentguard-policy` — tool `intentguard_gateway_propose`.

## What we support today

See [PRICING.md](./PRICING.md) for tiers and boundaries.

## Verify your install

```bash
npm run product:smoke
npm run security:verify
npm run e2e:protocol
npm run gtm:verify
```
