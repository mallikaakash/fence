import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export type GatewayConfig = {
  port: number;
  dataDir: string;
  ownerApiKey: string;
  /** When true, POST /v1/execute may broadcast MsgExec (testnet/mainnet per network env). */
  executeEnabled: boolean;
  /** Granter private key for MsgExec — sidecar only, never sent to agents. */
  ownerPrivateKeyHex: string | null;
};

function defaultDataDir(): string {
  return process.env.INTENTGUARD_DATA_DIR ?? join(process.cwd(), ".intentguard");
}

export function loadConfig(): GatewayConfig {
  const dataDir = defaultDataDir();
  mkdirSync(dataDir, { recursive: true });

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
    );
    console.error(
      `[intentguard] Generated owner API key — set INTENTGUARD_OWNER_API_KEY or see ${configPath}`,
    );
  }

  const port = Number(process.env.PORT ?? process.env.INTENTGUARD_PORT ?? 8787);

  const executeEnabled =
    process.env.INTENTGUARD_EXECUTE === "1" ||
    process.env.INTENTGUARD_EXECUTE === "true";

  let ownerPrivateKeyHex: string | null =
    process.env.INTENTGUARD_OWNER_PRIVATE_KEY_HEX?.replace(/^0x/, "") ?? null;

  if (!ownerPrivateKeyHex && executeEnabled) {
    const ownerKeyPath = join(dataDir, "owner-private-key.hex");
    if (existsSync(ownerKeyPath)) {
      ownerPrivateKeyHex = readFileSync(ownerKeyPath, "utf8").trim().replace(/^0x/, "");
    }
  }

  return { port, dataDir, ownerApiKey, executeEnabled, ownerPrivateKeyHex };
}
