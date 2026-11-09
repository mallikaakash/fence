#!/usr/bin/env node
/**
 * Frontend / UX artifact checks (static + web build invoked separately in CI).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = join(root, "../..");
const web = join(root, "web/src");

const required: [string, string][] = [
  [join(repoRoot, "docs/UX.md"), "UX.md"],
  [join(web, "components/intentguard/gateway-ux.tsx"), "gateway-ux"],
  [join(web, "lib/gateway/storage.ts"), "gateway storage"],
  [join(web, "components/intentguard/owner-console.tsx"), "owner console"],
  [join(web, "components/layout/app-shell.tsx"), "app shell"],
];

for (const [path, label] of required) {
  assert.ok(existsSync(path), `missing UX artifact: ${label}`);
}

const storage = readFileSync(join(web, "lib/gateway/storage.ts"), "utf8");
assert.match(storage, /clearGatewaySettings/);
assert.match(storage, /gatewaySecretsStale/);

const ux = readFileSync(join(web, "components/intentguard/gateway-ux.tsx"), "utf8");
assert.match(ux, /GatewayConnectionWarnings/);
assert.match(ux, /GatewaySecretsPanel/);
assert.match(ux, /GatewayNetworkChip/);
assert.match(ux, /EnvironmentRibbon/);

const consoleSrc = readFileSync(join(web, "components/intentguard/owner-console.tsx"), "utf8");
assert.match(consoleSrc, /GatewaySecretsPanel/);
assert.match(consoleSrc, /GatewayNetworkChip/);
assert.match(consoleSrc, /GrantTxPlanPanel/);

const shell = readFileSync(join(web, "components/layout/app-shell.tsx"), "utf8");
assert.match(shell, /EnvironmentRibbon/);

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};
assert.ok(pkg.scripts["ux:verify"], "package.json must define ux:verify");

const uxDoc = readFileSync(join(repoRoot, "docs/UX.md"), "utf8");
assert.match(uxDoc, /ux:verify/);
assert.match(uxDoc, /localStorage/i);

console.log("OK ux-verify:", required.length, "UX artifacts + console/shell wiring");
