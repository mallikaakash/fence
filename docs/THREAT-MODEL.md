# IntentGuard — threat model

## Assets

| Asset | Where it lives | Protection (v0.1.3) |
|-------|----------------|---------------------|
| Grantee MsgExec key | Sidecar `state.json` | AES-256-GCM when `INTENTGUARD_DATA_KEY` set; file mode 0600 |
| Owner granter key (execute) | Env or `owner-private-key.hex` | Operator custody; never in agent APIs |
| Owner HTTP API key | `config.json` | mode 0600; timing-safe compare; `POST /v1/owner/rotate-api-key` |
| Agent API token | Agent runtime | TTL default 7d; revocable session |

## Trust boundaries

- **Agent** — untrusted; Bearer `agt_` only.
- **Owner** — trusted for MsgGrant + owner API key.
- **Sidecar host** — must be hardened (loopback bind default, no public ingress).

## Controls implemented

| Risk | Mitigation |
|------|------------|
| Network exposure | `INTENTGUARD_BIND=127.0.0.1` default |
| CORS abuse | Allowlist via `INTENTGUARD_CORS_ORIGINS` (no `*`) |
| Brute force / flood | Per-IP+route rate limit (`INTENTGUARD_RATE_LIMIT_PER_MIN`) |
| Large bodies | `INTENTGUARD_MAX_BODY_BYTES` (default 64KiB) |
| Owner key guessing | `timingSafeEqual` on bearer |
| Grant plan scraping | Owner auth on `POST /v1/grants/plan` |
| Disk theft | Encrypt grantee material + HMAC audit seal with `INTENTGUARD_DATA_KEY` |
| Audit tampering | `auditSeal` HMAC on `state.json` v2 |
| Stale agent tokens | `agentTokenExpiresAt` on sessions |
| Plaintext ops mistake | `INTENTGUARD_REQUIRE_DATA_KEY=1` for strict deploys |

## Residual risk (document to customers)

- **Host compromise** — attacker with root can read `INTENTGUARD_DATA_KEY` from env and decrypt state.
- **Owner key on sidecar** for execute mode — high value; prefer HSM/KMS in enterprise tier.
- **No TLS in-process** — terminate TLS at reverse proxy for remote access.
- **Grant LCD check** — grantee + auth type, not full market/subaccount decode yet.
- **Gateway integrity** — supply-chain / binary trust is operator responsibility.

## Production checklist

```bash
export INTENTGUARD_BIND=127.0.0.1
export INTENTGUARD_DATA_KEY=$(openssl rand -hex 32)
export INTENTGUARD_REQUIRE_DATA_KEY=1
export INTENTGUARD_CORS_ORIGINS=http://127.0.0.1:3001
export INTENTGUARD_EXECUTE=0   # until grants + funding ready
```

See [E2E.md](./E2E.md) for functional setup.
