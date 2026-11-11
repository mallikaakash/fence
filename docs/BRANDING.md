# Branding

| | |
|---|---|
| **Product name** | **Fence** |
| **Repo folder** | `apps/intentguard/` |
| **Env / secrets prefix** | `INTENTGUARD_*` (unchanged — avoids breaking deploy) |
| **GCP services** | `intentguard-gateway` (API), `fence` (public web) |
| **MCP server ids** | `intentguard-agent`, `intentguard-policy` |

**Favicon / app icon:** `web/src/app/icon.png` (candlestick F mark). UI uses the orange **Fence** word chip on the home hero, not the image mark in the layout.

See `web/src/lib/brand.ts` and `src/brand.ts` for product name in copy.

Internal TypeScript names such as `IntentGuardPolicy` remain until a dedicated types rename.
