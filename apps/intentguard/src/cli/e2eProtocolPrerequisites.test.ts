import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatBlockedGrantMessage,
  isMissingTestnetAuthzGrants,
} from "./e2eProtocolPrerequisites.ts";
import type { SessionGrantStatus } from "../authz/verifySessionGrant.ts";

function baseStatus(overrides: Partial<SessionGrantStatus> = {}): SessionGrantStatus {
  return {
    granter: "inj1owner",
    grantee: "inj1grantee",
    network: "testnet",
    ready: false,
    limitReady: false,
    cancelReady: false,
    scopeMatch: false,
    matchingGrants: 0,
    issues: [],
    userFacingIssues: [],
    endpoint: "https://lcd.example",
    grantsSummary: [],
    onChainLimitScopes: [],
    ...overrides,
  };
}

describe("e2eProtocolPrerequisites", () => {
  it("detects missing grants from granter", () => {
    const status = baseStatus({
      issues: [
        "no AuthZ grants from inj1owner to grantee inj1grantee — sign MsgGrant",
        "missing place-order wallet permission",
        "missing cancel-order wallet permission",
      ],
    });
    assert.equal(isMissingTestnetAuthzGrants(status), true);
    assert.match(formatBlockedGrantMessage(status), /BLOCKED: testnet AuthZ grants missing/);
  });

  it("does not treat scope mismatch with grants as missing prerequisite", () => {
    const status = baseStatus({
      matchingGrants: 1,
      grantsSummary: [{ authorizationType: "CreateDerivativeLimitOrderAuthz" }],
      issues: ["policy market not covered by on-chain grant"],
      scopeMatch: false,
    });
    assert.equal(isMissingTestnetAuthzGrants(status), false);
  });

  it("detects generic grants without typed limit", () => {
    const status = baseStatus({
      grantsSummary: [{ authorizationType: "/cosmos.authz.v1beta1.GenericAuthorization" }],
      issues: [
        "grants exist for grantee but no CreateDerivativeLimitOrderAuthz — use typed grant plan",
      ],
    });
    assert.equal(isMissingTestnetAuthzGrants(status), true);
  });
});
