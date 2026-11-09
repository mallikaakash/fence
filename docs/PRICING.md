# IntentGuard — offers & support boundaries

> Pricing numbers are **TBD** until design partners validate. This doc defines **what ships** in each tier.

## Tiers

### Free — Grant Auditor

- Web `/portfolio` + `GET /v1/audit/grants` (public LCD)
- Risk score for generic vs typed AuthZ
- No account, no keys

**Best for:** Wallets, funds, “do we already have dangerous agent grants?”

### Self-serve — Sidecar (open source in this repo)

- Gateway: sessions, policy, grant plan, grant-status, optional execute
- Owner console (local web), MCP gateway propose, Docker
- You operate: VM, keys, testnet/mainnet, owner MsgGrant

**Best for:** Agent teams with DevOps comfortable running a sidecar.

**Included:** Docs (E2E, PROTOCOL, THREAT-MODEL), `npm run *:verify` scripts.

**Not included:** Hosted SLA, Keplr-in-browser grant flow, phone support, mainnet LP.

### Design partner — Assisted onboarding (sales)

- Call: typed grant + subaccount setup, testnet execute drill
- Help interpreting `grant-status` / `scopeMatch`
- Feedback loop into roadmap (RFQ, hosted gateway)

**Success criteria:** Agent on `agt_` token &lt; 1 week; at least one **denied** oversize in audit log.

### Future — Hosted gateway

- Same API, our VPC or your cloud account
- KMS, webhooks, multi-tenant (not in v0.1.x)

## Honest limitations (all tiers)

See [LIMITATIONS.md](./LIMITATIONS.md) (risk disclosure, not legal advice).

- v0 is **derivative limit orders** + cancel typed grants — not market orders, not RFQ, not spot. See [PROTOCOL.md](./PROTOCOL.md).
- Gateway integrity and sidecar host security are **your** operational responsibility. See [THREAT-MODEL.md](./THREAT-MODEL.md).
- We do not custody owner or grantee keys in the hosted **demo** web app.
- Marketing must not claim agents “cannot escape” policy — see approved language in LIMITATIONS.

## Contact / design partner

Open an issue or use repo contact for hackathon / design-partner intake (update with your commercial channel when ready).
