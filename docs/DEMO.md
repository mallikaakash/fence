# IntentGuard — Demo Day runbook

## One command (presenter)

```bash
cd apps/intentguard
npm run demo:pitch
```

Shows: 60-second pitch, cached testnet tx hashes, spike checklist summary, live LCD grant audit + indexer snapshot (read-only, no keys printed).

Offline-only (airplane mode):

```bash
npm run demo:pitch -- --offline-only
```

## Four beats to narrate

| # | Story | Command / proof |
|---|--------|-----------------|
| 1 | Stock AutoSign is wide open | `npm run audit -- <inj1…> --pretty` on a generic-grant wallet; contrast typed grant in `.spike/allowed-order.json` |
| 2 | Typed AuthZ + isolated signer | Grant tx in `demo:pitch` output; agent never sees grantee key |
| 3 | Blocks | Wrong market / subaccount: `npm run spike -- --attacks-only`; notional: `npm run spike:notional` |
| 4 | Kill switch | `npm run spike -- --revoke` (destructive — only on throwaway testnet session) |

## Cached proof txs (testnet spike wallet)

Explorer base: `https://testnet.explorer.injective.network/transaction/`

| Event | Tx (hex) |
|-------|----------|
| Typed MsgGrant | `F0852EA9E48CEDA2B779AFBEAF8DFEBC3DFDAA6BEFB64AA34D70295D62B701AF` |
| Allowed MsgExec (in-policy) | `411EC04566E138288ED8FDCEDE1BC1F4E958866E22FBC9FE73CBDE3D55FE4D18` |

Notional deny is **gateway-only** (no tx) — see `.spike/allowed-order.json` → `deny`.

## Offline rehearsal (no network)

```bash
npm run demo
```

Policy allow/deny/revoke + sample Grant Auditor narrative.

## Web UI (aleo-mvp shell)

```bash
npm run intentguard:web
# or: cd apps/intentguard/web && npm install && npm run dev
```

Glass Next.js app at port **3001** — simulate, proofs, grant audit.

## Static dashboard

Open `apps/intentguard/demo/index.html` in a browser (proof links + pitch beats).

## MCP (Cursor)

Reload MCP after pull — use **intentguard_propose** / **intentguard_audit_grants** on `intentguard-policy` (no signing).

## After demo

- Route B full vault: [ROUTE-B.md](./ROUTE-B.md) (smoke already green)
- Customer discovery → [CUSTOMER-DISCOVERY.md](../brainstorm/CUSTOMER-DISCOVERY.md)
