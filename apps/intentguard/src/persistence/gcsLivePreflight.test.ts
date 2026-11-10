import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertCleanupAllowed,
  assertLiveTestObjectName,
  assertProductionObjectPathForbidden,
  GcsLivePreflightError,
  KNOWN_PRODUCTION_STATE_BUCKETS,
  newLiveTestObjectName,
  validateAdcServiceAccountEmail,
  validateLiveTestBucket,
  validateProductionGuardEnv,
} from "./gcsLivePreflight.ts";

const PROD = KNOWN_PRODUCTION_STATE_BUCKETS[0];
const TEST_BUCKET = "intentguard-gcs-test-dedicated";
const TEST_SA = "intentguard-gcs-live-test@example.iam.gserviceaccount.com";

describe("gcsLivePreflight", () => {
  it("1 — rejects missing INTENTGUARD_GCS_STATE_BUCKET", () => {
    assert.throws(
      () => validateLiveTestBucket(TEST_BUCKET, undefined),
      GcsLivePreflightError,
    );
  });

  it("2 — rejects incorrect production bucket guard", () => {
    assert.throws(
      () => validateProductionGuardEnv("not-a-known-production-bucket"),
      GcsLivePreflightError,
    );
  });

  it("3 — rejects known production bucket as test bucket", () => {
    assert.throws(
      () => validateLiveTestBucket(PROD, PROD),
      /known production state bucket/,
    );
  });

  it("4 — rejects production .intentguard/ object path", () => {
    assert.throws(
      () => assertProductionObjectPathForbidden(".intentguard/state.json"),
      GcsLivePreflightError,
    );
  });

  it("5 — rejects production intentguard/state.json path", () => {
    assert.throws(
      () => assertProductionObjectPathForbidden("intentguard/state.json"),
      GcsLivePreflightError,
    );
  });

  it("6 — rejects blocked owner user identity", () => {
    assert.throws(
      () =>
        validateAdcServiceAccountEmail(
          "violina.doley2025@gmail.com",
          TEST_SA,
        ),
      GcsLivePreflightError,
    );
  });

  it("7 — rejects missing or unverifiable ADC identity", () => {
    assert.throws(
      () => validateAdcServiceAccountEmail(null, TEST_SA),
      /Cannot verify ADC service account identity/,
    );
  });

  it("8 — rejects unexpected service account", () => {
    assert.throws(
      () =>
        validateAdcServiceAccountEmail(
          "other-sa@example.iam.gserviceaccount.com",
          TEST_SA,
        ),
      GcsLivePreflightError,
    );
  });

  it("9 — accepts valid dedicated test service account", () => {
    const email = validateAdcServiceAccountEmail(TEST_SA, TEST_SA);
    assert.equal(email, TEST_SA);
  });

  it("10 — cleanup cannot delete objects outside current run", () => {
    const name = newLiveTestObjectName();
    assert.throws(
      () => assertCleanupAllowed(name, new Set()),
      /not created in this test run/,
    );
    assert.doesNotThrow(() => assertCleanupAllowed(name, new Set([name])));
  });

  it("accepts valid test bucket when prod guard matches", () => {
    const bucket = validateLiveTestBucket(TEST_BUCKET, PROD);
    assert.equal(bucket, TEST_BUCKET);
  });

  it("generated object names match required prefix pattern", () => {
    const name = newLiveTestObjectName();
    assert.doesNotThrow(() => assertLiveTestObjectName(name));
    assert.throws(
      () => assertLiveTestObjectName("intentguard-test/wrong-name.json"),
      GcsLivePreflightError,
    );
  });
});
