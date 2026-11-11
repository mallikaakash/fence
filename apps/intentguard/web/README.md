# Fence web (Next.js)

Glassmorphism UI adapted from [aleo-mvp](https://github.com/mallikaakash/aleo-mvp) (`frontend/`), re-themed for **Fence on Injective**.

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
| `/history` | Live gateway audit log (export JSON/CSV) |
| `/portfolio` | Grant auditor (LCD) |

API routes import policy/authz code from `../src/` via Next `externalDir`.

## Activity log (hosted)

After **Protect**, events appear on `/history`. CLI spike proofs: `npm run demo:pitch` in `apps/intentguard`.

```bash
cd ..
npm run spike:notional
```
