#!/usr/bin/env node
/**
 * Product / GTM file & route sanity checks (no network except optional smoke skip).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = join(root, "../..");

const required = [
  [join(repoRoot, "docs/GETTING-STARTED.md"), "GETTING-STARTED"],
  [join(repoRoot, "docs/PRICING.md"), "PRICING"],
  [join(root, "web/src/app/start/page.tsx"), "web /start"],
  [join(root, "web/src/app/api/gateway/[...path]/route.ts"), "Vercel gateway proxy"],
  [join(root, "web/src/components/intentguard/onboarding-checklist.tsx"), "onboarding checklist"],
  [join(root, "web/src/components/intentguard/policy-simulator.tsx"), "policy simulator"],
  [join(root, "web/src/components/layout/app-shell.tsx"), "app shell"],
];

for (const [path, label] of required) {
  assert.ok(existsSync(path), `missing GTM artifact: ${label} (${path})`);
}

const checklist = readFileSync(
  join(root, "web/src/components/intentguard/onboarding-checklist.tsx"),
  "utf8",
);
assert.match(checklist, /gtm:verify/);
assert.match(checklist, /\/portfolio/);

const startPage = readFileSync(join(root, "web/src/app/start/page.tsx"), "utf8");
assert.match(startPage, /OnboardingChecklist/);

const shell = readFileSync(join(root, "web/src/components/layout/app-shell.tsx"), "utf8");
assert.match(shell, /href="\/start"/);

const simulator = readFileSync(
  join(root, "web/src/components/intentguard/policy-simulator.tsx"),
  "utf8",
);
assert.match(simulator, /useSidecar/);
assert.match(simulator, /gatewayPropose/);

const gettingStarted = readFileSync(join(repoRoot, "docs/GETTING-STARTED.md"), "utf8");
assert.match(gettingStarted, /Grant Auditor|portfolio/i);
assert.match(gettingStarted, /npm run gateway/);

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};
assert.ok(pkg.scripts["gtm:verify"], "package.json must define gtm:verify");

const srePath = join(repoRoot, "docs/SRE.md");
assert.ok(existsSync(srePath), "missing SRE.md");
const pkgScripts = pkg.scripts;
assert.ok(pkgScripts["platform:verify"], "package.json must define platform:verify");
assert.ok(pkgScripts["ux:verify"], "package.json must define ux:verify");
assert.ok(existsSync(join(repoRoot, "docs/UX.md")), "missing UX.md");
assert.ok(existsSync(join(repoRoot, "docs/AGENTS.md")), "missing AGENTS.md");
assert.ok(pkgScripts["agent:verify"], "package.json must define agent:verify");

console.log("OK gtm-verify:", required.length, "artifacts + nav/simulator/onboarding strings");
