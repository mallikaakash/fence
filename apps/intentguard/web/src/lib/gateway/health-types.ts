export type GatewayHealthJson = {
  ok?: boolean;
  version?: string;
  network?: "testnet" | "mainnet";
  executeEnabled?: boolean;
  requireOnChainGrant?: boolean;
  requireExecuteReadiness?: boolean;
  /** Per-revision maintenance guard (deploy may lag until image refresh). */
  executionMaintenance?: boolean;
  stateWriteFreeze?: boolean;
  encryptionAtRest?: boolean;
  sessions?: number;
};
