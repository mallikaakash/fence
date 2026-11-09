import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSubaccountId } from "@injectivelabs/sdk-ts";
import { verifySessionGrantOnChain } from "./verifySessionGrant.ts";
import { TRADING_SUBACCOUNT_INDEX } from "../chain/keys.ts";

const SPIKE_MARKET =
  "0xdc70164d7120529c3cd84278c98df4151210c0447a65a2aab03459cf328de41e";
const GRANTER = "inj1yrvztj7g3x3009uhm03hgsp3fru6e4mdv7jpkz";
const GRANTEE = "inj1cu9mv984p30etesxfrgwp3ve37mf5p8uhwrh9y";

describe("verifySessionGrantOnChain (live testnet LCD)", () => {
  it("ready when spike granter/grantee/markets match", async () => {
    const subaccountId = getSubaccountId(GRANTER, TRADING_SUBACCOUNT_INDEX);
    const status = await verifySessionGrantOnChain({
      network: "testnet",
      session: {
        ownerInjectiveAddress: GRANTER,
        granteeAddress: GRANTEE,
        revoked: false,
        subaccountId,
        policy: {
          version: 1,
          marketIds: [SPIKE_MARKET],
          maxMarginPerOrder: "100",
          maxLeverage: 5,
          dailyMarginBudget: "500",
        },
      },
    });
    assert.equal(status.scopeMatch, true, status.issues.join("; "));
    assert.ok(status.onChainLimitScopes.length > 0);
    if (!status.ready) {
      assert.ok(
        status.issues.some((i) => /expired/i.test(i)),
        `expected ready or expired grant, got: ${status.issues.join("; ")}`,
      );
    }
  });
});
