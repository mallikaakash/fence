# Testnet links audit

Canonical constants: `apps/intentguard/web/src/lib/testnet-resources.ts`.

| Resource | URL | Used in |
|----------|-----|---------|
| Helix testnet (trade / margin) | https://testnet.helixapp.com/ | Protect Done, `TestnetResourcesCallout`, END-USERS, GO-LIVE, RUNBOOK, DEMO-WEB |
| Helix testnet trading bots | https://testnet.helixapp.com/trading-bots | Related products callout |
| Helix mainnet trading bots (contrast) | https://helixapp.com/trading-bots | `/limitations` related products |
| Injective testnet faucet | https://testnet.faucet.injective.network/ | Protect resources, GO-LIVE |
| Google Cloud Injective faucet | https://cloud.google.com/application/web3/faucet/injective/testnet | Protect resources, GO-LIVE, spike CLI hints |
| Hosted web | https://fence-2lcs3sivbq-uc.a.run.app | All user docs |
| Explorer (testnet tx) | https://testnet.explorer.injective.network/transaction | `web/src/lib/explorer.ts` |

## Checklist (maintenance)

- [x] No mainnet Helix URL in testnet **CTAs** (only comparison copy on limitations)
- [x] Faucets documented in UI (`TestnetResourcesCallout` on How it works)
- [x] `GO-LIVE-TESTNET.md` matches hosted URLs
- [ ] Re-verify Helix testnet bot path if Injective changes testnet routing

Last audit: 10 Nov 2026.
