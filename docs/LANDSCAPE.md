# Market & infrastructure landscape (research summary)

**Full stock take of services & 2025–2026 releases:** [INVENTORY.md](./INVENTORY.md).

Canonical notes from hackathon research — use before picking or pitching a build.

**Short answers:** Public trading of some tokenized assets exists (**Helix** + a few RWAs); broad issuance is mostly institutional/private; the agent stack is real but incomplete; there is **no full NEAR Intents clone** — **RFQ + AuthZ** is the closest.

---

## 1. Tokenized assets / public apps

### Publicly usable today

| What | Status | Notes |
|------|--------|--------|
| **[Helix](https://helixapp.com)** | Live DEX | Main public venue. Spot markets have included RWA-linked assets like **USDY** (Ondo) and **AUSD** (Agora). Also perps, etc. |
| **RWA module** | On-chain (since Volan) | Protocol-level permissioning / KYC-style controls for compliant assets — infrastructure, not a retail “marketplace UI.” |
| **Pineapple mortgages** | Public on-chain records | ~$1B+ mortgage *records* tokenized; auditable loan-file metadata, **not** an open retail mortgage securities marketplace. |
| **InjScan / explorers** | Public | Inspect minted assets after issuance. |

### Not a public consumer marketplace

- **[Injective Mint](https://injective.com/blog/injective-mint)** — no-code issuance on TokenFactory + Permissions. **Private beta/alpha**, aimed at institutions. Agents can issue in principle once you have access; you can’t browse Mint like OpenSea.
- Institutional pieces (transfer-agent registration, Institutional Rail, CypherOS) are rails, not apps you open and trade RWAs on.

**Bottom line:** No dedicated “RWA OpenSea” for random tokenized equities/bonds. What *is* public is **Helix as the liquidity venue**, a few tokenized cash/yield assets, and institutional issuance that lands on-chain and can later be listed.

---

## 2. Gaps in agentic infrastructure

Injective already ships a solid **dev/agent tooling** layer:

- `@injectivelabs/ainj` / AI SDK (CLI + MCP + skills)
- [agent-skills](https://github.com/InjectiveLabs/agent-skills), [mcp-server](https://github.com/InjectiveLabs/mcp-server)
- [injective-agent-sdk](https://github.com/InjectiveLabs/injective-agent-sdk) — ERC-8004 identity NFTs, registry at agents.injective.com
- AuthZ-based **trading autosign**, RFQ skills, docs MCP, trading MCP

### Real gaps (good build targets)

| # | Gap | Implication for hackathon |
|---|-----|---------------------------|
| 1 | **AgentProof / verifiable execution** | Identity exists; little for “this output was computed faithfully by that agent” (attestation, TEEs, ZK, signed reasoning hashes). |
| 2 | **IntentGuard / policy UX** | AuthZ can scope spend/msg types; no polished product: budgets, market allowlists, risk limits, human-readable policies, monitoring/revoke UX. |
| 3 | **Options / SICI tooling** | New primitives lack agent-facing analytics (Greeks, IV, scenarios, MCP for options). |
| 4 | **Maturity / packaging** | Identity SDK/MCP rough (packaging, Pinata/IPFS deps, incomplete docs). Skills teach workflows; they don’t replace missing products. |
| 5 | **No general intent settlement** | Agents can order / RFQ / AuthZ; not NEAR-style “declare outcome → solvers compete → atomic settle anywhere.” |
| 6 | **Trust & compromise** | Key leakage, over-broad grants, no standard multi-party / recovery for agent operators. |

Trade-finance AI (receivables pilots) is partly crowded — pure TradeFlow clones are weaker than the three product-shaped gaps above.

---

## 3. NEAR Intents counterpart?

**[NEAR Intents](https://docs.near-intents.org/):** user signs desired **outcome** → solvers quote → Verifier settles **atomically** (message bus, chain abstraction, `token_diff`, etc.).

**Injective does not have an equivalent general intents protocol.** Closest pieces:

| Piece | What it is | vs NEAR Intents |
|-------|------------|-----------------|
| **[INJ RFQ](https://rfq.inj.so/onboarding.html)** | Off-chain quote network, on-chain settle; MMs sign quotes; taker / `AcceptSignedIntent` for TP/SL | Closest: competitive quoting + signed commitments. **Narrower:** trading/RFQ, not general outcomes or chain-abstraction solvers. |
| **Native orderbook / exchange module** | On-chain CLOB for spot/perps/options | Execution venue, not intent/solver architecture. |
| **Cosmos AuthZ** | Scoped delegation to an agent/key | Policy/delegation, not intent matching. |
| **RFQ “signed intents”** | Conditional TP/SL filled by relayer | Same word, different meaning — triggerable trade intents, not NEAR’s solver marketplace. |

**So:** No drop-in NEAR Intents counterpart. A generalized intent → solver network on Injective would be **greenfield** (bigger, higher-risk). **IntentGuard** (AuthZ policy product for agents) and **deepening RFQ for agents** reuse what exists.

---

## 4. Hacker House build mapping

| Idea | Fit to live primitives | Risk |
|------|--------------------------|------|
| **IntentGuard** | AuthZ + autosign skills + trading MCP | Lower — wedges existing delegation |
| **OptionLens** | Options testnet + SICI markets | Medium — analytics/UI, clear demo |
| **AgentProof** | Registry + oracle/MCP truth + (later) attestation | Medium — narrative strong; ZK/TEE is hard for MVP |
| **Generalized NEAR-style intents** | Mostly greenfield | High |
