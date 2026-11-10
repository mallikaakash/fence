import type { GatewaySession } from "../gateway/session.ts";
import type { IntentGuardGateway } from "../gateway/session.ts";

export type SessionBroadcastGateFailure = {
  ok: false;
  code:
    | "session_revoked"
    | "grantee_key_missing"
    | "agent_token_expired"
    | "policy_expired";
  message: string;
};

export type SessionBroadcastGateSuccess = { ok: true };

export function assertSessionExecutableForBroadcast(
  gateway: IntentGuardGateway,
  agentApiToken: string,
  nowMs: number = Date.now(),
): SessionBroadcastGateSuccess | SessionBroadcastGateFailure {
  const session = gateway.getSessionForAgent(agentApiToken);
  if (!session) {
    return { ok: false, code: "session_revoked", message: "unknown agent token" };
  }
  return assertSessionRecordExecutableForBroadcast(session, nowMs);
}

export function assertSessionRecordExecutableForBroadcast(
  session: GatewaySession,
  nowMs: number = Date.now(),
): SessionBroadcastGateSuccess | SessionBroadcastGateFailure {
  if (session.revoked || !session.granteePrivateKeyHex) {
    return {
      ok: false,
      code: "session_revoked",
      message: "session revoked or grantee key cleared",
    };
  }
  if (
    session.agentTokenExpiresAt &&
    nowMs >= Date.parse(session.agentTokenExpiresAt)
  ) {
    return {
      ok: false,
      code: "agent_token_expired",
      message: "agent token expired — create a new session",
    };
  }
  if (session.policy.expiresAt && nowMs >= Date.parse(session.policy.expiresAt)) {
    return {
      ok: false,
      code: "policy_expired",
      message: "session policy expired",
    };
  }
  return { ok: true };
}
