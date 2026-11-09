# Customer discovery — IntentGuard

## ICP (first 10 design partners)

Teams running **LLM or autonomous agents** that trade on Injective (or plan to), with a human **owner wallet** and fear of generic AuthZ / key leakage.

## 60-second pitch

IntentGuard is a sidecar that holds the grantee signing key, enforces notional and leverage off-chain, and only lets your agent **propose** trades through a scoped token. Typed AuthZ on-chain limits markets and subaccount; the gateway limits economics attackers love to abuse.

## Wedge offers

1. **Grant Auditor** (free) — paste `inj1…`, get risk score. Web `/portfolio` or API.
2. **Sidecar trial** — Docker or `npm run gateway`, one session, testnet.
3. **Paid onboarding** — help owner sign typed grants, enable execute on mainnet.

## Questions to ask

- Who holds the trading wallet today when an agent runs?
- Have you used GenericAuthorization or full MsgExec grants?
- What max loss per day would be acceptable if the agent misbehaves?
- Testnet or mainnet in the next 30 days?

## Success criteria for design partner

- Agent integrated with `agt_` token in &lt; 1 week
- At least one **denied** oversize propose in audit log
- Owner comfortable revoking session without sharing granter key with agent

## Pricing sketch (validate, do not publish as final)

- Auditor: free
- Sidecar license / support: TBD per seat or per wallet
- Hosted gateway: premium tier later
