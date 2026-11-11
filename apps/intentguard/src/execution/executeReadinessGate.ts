import type { GatewaySession } from "../gateway/session.ts";
import { assessSessionReadiness } from "../readiness/assessSessionReadiness.ts";
import type { SessionReadinessResponse } from "../readiness/types.ts";

export type ExecuteReadinessGateResult =
  | { ok: true }
  | {
      ok: false;
      errorCode: "execute_readiness_not_ready" | "execute_readiness_unavailable";
      message: string;
      overallStatus: SessionReadinessResponse["overallStatus"];
      blockers: string[];
    };

export async function assertExecuteReadinessForBroadcast(params: {
  session: GatewaySession;
  network: "testnet" | "mainnet";
  marketId: string;
  assess?: typeof assessSessionReadiness;
}): Promise<ExecuteReadinessGateResult> {
  const assess = params.assess ?? assessSessionReadiness;
  const readiness = await assess({
    session: params.session,
    network: params.network,
    marketId: params.marketId,
    executeEnabled: true,
  });

  if (readiness.overallStatus === "ready") {
    return { ok: true };
  }

  const blockers: string[] = [];
  for (const [key, check] of Object.entries(readiness.checks)) {
    if (check.status !== "ready") {
      blockers.push(`${key}: ${check.summary}`);
    }
  }

  if (readiness.overallStatus === "unavailable") {
    return {
      ok: false,
      errorCode: "execute_readiness_unavailable",
      message:
        "Execute pre-flight could not be verified — retry when network queries succeed.",
      overallStatus: readiness.overallStatus,
      blockers,
    };
  }

  return {
    ok: false,
    errorCode: "execute_readiness_not_ready",
    message:
      blockers[0] ??
      "Trading setup is not ready for execute — resolve readiness blockers.",
    overallStatus: readiness.overallStatus,
    blockers,
  };
}
