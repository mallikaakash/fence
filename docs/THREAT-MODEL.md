# IntentGuard — threat model (v0.1)

## Assets

| Asset | Where it lives |
|-------|----------------|
| Grantee MsgExec key | Sidecar `state.json` (plaintext, mode 600) |
| Owner granter key (execute mode) | Env or `owner-private-key.hex` on sidecar |
| Owner HTTP API key | `config.json` |
| Agent API token | Agent runtime + optional browser localStorage |

## Trust boundaries

- **Agent** is untrusted: may send malicious intents, must not sign chain txs.
- **Owner** is trusted to sign MsgGrant once and hold API key.
- **Sidecar operator** must protect the host: disk, backups, and network exposure.

## What IntentGuard mitigates

- Agent exfiltration of grantee private key (token-only API).
- Oversize notional / leverage / daily margin before MsgExec (when execute enabled).
- Typed AuthZ scoping (markets, subaccount) enforced on-chain **after** owner signs grant plan.

## What it does not mitigate (v0.1)

- Compromised sidecar host → full loss until on-chain revoke.
- Owner’s separate generic AuthZ grants on the same wallet.
- Gateway integrity: a patched sidecar could sign outside policy.
- Plaintext `state.json` on shared backups or multi-tenant disks.

## Operational defaults (v0.1.1+)

- Gateway binds **127.0.0.1** by default (`INTENTGUARD_BIND`).
- Sensitive JSON files written **mode 0600**; data dir **0700**.
- `POST /v1/grants/plan` requires owner API key.
- Daily margin budget applies on **successful execute**, not dry-run propose.

## Customer guidance

Run sidecar on a dedicated VM, no public ingress, TLS via reverse proxy if remote, rotate `agt_` tokens per session, revoke on-chain when offboarding.
