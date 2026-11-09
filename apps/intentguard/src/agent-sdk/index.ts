/**
 * Minimal agent SDK — agt_ token + HTTP only (no grantee/owner keys).
 *
 *   import { createGatewayClient } from "../agent-sdk/index.ts";
 */
export { createGatewayClient, type GatewayClientOptions } from "../client/gateway.ts";
export type { TradeIntent, IntentGuardPolicy } from "../policy/types.ts";

/** Injective testnet INJ perp — same default as Protect / spike demos. */
export const DEFAULT_INJ_PERP_MARKET_ID =
  "0xdc70164d7120529c3cd84278c98df4151210c0447a65a2aab03459cf328de41e";
