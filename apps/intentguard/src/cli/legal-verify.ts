#!/usr/bin/env node
/**
 * Legal / risk disclosure checks — static artifacts, no legal review automation.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = join(root, "../..");
const web = join(root, "web/src");

const required = [
  [join(repoRoot, "docs/LIMITATIONS.md"), "LIMITATIONS.md"],
  [join(repoRoot, "docs/THREAT-MODEL.md"), "THREAT-MODEL.md"],
  [join(web, "components/intentguard/risk-disclosure.tsx"), "risk-disclosure"],
  [join(web, "app/limitations/page.tsx"), "web /limitations"],
];

for (const [p, label] of required) {
  assert.ok(existsSync(p), `missing legal/risk artifact: ${label}`);
}

const limitations = readFileSync(join(repoRoot, "docs/LIMITATIONS.md"), "utf8");
assert.match(limitations, /Sidecar integrity/i);
assert.match(limitations, /not legal advice/i);
assert.match(limitations, /escape mandate|cannot escape/i);
assert.match(limitations, /legal:verify/);

const home = readFileSync(join(web, "app/page.tsx"), "utf8");
assert.doesNotMatch(home, /escaping their mandate/i);
assert.match(home, /RiskDisclosure|limitations/i);

const pricing = readFileSync(join(repoRoot, "docs/PRICING.md"), "utf8");
assert.match(pricing, /LIMITATIONS\.md/);

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};
assert.ok(pkg.scripts["legal:verify"]);

console.log("OK legal-verify: LIMITATIONS.md, site disclosure, toned marketing copy");
