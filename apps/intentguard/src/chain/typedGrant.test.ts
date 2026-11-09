import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MsgGrant } from "@injectivelabs/sdk-ts";
import { CreateDerivativeLimitOrderAuthz } from "@injectivelabs/core-proto-ts-v2/generated/injective/exchange/v1beta1/authz_pb.js";
import { TYPED_EXCHANGE_AUTHZ } from "../authz/types.ts";

describe("typed MsgGrant encoding", () => {
  it("packs CreateDerivativeLimitOrderAuthz into MsgGrant Any (direct-sign)", () => {
    const subaccountId =
      "0x1111111111111111111111111111111111111111000000000000000000000001";
    const marketIds = [
      "0xdc70164d7120529c3cd84278c98df4151210c0447a65a2aab03459cf328de41e",
    ];
    const authorization = {
      typeUrl: TYPED_EXCHANGE_AUTHZ.CreateDerivativeLimitOrderAuthz,
      value: CreateDerivativeLimitOrderAuthz.toBinary(
        CreateDerivativeLimitOrderAuthz.create({ subaccountId, marketIds }),
      ),
    };
    const msg = MsgGrant.fromJSON({
      granter: "inj1cml96vmptgw99syqrrz8az79xer2pcgp0a885r",
      grantee: "inj1cml96vmptgw99syqrrz8az79xer2pcgp0a885r",
      authorization,
      expiration: Math.floor(Date.now() / 1000) + 3600,
    });
    const data = msg.toData() as {
      grant?: { authorization?: { typeUrl?: string } };
    };
    assert.equal(
      data.grant?.authorization?.typeUrl,
      TYPED_EXCHANGE_AUTHZ.CreateDerivativeLimitOrderAuthz,
    );
    assert.ok(msg.toBinary().length > 50);
    assert.doesNotMatch(
      data.grant?.authorization?.typeUrl ?? "",
      /GenericAuthorization/,
    );
  });
});
