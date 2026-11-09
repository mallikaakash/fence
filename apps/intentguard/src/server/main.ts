#!/usr/bin/env node
/**
 * IntentGuard sidecar gateway — production-shaped HTTP API.
 *
 *   npm run gateway
 *
 * Owner key: INTENTGUARD_OWNER_API_KEY or `.intentguard/config.json` (gitignored).
 */
import { startGatewayServer } from "./http.ts";

const { shutdown } = startGatewayServer();

function onSignal(sig: string) {
  void shutdown()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
  console.error(`[intentguard] ${sig} received — draining`);
}

process.on("SIGTERM", () => onSignal("SIGTERM"));
process.on("SIGINT", () => onSignal("SIGINT"));
