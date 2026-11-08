# Injective agentic ecosystem (concise map)

Deep dive: **[LANDSCAPE.md](./LANDSCAPE.md)** (RWAs, agent gaps, NEAR vs RFQ/AuthZ). Use docs MCP for live details.

## Three layers (recommended)

### Layer 1 — Knowledge

- **Docs MCP** — `https://docs.injective.network/mcp`
- **Agent skills** — `InjectiveLabs/agent-skills`
- Injective docs, GitHub, Injective Agents announcements

### Layer 2 — Development environment

- `injectived` CLI (Cosmos)
- EVM tooling (Foundry/Hardhat per `injective-evm-developer` skill)
- CosmWasm where needed
- TypeScript SDKs (`@injectivelabs/*`)
- Public RPC / REST / gRPC / indexers (testnet first)

### Layer 3 — Agent execution

- **Trading MCP** — markets, balances, trades, bridge, EVM broadcast
- **AuthZ / autosign** — `injective-trading-autosign` skill
- **Agent registry** — ERC-8004-style identities on Injective Agents
- **Economics** — x402-style agent payments (roadmap varies by feature)

## Native agentic primitives (already on Injective)

| Primitive | Role |
|-----------|------|
| Agent identity / registry | Discoverable onchain agent profiles |
| Exchange execution | Agents can trade, not only advise |
| MCP | Standard tool surface for LLMs |
| WasmX scheduling | Time/block triggered contract calls |
| Agent commerce | Payments, fee attribution (partially live) |

## Crowded vs gap (hackathon lens)

| Area | Verdict |
|------|---------|
| Generic agent marketplace / directory | Crowded (registry + Agent402, etc.) |
| “AI wallet with spend limits” | Overlaps SDK + wallets |
| Generic chain monitoring | Weak vs Chain Portal / Hermes |
| **Service delivery verification** | Narrower — **AgentProof** |
| **Intent vs execution matching** | **IntentGuard** |
| **Injective-native options UX** | **OptionLens** (ties to SICI, testnet options) |

## SICI (context)

**Super Intelligence Compute Index** — rental cost basket for H100, B200, H200, A100, RTX 4090. Perps on mainnet; options on testnet. Useful for demos that connect “AI infra economics” to Injective markets.

## NEAR Intents (comparison hook)

No Injective equivalent to NEAR’s general intent → solver → atomic settle layer. **RFQ + signed quotes + AuthZ** are the adjacent primitives — not a clone. Prefer **IntentGuard** or **RFQ-for-agents** over building a new solver network unless you want a high-risk greenfield thesis.

## RWA / public trading (one line)

**Helix** is the public venue (e.g. USDY, AUSD); **Injective Mint** and institutional rails are not a retail RWA marketplace — see [LANDSCAPE.md](./LANDSCAPE.md).
