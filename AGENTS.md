# AI agents — Injective buildathon workspace

Human + agent development on **Injective**. **Chosen track: IntentGuard** (`brainstorm/CHOSEN.md`). App code lives under `apps/intentguard/`.

## Installed by `npm run setup`

| Layer | Location | Purpose |
| ----- | -------- | ------- |
| **Injective agent skills** | `.agents/skills/*` + `skills-lock.json` | CLI, EVM, MCP setup, trading, wallet UX playbooks |
| **Injective Docs MCP** | `.cursor/mcp.json` → `injective-docs` | Live doc search (`https://docs.injective.network/mcp`) |
| **Trading MCP** | `.cursor/mcp.json` → `injective-trading` | Markets, balances, trades — **local keystore** |
| **IntentGuard MCP** | `.cursor/mcp.json` → `intentguard-policy` | Policy + grant audit; optional `INTENTGUARD_GATEWAY_URL` + `INTENTGUARD_AGENT_TOKEN` for live sidecar propose |
| **Vendor server source** | `vendor/mcp-server/` | Built artifact at `dist/mcp/server.js` |
| **Cursor rules** | `.cursor/rules/injective-scaffold.mdc` | Testnet-first, no premature implementation |

Refresh skills: `npm run skills:install`

## Core skills (read `SKILL.md` before acting)

| Skill | When to use |
| ----- | ----------- |
| `injective-mcp-servers` | Wire docs + trading MCP in Cursor/Claude |
| `injective-cli` | `injectived` queries and transactions |
| `injective-evm-developer` | Solidity / Injective EVM |
| `injective-trading-market-data` | Perp/spot data via MCP |
| `injective-trading-account` | Balances, subaccounts, positions |
| `injective-trading-chain-analysis` | Protocol-level reasoning |
| `injective-frontend-wallet` | Browser wallets (Keplr, MetaMask, etc.) |

Full list: [InjectiveLabs/agent-skills](https://github.com/InjectiveLabs/agent-skills)

## Repo layout

```
docs/           # Setup, ecosystem, RESOURCES.md (Discord official links audit)
brainstorm/     # Specs — start with CHOSEN.md + INTENTGUARD.md
apps/           # Product code (intentguard)
prompts/        # Master setup prompt for fresh machines
scripts/        # setup, doctor, skills install
vendor/         # mcp-server clone (not hand-edited)
```

Official Discord resource list → IntentGuard usage: [docs/RESOURCES.md](./docs/RESOURCES.md).

## Typical agent workflows (scaffold)

### Validate toolchain

```bash
npm run doctor
```

### Read docs (no keys)

Use MCP tool `search_injective_docs` on `injective-docs` (the skill's `SearchInjectiveDocs` name is outdated).

### Read chain state (testnet)

Connect trading MCP with **no imported wallet**, or use CLI per `injective-cli` skill:

```bash
# After injectived is installed per skill instructions
injectived query bank balances <inj1...> --node <testnet-rpc>
```

### Build MCP after upstream changes

```bash
npm run mcp:build
```

## Security rules for agents

1. Default to **testnet** (`INJECTIVE_NETWORK=testnet` in `.env` and MCP).
2. Never commit mnemonics, hex private keys, or `.injective-mcp` keystores.
3. Do not open trades, bridge, or CCTP mint without explicit user approval.
4. Distinguish **official** (`InjectiveLabs/*`) vs **community** (`@bguiz/ainj`, etc.) tooling in recommendations.

## Hackathon direction

**Hero:** IntentGuard — [brainstorm/INTENTGUARD.md](./brainstorm/INTENTGUARD.md)  
**Spike / kill switch:** [brainstorm/INTENTGUARD-SPIKE.md](./brainstorm/INTENTGUARD-SPIKE.md)  
**Addon:** OptionLens · **Next:** AgentPay · **Parked:** AgentProof

Human overview: [README.md](./README.md)
