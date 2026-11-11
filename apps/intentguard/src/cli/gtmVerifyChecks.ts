import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Static GTM verifier — no network, no wallet. Cannot prove runtime UX or on-chain state. */

export type GtmVerifyPaths = {
  root: string;
  repoRoot: string;
};

export type GtmCheckResult = { name: string; ok: true } | { name: string; ok: false; detail: string };

function readUtf8(base: string, rel: string): string {
  const path = join(base, rel);
  assert.ok(existsSync(path), `missing file: ${rel}`);
  return readFileSync(path, "utf8");
}

function mustMatch(
  source: string,
  pattern: RegExp,
  label: string,
): void {
  assert.match(source, pattern, label);
}

/**
 * User journey (testnet hosted / local):
 * Home → /start (setup wizard) → /protection (dashboard) → /trade (policy try) → optional /console, /portfolio audit.
 */
export function runGtmVerifyChecks(paths: GtmVerifyPaths): GtmCheckResult[] {
  const { root, repoRoot } = paths;
  const web = join(root, "web/src");
  const results: GtmCheckResult[] = [];

  const check = (name: string, fn: () => void) => {
    try {
      fn();
      results.push({ name, ok: true });
    } catch (err) {
      results.push({
        name,
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const artifacts: [string, string][] = [
    [join(repoRoot, "docs/GETTING-STARTED.md"), "GETTING-STARTED"],
    [join(repoRoot, "docs/PRICING.md"), "PRICING"],
    [join(web, "app/start/page.tsx"), "/start route"],
    [join(web, "app/protection/page.tsx"), "/protection dashboard"],
    [join(web, "app/trade/page.tsx"), "/trade route"],
    [join(web, "app/portfolio/page.tsx"), "/portfolio grant audit"],
    [join(web, "app/api/gateway/[...path]/route.ts"), "Vercel gateway proxy"],
    [join(web, "components/intentguard/setup-page-client.tsx"), "setup page client"],
    [join(web, "components/intentguard/onboarding-checklist.tsx"), "onboarding checklist"],
    [join(web, "components/intentguard/policy-simulator.tsx"), "policy simulator"],
    [join(web, "components/layout/site-nav.tsx"), "site navigation"],
    [join(web, "components/layout/app-shell.tsx"), "app shell"],
    [join(web, "lib/product-copy.ts"), "product copy"],
  ];

  check("gtm artifacts exist", () => {
    for (const [path, label] of artifacts) {
      assert.ok(existsSync(path), `missing GTM artifact: ${label}`);
    }
  });

  check("onboarding checklist primary paths", () => {
    const checklist = readUtf8(web, "components/intentguard/onboarding-checklist.tsx");
    mustMatch(checklist, /gtm:verify/, "onboarding references gtm:verify");
    mustMatch(checklist, /href: "\/start"/, "onboarding links /start protect flow");
    mustMatch(checklist, /href: "\/trade"/, "onboarding links /trade");
    mustMatch(checklist, /href: "\/portfolio"/, "onboarding links grant audit");
  });

  check("setup route mounts canonical setup client", () => {
    const startPage = readUtf8(web, "app/start/page.tsx");
    mustMatch(startPage, /SetupPageClient/, "start page must use SetupPageClient");
    assert.doesNotMatch(
      startPage,
      /from "@\/components\/intentguard\/protection-wizard"/,
      "start page should not import wizard directly (use SetupPageClient)",
    );
    const setup = readUtf8(web, "components/intentguard/setup-page-client.tsx");
    mustMatch(setup, /SETUP_STEPS/, "setup flow uses canonical SETUP_STEPS labels");
    mustMatch(setup, /ProtectionWizard/, "setup embeds protection wizard");
    mustMatch(setup, /Set up protection/, "setup user-facing title");
  });

  check("site nav primary routes", () => {
    const nav = readUtf8(web, "components/layout/site-nav.tsx");
    mustMatch(nav, /href: "\/start"/, "nav includes setup");
    mustMatch(nav, /href: "\/protection"/, "nav includes dashboard");
    mustMatch(nav, /href: "\/portfolio"/, "nav includes wallet check");
    const copy = readUtf8(web, "lib/product-copy.ts");
    mustMatch(copy, /setup: "Set up"/, "product copy defines setup label");
    mustMatch(copy, /dashboard: "Dashboard"/, "product copy defines dashboard label");
  });

  check("wallet connection in setup wizard", () => {
    const wizard = readUtf8(web, "components/intentguard/protection-wizard.tsx");
    mustMatch(wizard, /OwnerWalletConnect/, "wizard includes owner wallet connect");
    mustMatch(wizard, /gatewayCreateSession/, "wizard creates gateway session");
    mustMatch(wizard, /subaccount/i, "wizard references subaccount context");
  });

  check("typed AuthZ grant broadcast path", () => {
    const authz = readUtf8(web, "lib/intentguard/authz-types.ts");
    mustMatch(authz, /CreateDerivativeLimitOrderAuthz/, "typed limit grant constant");
    mustMatch(authz, /CancelDerivativeOrderAuthz/, "typed cancel grant constant");
    const wizard = readUtf8(web, "components/intentguard/protection-wizard.tsx");
    mustMatch(wizard, /GrantApprovalPanel/, "wizard uses shared grant approval panel");
    mustMatch(wizard, /gatewayGetSession/, "wizard loads session before grant approval");
    assert.ok(
      existsSync(join(web, "lib/chain/broadcast-typed-grants.ts")),
      "typed grant broadcast helper",
    );
  });

  check("on-chain grant verification UI", () => {
    const grantStatus = readUtf8(web, "lib/grant-status.ts");
    mustMatch(grantStatus, /limitReady/, "grant status parses limit grant");
    mustMatch(grantStatus, /cancelReady/, "grant status parses cancel grant");
    mustMatch(grantStatus, /userFacingIssues/, "grant status surfaces user-facing issues");
    const wizard = readUtf8(web, "components/intentguard/protection-wizard.tsx");
    mustMatch(wizard, /gatewayGrantStatus/, "wizard polls grant status");
    mustMatch(wizard, /parseGrantStatusJson/, "wizard parses grant status JSON");
  });

  check("readiness and execute gates", () => {
    const readiness = readUtf8(web, "components/intentguard/protection-readiness.tsx");
    mustMatch(readiness, /INJ for network fees/, "readiness covers INJ gas");
    mustMatch(readiness, /gatewayGrantStatus/, "readiness checks on-chain grant");
    const execReady = readUtf8(web, "components/intentguard/session-execute-readiness.tsx");
    mustMatch(execReady, /subaccountCollateral/, "execute readiness covers subaccount collateral");
    const trade = readUtf8(web, "app/trade/page.tsx");
    mustMatch(trade, /SessionExecuteReadiness/, "trade page shows execute readiness");
    const hub = readUtf8(web, "components/intentguard/protection-hub.tsx");
    mustMatch(hub, /ProtectionReadiness/, "dashboard shows protection readiness");
  });

  check("exposure snapshot (not full risk engine)", () => {
    const exposure = readUtf8(web, "lib/exposure.ts");
    mustMatch(exposure, /partial/, "exposure handles partial state");
    mustMatch(exposure, /unavailable/, "exposure handles unavailable state");
    mustMatch(exposure, /disclaimer/, "exposure model includes disclaimer field");
    const trade = readUtf8(web, "app/trade/page.tsx");
    mustMatch(trade, /SessionExposurePanel/, "trade page embeds exposure panel");
    const hub = readUtf8(web, "components/intentguard/protection-hub.tsx");
    mustMatch(hub, /SessionExposurePanel/, "dashboard embeds exposure panel");
  });

  check("policy propose / execute UX", () => {
    const simulator = readUtf8(web, "components/intentguard/policy-simulator.tsx");
    mustMatch(simulator, /gatewayPropose/, "simulator calls gateway propose");
    mustMatch(simulator, /sidecarReady/, "simulator distinguishes hosted vs sidecar");
    mustMatch(simulator, /denied|allowed/, "simulator surfaces policy outcome");
  });

  check("revocation and cleanup flows", () => {
    const hub = readUtf8(web, "components/intentguard/protection-hub.tsx");
    mustMatch(hub, /TurnOffProtectionPanel/, "dashboard turn-off protection");
    mustMatch(hub, /SessionCleanupOnlyPanel/, "dashboard cleanup-only recovery");
    mustMatch(hub, /gatewayRevokeSession/, "gateway session revocation");
    assert.ok(existsSync(join(web, "components/intentguard/grant-revoke-button.tsx")));
    assert.ok(existsSync(join(web, "lib/chain/broadcast-revoke.ts")));
    assert.ok(existsSync(join(web, "lib/protection/turn-off-orchestration.ts")));
  });

  check("docs and verify scripts", () => {
    const gettingStarted = readUtf8(repoRoot, "docs/GETTING-STARTED.md");
    mustMatch(gettingStarted, /Grant Audit|portfolio/i, "getting started mentions grant audit");
    mustMatch(gettingStarted, /npm run gateway/, "getting started mentions gateway");
    mustMatch(gettingStarted, /gtm:verify/, "getting started lists gtm:verify");
    const pkg = JSON.parse(readUtf8(root, "package.json")) as { scripts: Record<string, string> };
    assert.ok(pkg.scripts["gtm:verify"], "package.json defines gtm:verify");
    assert.ok(pkg.scripts["platform:verify"], "package.json defines platform:verify");
    assert.ok(pkg.scripts["ux:verify"], "package.json defines ux:verify");
    assert.ok(pkg.scripts["agent:verify"], "package.json defines agent:verify");
    assert.ok(pkg.scripts["legal:verify"], "package.json defines legal:verify");
    assert.ok(existsSync(join(repoRoot, "docs/SRE.md")), "SRE.md");
    assert.ok(existsSync(join(repoRoot, "docs/UX.md")), "UX.md");
    assert.ok(existsSync(join(repoRoot, "docs/AGENTS.md")), "AGENTS.md");
  });

  return results;
}

export function assertGtmVerifyOk(paths: GtmVerifyPaths): number {
  const results = runGtmVerifyChecks(paths);
  const failed = results.filter((r): r is { name: string; ok: false; detail: string } => !r.ok);
  if (failed.length > 0) {
    const msg = failed.map((f) => `  - ${f.name}: ${f.detail}`).join("\n");
    throw new Error(`GTM verify failed (${failed.length} checks):\n${msg}`);
  }
  return results.length;
}
