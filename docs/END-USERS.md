# IntentGuard for everyday users

**Testnet only** — all flows use Injective testnet (fake funds, Helix testnet). We are not shipping a mainnet version of this hosted app.

You do **not** need GCP, terminal, or manual `agt_` tokens when you use the hosted web app — the site proxies to the gateway with your browser session.

## What you get

1. **Protect** ([/start](https://fence-2lcs3sivbq-uc.a.run.app/start)) — pick markets, set caps, approve a **timed** typed grant in Keplr.
2. **Try limits** ([/trade](https://fence-2lcs3sivbq-uc.a.run.app/trade)) — see allow/deny against your real session policy.
3. **Demo agent** ([/agent](https://fence-2lcs3sivbq-uc.a.run.app/agent)) — tap sample “AI” phrases; same policy engine as a real bot.
4. **Grant audit** ([/portfolio](https://fence-2lcs3sivbq-uc.a.run.app/portfolio)) — scan your wallet for risky AuthZ grants.

## Live trading on testnet (after Protect)

| Step | What to do |
|------|------------|
| On-chain grant | Keplr approve on Protect — status chips show **On-chain grant: active** |
| Assistant gas | ~0.2 INJ to the assistant address (button on Protect **Done**) |
| Exchange margin | Deposit USDT on [Helix testnet](https://testnet.helixapp.com/) with the **same wallet** |
| Testnet INJ (gas) | [Injective faucet](https://testnet.faucet.injective.network/) or [Google Cloud faucet](https://cloud.google.com/application/web3/faucet/injective/testnet) |
| Execute | Hosted gateway has live execute enabled — small trades from Protect, Trade, or Demo agent |

If a trade fails, the app shows a **plain hint** (gas, margin, or grant) instead of only raw chain text.

**Daily margin left** resets at **midnight UTC** per protection session (not total portfolio exposure).

## Connect an AI agent or script

After **Protect**, open [/console](https://fence-2lcs3sivbq-uc.a.run.app/console) → **Connect your agent** (copy `agt_…` + sample `curl`). Full guide: [AGENT-INTEGRATION.md](./AGENT-INTEGRATION.md).

## What still needs Advanced console

| Goal | Where |
|------|--------|
| Owner sessions / probes | Rest of [/console](https://fence-2lcs3sivbq-uc.a.run.app/console) |
| Operator key rotation | Server-side only (not exposed in the browser) |

## Honest limit

Notional caps are enforced by IntentGuard’s gateway before MsgExec, not inside every Injective smart contract. You trust this app the way you trust any trading frontend — with an audit trail on [/history](https://fence-2lcs3sivbq-uc.a.run.app/history).
