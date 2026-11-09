# UI/UX audit (Playwright)

End-user flows are **testnet-only**. Primary nav: Protect → Try limits → Demo agent → Grant audit.

## Automated checks

```bash
cd apps/intentguard/web
npm run test:e2e
```

Optional hosted smoke:

```bash
PLAYWRIGHT_BASE_URL=https://intentguard-web-2lcs3sivbq-uc.a.run.app npm run test:e2e
```

Covers: all 8 routes, shared nav/footer, mobile horizontal overflow on `/start`.

## Design rules (v0.3)

| Area | Rule |
|------|------|
| Voice | Short sentences; no `POST /v1/…` on primary buttons |
| Nav | 4 primary links; Advanced/Evidence in footer |
| Pages | `InnerPage` + `PageHeader` for consistent titles |
| Caps | Collapsible `PolicyCapsCallout` — not portfolio exposure |
| Console | Developer-only; Protect wizard is the default path |
