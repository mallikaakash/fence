import type { SessionGrantContext } from "./grant-plan-validation.ts";

/** Map gateway `GET /v1/sessions/:id` JSON to GrantApprovalPanel session context. */
export function sessionFromGatewayPublicView(raw: {
  sessionId: string;
  granteeAddress: string;
  ownerInjectiveAddress?: string;
  subaccountId?: string;
  revoked?: boolean;
  policy?: SessionGrantContext["policy"];
}): SessionGrantContext | null {
  if (
    !raw.ownerInjectiveAddress?.startsWith("inj1") ||
    !raw.subaccountId ||
    !raw.policy?.marketIds?.length
  ) {
    return null;
  }
  return {
    sessionId: raw.sessionId,
    ownerInjectiveAddress: raw.ownerInjectiveAddress,
    granteeAddress: raw.granteeAddress,
    subaccountId: raw.subaccountId,
    policy: raw.policy,
    revoked: raw.revoked,
  };
}
