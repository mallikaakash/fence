# IntentGuard — limitations & risk disclosure (light touch)

> **Not legal advice.** This document states product boundaries for buyers, judges, and operators. It is not a warranty, SLA, or regulatory filing.

## What IntentGuard is

Software that helps operators run a **policy sidecar** next to an AI agent: typed Injective AuthZ, session-scoped agent tokens, and optional MsgExec through an isolated grantee key on **your** infrastructure.

## What we do **not** warrant

| Topic | Reality |
|-------|---------|
| **“Agent cannot escape mandate”** | False if the sidecar is compromised, the owner key lives on the same host, other generic AuthZ grants exist on the wallet, or the agent is given keys outside IntentGuard. |
| **On-chain enforcement of notional** | Policy limits are enforced by **your gateway** before broadcast — not by the Cosmos module. Typed grants scope markets/subaccount; they do not encode max notional on-chain in v0.1.x. |
| **Hosted demo web** | Vercel UI is for audit and education. It is **not** a custody or policy authority unless you configure a remote gateway proxy. |
| **Insurance / compliance** | No SOC2, no formal penetration test report, no regulatory approval in this repo. |
| **Mainnet production** | Supported as software; **you** choose network, funding, grants, and risk appetite. |

## Operator responsibilities

1. **Sidecar integrity** — patch OS, restrict access, encrypt state (`INTENTGUARD_DATA_KEY`), prefer loopback bind.
2. **Grant hygiene** — revoke dangerous generic grants; use typed AuthZ from IntentGuard grant plans.
3. **Key custody** — owner granter key for execute stays on sidecar; never ship grantee hex to agents.
4. **Truth in agent UX** — `POST /v1/propose` is **policy-only**; chain orders require execute + on-chain grant + funding.

See also: [THREAT-MODEL.md](./THREAT-MODEL.md), [AGENTS.md](./AGENTS.md), [UX.md](./UX.md).

## Marketing language — approved vs avoid

| Avoid | Prefer |
|-------|--------|
| “Agents cannot bypass policy” | “Agents use scoped tokens; gateway denies out-of-policy proposes” |
| “Fully on-chain limits” | “Typed AuthZ on-chain + gateway notional gate off-chain” |
| “Production-ready custody” | “Self-serve sidecar for design partners; see limitations” |

## Verify

```bash
npm run legal:verify
```

Included in the release verification train with other `*:verify` scripts.
