#!/usr/bin/env node
/**
 * Aggregates release + production readiness scripts (exit non-zero on failure).
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const steps = [
  "check",
  "test",
  "product:smoke",
  "security:verify",
  "e2e:protocol",
  "platform:verify",
  "agent:verify",
  "legal:verify",
];

for (const script of steps) {
  console.log("\n—— production:verify →", script, "——");
  const r = spawnSync("npm", ["run", script], {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  if (r.status !== 0) {
    console.error("FAIL:", script);
    process.exit(r.status ?? 1);
  }
}

const webBuild = spawnSync("npm", ["run", "web:build"], {
  cwd: root,
  stdio: "inherit",
});
if (webBuild.status !== 0) {
  process.exit(webBuild.status ?? 1);
}

console.log("\nOK production:verify — all steps passed");
