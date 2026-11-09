# Grantee gas (FeeGrant)

IntentGuard grantee signs **MsgExec** and pays gas in INJ. Options:

1. **Prefund grantee** (spike default) — send ~2 INJ to grantee bech32.
2. **FeeGrant** — owner issues `BasicAllowance` so grantee spends owner's INJ up to a limit.

sdk-ts in this repo does not export `MsgGrantAllowance` yet. Use Injective CLI after importing the owner key:

```bash
injectived tx feegrant grant <owner_inj1> <grantee_inj1> 2000000000000000000 \
  --expiration 2026-12-31T00:00:00Z \
  --from <owner_inj1> \
  --keyring-backend test \
  --node https://testnet.sentry.tm.injective.network:443 \
  --chain-id injective-888 \
  -y
```

Helper prints the exact command: `apps/intentguard/src/chain/feeGrant.ts` (`ensureGranteeFeeAllowance`).

Docs: [FeeGrant example](https://docs.injective.network/developers-native/examples/feegrant)
