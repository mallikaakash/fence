# Chosen track

**Hero:** IntentGuard  
**Demo Day addon:** OptionLens (proposals only; execution must pass IntentGuard)  
**Next / kill-switch product:** AgentPay Control  
**Parked:** AgentProof, NEAR-style intents protocol

**Diligence lock (9 Nov 2026):** [DILIGENCE.md](./DILIGENCE.md) — **BUILD WITH CHANGES**

**Baseline architecture (Route A):** Typed exchange AuthZ (`market_ids` + `subaccount_id`) + isolated grantee signer + financial policy gateway + dedicated funded subaccount. Agent never holds the MsgExec key.

**Challenger (Route B):** EVM Exchange Precompile Policy Vault (`0x…65`) — spike in parallel; promote only if non-bypass is stronger and proven on testnet.

**Kill switch (48h):** If the agent can obtain/use the grantee key or another signing route that trades delegated capital outside policy — **and** Route B also fails — switch hero to AgentPay Control.

Canonical spec: [INTENTGUARD.md](./INTENTGUARD.md)  
Spike plan: [INTENTGUARD-SPIKE.md](./INTENTGUARD-SPIKE.md)  
Customer discovery: [CUSTOMER-DISCOVERY.md](./CUSTOMER-DISCOVERY.md)

Implementation: `apps/intentguard/` — **no dashboard until the 7-point spike checklist passes.**
