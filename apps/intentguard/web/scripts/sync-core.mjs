import { cpSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = join(root, "..", "src");
const dest = join(root, "src", "lib", "intentguard");

const pairs = [
  ["policy/types.ts", "policy-types.ts"],
  ["policy/evaluate.ts", "evaluate.ts"],
  ["authz/types.ts", "authz-types.ts"],
  ["authz/fetchGrants.ts", "fetchGrants.ts"],
  ["authz/score.ts", "score.ts"],
  ["authz/formatAudit.ts", "formatAudit.ts"],
];
for (const [from, to] of pairs) {
  cpSync(join(srcRoot, from), join(dest, to), { force: true });
}
console.log("Run sed on evaluate/score/formatAudit imports if needed.");
console.log("Synced", readdirSync(dest).filter((f) => f.endsWith(".ts")).join(", "));
