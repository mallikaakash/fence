export type GatewayHealthJson = {
  ok?: boolean;
  version?: string;
  network?: "testnet" | "mainnet";
  executeEnabled?: boolean;
  encryptionAtRest?: boolean;
  sessions?: number;
};
