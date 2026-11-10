import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import {
  enforceHostedAuthzPolicy,
  shouldVerifyAuthzAtExecute,
  assertHostedExecuteAuthzConfig,
  isHostedRuntime,
} from "./authzConfig.ts";

const snap = { ...process.env };

afterEach(() => {
  process.env = { ...snap };
});

describe("AuthZ hosted matrix", () => {
  it("hosted + AuthZ enabled + no bypass → startup ok", () => {
    process.env.DOCKER = "1";
    delete process.env.INTENTGUARD_ALLOW_AUTHZ_BYPASS;
    assert.doesNotThrow(() => enforceHostedAuthzPolicy(true));
    assert.equal(shouldVerifyAuthzAtExecute(true), true);
  });

  it("hosted + AuthZ disabled + no bypass → startup throws", () => {
    process.env.DOCKER = "1";
    delete process.env.INTENTGUARD_ALLOW_AUTHZ_BYPASS;
    assert.throws(() => enforceHostedAuthzPolicy(false), /forbidden/i);
  });

  it("hosted + AuthZ enabled + bypass flag → startup throws", () => {
    process.env.DOCKER = "1";
    process.env.INTENTGUARD_ALLOW_AUTHZ_BYPASS = "1";
    assert.throws(() => enforceHostedAuthzPolicy(true), /bypass/i);
  });

  it("hosted + AuthZ disabled + bypass flag → startup throws", () => {
    process.env.DOCKER = "1";
    process.env.INTENTGUARD_ALLOW_AUTHZ_BYPASS = "1";
    assert.throws(() => enforceHostedAuthzPolicy(false), /bypass/i);
  });

  it("local + AuthZ disabled + explicit bypass → startup ok", () => {
    delete process.env.DOCKER;
    delete process.env.NODE_ENV;
    delete process.env.INTENTGUARD_HOSTED;
    process.env.INTENTGUARD_ALLOW_AUTHZ_BYPASS = "1";
    assert.ok(!isHostedRuntime());
    assert.doesNotThrow(() => enforceHostedAuthzPolicy(false));
    assert.equal(shouldVerifyAuthzAtExecute(false), false);
  });

  it("missing bypass + local + grants off → ok", () => {
    delete process.env.DOCKER;
    delete process.env.INTENTGUARD_ALLOW_AUTHZ_BYPASS;
    assert.doesNotThrow(() => enforceHostedAuthzPolicy(false));
  });

  it("malformed REQUIRE_ONCHAIN_GRANT treats non-0 as required", () => {
    process.env.INTENTGUARD_REQUIRE_ONCHAIN_GRANT = "banana";
    const required = process.env.INTENTGUARD_REQUIRE_ONCHAIN_GRANT !== "0";
    assert.equal(required, true);
  });
});
