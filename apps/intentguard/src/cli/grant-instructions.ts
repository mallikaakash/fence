#!/usr/bin/env node
/**
 * Print owner steps after POST /v1/sessions (from saved JSON file).
 *
 *   npm run grant:instructions -- path/to/session-create-response.json
 */
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: grant-instructions <session-create-response.json>");
  process.exit(1);
}

const data = JSON.parse(readFileSync(file, "utf8")) as {
  grantPlan?: {
    granteeAddress: string;
    subaccountId: string;
    typedGrants: Array<{ msgTypeUrl: string; authorizationTypeUrl: string }>;
    notes: string[];
  };
  agentApiToken?: string;
  session?: { sessionId: string; granteeAddress: string };
};

if (!data.grantPlan) {
  console.error("JSON missing grantPlan — save POST /v1/sessions response");
  process.exit(1);
}

const p = data.grantPlan;
console.log(`
IntentGuard — on-chain grant steps (Route A)

1. Granter signs MsgGrant(s) on Injective testnet for grantee:
   ${p.granteeAddress}

2. Subaccount scoped in grant:
   ${p.subaccountId}

3. Typed grants to construct (${p.typedGrants.length}):
${p.typedGrants.map((t, i) => `   ${i + 1}. ${t.authorizationTypeUrl}`).join("\n")}

4. After broadcast, verify:
   curl -H "Authorization: Bearer $OWNER_KEY" \\
     http://127.0.0.1:8787/v1/sessions/${data.session?.sessionId ?? "SESSION_ID"}/grant-status

5. Fund grantee INJ (gas) and deposit margin to owner subaccount.

6. Agent token (runtime only):
   ${data.agentApiToken ?? "(from create response)"}

Spike helper (owner key in .spike/): npm run spike -- --prepare-only
See docs/E2E.md
`);
for (const n of p.notes) console.log(`• ${n}`);
