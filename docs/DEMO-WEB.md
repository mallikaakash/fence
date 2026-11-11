# Live web demo (~3 minutes)

**URL:** https://fence-2lcs3sivbq-uc.a.run.app  
**Network:** Injective testnet only.

## Preflight (do before presenting)

| Item | Check |
|------|--------|
| Keplr on **injective-888** / testnet | Connected |
| Wallet has **testnet INJ** | [Injective faucet](https://testnet.faucet.injective.network/) or [GCP faucet](https://cloud.google.com/application/web3/faucet/injective/testnet) |
| Optional live execute | ~0.2 INJ sent to **assistant** from Protect Done; small **USDT** on Helix testnet |
| Browser | Hard refresh after deploy (`Cmd+Shift+R`) |

Hosted health:

```bash
curl -sS https://fence-2lcs3sivbq-uc.a.run.app/api/gateway/health
```

Expect `network: "testnet"`, `executeEnabled: true`.

## Beat 1 — Problem (30s)

**Grant audit** (`/portfolio`): paste an address or connect Keplr → **Run auditor**.

Say: *“Generic AutoSign grants whole message classes. We highlight risky grants; IntentGuard uses typed scope + gateway caps.”*

## Beat 2 — Protect (60s)

**Protect** (`/start`): Standard preset → **Create protection** → Keplr **MsgGrant** → **Done**.

Point at chips: **ON-CHAIN GRANT: active**, **daily margin**, **live execute**.

## Beat 3 — Policy (45s)

**Try limits** (`/trade`): small intent → **Evaluate proposal** (allow). Bump quantity over max notional → **deny**.

**Demo agent** (`/agent`): **Small long INJ** vs **Oversize order**.

## Beat 4 — Optional execute (30s)

Only if preflight gas + margin are ready: **Place small protected trade** or agent execute.

If it fails, read the **plain hint** aloud (gas / margin) — still proves gateway policy.

## Beat 5 — Integrator (15s)

**Developer console** (`/console`): show **Connect your agent** snippet — `agt_…` + `curl` propose. Link [AGENT-INTEGRATION.md](./AGENT-INTEGRATION.md).

## Offline backup

CLI pitch: `cd apps/intentguard && npm run demo:pitch` — see [DEMO.md](./DEMO.md).

## One-liner close

*“Agents on Injective can AutoSign — IntentGuard adds **size and margin policy**, **typed grants**, and a **signer the LLM never holds**.”*
