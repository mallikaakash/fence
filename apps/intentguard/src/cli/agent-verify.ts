#!/usr/bin/env node
/**
 * AI / agent integrator verification — OpenAPI, MCP, client, idempotency smoke.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOpenApiDocument } from "../server/openapi.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = join(root, "../..");

const required = [
  [join(repoRoot, "docs/AGENTS.md"), "AGENTS.md"],
  [join(root, "src/mcp/server.ts"), "MCP server"],
  [join(root, "src/client/gateway.ts"), "gateway client"],
  [join(root, "examples/agent-propose.mjs"), "agent-propose example"],
  [join(root, "src/server/openapi.ts"), "openapi"],
  [join(root, "src/agent/api-envelope.ts"), "api envelope"],
];

for (const [p, label] of required) {
  assert.ok(existsSync(p), `missing agent artifact: ${label}`);
}

const doc = buildOpenApiDocument() as {
  components: { schemas: Record<string, unknown> };
  paths: Record<string, unknown>;
};
assert.ok(doc.components.schemas.ProposeResponse);
assert.ok(doc.components.schemas.ExecuteResponse);
assert.ok(doc.paths["/v1/propose"]);
assert.ok(doc.paths["/v1/execute"]);

const mcp = readFileSync(join(root, "src/mcp/server.ts"), "utf8");
assert.match(mcp, /intentguard_gateway_propose/);
assert.match(mcp, /intentguard_gateway_health/);
assert.match(mcp, /intentguard_propose/);

const client = readFileSync(join(root, "src/client/gateway.ts"), "utf8");
assert.match(client, /idempotencyKey/i);

const agents = readFileSync(join(repoRoot, "docs/AGENTS.md"), "utf8");
assert.match(agents, /policy_check/);
assert.match(agents, /Idempotency-Key/i);
assert.match(agents, /INTENTGUARD_WEBHOOK_URL/);

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};
assert.ok(pkg.scripts["agent:verify"]);

console.log("OK agent-verify: OpenAPI schemas, MCP gateway tools, client idempotency, AGENTS.md");
