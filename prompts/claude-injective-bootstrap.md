# Master prompt — bootstrap Injective dev on a fresh machine

Paste into Claude Code or Cursor Agent. **Scaffold only** until hackathon scope is locked in `brainstorm/`.

---

You are setting up Injective blockchain development for a hackathon workspace. Do **not** implement application code yet.

## Phase 0 — Inspect

1. OS, Node (≥20), git, available disk.
2. Whether Cursor/Claude MCP config exists.
3. Whether this repo path contains `vendor/mcp-server` and `.agents/skills/`.

## Phase 1 — Official toolchain (prefer InjectiveLabs)

1. Run `npm run setup` in the repo root (or equivalent steps in `docs/SETUP.md`).
2. Install agent skills via `scripts/install-skills.sh` (already called by setup).
3. Configure MCP:
   - **Docs:** `https://docs.injective.network/mcp`
   - **Trading:** `node vendor/mcp-server/dist/mcp/server.js` with `INJECTIVE_NETWORK=testnet`
4. Read skills: `injective-mcp-servers`, `injective-cli`, `injective-trading-market-data`.

## Phase 2 — Validate on testnet

1. `npm run doctor`
2. Search docs MCP for testnet endpoints and faucet.
3. Use **read-only** MCP tools: `market_list`, `market_price` — no wallet import unless user approves.
4. Document gaps in `docs/SETUP.md` if anything fails.

## Phase 3 — Security

- Never commit mnemonics or `.env` secrets.
- No mainnet trades, bridges, or CCTP mint without explicit user confirmation.
- Prefer AuthZ/autosign patterns from skills only after user understands scope.

## Phase 4 — Hackathon alignment

Read `brainstorm/AGENTPROOF.md`. Summarize MVP boundaries in 5 bullets before writing app code under `apps/`.

## Output

Deliver: setup status table, MCP tool smoke test results, list of missing system dependencies, and recommended next human action (brainstorm vs implement).
