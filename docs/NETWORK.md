# Network policy — **testnet only**

IntentGuard for this buildathon / hosted product ships and stays on **Injective testnet**.

| Layer | Setting |
|-------|---------|
| GCP gateway | `INJECTIVE_NETWORK=testnet` (deploy script default) |
| Web / Keplr | Testnet chain only in user flows |
| Grant audit | Testnet LCD only in the public UI |

Mainnet is **out of scope** for this product track. SDK and operator code may still accept a `mainnet` type for advanced self-hosters, but we do not document or build a mainnet go-live path here.

See [GO-LIVE-TESTNET.md](./GO-LIVE-TESTNET.md) for the hosted URLs.
