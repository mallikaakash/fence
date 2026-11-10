import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { enforceHostedAuthzPolicy } from "./authzConfig.ts";

const env = { ...process.env };

afterEach(() => {
  process.env = { ...env };
});

describe("authzConfig", () => {
  it("hosted rejects REQUIRE_ONCHAIN_GRANT=0 without bypass", () => {
    process.env.DOCKER = "1";
    delete process.env.INTENTGUARD_ALLOW_AUTHZ_BYPASS;
    assert.throws(() => enforceHostedAuthzPolicy(false), /forbidden/i);
  });

  it("local bypass allowed with explicit flag (non-hosted only)", () => {
    process.env.INTENTGUARD_ALLOW_AUTHZ_BYPASS = "1";
    delete process.env.DOCKER;
    delete process.env.NODE_ENV;
    delete process.env.INTENTGUARD_HOSTED;
    assert.doesNotThrow(() => enforceHostedAuthzPolicy(false));
  });

  it("hosted bypass flag always rejected", () => {
    process.env.DOCKER = "1";
    process.env.INTENTGUARD_ALLOW_AUTHZ_BYPASS = "1";
    assert.throws(() => enforceHostedAuthzPolicy(true), /bypass/i);
  });

  it("requireOnChainGrant true always passes", () => {
    process.env.DOCKER = "1";
    assert.doesNotThrow(() => enforceHostedAuthzPolicy(true));
  });
});
