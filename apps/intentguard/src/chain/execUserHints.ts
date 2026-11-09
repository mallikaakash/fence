export type ExecErrorCode =
  | "grantee_gas"
  | "subaccount_margin"
  | "authz"
  | "sequence"
  | "unknown";

export function humanizeBroadcastError(message: string): {
  code: ExecErrorCode;
  hint: string;
} {
  const m = message.toLowerCase();
  if (
    m.includes("insufficient funds") ||
    m.includes("insufficient fee") ||
    m.includes("not enough fee") ||
    m.includes("out of gas") ||
    m.includes("no gas")
  ) {
    return {
      code: "grantee_gas",
      hint:
        "The assistant wallet needs INJ for gas — on Protect, use “Send assistant gas” (~0.2 INJ from Keplr).",
    };
  }
  if (
    m.includes("margin") ||
    m.includes("insufficient deposit") ||
    m.includes("available balance") ||
    m.includes("insufficient funds for order")
  ) {
    return {
      code: "subaccount_margin",
      hint:
        "Deposit USDT margin on Helix testnet (same wallet / subaccount) before placing live orders.",
    };
  }
  if (
    m.includes("unauthorized") ||
    m.includes("authz") ||
    m.includes("does not have permission") ||
    m.includes("invalid grant")
  ) {
    return {
      code: "authz",
      hint:
        "On-chain typed grant missing or expired — finish Keplr approve on Protect or revoke and start again.",
    };
  }
  if (m.includes("account sequence") || m.includes("wrong sequence")) {
    return {
      code: "sequence",
      hint: "Wait a few seconds and retry; another transaction may still be confirming.",
    };
  }
  return {
    code: "unknown",
    hint: "Try a smaller margin on Helix first, or check Evidence (/history) for the raw chain error.",
  };
}
