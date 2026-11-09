# IntentGuard — pitch (matches live testnet product)

Use this for slides, demo day, or README hero. **Live app:** https://intentguard-web-2lcs3sivbq-uc.a.run.app  
**Rehearse:** [DEMO-WEB.md](./DEMO-WEB.md) · **Integrators:** [AGENT-INTEGRATION.md](./AGENT-INTEGRATION.md)

---

## Slide 1 — Title

**IntentGuard** — trading limits for **bring-your-own AI** on **Injective testnet**

Sub: Typed AuthZ · policy gateway · grantee key never in the agent

---

## Slide 2 — Problem

- Agents and MCP tools can trade via **AuthZ** — but stock **AutoSign** only limits **message types**, not size or daily margin.
- If the **grantee private key** lives in the agent env, policy is theater.
- **Helix trading bots** solve **in-app** automation; they don’t secure **external** LLM / MCP integrations.

---

## Slide 3 — Solution

```
Owner (Keplr) → typed MsgGrant + caps
Agent → propose only (Bearer agt_…)
Gateway → allow/deny notional · margin · markets → MsgExec (isolated grantee)
```

---

## Slide 4 — Live product (click path)

| Step | URL | What to show |
|------|-----|--------------|
| Grant audit | `/portfolio` | Risky vs typed grants |
| Protect | `/start` | Keplr grant, chips active |
| Try limits | `/trade` | Allow / deny |
| Demo agent | `/agent` | Phrase buttons |
| Connect bot | `/console` | Copy `agt_…` + curl |

---

## Slide 5 — Differentiation

| | AutoSign / MCP | Hummingbot | Helix bots | **IntentGuard** |
|---|----------------|------------|------------|-----------------|
| Audience | Devs | Pro MM | Retail trader | **Agent operators** |
| Scope | Msg types | Typed grant DIY | Strategy UI | Typed + **gateway economics** |
| Agent key | Often grantee | Own ops | N/A | **No grantee in agent** |

---

## Slide 6 — Honest limits

- Caps enforced **at gateway** before MsgExec — not inside every chain contract.
- **Testnet only** for hosted app ([NETWORK.md](./NETWORK.md)).
- Trust model: like any trading frontend + **revocable on-chain grant**.

---

## Slide 7 — Ask / next

- Design partners: embed `POST /v1/propose` + `execute`
- Optional: Route B Policy Vault if on-chain rules beat gateway
- **Not** claiming trillion-dollar TAM — beachhead = Injective agent builders

---

## 60-second spoken script

1. AI on Injective can AutoSign — that’s **broad**.
2. We add **typed grants**, **max order + daily margin**, and a **gateway** so the LLM never holds the grantee key.
3. Live: **Protect** in Keplr, **deny** an oversize agent intent, **revoke** the grant.
4. Integrators copy **`agt_…`** from console — see AGENT-INTEGRATION.md.
5. We’re **not** Helix grid bots; we’re the **policy layer for your own agent**.

---

## Parity checklist (deck vs product)

- [x] Protect wizard + revoke
- [x] Demo agent + trade simulator
- [x] Grant audit (LCD)
- [x] Execute with gas/margin hints
- [x] Console agent token + curl
- [x] Helix / faucet links ([TESTNET-LINKS.md](./TESTNET-LINKS.md))
- [x] Related products (Helix bots) called out on `/limitations`
