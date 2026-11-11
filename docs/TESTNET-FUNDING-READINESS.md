# Testnet funding for execute readiness

IntentGuard **readiness** checks real on-chain balances. Grant approval alone is not enough.

## G4 pattern (INJ/USDC PERP)

| Check | Requirement |
|-------|-------------|
| Typed grants | Limit + cancel for subaccount + market |
| Grantee INJ | ≥ 0.2 INJ on grantee `inj1…` (recommend buffer) |
| Subaccount collateral | ≥ `maxMarginPerOrder` in **market quote** (USDC for INJ/USDC PERP) |

**Common mistake:** USDT in wallet or subaccount does **not** satisfy USDC-quoted perps.

## Steps (Owner A, Helix testnet)

1. Connect the same owner wallet used in the session.
2. Open [Helix testnet](https://testnet.helixapp.com/) → **Subaccounts** → deposit to **Subaccount 1**.
3. Select **USDC** (`erc20:0x0C382e685bbeeFE5d3d9C29E29E341fEE8E84C5d` on testnet).
4. Deposit at least your policy `maxMarginPerOrder` (e.g. 50 USDC).
5. In IntentGuard **Trade** → refresh **Execute readiness** until `overallStatus: ready`.

Verify from terminal (read-only):

```bash
bash scripts/verify-hosted-sessions-readiness.sh
```

## After funding

Hosted gateway with `INTENTGUARD_REQUIRE_EXECUTE_READINESS=1` (next deploy) will reject execute until readiness is `ready`, even if propose was allowed.
