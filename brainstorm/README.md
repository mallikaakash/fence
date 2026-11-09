# Brainstorm track

Specs live here; code under `apps/intentguard/`.

**Locked:** [CHOSEN.md](./CHOSEN.md) → **IntentGuard** hero · **BUILD WITH CHANGES** ([DILIGENCE.md](./DILIGENCE.md))

| Doc | Idea |
|-----|------|
| [CHOSEN.md](./CHOSEN.md) | Hero / addon / kill switch |
| [DILIGENCE.md](./DILIGENCE.md) | ChatGPT diligence lock (9 Nov 2026) |
| [INTENTGUARD.md](./INTENTGUARD.md) | Product + architecture (Route A baseline) |
| [INTENTGUARD-SPIKE.md](./INTENTGUARD-SPIKE.md) | 48h non-bypass + 7-point checklist |
| [CUSTOMER-DISCOVERY.md](./CUSTOMER-DISCOVERY.md) | Interview scripts + validation bar |
| [OPTIONLENS.md](./OPTIONLENS.md) | Demo Day addon |
| [AGENTPROOF.md](./AGENTPROOF.md) | Parked |
| [NEAR_STYLE_INTENTS.md](./NEAR_STYLE_INTENTS.md) | Parked (protocol-scale) |
| [../docs/LANDSCAPE.md](../docs/LANDSCAPE.md) | Research backdrop |

## IntentGuard vs OptionLens

| | IntentGuard | OptionLens |
|---|-------------|------------|
| Primitive status | Typed AuthZ live; Precompile vault is challenger | Options whitelisted testnet |
| Biggest risk | Agent obtains MsgExec key / alternate path | Data access |
| Demo "wow" | Allowed order + oversized/wrong-market blocked + revoke | GPU bill → hedge proposal |
| Weakest objection | "Wrapper on AuthZ" → Hummingbot already scopes markets; we add notional + isolated signer | "App already has payoff chart" |
| Fallback | Grant Auditor + narrower per-order MVP | Simulated series |

## Locked decision

**IntentGuard** is the hero. Follow [INTENTGUARD-SPIKE.md](./INTENTGUARD-SPIKE.md). No dashboard until the 7-point checklist passes. OptionLens only after kill-switch tests pass.
