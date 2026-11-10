import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { parseDataKey } from "./crypto.ts";
import { enforceHostedAuthzPolicy } from "../execution/authzConfig.ts";
import { isExecutionMaintenanceEnabled } from "../execution/executionMaintenance.ts";
import { isStateWriteFreezeEnvEnabled } from "../persistence/stateWriteFreezeEnv.ts";

export type GatewayConfig = {
  port: number;
  /** Listen address — default loopback; set 0.0.0.0 in Docker. */
  bindHost: string;
  dataDir: string;
  ownerApiKey: string;
  /** When true, POST /v1/execute may broadcast MsgExec (testnet/mainnet per network env). */
  executeEnabled: boolean;
  /** When true, reject new executes (deploy/rollback guard). Default off. */
  executionMaintenance: boolean;
  /** When true, reject all persistent state mutations (deploy handoff). Default off. */
  stateWriteFreeze: boolean;
  requireWriterLease: boolean;
  /** Native GCS API state object (not FUSE). */
  gcsStateBucket: string | null;
  gcsStateObject: string | null;
  requireGcsState: boolean;
  stateBackend: "file" | "gcs";
  /** Granter private key for MsgExec — sidecar only, never sent to agents. */
  ownerPrivateKeyHex: string | null;
  network: "testnet" | "mainnet";
  /** When true, execute denies if typed AuthZ grant missing on-chain. */
  requireOnChainGrant: boolean;
  dataKey: Buffer | null;
  requireDataKey: boolean;
  corsOrigins: string[];
  maxBodyBytes: number;
  rateLimitPerMinute: number;
  /** Per `agt_` token — POST /v1/propose */
  agentProposeRateLimitPerMinute: number;
  /** Per `agt_` token — POST /v1/execute */
  agentExecuteRateLimitPerMinute: number;
  configPath: string;
};

function defaultDataDir(): string {
  return process.env.INTENTGUARD_DATA_DIR ?? join(process.cwd(), ".intentguard");
}

