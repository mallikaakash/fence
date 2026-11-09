# IntentGuard v0.1.x

## v0.1.3 (AppSec)

- AES-256-GCM grantee key encryption at rest (`INTENTGUARD_DATA_KEY`)
- HMAC audit seal; CORS allowlist; rate limits; body size cap
- Timing-safe owner bearer; agent token TTL; owner API key rotation endpoint
- `npm run security:verify` + gateway security tests

## v0.1.2 (E2E)

- `GET /v1/sessions/:id/grant-status` — LCD typed grant check
- Execute blocked until on-chain grant ready (override: `INTENTGUARD_REQUIRE_ONCHAIN_GRANT=0`)
- Atomic `state.json` writes; MCP `intentguard_gateway_propose`
- `docs/E2E.md`, `npm run grant:instructions`, thin `src/client/gateway.ts`
- Console **Check grant** + auto-check after session create

## v0.1.1 (hardening)

- Gateway binds `127.0.0.1` by default; Docker sets `DOCKER=1` → `0.0.0.0`
- Owner auth on `POST /v1/grants/plan`; state/config files mode `0600`
- `propose` is dry-run; daily margin increments on successful `execute` only
- Console onboarding checklist + grant plan JSON; INSTALL + THREAT-MODEL

# IntentGuard v0.1.0

**Shippable sidecar product** — policy gateway + owner console + optional live MsgExec.

## Included

- HTTP gateway (`npm run gateway`) — sessions, propose, revoke, grant plan, grant auditor, audit log
- `POST /v1/execute` when `INTENTGUARD_EXECUTE=1` + owner private key on sidecar only
- Owner web console at `/console`
- Docker image + `docker compose`
- Install guide: [INSTALL.md](./INSTALL.md)
- Agent sample: `apps/intentguard/examples/agent-propose.mjs`
- `npm run product:smoke` release check

## Not included (v0.2+)

- Hosted multi-tenant SaaS
- Webhooks / KMS
- Route B vault default path
- Keplr one-click owner grant in browser

## Verification run (2026)

```
npm run check && npm test && npm run product:smoke
npm run build --prefix apps/intentguard/web
```
