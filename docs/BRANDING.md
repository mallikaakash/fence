# Branding

| | |
|---|---|
| **Product name** | **Fence** |
| **Repo folder** | `apps/intentguard/` |
| **Env / secrets prefix** | `INTENTGUARD_*` (unchanged — avoids breaking deploy) |
| **GCP services** | `intentguard-gateway`, `intentguard-web` |
| **MCP server ids** | `intentguard-agent`, `intentguard-policy` |

User-facing strings use **Fence** (see `apps/intentguard/src/brand.ts` and `web/src/lib/brand.ts`).

Internal TypeScript names such as `IntentGuardPolicy` remain until a dedicated types rename.
