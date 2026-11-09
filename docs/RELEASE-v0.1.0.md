# IntentGuard v0.1.x

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
