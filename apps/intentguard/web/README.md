# IntentGuard web (Next.js)

Glassmorphism UI adapted from [aleo-mvp](https://github.com/mallikaakash/aleo-mvp) (`frontend/`), re-themed for **IntentGuard on Injective**.

## Run

```bash
cd apps/intentguard/web
npm install
npm run dev
```

Open [http://localhost:3001](http://localhost:3001).

| Route | Purpose |
|-------|---------|
| `/` | Product home |
| `/trade` | Policy simulator (calls shared `evaluateTradeIntent`) |
| `/history` | Testnet proof txs from `../.spike/*.json` |
| `/portfolio` | Grant auditor (LCD) |

API routes import policy/authz code from `../src/` via Next `externalDir`.

## Proofs

Run spike locally so `/history` has data:

```bash
cd ..
npm run spike:notional
```
