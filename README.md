# Fence
Fence is the guardrail for your AI agents on [Injective](https://injective.com). Fence checks every trade intent against limits you set in your wallet before anything can execute on Helix.
**Network:** Injective **testnet** (not mainnet).
| | |
|---|---|
| **App** | https://fence-2lcs3sivbq-uc.a.run.app |
| **Pitch deck** | https://fence-pitch-deck-2lcs3sivbq-uc.a.run.app |
Implementation lives under `apps/intentguard/` (legacy name IntentGuard). Deploy scripts and env vars may still use `INTENTGUARD_*`.
---
## What it does
Helix holds margin and matches trades. **Fence sits in front of your AI agent** and enforces your rules on every request.
1. Set **markets**, **max order size**, **daily margin**, and **leverage**.
2. Approve a **scoped grant** in Keplr or Leap.
3. Connect your agent with an **access code** (HTTP API or MCP), not your seed phrase.
4. Each **propose** returns **allowed** or **denied** with reasons and audit history.
```
Agent  →  propose  →  Fence (policy)  →  allow / deny  →  execute (if grant + margin OK)  →  Helix
```
---
## What is live
- **Web** — setup, session, policy demos, activity, developer tools (Google Cloud Run).
- **Gateway** — sessions, grant planning, policy validation, optional execute path.
- **Integrations** — REST API, MCP server for AI tooling, reference agent samples.
Hosted on **Google Cloud Platform** (Cloud Run, Docker).
---
## Quick start (local)
```bash
npm run setup
npm run doctor
npm run intentguard:web      # UI → http://127.0.0.1:3001
npm run intentguard:gateway  # API → http://127.0.0.1:8787
```
Copy `agt_…` from **My session** into `apps/intentguard/.env.agent` for the Fence agent MCP server.
Never commit `.env`, mnemonics, or API keys.
---
## Repo map
| Path | |
|------|--|
| `apps/intentguard/` | Gateway, policy engine, Next.js web, MCP |
| `brainstorm/INTENTGUARD.md` | Product and architecture spec |
| `docs/PRODUCT.md` | API and deployment |
| `docs/INSTALL.md` | Self-hosted install |
| `scripts/deploy-intentguard-gcp.sh` | Deploy app to GCP |
---
## Security
- Default to **testnet**.
- Agent processes must **not** hold the grantee MsgExec private key (isolated gateway signer).
- Typed AuthZ scopes markets and subaccount on chain; **notional and daily budget** are enforced at the gateway.
---
## Links
- [Injective agent skills](https://github.com/InjectiveLabs/agent-skills)
- [Injective trading MCP](https://github.com/InjectiveLabs/mcp-server)
- [Injective AI docs](https://docs.injective.network/developers-ai)
---
Built for the Injective ecosystem. Helix is the exchange; Fence is execution policy for agents.
