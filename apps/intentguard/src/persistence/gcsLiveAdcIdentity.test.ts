import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADC_TYPE_IMPERSONATED,
  extractTargetPrincipalFromImpersonationUrl,
  parseAdcJsonForIdentity,
  resolveAdcServiceAccountIdentity,
} from "./gcsLiveAdcIdentity.ts";
import { GcsLivePreflightError } from "./gcsLivePreflight.ts";

const TEST_SA =
  "intentguard-gcs-live-test@intentguard-gcs-test-bf77a013.iam.gserviceaccount.com";
const OTHER_SA = "other-sa@intentguard-gcs-test-bf77a013.iam.gserviceaccount.com";

const IMPERSONATION_URL = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${TEST_SA}:generateAccessToken`;

function impersonatedAdcJson(targetSa: string = TEST_SA) {
  return {
    type: ADC_TYPE_IMPERSONATED,
    source_credentials: {
      type: "authorized_user",
      client_id: "test-client-id",
      client_secret: "test-secret",
      refresh_token: "test-refresh",
    },
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${targetSa}:generateAccessToken`,
    delegates: [],
  };
}

function mockImpersonatedClient(targetSa: string) {
  return {
    getTargetPrincipal: () => targetSa,
  };
}

describe("gcsLiveAdcIdentity", () => {
  it("extracts target principal from IAM generateAccessToken URL", () => {
    const principal = extractTargetPrincipalFromImpersonationUrl(
      IMPERSONATION_URL,
    );
    assert.equal(principal, TEST_SA);
  });

  it("parseAdcJson — valid impersonated ADC", () => {
    const parsed = parseAdcJsonForIdentity(impersonatedAdcJson());
    assert.equal(parsed.mode, "impersonated");
    if (parsed.mode === "impersonated") {
      assert.equal(parsed.targetPrincipal, TEST_SA);
    }
  });

  it("resolve — valid impersonated ADC (SDK + file)", async () => {
    const email = await resolveAdcServiceAccountIdentity({
      readAdcFile: async () => ({
        path: "/mock/adc.json",
        json: impersonatedAdcJson(),
      }),
      createGoogleAuth: async () => ({
        getClient: async () => mockImpersonatedClient(TEST_SA),
        getCredentials: async () => ({ client_email: TEST_SA }),
      }),
    });
    assert.equal(email, TEST_SA);
  });

  it("resolve — impersonation targeting wrong service account (file)", async () => {
    const email = await resolveAdcServiceAccountIdentity({
      readAdcFile: async () => ({
        path: "/mock/adc.json",
        json: impersonatedAdcJson(OTHER_SA),
      }),
      createGoogleAuth: async () => ({
        getClient: async () => mockImpersonatedClient(OTHER_SA),
        getCredentials: async () => ({ client_email: OTHER_SA }),
      }),
    });
    assert.equal(email, OTHER_SA);
  });

  it("resolve — rejects ordinary user ADC file", async () => {
    await assert.rejects(
      () =>
        resolveAdcServiceAccountIdentity({
          readAdcFile: async () => ({
            path: "/mock/adc.json",
            json: {
              type: "authorized_user",
              client_id: "id",
              client_secret: "secret",
              refresh_token: "rt",
              account: "violina.doley2025@gmail.com",
            },
          }),
          createGoogleAuth: async () => ({
            getClient: async () => ({}),
            getCredentials: async () => {
              throw new Error("NO_CREDENTIALS_FOUND");
            },
          }),
        }),
      (err: unknown) => {
        assert.ok(err instanceof GcsLivePreflightError);
        return /Personal user OAuth ADC/.test((err as Error).message);
      },
    );
  });

  it("resolve — impersonated file but SDK client is not Impersonated", async () => {
    await assert.rejects(
      () =>
        resolveAdcServiceAccountIdentity({
          readAdcFile: async () => ({
            path: "/mock/adc.json",
            json: impersonatedAdcJson(),
          }),
          createGoogleAuth: async () => ({
            getClient: async () => ({}),
            getCredentials: async () => ({ client_email: TEST_SA }),
          }),
        }),
      /did not load an Impersonated client/,
    );
  });

  it("resolve — malformed impersonated ADC (missing URL)", async () => {
    await assert.rejects(
      () =>
        resolveAdcServiceAccountIdentity({
          readAdcFile: async () => ({
            path: "/mock/adc.json",
            json: {
              type: ADC_TYPE_IMPERSONATED,
              source_credentials: { type: "authorized_user" },
            },
          }),
          createGoogleAuth: async () => ({
            getClient: async () => mockImpersonatedClient(TEST_SA),
            getCredentials: async () => ({ client_email: TEST_SA }),
          }),
        }),
      /missing service_account_impersonation_url/,
    );
  });

  it("resolve — ADC file vs SDK principal mismatch", async () => {
    await assert.rejects(
      () =>
        resolveAdcServiceAccountIdentity({
          readAdcFile: async () => ({
            path: "/mock/adc.json",
            json: impersonatedAdcJson(TEST_SA),
          }),
          createGoogleAuth: async () => ({
            getClient: async () => mockImpersonatedClient(OTHER_SA),
            getCredentials: async () => ({ client_email: OTHER_SA }),
          }),
        }),
      /does not match SDK-resolved principal/,
    );
  });

  it("resolve — unverifiable when SDK fails and only user ADC would apply", async () => {
    const email = await resolveAdcServiceAccountIdentity({
      readAdcFile: async () => null,
      createGoogleAuth: async () => ({
        getClient: async () => ({}),
        getCredentials: async () => {
          throw new Error("NO_CREDENTIALS_FOUND");
        },
      }),
    });
    assert.equal(email, null);
  });

  it("resolve — getCredentials empty but getTargetPrincipal present", async () => {
    const email = await resolveAdcServiceAccountIdentity({
      readAdcFile: async () => ({
        path: "/mock/adc.json",
        json: impersonatedAdcJson(),
      }),
      createGoogleAuth: async () => ({
        getClient: async () => mockImpersonatedClient(TEST_SA),
        getCredentials: async () => {
          throw new Error("NO_CREDENTIALS_FOUND");
        },
      }),
    });
    assert.equal(email, TEST_SA);
  });

  it("resolve — dedicated service account key file", async () => {
    const email = await resolveAdcServiceAccountIdentity({
      readAdcFile: async () => ({
        path: "/mock/sa.json",
        json: {
          type: "service_account",
          client_email: TEST_SA,
          private_key: "-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----\n",
        },
      }),
      createGoogleAuth: async () => ({
        getClient: async () => ({}),
        getCredentials: async () => ({ client_email: TEST_SA }),
      }),
    });
    assert.equal(email, TEST_SA);
  });

  it("assertLiveGcsPreflight wiring — wrong SA vs env", async () => {
    const { assertLiveGcsPreflight } = await import("./gcsLivePreflight.ts");
    const prev = {
      live: process.env.INTENTGUARD_GCS_LIVE_TEST,
      testBucket: process.env.INTENTGUARD_GCS_TEST_BUCKET,
      stateBucket: process.env.INTENTGUARD_GCS_STATE_BUCKET,
      testSa: process.env.INTENTGUARD_GCS_TEST_SERVICE_ACCOUNT,
    };
    process.env.INTENTGUARD_GCS_LIVE_TEST = "1";
    process.env.INTENTGUARD_GCS_TEST_BUCKET = "intentguard-gcs-test-bf77a013";
    process.env.INTENTGUARD_GCS_STATE_BUCKET =
      "intentguard-state-project-bf77a013-c0b3-413c-a75";
    process.env.INTENTGUARD_GCS_TEST_SERVICE_ACCOUNT = TEST_SA;

    try {
      await assert.rejects(
        () =>
          assertLiveGcsPreflight(process.env.INTENTGUARD_GCS_TEST_BUCKET, {
            readAdcFile: async () => ({
              path: "/mock/adc.json",
              json: impersonatedAdcJson(OTHER_SA),
            }),
            createGoogleAuth: async () => ({
              getClient: async () => mockImpersonatedClient(OTHER_SA),
              getCredentials: async () => ({ client_email: OTHER_SA }),
            }),
          }),
        (err: unknown) => {
          assert.ok(err instanceof GcsLivePreflightError);
          return /does not match INTENTGUARD_GCS_TEST_SERVICE_ACCOUNT/.test(
            (err as Error).message,
          );
        },
      );
    } finally {
      process.env.INTENTGUARD_GCS_LIVE_TEST = prev.live;
      process.env.INTENTGUARD_GCS_TEST_BUCKET = prev.testBucket;
      process.env.INTENTGUARD_GCS_STATE_BUCKET = prev.stateBucket;
      process.env.INTENTGUARD_GCS_TEST_SERVICE_ACCOUNT = prev.testSa;
    }
  });
});
