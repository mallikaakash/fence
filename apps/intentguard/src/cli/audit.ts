#!/usr/bin/env node
/**
 * Read-only AuthZ grant auditor.
 *
 *   npm run audit -- inj1...
 *   npm run audit -- inj1... --mainnet
 */
import { fetchGranterGrants } from "../authz/fetchGrants.ts";
import { formatGrantAuditReport } from "../authz/formatAudit.ts";
import { scoreGrants } from "../authz/score.ts";

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const mainnet = process.argv.includes("--mainnet");
  const granter = args[0];
  if (!granter?.startsWith("inj1")) {
    console.error("Usage: npm run audit -- <inj1...> [--mainnet] [--pretty]");
    process.exit(2);
  }

  const fetched = await fetchGranterGrants({
    granter,
    network: mainnet ? "mainnet" : "testnet",
  });
  const report = scoreGrants(granter, fetched.grants);
  const pretty = process.argv.includes("--pretty");
  if (pretty) {
    console.log(formatGrantAuditReport(report));
    console.log(`\n(endpoint: ${fetched.endpoint})`);
  } else {
    console.log(JSON.stringify({ endpoint: fetched.endpoint, report }, null, 2));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
