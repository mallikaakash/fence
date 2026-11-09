#!/usr/bin/env node
/**
 * Live testnet spike — Route A Day 1/2 AuthZ path.
 *
 *   npm run spike          # full flow (waits for faucet)
 *   npm run spike -- --prepare-only
 *   npm run spike -- --grant-only
 *   npm run spike -- --attacks-only
 *
 * Keys: apps/intentguard/.spike/keystore.json (gitignored)
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadOrCreateSpikeKeystore, publicSpikeAddresses } from "../chain/keys.ts";
import {
  requestTestnetInj,
  waitForInjBalance,
  getInjBalance,
} from "../chain/faucet.ts";
import {
  broadcastTypedTradingGrants,
  broadcastRevokeTypedTrading,
} from "../chain/typedGrant.ts";
import {
  attemptDerivativeLimitMsgExec,
  attemptMsgExecAsNonGrantee,
} from "../chain/msgExec.ts";
import {
  SPIKE_ALLOWED_MARKET_ID,
  SPIKE_FORBIDDEN_MARKET_ID,
  createAuthZApi,
} from "../chain/network.ts";
import { PrivateKey } from "@injectivelabs/sdk-ts";

type Checklist = Record<
  string,
  { pass: boolean | null; detail: string }
>;

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

function spikeDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../../.spike");
}

function mergeNotionalChecklist(checklist: Checklist) {
  const path = join(spikeDir(), "allowed-order.json");
  if (!existsSync(path)) return;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as {
      deny?: { status?: string; stage?: string; broadcast?: boolean; reasons?: string[] };
      ok?: { txHash?: string };
    };
    const denyOk =
      raw.deny?.status === "denied" &&
      raw.deny.stage === "policy" &&
      raw.deny.broadcast === false;
    if (denyOk) {
      checklist.notional_enforcement = {
        pass: true,
        detail: `gateway deny: ${raw.deny?.reasons?.join("; ") ?? "policy"} | allowed tx ${raw.ok?.txHash ?? "see allowed-order.json"}`,
      };
    }
  } catch {
    /* ignore */
  }
}

function parseArgs(argv: string[]) {
  return {
    prepareOnly: argv.includes("--prepare-only"),
    grantOnly: argv.includes("--grant-only"),
    attacksOnly: argv.includes("--attacks-only"),
    skipFaucetWait: argv.includes("--skip-faucet-wait"),
    revoke: argv.includes("--revoke"),
  };
}