export function loadConfig(): GatewayConfig {
  const dataDir = defaultDataDir();
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });

  const configPath = join(dataDir, "config.json");
  let ownerApiKey = process.env.INTENTGUARD_OWNER_API_KEY;

  if (!ownerApiKey) {
    if (existsSync(configPath)) {
      const raw = JSON.parse(readFileSync(configPath, "utf8")) as {
        ownerApiKey?: string;
      };
      ownerApiKey = raw.ownerApiKey;
    }
  }

  if (!ownerApiKey) {
    ownerApiKey = `own_${randomBytes(24).toString("hex")}`;
    writeFileSync(
      configPath,
      JSON.stringify({ ownerApiKey, createdAt: new Date().toISOString() }, null, 2) + "\n",
      { mode: 0o600 },
    );
    console.error(
      `[intentguard] Generated owner API key — set INTENTGUARD_OWNER_API_KEY or see ${configPath}`,
    );
  }

  const port = Number(process.env.PORT ?? process.env.INTENTGUARD_PORT ?? 8787);
  const bindHost =
    process.env.INTENTGUARD_BIND ??
    (process.env.DOCKER === "1" ? "0.0.0.0" : "127.0.0.1");

  const executeEnabled =
    process.env.INTENTGUARD_EXECUTE === "1" ||
    process.env.INTENTGUARD_EXECUTE === "true";

  const executionMaintenance = isExecutionMaintenanceEnabled();
  const stateWriteFreeze = isStateWriteFreezeEnvEnabled();
  const requireWriterLease =
    process.env.INTENTGUARD_REQUIRE_WRITER_LEASE === "1" ||
    process.env.INTENTGUARD_REQUIRE_WRITER_LEASE === "true";

  const gcsStateBucket =
    process.env.INTENTGUARD_GCS_STATE_BUCKET ??
    process.env.INTENTGUARD_GCS_BUCKET ??
    null;
  const gcsStateObject =
    process.env.INTENTGUARD_GCS_STATE_OBJECT ?? "intentguard/state.json";
  const requireGcsState =
    process.env.INTENTGUARD_REQUIRE_GCS_STATE === "1" ||
    process.env.INTENTGUARD_REQUIRE_GCS_STATE === "true";
  const stateBackendRaw = process.env.INTENTGUARD_STATE_BACKEND?.toLowerCase();
  const stateBackend: "file" | "gcs" =
    stateBackendRaw === "gcs"
      ? "gcs"
      : stateBackendRaw === "file"
        ? "file"
        : requireGcsState || (process.env.DOCKER === "1" && gcsStateBucket)
          ? "gcs"
          : "file";

  let ownerPrivateKeyHex: string | null =
    process.env.INTENTGUARD_OWNER_PRIVATE_KEY_HEX?.replace(/^0x/, "") ?? null;

  if (!ownerPrivateKeyHex && executeEnabled) {
    const ownerKeyPath = join(dataDir, "owner-private-key.hex");
    if (existsSync(ownerKeyPath)) {
      ownerPrivateKeyHex = readFileSync(ownerKeyPath, "utf8").trim().replace(/^0x/, "");
    }
  }

  const network =
    process.env.INJECTIVE_NETWORK === "mainnet" ? "mainnet" : "testnet";

  const requireOnChainGrant = process.env.INTENTGUARD_REQUIRE_ONCHAIN_GRANT !== "0";
  enforceHostedAuthzPolicy(requireOnChainGrant);

  const dataKey = parseDataKey(process.env.INTENTGUARD_DATA_KEY);
  const requireDataKey =
    process.env.INTENTGUARD_REQUIRE_DATA_KEY === "1" ||
    process.env.INTENTGUARD_REQUIRE_DATA_KEY === "true";
  if (requireDataKey && !dataKey) {
    throw new Error(
      "INTENTGUARD_REQUIRE_DATA_KEY=1 but INTENTGUARD_DATA_KEY is missing",
    );
  }
  if (!dataKey && process.env.NODE_ENV === "production") {
    console.error(
      "[intentguard] WARNING: INTENTGUARD_DATA_KEY unset — grantee keys stored plaintext",
    );
  }

  const corsDefault = "http://127.0.0.1:3001,http://localhost:3001";
  const corsOrigins = (process.env.INTENTGUARD_CORS_ORIGINS ?? corsDefault)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const maxBodyBytes = Number(process.env.INTENTGUARD_MAX_BODY_BYTES ?? 65_536);
  const rateLimitPerMinute = Number(
    process.env.INTENTGUARD_RATE_LIMIT_PER_MIN ?? 120,
  );
  const agentProposeRateLimitPerMinute = Number(
    process.env.INTENTGUARD_AGENT_PROPOSE_PER_MIN ?? 90,
  );
  const agentExecuteRateLimitPerMinute = Number(
    process.env.INTENTGUARD_AGENT_EXECUTE_PER_MIN ?? 30,
  );

  return {
    port,
    bindHost,
    dataDir,
    ownerApiKey,
    executeEnabled,
    executionMaintenance,
    stateWriteFreeze,
    requireWriterLease,
    gcsStateBucket,
    gcsStateObject,
    requireGcsState,
    stateBackend,
    ownerPrivateKeyHex,
    network,
    requireOnChainGrant,
    dataKey,
    requireDataKey,
    corsOrigins,
    maxBodyBytes,
    rateLimitPerMinute,
    agentProposeRateLimitPerMinute,
    agentExecuteRateLimitPerMinute,
    configPath,
  };
}

export function rotateOwnerApiKey(configPath: string): string {
  const ownerApiKey = `own_${randomBytes(24).toString("hex")}`;
  writeFileSync(
    configPath,
    JSON.stringify(
      { ownerApiKey, rotatedAt: new Date().toISOString() },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  return ownerApiKey;
}
