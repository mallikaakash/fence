# Mainnet prep checklist — **PARKED**

**Product decision: testnet only.** This checklist is retained for reference if the project scope changes later. Active networking policy: [NETWORK.md](./NETWORK.md).

~~Do not flip production traffic until each item is signed off.~~

## Gateway / ops

- [ ] `INJECTIVE_NETWORK=mainnet` on Cloud Run gateway revision (separate service or env per stage).
- [ ] Mainnet `INTENTGUARD_CORS_ORIGINS` for production web URL only.
- [ ] Confirm `INTENTGUARD_EXECUTE=1` only after legal/risk review.
- [ ] GCS state bucket + `INTENTGUARD_DATA_KEY` rotation runbook.
- [ ] Owner API key rotation tested (`POST /v1/owner/rotate-api-key`).

## Web

- [ ] Market list for mainnet perps (not testnet IDs).
- [ ] Helix mainnet + faucet links (no testnet faucet on production UI).
- [ ] Environment ribbon: **MAINNET** with extra confirmation copy.
- [ ] Grant audit default network = mainnet for production host.

## Chain / policy

- [ ] Typed grant plan reviewed for mainnet exchange message types.
- [ ] Spike live grant test on mainnet with dust amounts.
- [ ] Document max leverage / min notional from live market metadata.

## Legal / product

- [ ] [LIMITATIONS.md](./LIMITATIONS.md) and [END-USERS.md](./END-USERS.md) reviewed for mainnet.
- [ ] No “portfolio exposure” marketing without aggregate risk engine.

```bash
./scripts/deploy-intentguard-gcp.sh   # after setting GCP env for mainnet staging
```
