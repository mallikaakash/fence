# Setup checklist

## One command

```bash
npm run setup
```

This will:

1. `git init` (if needed)
2. Clone [InjectiveLabs/mcp-server](https://github.com/InjectiveLabs/mcp-server) → `vendor/mcp-server`
3. `npm install && npm run build` in that directory
4. Install Injective agent skills into `.agents/skills/` (project-local)
5. Create `.env` from `.env.example` with `INJECTIVE_NETWORK=testnet`

## Manual follow-ups

### Injective CLI (`injectived`)

Follow `.agents/skills/injective-cli/SKILL.md` after skills install. The CLI is not vendored in this repo.

### Cursor

1. Open this folder in Cursor.
2. Confirm MCP servers: **Settings → MCP** (or project `.cursor/mcp.json`).
3. If `injective-trading` fails to start, run `npm run mcp:build` and reload.

### Optional: Claude Code / Claude Desktop

Mirror the trading server block from `.cursor/mcp.json`, using the absolute path to:

`vendor/mcp-server/dist/mcp/server.js`

Set `INJECTIVE_NETWORK` to `testnet` for hackathon work.

### Optional: community bundle

[`@bguiz/ainj`](https://www.npmjs.com/package/@bguiz/ainj) — community installer for CLI + MCP + skills. Official path is this repo + InjectiveLabs GitHub.

## Validation

```bash
npm run doctor
```

In Cursor, ask the agent to call **`search_injective_docs`** on `injective-docs` for “testnet faucet” or “agent SDK”. (The `injective-mcp-servers` skill still says `SearchInjectiveDocs`; the live server exposes `search_injective_docs` and `query_docs_filesystem_injective_docs`.)

## Security

- Do not point trading MCP at mainnet with funded keys during exploration.
- Add `vendor/mcp-server` keystores to `.gitignore` (already covered via env patterns).
