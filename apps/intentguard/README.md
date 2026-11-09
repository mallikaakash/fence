# IntentGuard

Injective-native financial execution policy for AI agents.

**Route A (baseline):** typed exchange AuthZ (`market_ids` + `subaccount_id`) + isolated grantee signer + gateway order economics + dedicated funded subaccount.

**Route B (challenger):** Exchange Precompile Policy Vault — spike in parallel; promote only if stronger non-bypass is proven.

**Non-bypass rule:** the agent never holds the AuthZ grantee private key. Only the isolated IntentGuard signer does.

**Diligence:** `../../brainstorm/DILIGENCE.md`

## Quick start

```bash
cd apps/intentguard
npm install
npm test
npm run demo
npm run demo:pitch   # Demo Day: proofs + live read-only chain checks
npm run gateway      # Sidecar HTTP API (product path) — see docs/PRODUCT.md
npm run product:smoke
```

Shippable install: [docs/INSTALL.md](../../docs/INSTALL.md) · E2E: [docs/E2E.md](../../docs/E2E.md) · Docker: `docker compose up`

Demo runbook: [../../docs/DEMO.md](../../docs/DEMO.md)

Read-only grant audit (no keys):

```bash
npm run audit -- inj1youraddress
```

## Layout

| Path | Role |
|------|------|
| `src/policy/` | Market / margin / notional / leverage / budget checks |
| `src/gateway/` | Session, key isolation, propose, isolated signer, audit |
| `src/authz/` | Typed grant planner, risk scoring, LCD fetch |
| `src/cli/demo.ts` | Offline Demo Day rehearsal |
| `src/cli/demo-pitch.ts` | Pitch driver (cached txs + LCD + indexer) |
| `src/cli/audit.ts` | Live AuthZ auditor (`--pretty`) |

## Specs

- `../../brainstorm/CHOSEN.md`
- `../../brainstorm/DILIGENCE.md`
- `../../brainstorm/INTENTGUARD.md`
- `../../brainstorm/INTENTGUARD-SPIKE.md`

## Status

- [x] Policy engine + notional (price×qty) + unit tests
- [x] Gateway session (key isolation, allow/deny/revoke, audit)
- [x] Typed AuthZ grant planner (`CreateDerivativeLimitOrderAuthz` + cancel)
- [x] Isolated grantee signer (approval-bound; no `sign(bytes)`)
- [x] Grant auditor scoring GenericAuthorization vs typed AuthZ
- [x] Live testnet typed MsgGrant + MsgExec attacks (`npm run spike`)
- [x] On-chain wrong-market / wrong-subaccount AuthZ denials proven
- [x] Notional gate before MsgExec (`npm run spike:notional` + live deny)
- [x] Funded USDC (Circle) → deposit subaccount **index 1** → allowed MsgExec order
- [x] Route B smoke — `npm run route-b:smoke` + [docs/ROUTE-B.md](../../docs/ROUTE-B.md) + vault skeleton
- [x] Demo pitch CLI (`npm run demo:pitch`) + [docs/DEMO.md](../../docs/DEMO.md)
- [x] Thin dashboard — `demo/index.html` (static proof links)
- [x] Next.js UI — `web/` (aleo-mvp glass shell, Injective content)
- [x] IntentGuard MCP — `intentguard-policy` in `.cursor/mcp.json` (`npm run mcp`)
- [x] Approval nonce replay protection on isolated signer
- [x] FeeGrant docs — [docs/FEEGRANT.md](../../docs/FEEGRANT.md)

```bash
npm run spike:prepare    # keys + faucet hints
npm run spike -- --revoke
npm run spike:notional   # notional pre-broadcast deny
```

Note: after chain v1.10, bank and default trading account (nonce `0`) are merged — `MsgDeposit` to index `0` is invalid. IntentGuard uses index `1`. Official resource map: [docs/RESOURCES.md](../../docs/RESOURCES.md).
