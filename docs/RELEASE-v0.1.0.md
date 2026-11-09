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
