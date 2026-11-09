import { getEthereumAddress, PrivateKey, getSubaccountId } from "@injectivelabs/sdk-ts";
import type { IntentGuardGateway } from "../gateway/session.ts";
import { verifySessionGrantOnChain } from "../authz/verifySessionGrant.ts";
import type { TradeIntent } from "../policy/types.ts";
import { IsolatedGranteeSigner } from "../gateway/signer.ts";
import { proposeAndExecLimitOrder } from "../chain/liveExec.ts";
import { TRADING_SUBACCOUNT_INDEX } from "../chain/keys.ts";
import type { SpikeWallet } from "../chain/keys.ts";
import { maybeDispatchWebhook } from "./webhooks.ts";

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

function resolveOwnerWallet(
  session: {
    ownerInjectiveAddress?: string;
    subaccountId?: string;
    subaccountIndex?: number;
  },
  subaccountId: string,
  subIndex: number,
  ownerPrivateKeyHex?: string | null,
): SpikeWallet | { error: string } {
  if (session.ownerInjectiveAddress && session.subaccountId) {
    if (ownerPrivateKeyHex) {
      const fromKey = walletFromHex(
        "owner",
        ownerPrivateKeyHex,
        subaccountId,
        subIndex,
      );
      if (fromKey.injectiveAddress !== session.ownerInjectiveAddress) {
        return { error: "configured owner key does not match session owner address" };
      }
      return fromKey;
    }
    let ethereumAddress = "";
    try {
      ethereumAddress = getEthereumAddress(session.ownerInjectiveAddress);
    } catch {
      ethereumAddress = "";
    }
    return {
      role: "owner",
      injectiveAddress: session.ownerInjectiveAddress,
      ethereumAddress,
      subaccountId: session.subaccountId,
      subaccountIndex: subIndex,
      privateKeyHex: "",
    };
  }
  if (!ownerPrivateKeyHex) {
    return { error: "session missing ownerInjectiveAddress — create session with Keplr owner" };
  }
  return walletFromHex("owner", ownerPrivateKeyHex, subaccountId, subIndex);
}

export async function executeAgentIntent(params: {
  gateway: IntentGuardGateway;
  agentApiToken: string;
  intent: TradeIntent;
  ownerPrivateKeyHex?: string | null;
  requireOnChainGrant?: boolean;
  network?: "testnet" | "mainnet";
}): Promise<
  Awaited<ReturnType<typeof proposeAndExecLimitOrder>> & {
    sessionId?: string;
    phase?: "chain_broadcast";
  }
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
  const subaccountId =
    session.subaccountId ??
    (session.ownerInjectiveAddress
      ? getSubaccountId(session.ownerInjectiveAddress, subIndex)
      : params.ownerPrivateKeyHex
        ? getSubaccountId(
            walletFromHex("owner", params.ownerPrivateKeyHex, "0x0", subIndex)
              .injectiveAddress,
            subIndex,
          )
        : "0x0");

  const ownerResolved = resolveOwnerWallet(
    session,
    subaccountId,
    subIndex,
    params.ownerPrivateKeyHex,
  );
  if ("error" in ownerResolved) {
    return {
      status: "denied",
      stage: "approval",
      reasons: [ownerResolved.error],
      signed: false,
      broadcast: false,
    };
  }
  const owner = ownerResolved;

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

  if (params.requireOnChainGrant !== false) {
    const grantStatus = await verifySessionGrantOnChain({
      session,
      network: params.network ?? "testnet",
    });
    if (!grantStatus.ready) {
      return {
        status: "denied",
        stage: "policy",
        reasons: [
          "on-chain typed grant missing or invalid",
          ...grantStatus.issues,
        ],
        signed: false,
        broadcast: false,
        sessionId: session.sessionId,
        grantStatus,
      } as Awaited<ReturnType<typeof proposeAndExecLimitOrder>> & {
        sessionId: string;
        grantStatus: typeof grantStatus;
      };
    }
  }

  const signer = new IsolatedGranteeSigner({
    granteeAddress: session.granteeAddress,
    privateKeyHex: session.granteePrivateKeyHex,
  });

  params.gateway.touchSessionBudget(session);

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

  maybeDispatchWebhook(
    params.gateway.audit.append(
      result.status === "allowed" ? "execute_allowed" : "execute_denied",
      result.reasons.join("; ") || result.stage,
      {
        sessionId: session.sessionId,
        intent: params.intent,
        broadcast: "broadcast" in result ? result.broadcast : false,
        txHash: "txHash" in result ? result.txHash : undefined,
      },
    ),
  );

  return {
    ...result,
    sessionId: session.sessionId,
    phase: "chain_broadcast" as const,
  };
}
