# IntentGuard GCS conditional state — security review (Phase 2B.3.4)

Review of in-repo implementation only. **Not** a production sign-off without live GCS integration tests and operator migration.

## Scope

- Authoritative `state.json` via `GcsConditionalStateStore` + `@google-cloud/storage`
- Execution checkpoints unchanged (`persistNow` before broadcast)
- No changes to MsgExec, AuthZ, proposal fingerprinting, or idempotency keys

## Threat: stale Cloud Run revision overwrites newer state

| Control | Mechanism |
|---------|-----------|
| Storage generation | Every `save` uses `preconditionOpts.ifGenerationMatch` = generation at load/last success |
| Process fencing | `assertMayWrite()` rejects when `writerHolderId !== holderId` and not claiming ownership |
| Takeover | New holder bumps `writerEpoch` on first successful conditional commit |
| No stale retry | On 412, **no** metadata refresh + rewrite of in-memory state |
| Ambiguous OK | 412 + matching `lastCommitId` on object → adopt generation (upload succeeded) |
| Ambiguous bad | 412 + mismatch → `StateGenerationConflictError` → `persist_failed` (execute fail-closed) |

**Residual:** Two writers can still run in memory until first conflicting persist; execution safety relies on existing checkpoint ordering + persist failure before broadcast.

## Threat: FUSE bypass

| Path | Authoritative write? |
|------|---------------------|
| `GcsConditionalStateStore.save` | Yes (hosted) |
| `SecureFileStore.save` | Dev only (`INTENTGUARD_STATE_BACKEND=file`) |
| `writeJsonAtomic` for `writer-lease.json` | No (lease disabled when `stateBackend=gcs`) |
| `config.json` | Owner credentials — separate file, unchanged |

Hosted: `INTENTGUARD_REQUIRE_GCS_STATE=1` prevents silent file backend.

## Execution invariants (unchanged)

- Proposal consumption and fingerprint checks — orchestrator unchanged
- Idempotency records persisted in same object
- `broadcast_unknown` recovery rules — `executionRecovery.ts` unchanged
- Maintenance / state-write freeze — coordinator unchanged
- Agent token does not sign chain txs

## Fail-closed cases

- Missing bucket/object config with `REQUIRE_GCS_STATE`
- Malformed JSON on load → `StatePersistenceError` / startup failure
- GCS 404 on load → empty in-memory state **only** when object truly absent (new install); operator must not point at wrong bucket
- JSON parse errors after partial download — throw
- Reconciliation failure on 412 — conflict error

## Phase 2B.3.4.1 audit — confirmed fix

**CRITICAL (confirmed):** After a successful `file.save()`, `gcsNodeAdapter` called `getMetadata()` and `commitBody` trusted `result.generation` without verifying object body. If writer B committed before A read metadata, A could adopt B’s generation while retaining stale in-memory gateway state, then overwrite B on the next `ifGenerationMatch`.

**Fix (2B.3.4.1):** Body-verified adoption before trusting metadata generation.

**Fix (2B.3.4.2):** Removed incorrect `generation === precondition + 1` arithmetic (real GCS generations are opaque). Adoption uses live `getMetadata()` + `download({ generation })` pinned read; commit must be at **live head** (`lastCommitId`, `writerHolderId`, `writerEpoch`).

Adversarial tests: `gcsConditionalStateStore.adversarial.test.ts`.

Live test isolation: `gcsLivePreflight.ts` + [GCS-LIVE-TEST.md](./GCS-LIVE-TEST.md) (mandatory prod bucket guard, dedicated test SA ADC).

## Gaps / follow-ups

1. **Live GCS** race proofs — unit tests use `MemoryGcsObjectAdapter` only.
2. **Read-after-FUSE** — Operators must not edit `gs://…/intentguard/state.json` and FUSE copy divergently.
3. **`config.json` on FUSE** — Still writable on mount; not in scope for this phase.
4. **Automatic reload on 412 for non-execute paths** — Not implemented (intentional fail-closed).

## Confirmation (this review session)

No GCP deploy, IAM changes, wallet access, transactions, git commit, or push.
