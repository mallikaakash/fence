import { randomUUID } from "node:crypto";
import {
  type AdcIdentityResolverDeps,
  resolveAdcServiceAccountIdentity,
} from "./gcsLiveAdcIdentity.ts";

/**
 * Fail-closed guards for live GCS integration tests.
 * Code-level path isolation does NOT replace IAM identity isolation.
 */

/** Production state buckets — deny as INTENTGUARD_GCS_TEST_BUCKET even if env is wrong. */
export const KNOWN_PRODUCTION_STATE_BUCKETS = [
  "intentguard-state-project-bf77a013-c0b3-413c-a75",
] as const;

export const BLOCKED_ADC_USER_PRINCIPALS = [
  "violina.doley2025@gmail.com",
] as const;

const TEST_OBJECT_PREFIX = "intentguard-test/";
const TEST_OBJECT_PATTERN = /^intentguard-test\/live-[0-9a-f-]+\.json$/;

const CANONICAL_API_STATE_OBJECT = "intentguard/state.json";

export class GcsLivePreflightError extends Error {
  readonly code = "gcs_live_preflight_failed" as const;
  constructor(message: string) {
    super(message);
  }
}

export function productionStateObjectPath(): string {
  return process.env.INTENTGUARD_GCS_STATE_OBJECT ?? CANONICAL_API_STATE_OBJECT;
}

export function normalizeBucketName(bucket: string): string {
  return bucket.replace(/^gs:\/\//, "").replace(/\/$/, "").trim();
}

export function isKnownProductionStateBucket(bucket: string): boolean {
  const name = normalizeBucketName(bucket);
  return (KNOWN_PRODUCTION_STATE_BUCKETS as readonly string[]).includes(name);
}

export function validateProductionGuardEnv(stateBucketEnv: string | undefined): string {
  if (!stateBucketEnv || stateBucketEnv.trim() === "") {
    throw new GcsLivePreflightError(
      "INTENTGUARD_GCS_STATE_BUCKET is required when INTENTGUARD_GCS_LIVE_TEST=1",
    );
  }
  const normalized = normalizeBucketName(stateBucketEnv);
  if (!isKnownProductionStateBucket(normalized)) {
    throw new GcsLivePreflightError(
      `INTENTGUARD_GCS_STATE_BUCKET must match a known production state bucket; got "${normalized}"`,
    );
  }
  return normalized;
}

export function validateLiveTestBucket(
  testBucketEnv: string | undefined,
  stateBucketEnv: string | undefined,
): string {
  if (!testBucketEnv || testBucketEnv.trim() === "") {
    throw new GcsLivePreflightError(
      "INTENTGUARD_GCS_TEST_BUCKET must be set to a dedicated test bucket",
    );
  }
  const testBucket = normalizeBucketName(testBucketEnv);
  const prodBucket = validateProductionGuardEnv(stateBucketEnv);

  if (isKnownProductionStateBucket(testBucket)) {
    throw new GcsLivePreflightError(
      `INTENTGUARD_GCS_TEST_BUCKET must not be a known production state bucket: ${testBucket}`,
    );
  }
  if (testBucket === prodBucket) {
    throw new GcsLivePreflightError(
      "INTENTGUARD_GCS_TEST_BUCKET must not equal INTENTGUARD_GCS_STATE_BUCKET",
    );
  }
  return testBucket;
}

export function assertProductionObjectPathForbidden(objectName: string): void {
  const prodObject = productionStateObjectPath();
  if (objectName === CANONICAL_API_STATE_OBJECT || objectName === prodObject) {
    throw new GcsLivePreflightError(
      "live tests must not use production API state object path",
    );
  }
  if (
    objectName.startsWith(".intentguard/") ||
    objectName.startsWith(".intentguard") ||
    objectName.includes("/.intentguard/")
  ) {
    throw new GcsLivePreflightError(
      "live tests must not use production FUSE-style .intentguard/ object paths",
    );
  }
}

export function assertLiveTestObjectName(objectName: string): void {
  if (!TEST_OBJECT_PATTERN.test(objectName)) {
    throw new GcsLivePreflightError(
      `live test object must match ${TEST_OBJECT_PREFIX}live-<uuid>.json, got: ${objectName}`,
    );
  }
  assertProductionObjectPathForbidden(objectName);
}

export function newLiveTestObjectName(): string {
  return `${TEST_OBJECT_PREFIX}live-${randomUUID()}.json`;
}

export function assertCleanupAllowed(
  objectName: string,
  createdInRun: ReadonlySet<string>,
): void {
  assertLiveTestObjectName(objectName);
  if (!createdInRun.has(objectName)) {
    throw new GcsLivePreflightError(
      `refusing cleanup of object not created in this test run: ${objectName}`,
    );
  }
}

/**
 * Verify resolved ADC identity is the expected dedicated service account (not user OAuth).
 */
export function validateAdcServiceAccountEmail(
  clientEmail: string | null | undefined,
  expectedServiceAccount: string | undefined,
): string {
  const expected = expectedServiceAccount?.trim();
  if (!expected) {
    throw new GcsLivePreflightError(
      "INTENTGUARD_GCS_TEST_SERVICE_ACCOUNT must be set for live GCS tests",
    );
  }
  if (!clientEmail) {
    throw new GcsLivePreflightError(
      "Cannot verify ADC service account identity — missing or unverifiable Application Default Credentials (use impersonated ADC or a dedicated service account key; personal user OAuth ADC is not permitted)",
    );
  }
  const email = clientEmail.trim();
  if ((BLOCKED_ADC_USER_PRINCIPALS as readonly string[]).includes(email)) {
    throw new GcsLivePreflightError(`Blocked ADC principal: ${email}`);
  }
  if (!email.endsWith(".iam.gserviceaccount.com")) {
    throw new GcsLivePreflightError(
      `Live GCS tests require a service account ADC identity, got: ${email}`,
    );
  }
  if (email !== expected) {
    throw new GcsLivePreflightError(
      `ADC identity "${email}" does not match INTENTGUARD_GCS_TEST_SERVICE_ACCOUNT`,
    );
  }
  return email;
}

export async function resolveAdcClientEmailFromSdk(
  deps?: AdcIdentityResolverDeps,
): Promise<string | null> {
  return resolveAdcServiceAccountIdentity(deps);
}

export function assertLiveTestEnabled(): void {
  if (process.env.INTENTGUARD_GCS_LIVE_TEST !== "1") {
    throw new GcsLivePreflightError("INTENTGUARD_GCS_LIVE_TEST=1 is required");
  }
}

export function assertLiveTestBucketConfigured(
  bucket: string | undefined,
): asserts bucket is string {
  assertLiveTestEnabled();
  validateLiveTestBucket(bucket, process.env.INTENTGUARD_GCS_STATE_BUCKET);
}

/** Full preflight including SDK ADC verification (live runs only). */
export async function assertLiveGcsPreflight(
  bucket: string | undefined,
  adcDeps?: AdcIdentityResolverDeps,
): Promise<{ testBucket: string; adcEmail: string }> {
  assertLiveTestBucketConfigured(bucket);
  const testBucket = normalizeBucketName(bucket!);
  const clientEmail = await resolveAdcClientEmailFromSdk(adcDeps);
  const adcEmail = validateAdcServiceAccountEmail(
    clientEmail,
    process.env.INTENTGUARD_GCS_TEST_SERVICE_ACCOUNT,
  );
  return { testBucket, adcEmail };
}
