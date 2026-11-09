#!/usr/bin/env node
/**
 * AppSec verification — run in CI or before release.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { startGatewayServer } from "../server/http.ts";
import { safeEqual } from "../server/auth.ts";

assert.equal(safeEqual("abc", "abc"), true);
assert.equal(safeEqual("abc", "abd"), false);

const dataDir = mkdtempSync(join(tmpdir(), "ig-sec-verify-"));
process.env.INTENTGUARD_DATA_DIR = dataDir;
process.env.INTENTGUARD_OWNER_API_KEY = "own_verify_key_000000000000";
process.env.INTENTGUARD_DATA_KEY = randomBytes(32).toString("hex");
process.env.INTENTGUARD_PORT = "0";
process.env.INTENTGUARD_BIND = "127.0.0.1";

const { server, config } = startGatewayServer();
await new Promise<void>((r) => server.once("listening", () => r()));
const addr = server.address();
assert.ok(addr && typeof addr === "object");
const base = `http://127.0.0.1:${addr.port}`;

const health = await fetch(`${base}/health`);
const h = (await health.json()) as { encryptionAtRest: boolean };
assert.equal(h.encryptionAtRest, true);

const noAuth = await fetch(`${base}/v1/grants/plan`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
});
assert.equal(noAuth.status, 401);

const cors = await fetch(`${base}/health`, {
  headers: { origin: "https://evil.example" },
});
assert.equal(cors.headers.get("access-control-allow-origin"), null);

const corsOk = await fetch(`${base}/health`, {
  headers: { origin: "http://127.0.0.1:3001" },
});
assert.equal(corsOk.headers.get("access-control-allow-origin"), "http://127.0.0.1:3001");

console.log("OK security-verify: encryption, auth, CORS allowlist");

server.close();
rmSync(dataDir, { recursive: true, force: true });
