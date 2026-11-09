# IntentGuard — 8-week product plan

Ship a **real** end-user product on **Injective testnet only** ([NETWORK.md](./NETWORK.md)). Route A (typed AuthZ + gateway policy + isolated grantee) stays primary; Route B vault only if promotion criteria in [ROUTE-B.md](./ROUTE-B.md) are met.

## Week 1–2 — Protect v2 (in progress)

- [x] Multi-market selection (INJ + BTC testnet perps)
- [x] Policy presets (Conservative / Standard / Custom)
- [x] On-chain grant expiry (24h / 7d) via `grantExpirySeconds` on session create
- [x] Local persistence of protection summary (`sessionId`, limits)
- [x] Turn off protection (Keplr revoke + gateway session revoke)
- [x] Pitch-aligned copy on `/start`
- [x] Trade page reflects saved markets / limits
- [x] E2E smoke on hosted GCP after deploy (gateway `00011-n6z`, web `00011-q62`)

## Week 3 — Execute path polish

- [x] Clear errors when grant gas / subaccount margin missing (`execUserHints` + `userHint` on execute)
- [x] Status chip: grant ready, execute enabled, daily budget remaining (`ProtectionLiveStatus`, `GET /v1/agent/session`)
- [x] Operator docs merged into END-USERS (session execute is default)

## Week 4 — Demo agent page

- [x] `/agent` — preset phrases → propose/execute with visible policy decisions
- [x] Link from Protect “done” and nav
- [x] Home hero link to `/agent`

## Week 5–6 — Presets + exposure wording

- [x] Portfolio “exposure” copy vs real margin caps (`PolicyCapsCallout`, audit verdicts)
- [x] Saved presets per wallet (localStorage by `inj1…`)
- [x] UTC daily margin budget reset on gateway sessions

## Week 7–8 — Testnet hardening (replaces mainnet)

Mainnet prep is **parked** — see [NETWORK.md](./NETWORK.md).

- [ ] Rate limits on gateway propose/execute
- [ ] Audit export (CSV/JSON) for /history
- [ ] Incident runbook (sidecar down, grant expiry, revoke)
- [ ] Pitch deck ↔ testnet product parity review
- [ ] Helix testnet + faucet links audit on all CTAs

## Deploy (when gateway or web changes)

```bash
# From repo root — adjust project/region per your GCP setup
./scripts/deploy-intentguard-gcp.sh
```

Hosted URLs (testnet): see [GO-LIVE-TESTNET.md](./GO-LIVE-TESTNET.md).
