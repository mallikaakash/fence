#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateGatewayDeployScripts } from "../deploy/gatewayDeployValidate.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../../");
const issues = validateGatewayDeployScripts(root);
const errors = issues.filter((i) => i.severity === "error");
const warns = issues.filter((i) => i.severity === "warn");

for (const w of warns) {
  console.warn(`WARN ${w.file}: ${w.message}`);
}
for (const e of errors) {
  console.error(`FAIL ${e.file}: ${e.message}`);
}

if (errors.length > 0) {
  process.exit(1);
}
console.log("OK gateway deploy script validation");
process.exit(0);
