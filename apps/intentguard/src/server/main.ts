#!/usr/bin/env node
/**
 * IntentGuard sidecar gateway — production-shaped HTTP API.
 *
 *   npm run gateway
 *
 * Owner key: INTENTGUARD_OWNER_API_KEY or `.intentguard/config.json` (gitignored).
 */
import { startGatewayServer } from "./http.ts";

startGatewayServer();
