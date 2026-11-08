# Brainstorm track

Implementation stays **out** of this folder. These docs define *what* to build later under `apps/<name>/`.

| Doc | Idea |
|-----|------|
| [../docs/LANDSCAPE.md](../docs/LANDSCAPE.md) | **Research** — RWAs, gaps, NEAR vs RFQ/AuthZ, build fit |
| [INTENTGUARD.md](./INTENTGUARD.md) | Gap #2 — parameter-level, on-chain policies for trading agents |
| [OPTIONLENS.md](./OPTIONLENS.md) | Gap #3 — options fair value, implied odds, Compute Hedge Desk, options MCP |
| [AGENTPROOF.md](./AGENTPROOF.md) | Gap #1 — verifiable agent deliverables (parked) |
| [NEAR_STYLE_INTENTS.md](./NEAR_STYLE_INTENTS.md) | How to build intent → solver → settle on Injective |

## IntentGuard vs OptionLens

| | IntentGuard | OptionLens |
|---|-------------|------------|
| Primitive status | AuthZ + precompile **live on testnet** | Options **whitelisted testnet**, no public addresses |
| Biggest risk | Precompile proxy flow on testnet | Data access |
| Demo "wow" | Prompt-injected agent rejected on-chain | GPU bill → hedge plan |
| Skill mix | Solidity + agent/MCP + light UI | Quant + charts UI + MCP |
| Weakest objection | "Wrapper on AuthZ" → answer with attack demo | "App already has payoff chart" → lead with fair value + hedging |
| Fallback | Off-chain co-signer + Grant Auditor | Simulated series + independent pricing |

## Decision gate (day 1)

1. Ask Injective for **options whitelist + contract/ABI**.
2. Run IntentGuard **spike 1** (precompile `approve` → contract places order on testnet).

- Whitelist granted and you like quant/UI → **OptionLens**.
- No whitelist, or the team is stronger on contracts/agents → **IntentGuard** (every dependency is live).
- Both work → IntentGuard core + an OptionLens-style "hedge agent constrained by IntentGuard" as the stretch demo.
