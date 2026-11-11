# Live GCS integration tests (IntentGuard)

**Scope:** Verify `GcsConditionalStateStore` against real Google Cloud Storage.  
**Not** production migration, deployment, or readiness sign-off.

## Identity isolation vs code isolation

| Layer | What it does | What it does **not** do |
|-------|----------------|-------------------------|
| **Code** (`gcsLivePreflight.ts`) | Enforces test bucket, object prefix, prod bucket deny list | Stop a project **Owner** principal from accessing production |
| **IAM** | Dedicated **test service account** with `roles/storage.objectUser` on **test bucket only** | Implied by passing preflight alone |

**Personal Owner Application Default Credentials are prohibited** for live tests. Preflight accepts **impersonated ADC** (`type: impersonated_service_account`) or a dedicated **service account key**, validating the effective principal via `google-auth-library` (`Impersonated#getTargetPrincipal` / `getCredentials().client_email`) and cross-checking the ADC file when present. Plain `authorized_user` ADC fails closed.

**Separate non-production GCP project** is strongly recommended so the test SA never inherits project-wide Storage access to production.

## Required environment

```bash
export INTENTGUARD_GCS_LIVE_TEST=1
export INTENTGUARD_GCS_TEST_BUCKET=intentguard-gcs-test-YOUR_PROJECT   # dedicated, ≠ prod
export INTENTGUARD_GCS_STATE_BUCKET=intentguard-state-project-bf77a013-c0b3-413c-a75  # known prod guard
export INTENTGUARD_GCS_TEST_SERVICE_ACCOUNT=intentguard-gcs-live-test@YOUR_PROJECT.iam.gserviceaccount.com
```

Authenticate ADC as that service account only (key file or impersonation):

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/test-sa-key.json
# OR: gcloud auth application-default login --impersonate-service-account="$INTENTGUARD_GCS_TEST_SERVICE_ACCOUNT"
```

## Bucket configuration (operator provisions — not created by agents)

| Setting | Recommendation |
|---------|----------------|
| **Project** | Prefer dedicated test project |
| **Location** | `us-central1` (align with prod state bucket) |
| **Uniform bucket-level access** | Enabled |
| **Object Versioning** | **Not required** for the live suite |
| **IAM** | Test SA: `roles/storage.objectUser` on **test bucket only** |
| **Object prefix** | Tests create only `intentguard-test/live-<uuid>.json` |

## Object Versioning vs generations

- **Generation preconditions** (`ifGenerationMatch`) apply to the **live** object generation on every write.
- **Generation-pinned reads** fetch a specific generation via the GCS API (`File` scoped with `generation`).
- **Object Versioning** (bucket setting) controls retention of archived versions; it is **not** required for correctness tests.
- The **superseded-generation probe** in live tests is **informational** (records whether an old generation remains readable); stale writers must still fail via precondition conflicts.

## Preflight failures (fail closed)

Live tests do not start when:

- `INTENTGUARD_GCS_LIVE_TEST` ≠ `1`
- `INTENTGUARD_GCS_TEST_BUCKET` missing or equals a **known production** bucket
- `INTENTGUARD_GCS_STATE_BUCKET` missing or not in the known production allowlist
- Test bucket equals production guard bucket
- Object path is not `intentguard-test/live-<uuid>.json`
- Path is under `.intentguard/` or `intentguard/state.json`
- `INTENTGUARD_GCS_TEST_SERVICE_ACCOUNT` missing
- ADC identity missing, unverifiable, mismatched, not a `*.iam.gserviceaccount.com`, impersonation/file principal mismatch, or blocked owner user
- Cleanup targets an object not created in the current run

## Run

```bash
cd apps/intentguard
npm test -- src/persistence/gcsLiveIntegration.test.ts
```

Unit tests for preflight (no GCP): `src/persistence/gcsLivePreflight.test.ts`
