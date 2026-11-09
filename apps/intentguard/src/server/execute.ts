import { PrivateKey, getSubaccountId } from "@injectivelabs/sdk-ts";
import type { IntentGuardGateway } from "../gateway/session.ts";
import type { TradeIntent } from "../policy/types.ts";
import { IsolatedGranteeSigner } from "../gateway/signer.ts";
import { proposeAndExecLimitOrder } from "../chain/liveExec.ts";
import { TRADING_SUBACCOUNT_INDEX } from "../chain/keys.ts";
import type { SpikeWallet } from "../chain/keys.ts";

function walletFromHex(
  role: "owner" | "grantee",
  privateKeyHex: string,
  subaccountId: string,
  subaccountIndex: number,
): SpikeWallet {
  const hex = privateKeyHex.replace(/^0x/, "");
  const pk = PrivateKey.fromHex(hex);
  return {
    role,
    injectiveAddress: pk.toBech32(),
    ethereumAddress: pk.toHex(),
    subaccountId,
    subaccountIndex,
    privateKeyHex: hex,
  };
}

export async function executeAgentIntent(params: {
  gateway: IntentGuardGateway;
  agentApiToken: string;
  intent: TradeIntent;
  ownerPrivateKeyHex: string;
}): Promise<
  Awaited<ReturnType<typeof proposeAndExecLimitOrder>> & { sessionId?: string }
> {
  const session = params.gateway.getSessionForAgent(params.agentApiToken);
  if (!session) {
    return {
      status: "denied",
      stage: "policy",
      reasons: ["unknown agent token"],
      signed: false,
      broadcast: false,
    };
  }

  if (session.revoked || !session.granteePrivateKeyHex) {
    return {
      status: "denied",
      stage: "policy",
      reasons: ["session revoked or grantee key cleared"],
      signed: false,
      broadcast: false,
    };
  }

  const subIndex = session.subaccountIndex ?? TRADING_SUBACCOUNT_INDEX;
  const ownerAddr =
    session.ownerInjectiveAddress ??
    walletFromHex(
      "owner",
      params.ownerPrivateKeyHex,
      "0x0",
      subIndex,
    ).injectiveAddress;
  const subaccountId =
    session.subaccountId ?? getSubaccountId(ownerAddr, subIndex);

  const owner = walletFromHex(
    "owner",
    params.ownerPrivateKeyHex,
    subaccountId,
    subIndex,
  );
  if (session.ownerInjectiveAddress && owner.injectiveAddress !== session.ownerInjectiveAddress) {
    return {
      status: "denied",
      stage: "approval",
      reasons: ["configured owner key does not match session owner address"],
      signed: false,
      broadcast: false,
    };
  }

  const grantee = walletFromHex(
    "grantee",
    session.granteePrivateKeyHex,
    subaccountId,
    subIndex,
  );
  if (grantee.injectiveAddress !== session.granteeAddress) {
    return {
      status: "denied",
      stage: "approval",
      reasons: ["session grantee address mismatch (rotate session)"],
      signed: false,
      broadcast: false,
    };
  }

  const signer = new IsolatedGranteeSigner({
    granteeAddress: session.granteeAddress,
    privateKeyHex: session.granteePrivateKeyHex,
  });

  const result = await proposeAndExecLimitOrder({
    agent: { role: "agent", apiToken: params.agentApiToken },
    policy: session.policy,
    intent: params.intent,
    owner,
    grantee,
    signer,
    dailyMarginUsed: session.dailyMarginUsed,
  });

  if (result.status === "allowed" && result.broadcast && !params.intent.reduceOnly) {
    params.gateway.recordMarginUse(session.sessionId, params.intent.margin);
  }

  params.gateway.audit.append(
    result.status === "allowed" ? "execute_allowed" : "execute_denied",
    result.reasons.join("; ") || result.stage,
    {
      sessionId: session.sessionId,
      intent: params.intent,
      broadcast: "broadcast" in result ? result.broadcast : false,
      txHash: "txHash" in result ? result.txHash : undefined,
    },
  );

  return { ...result, sessionId: session.sessionId };
}
