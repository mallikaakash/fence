# Injective buildathon workspace

Two layers in one repo:

1. **Scaffold** — Injective docs MCP, trading MCP, agent skills, scripts.
2. **Product** — **Fence** (scoped agent trading on Injective; code in `apps/intentguard/`, specs in `brainstorm/`).

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
- **Full Discord docs/SDK audit:** [docs/RESOURCES.md](./docs/RESOURCES.md)

## Next steps

| Goal | Read |
|------|------|
| **All services & recent releases** | [docs/INVENTORY.md](./docs/INVENTORY.md) |
| Understand tooling layers | [docs/ECOSYSTEM.md](./docs/ECOSYSTEM.md) |
| Step-by-step install | [docs/SETUP.md](./docs/SETUP.md) |
| Chosen track + spike | [brainstorm/CHOSEN.md](./brainstorm/CHOSEN.md), [INTENTGUARD-SPIKE.md](./brainstorm/INTENTGUARD-SPIKE.md) |
| Fence spec (INTENTGUARD.md) | [brainstorm/INTENTGUARD.md](./brainstorm/INTENTGUARD.md) |
| Pasteable machine bootstrap | [prompts/claude-injective-bootstrap.md](./prompts/claude-injective-bootstrap.md) |
| Demo Day runbook | [docs/DEMO.md](./docs/DEMO.md), live web [DEMO-WEB.md](./docs/DEMO-WEB.md) |
| Pitch (slide parity) | [docs/PITCH.md](./docs/PITCH.md) |
| Hosted testnet app | https://fence-2lcs3sivbq-uc.a.run.app |
| Fence web UI | `npm run intentguard:web` → [apps/intentguard/web](./apps/intentguard/web) — `/start`, `/portfolio`, `/console` |
| Fence product docs | [docs/PRODUCT.md](./docs/PRODUCT.md), [docs/BRANDING.md](./docs/BRANDING.md) |
| Release verify | `smoke` … `legal` (all `*:verify` in apps/intentguard) — [LIMITATIONS](./docs/LIMITATIONS.md) |

## Implementing later

When you commit to a track, add code under something like `apps/<name>/` — not in this scaffold root.
