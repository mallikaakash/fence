# Injective buildathon workspace

Two tracks in one repo:

1. **Scaffold** — Injective docs MCP, trading MCP, agent skills, scripts (no product code yet).
2. **Brainstorm** — sharpen **AgentProof** (and forks) before you implement.

## Quick start

```bash
cd /Users/aakashmallik/Documents/injective-buildathon
npm run setup
```

Reload **Cursor** so `.cursor/mcp.json` loads.

```bash
npm run doctor
```

Copy secrets template if needed:

```bash
cp .env.example .env   # setup.sh does this on first run
```

## MCP in Cursor

| Server | Type | Notes |
|--------|------|-------|
| `injective-docs` | HTTP | Hosted at `https://docs.injective.network/mcp` |
| `injective-trading` | stdio `node` | Built from `vendor/mcp-server`; **testnet** by default |

Trading MCP can sign transactions. Keep wallets off the machine until you deliberately test flows.

## Official links

- [Agent skills](https://github.com/InjectiveLabs/agent-skills)
- [Trading MCP](https://github.com/InjectiveLabs/mcp-server)
- [AI developer docs](https://docs.injective.network/developers-ai)
- [Injective Agents platform](https://injective.com/agents)

## Next steps

| Goal | Read |
|------|------|
| **All services & recent releases** | [docs/INVENTORY.md](./docs/INVENTORY.md) |
| Understand tooling layers | [docs/ECOSYSTEM.md](./docs/ECOSYSTEM.md) |
| Step-by-step install | [docs/SETUP.md](./docs/SETUP.md) |
| Pick hackathon angle | [brainstorm/AGENTPROOF.md](./brainstorm/AGENTPROOF.md) |
| Pasteable machine bootstrap | [prompts/claude-injective-bootstrap.md](./prompts/claude-injective-bootstrap.md) |

## Implementing later

When you commit to a track, add code under something like `apps/<name>/` — not in this scaffold root.