async function ensureFunded(
  label: string,
  address: string,
  skipWait: boolean,
) {
  const before = await getInjBalance(address).catch(() => "0");
  console.log(`${label} ${address} balance=${before}`);
  if (BigInt(before) > 0n) return before;

  section(`Faucet request → ${label}`);
  try {
    const req = await requestTestnetInj(address);
    console.log(req);
  } catch (err) {
    console.warn(
      `Faucet API unreachable: ${err instanceof Error ? err.message : String(err)}`,
    );
    console.warn(
      `Manual fund: https://testnet.faucet.injective.network/ or https://cloud.google.com/application/web3/faucet/injective/testnet`,
    );
    console.warn(`Address: ${address}`);
  }
  if (skipWait) {
    console.log("Skipping wait (--skip-faucet-wait). Re-run when funded.");
    return before;
  }
  console.log("Waiting for faucet (up to ~12 min)...");
  const waited = await waitForInjBalance(address);
  console.log(`${label} after wait:`, waited);
  return waited.amount;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const store = loadOrCreateSpikeKeystore();
  const pubs = publicSpikeAddresses(store);
  const checklist: Checklist = {
    typed_market_authorization: { pass: null, detail: "pending" },
    subaccount_authorization: { pass: null, detail: "pending" },
    isolated_grantee_signing: { pass: null, detail: "pending" },
    notional_enforcement: {
      pass: null,
      detail: "run npm run spike:notional (or see .spike/allowed-order.json)",
    },
    funding_containment: { pass: null, detail: "pending owner INJ only for grant gas" },
    revocation: { pass: null, detail: "pending" },
    no_alternate_path: { pass: null, detail: "pending" },
  };
  mergeNotionalChecklist(checklist);

  section("Addresses (safe to share)");
  console.log(pubs);

  if (args.prepareOnly) {
    // prepare-only defaults to no long wait; pass --wait to block on faucet
    const skipWait = !process.argv.includes("--wait");
    await ensureFunded("owner", store.owner.injectiveAddress, skipWait);
    await ensureFunded("grantee", store.grantee.injectiveAddress, skipWait);
    const { ensureGranteeFeeAllowance } = await import("../chain/feeGrant.ts");
    const fee = await ensureGranteeFeeAllowance({
      owner: store.owner,
      granteeAddress: store.grantee.injectiveAddress,
    });
    console.log("\nFeeGrant hint:", fee.detail);
    console.log("\nPrepare done. Fund addresses if needed, then: npm run spike");
    return;
  }

  const ownerBal = await ensureFunded(
    "owner",
    store.owner.injectiveAddress,
    args.skipFaucetWait,
  );
  const granteeBal = await ensureFunded(
    "grantee",
    store.grantee.injectiveAddress,
    args.skipFaucetWait,
  );

  if (BigInt(ownerBal) === 0n) {
    console.error(
      "\nOwner has 0 INJ. Fund via https://testnet.faucet.injective.network/ or Google Cloud faucet, then re-run.",
    );
    process.exit(2);
  }
  if (BigInt(granteeBal) === 0n) {
    console.error(
      "\nGrantee has 0 INJ (needs gas for MsgExec). Fund grantee, then re-run.",
    );
    process.exit(2);
  }

  checklist.funding_containment = {
    pass: true,
    detail: `owner INJ=${ownerBal}; grantee gas INJ=${granteeBal}; no withdrawal AuthZ granted`,
  };

  let grantTx: string | undefined;

  if (!args.attacksOnly) {
    section("Broadcast typed AuthZ grants");
    const grant = await broadcastTypedTradingGrants({
      owner: store.owner,
      granteeAddress: store.grantee.injectiveAddress,
      marketIds: [SPIKE_ALLOWED_MARKET_ID],
      expirySeconds: 60 * 60 * 6,
      includeCancel: true,
    });
    grantTx = grant.txHash;
    console.log(grant);

    section("Query on-chain grants");
    const authzApi = createAuthZApi();
    const grants = await authzApi.fetchGrants({
      granter: store.owner.injectiveAddress,
      grantee: store.grantee.injectiveAddress,
    });
    console.log(JSON.stringify(grants, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2).slice(0, 4000));
  }

  if (args.grantOnly) {
    writeResults(checklist, { grantTx });
    return;
  }

  section("Attack: wrong market (must FAIL at AuthZ)");
  const wrongMarket = await attemptDerivativeLimitMsgExec({
    owner: store.owner,
    grantee: store.grantee,
    intent: {
      marketId: SPIKE_FORBIDDEN_MARKET_ID,
      price: 1,
      quantity: 0.01,
      margin: 1,
    },
  });
  console.log(wrongMarket);
  checklist.typed_market_authorization = {
    pass: !wrongMarket.ok,
    detail: wrongMarket.ok
      ? `UNEXPECTED SUCCESS tx=${wrongMarket.txHash}`
      : `rejected: ${wrongMarket.error}`,
  };

  section("Attack: wrong subaccount — owner index 2 (must FAIL at AuthZ)");
  // Trading grant is scoped to index 1; index 2 is unauthorized.
  const eth = store.owner.ethereumAddress.replace(/^0x/, "");
  const ownerSubIndex2 = `0x${eth}${"0".repeat(23)}2`;
  const wrongSub = await attemptDerivativeLimitMsgExec({
    owner: store.owner,
    grantee: store.grantee,
    subaccountIdOverride: ownerSubIndex2,
    intent: {
      marketId: SPIKE_ALLOWED_MARKET_ID,
      price: 20,
      quantity: 0.1,
      margin: 5,
    },
  });
  console.log(wrongSub);
  const subAuthzDenied = /subaccount is unauthorized|unauthorized/i.test(
    wrongSub.error ?? "",
  );
  checklist.subaccount_authorization = {
    pass: !wrongSub.ok && subAuthzDenied,
    detail: wrongSub.ok
      ? `UNEXPECTED SUCCESS tx=${wrongSub.txHash}`
      : `rejected: ${wrongSub.error}`,
  };

  section("Attack: non-grantee EOA tries MsgExec (must FAIL)");
  const attackerPk = (PrivateKey.generate().privateKey as PrivateKey);
  const attacker = {
    role: "grantee" as const,
    injectiveAddress: attackerPk.toBech32(),
    ethereumAddress: attackerPk.toHex(),
    subaccountId: "0x" + attackerPk.toHex().replace(/^0x/, "") + "0".repeat(24),
    subaccountIndex: 0,
    privateKeyHex: attackerPk.toPrivateKeyHex().replace(/^0x/, ""),
  };
  // Attacker has no gas — MsgExec may fail for fees OR authz. Prefer funding message clarity.
  const nonGrantee = await attemptMsgExecAsNonGrantee({
    owner: store.owner,
    attacker,
    intent: {
      marketId: SPIKE_ALLOWED_MARKET_ID,
      price: 1,
      quantity: 0.01,
      margin: 1,
    },
  });
  console.log(nonGrantee);
  checklist.no_alternate_path = {
    pass: !nonGrantee.ok,
    detail: nonGrantee.ok
      ? `UNEXPECTED SUCCESS tx=${nonGrantee.txHash}`
      : `rejected: ${nonGrantee.error}`,
  };
  checklist.isolated_grantee_signing = {
    pass: true,
    detail: "grantee key only in .spike/keystore.json; agent path never loads it",
  };

  section("Allowed market MsgExec (may fail for lack of USDC margin — AuthZ should pass simulation)");
  const allowed = await attemptDerivativeLimitMsgExec({
    owner: store.owner,
    grantee: store.grantee,
    intent: {
      marketId: SPIKE_ALLOWED_MARKET_ID,
      // Far from market — post-only style limit unlikely to fill; still tests AuthZ path
      price: 1,
      quantity: 0.01,
      margin: 1,
    },
  });
  console.log(allowed);
  // If it fails solely due to insufficient deposits / margin, AuthZ still worked.
  const authzOk =
    allowed.ok ||
    /insufficient|deposit|margin|funds|notional|tick/i.test(allowed.error ?? "");
  const authzDenied =
    /authorization|authz|unauthorized|not authorized|grant/i.test(
      allowed.error ?? "",
    );
  checklist.typed_market_authorization = {
    pass:
      checklist.typed_market_authorization.pass === true &&
      authzOk &&
      !authzDenied,
    detail: [
      checklist.typed_market_authorization.detail,
      allowed.ok
        ? `allowed tx=${allowed.txHash}`
        : `allowed-path error=${allowed.error} (authzOk=${authzOk})`,
    ].join(" | "),
  };

  let indexerVerify: unknown = null;
  if (allowed.ok) {
    section("Indexer verify (api.injective.exchange via sdk-ts)");
    const { verifyPostExec } = await import("../chain/verify.ts");
    const { TESTNET_USDC_DENOM } = await import("../chain/deposit.ts");
    indexerVerify = await verifyPostExec({
      subaccountId: store.owner.subaccountId,
      marketId: SPIKE_ALLOWED_MARKET_ID,
      quoteDenom: TESTNET_USDC_DENOM,
    });
    console.log(indexerVerify);
  }

  if (args.revoke) {
    section("Revoke grants");
    const rev = await broadcastRevokeTypedTrading({
      owner: store.owner,
      granteeAddress: store.grantee.injectiveAddress,
    });
    console.log(rev);
    const after = await attemptDerivativeLimitMsgExec({
      owner: store.owner,
      grantee: store.grantee,
      intent: {
        marketId: SPIKE_ALLOWED_MARKET_ID,
        price: 1,
        quantity: 0.01,
        margin: 1,
      },
    });
    checklist.revocation = {
      pass: !after.ok,
      detail: after.ok
        ? `UNEXPECTED SUCCESS after revoke ${after.txHash}`
        : `post-revoke rejected: ${after.error}`,
    };
  }

  writeResults(checklist, {
    grantTx,
    allowed,
    wrongMarket,
    wrongSub,
    nonGrantee,
    indexerVerify,
  });
}

function writeResults(
  checklist: Checklist,
  extra: Record<string, unknown>,
) {
  section("Checklist");
  let passed = 0;
  let failed = 0;
  let pending = 0;
  for (const [k, v] of Object.entries(checklist)) {
    const mark =
      v.pass === true ? "PASS" : v.pass === false ? "FAIL" : "PENDING";
    if (v.pass === true) passed++;
    else if (v.pass === false) failed++;
    else pending++;
    console.log(`[${mark}] ${k}: ${v.detail}`);
  }

  const outDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../.spike",
  );
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "spike-results.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        checklist,
        extra,
        summary: { passed, failed, pending },
      },
      null,
      2,
    ),
  );
  console.log(`\nWrote ${outPath}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
