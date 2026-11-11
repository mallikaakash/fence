import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GRANT_EXPIRY_MAX_SECONDS,
  GRANT_EXPIRY_MIN_SECONDS,
  resolveGrantExpirySeconds,
} from "./grantExpiry.ts";

describe("resolveGrantExpirySeconds", () => {
  it("requires explicit query when session has no stored expiry", () => {
    const r = resolveGrantExpirySeconds({
      queryExpirySeconds: null,
      sessionGrantExpirySeconds: undefined,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "grant_expiry_required");
  });

  it("accepts explicit query within bounds", () => {
    const r = resolveGrantExpirySeconds({
      queryExpirySeconds: 3600,
      sessionGrantExpirySeconds: undefined,
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.expirySeconds, 3600);
  });

  it("uses session stored expiry when query omitted", () => {
    const r = resolveGrantExpirySeconds({
      queryExpirySeconds: null,
      sessionGrantExpirySeconds: 86_400,
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.expirySeconds, 86_400);
  });

  it("rejects below minimum", () => {
    const r = resolveGrantExpirySeconds({
      queryExpirySeconds: GRANT_EXPIRY_MIN_SECONDS - 1,
      sessionGrantExpirySeconds: undefined,
    });
    assert.equal(r.ok, false);
  });

  it("rejects above maximum", () => {
    const r = resolveGrantExpirySeconds({
      queryExpirySeconds: GRANT_EXPIRY_MAX_SECONDS + 1,
      sessionGrantExpirySeconds: undefined,
    });
    assert.equal(r.ok, false);
  });

  it("query overrides session expiry", () => {
    const r = resolveGrantExpirySeconds({
      queryExpirySeconds: 7200,
      sessionGrantExpirySeconds: 86_400,
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.expirySeconds, 7200);
  });
});
