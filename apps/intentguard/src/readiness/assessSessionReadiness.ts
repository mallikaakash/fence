import type { GatewaySession } from "../gateway/session.ts";
import { verifySessionGrantOnChain } from "../authz/verifySessionGrant.ts";
import type { SessionGrantStatus } from "../authz/verifySessionGrant.ts";
import {
  formatInjHuman,
  minGranteeInjAmountWei,
  queryInjBalance,
  type InjBalanceQuery,
} from "../chain/bank.ts";
import {
  fetchDerivativeMarketById,
  type DerivativeMarketQuery,
} from "../chain/market.ts";
import { fetchSubaccountQuoteBalance } from "../chain/verify.ts";
import { readinessQueryTimeoutMs, withQueryTimeout } from "../chain/queryTimeout.ts";
import { assertReadinessNetwork } from "./network.ts";
import { parsePolicyQuoteAmount } from "./policyAmount.ts";
import { marketTypedGrantCoverage } from "./marketGrantCoverage.ts";
import type {
  ReadinessCheck,
  ReadinessCheckStatus,
  ReadinessOverallStatus,
  SessionReadinessResponse,
} from "./types.ts";

export type ReadinessDeps = {
  verifyGrants?: typeof verifySessionGrantOnChain;
  queryInj?: (address: string, network: "testnet" | "mainnet") => Promise<InjBalanceQuery>;
  fetchMarket?: (
    marketId: string,
    network: "testnet",
  ) => Promise<DerivativeMarketQuery>;
  fetchSubaccountBalance?: typeof fetchSubaccountQuoteBalance;
  queryTimeoutMs?: number;
};

function pickMarketId(session: GatewaySession, override?: string): string {
  if (override) return override;
  return session.policy.marketIds[0] ?? "";
}

function formatQuoteHuman(amount: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = amount / scale;
  const frac = amount % scale;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : String(whole);
}

function aggregateOverall(checks: SessionReadinessResponse["checks"]): ReadinessOverallStatus {
  const statuses = [
    checks.grants.status,
    checks.granteeGas.status,
    checks.subaccountCollateral.status,
    checks.market.status,
  ];
  if (statuses.some((s) => s === "unavailable")) return "unavailable";
  if (statuses.every((s) => s === "ready")) return "ready";
  return "action_required";
}

function buildGrantsCheck(
  grant: SessionGrantStatus,
  session: GatewaySession,
): ReadinessCheck {
  if (session.revoked) {
    return {
      status: "action_required",
      summary: "Session ended — wallet permission check skipped.",
      instructions: ["Start a new protection session or turn protection back on."],
      details: { revoked: true },
    };
  }
  if (!session.ownerInjectiveAddress?.startsWith("inj1")) {
    return {
      status: "action_required",
      summary: "Owner wallet address missing on session.",
      instructions: ["Re-create the session with your Keplr inj1 address."],
    };
  }
  if (!grant.endpoint && grant.issues.some((i) => i.includes("missing"))) {
    return {
      status: "action_required",
      summary: grant.userFacingIssues[0] ?? "Wallet permission is not active yet.",
      instructions: [
        "Approve the timed limit + cancel grants in Keplr from the setup flow.",
      ],
      details: { issues: grant.issues },
    };
  }
  if (!grant.endpoint) {
    return {
      status: "unavailable",
      summary: "Could not query AuthZ grants from the network.",
      instructions: ["Retry shortly — readiness cannot confirm grants right now."],
      details: { issues: grant.issues },
    };
  }
  if (grant.ready) {
    return {
      status: "ready",
      summary: "Typed limit and cancel grants match this session.",
      details: {
        limitReady: grant.limitReady,
        cancelReady: grant.cancelReady,
        grantee: grant.grantee,
        granter: grant.granter,
        endpoint: grant.endpoint,
      },
    };
  }
  const expired = grant.issues.some((i) => /expired/i.test(i));
  return {
    status: "action_required",
    summary:
      grant.userFacingIssues[0] ??
      (expired
        ? "Wallet permission expired."
        : "Wallet permission does not match your rules."),
    instructions: expired
      ? ["Revoke old grants and run setup again, or approve a fresh grant bundle."]
      : [
          "Finish Keplr approval from setup, or revoke and re-approve with matching subaccount and markets.",
        ],
    details: {
      issues: grant.issues,
      grantsSummary: grant.grantsSummary,
      endpoint: grant.endpoint,
    },
  };
}

export async function assessSessionReadiness(params: {
  session: GatewaySession;
  network: "testnet" | "mainnet";
  marketId?: string;
  executeEnabled?: boolean;
  deps?: ReadinessDeps;
}): Promise<SessionReadinessResponse> {
  const chainNetwork = assertReadinessNetwork(params.network);
  const { session } = params;
  const deps = params.deps ?? {};
  const timeoutMs = deps.queryTimeoutMs ?? readinessQueryTimeoutMs();
  const verifyGrants = deps.verifyGrants ?? verifySessionGrantOnChain;
  const queryInj =
    deps.queryInj ??
    ((address: string, net: "testnet" | "mainnet") =>
      queryInjBalance({ address, network: net, timeoutMs }));
  const fetchMarket =
    deps.fetchMarket ??
    ((id: string, net: "testnet") => fetchDerivativeMarketById(id, net, timeoutMs));
  const fetchSubBal =
    deps.fetchSubaccountBalance ??
    ((p: { subaccountId: string; denom: string }) =>
      fetchSubaccountQuoteBalance({
        ...p,
        network: chainNetwork,
        timeoutMs,
      }));

  const marketId = pickMarketId(session, params.marketId);

  const sessionIssues: string[] = [];
  let sessionActive = !session.revoked;
  if (session.revoked) {
    sessionIssues.push("session revoked");
  }
  if (session.agentTokenExpiresAt) {
    const exp = Date.parse(session.agentTokenExpiresAt);
    if (Number.isFinite(exp) && exp < Date.now()) {
      sessionIssues.push("agent token expired");
      sessionActive = false;
    }
  }

  const grantStatus = await withQueryTimeout("authz.grants", timeoutMs, () =>
    verifyGrants({ session, network: chainNetwork }),
  ).catch(
    (e): SessionGrantStatus => ({
      granter: session.ownerInjectiveAddress ?? "",
      grantee: session.granteeAddress,
      network: chainNetwork,
      ready: false,
      limitReady: false,
      cancelReady: false,
      scopeMatch: false,
      matchingGrants: 0,
      issues: [e instanceof Error ? e.message : String(e)],
      userFacingIssues: ["Could not verify wallet permission from the network."],
      endpoint: "",
      grantsSummary: [],
      onChainLimitScopes: [],
    }),
  );

  const grants = buildGrantsCheck(grantStatus, session);

  const minInjWei = minGranteeInjAmountWei();
  const minInjHuman = formatInjHuman(minInjWei);
  let granteeGas: ReadinessCheck;
  if (!session.granteeAddress.startsWith("inj1")) {
    granteeGas = {
      status: "unavailable",
      summary: "Grantee address invalid on session.",
    };
  } else {
    const inj = await queryInj(session.granteeAddress, chainNetwork);
    if (inj.status === "unavailable") {
      granteeGas = {
        status: "unavailable",
        summary: "Could not read grantee INJ balance.",
        instructions: ["Retry readiness — network balance query failed."],
        details: { error: inj.error, endpoint: inj.endpoint },
      };
    } else if (inj.amountWei < minInjWei) {
      granteeGas = {
        status: "action_required",
        summary: "Your grantee wallet needs additional INJ for transaction fees.",
        instructions: [
          `Send at least ${minInjHuman} INJ to the assistant (grantee) wallet from Keplr.`,
          `Available: ${formatInjHuman(inj.amountWei)} INJ · Required: ${minInjHuman} INJ minimum.`,
        ],
        details: {
          granteeAddress: session.granteeAddress,
          availableInj: inj.amount,
          availableInjHuman: formatInjHuman(inj.amountWei),
          requiredMinInjHuman: minInjHuman,
          requiredMinInjWei: minInjWei.toString(),
          source: inj.source,
        },
      };
    } else {
      granteeGas = {
        status: "ready",
        summary: "Grantee wallet has enough INJ for transaction fees.",
        details: {
          availableInjHuman: formatInjHuman(inj.amountWei),
          requiredMinInjHuman: minInjHuman,
          granteeAddress: session.granteeAddress,
        },
      };
    }
  }

  let marketCheck: ReadinessCheck;
  let marketMeta: SessionReadinessResponse["market"] = { marketId };
  let resolvedQuoteDecimals = 6;
  if (!marketId) {
    marketCheck = {
      status: "action_required",
      summary: "No market configured on session policy.",
      instructions: ["Add at least one market id to your protection rules."],
    };
  } else if (!session.policy.marketIds.some((m) => m.toLowerCase() === marketId.toLowerCase())) {
    marketCheck = {
      status: "action_required",
      summary: "Requested market is not in this session policy.",
      instructions: ["Pick a market from your allowed list or change your rules."],
    };
  } else {
    const mq = await fetchMarket(marketId, chainNetwork);
    if (mq.status === "unavailable") {
      marketCheck = {
        status: "unavailable",
        summary: "Could not verify market status from the indexer.",
        instructions: ["Retry readiness — market metadata is temporarily unavailable."],
        details: { error: mq.error, indexerEndpoint: mq.indexerEndpoint },
      };
    } else if (mq.status === "not_found") {
      marketCheck = {
        status: "action_required",
        summary: "Market was not found on Injective.",
        instructions: ["Confirm the market id in your policy matches testnet perps."],
        details: { marketId },
      };
    } else {
      const m = mq.market;
      resolvedQuoteDecimals = m.quoteDecimals;
      marketMeta = {
        marketId: m.marketId,
        ticker: m.ticker,
        quoteDenom: m.quoteDenom,
        quoteSymbol: m.quoteSymbol,
        marketStatus: m.marketStatus,
      };
      const active = m.marketStatus.toLowerCase() === "active";
      const inPolicy = session.policy.marketIds.some(
        (id) => id.toLowerCase() === m.marketId.toLowerCase(),
      );
      const grantCoverage = session.subaccountId
        ? marketTypedGrantCoverage({
            grantStatus,
            policyMarketIds: session.policy.marketIds,
            subaccountId: session.subaccountId,
            marketId: m.marketId,
          })
        : {
            covered: false,
            limitOk: false,
            cancelOk: false,
            usedSessionReady: false,
          };
      if (!active) {
        marketCheck = {
          status: "action_required",
          summary: `Market ${m.ticker} is not active for trading.`,
          instructions: ["Pick another market or wait until this market is active."],
          details: { marketStatus: m.marketStatus },
        };
      } else if (!inPolicy) {
        marketCheck = {
          status: "action_required",
          summary: "Market is not included in your session policy.",
        };
      } else if (session.revoked) {
        marketCheck = {
          status: "action_required",
          summary: "Session ended — market check skipped.",
        };
      } else if (!grantCoverage.covered) {
        const instructions = [
          "Approve typed limit and cancel grants for this market and subaccount in Keplr.",
        ];
        if (!grantCoverage.limitOk) {
          instructions.unshift(
            "Place-order (limit) permission is missing or does not match this market.",
          );
        }
        if (!grantCoverage.cancelOk) {
          instructions.unshift(
            "Cancel-order permission is missing or does not match this market.",
          );
        }
        marketCheck = {
          status: "action_required",
          summary: "On-chain wallet permission does not fully cover this market yet.",
          instructions,
          details: {
            limitOk: grantCoverage.limitOk,
            cancelOk: grantCoverage.cancelOk,
            usedSessionReady: grantCoverage.usedSessionReady,
          },
        };
      } else if (grants.status !== "ready") {
        marketCheck = {
          status: "action_required",
          summary:
            "This market requires matching wallet permissions — resolve the wallet permission check first.",
          instructions: [
            "Limit and cancel grants must both be active for this subaccount and market.",
          ],
          details: {
            limitOk: grantCoverage.limitOk,
            cancelOk: grantCoverage.cancelOk,
            grantsCheckStatus: grants.status,
          },
        };
      } else {
        marketCheck = {
          status: "ready",
          summary: `Market ${m.ticker} is active and compatible with your session.`,
          details: {
            quoteDenom: m.quoteDenom,
            quoteSymbol: m.quoteSymbol,
            quoteDecimals: m.quoteDecimals,
            marketStatus: m.marketStatus,
            limitOk: grantCoverage.limitOk,
            cancelOk: grantCoverage.cancelOk,
          },
        };
      }
    }
  }

  const minCollateralHuman = session.policy.maxMarginPerOrder;
  let subaccountCollateral: ReadinessCheck;
  const subaccountId = session.subaccountId;
  const quoteDenom = marketMeta.quoteDenom;
  const quoteDecimals = resolvedQuoteDecimals;

  if (!subaccountId) {
    subaccountCollateral = {
      status: "action_required",
      summary: "Trading subaccount is not set on this session.",
      instructions: ["Complete setup with subaccount index ≥ 1 (Helix Subaccount 1)."],
    };
  } else if (!quoteDenom) {
    subaccountCollateral = {
      status: "unavailable",
      summary: "Quote denomination unknown — fix market readiness first.",
    };
  } else {
    const parsedMargin = parsePolicyQuoteAmount(minCollateralHuman, quoteDecimals);
    if (!parsedMargin.ok) {
      subaccountCollateral = {
        status: parsedMargin.status,
        summary: `Policy margin invalid: ${parsedMargin.reason}.`,
        instructions: [
          "Update your protection rules with a valid positive max margin per order.",
        ],
        details: { maxMarginPerOrder: minCollateralHuman },
      };
    } else {
      const requiredWei = parsedMargin.chainUnits;
      const bal = await fetchSubBal({ subaccountId, denom: quoteDenom });
      if (bal === null) {
        subaccountCollateral = {
          status: "unavailable",
          summary: "Could not query subaccount collateral from the indexer.",
          instructions: ["Retry readiness — subaccount balance query failed."],
          details: { subaccountId, quoteDenom },
        };
      } else if (!/^\d+$/.test(bal.availableBalance)) {
        subaccountCollateral = {
          status: "unavailable",
          summary: "Subaccount balance response was malformed.",
          details: { availableBalance: bal.availableBalance },
        };
      } else {
        const available = BigInt(bal.availableBalance);
        const required = requiredWei;
        const symbol = marketMeta.quoteSymbol ?? "quote";
        if (available < required) {
          subaccountCollateral = {
            status: "action_required",
            summary: `Your trading subaccount needs ${symbol} collateral for this market.`,
            instructions: [
              `Transfer ${symbol} into subaccount index ${session.subaccountIndex ?? 1} on Helix testnet (not only wallet bank balance).`,
              `Quote denom: ${quoteDenom}`,
              `Available: ${formatQuoteHuman(available, quoteDecimals)} ${symbol} · Policy minimum margin per order: ${parsedMargin.normalizedHuman} ${symbol}.`,
            ],
            details: {
              subaccountId,
              quoteDenom,
              quoteSymbol: symbol,
              availableBalance: bal.availableBalance,
              totalBalance: bal.totalBalance,
              requiredMarginQuote: parsedMargin.normalizedHuman,
              requiredMarginChain: required.toString(),
            },
          };
        } else {
          subaccountCollateral = {
            status: "ready",
            summary: `Subaccount has ${symbol} collateral for at least one policy-sized order.`,
            details: {
              availableHuman: formatQuoteHuman(available, quoteDecimals),
              requiredMarginQuote: parsedMargin.normalizedHuman,
              quoteDenom,
            },
          };
        }
      }
    }
  }

  const checks = { grants, granteeGas, subaccountCollateral, market: marketCheck };
  const overallStatus = aggregateOverall(checks);
  const checkedAt = new Date().toISOString();

  return {
    sessionId: session.sessionId,
    overallStatus,
    sessionActive,
    sessionIssues,
    checks,
    market: marketMeta,
    subaccount: {
      subaccountId: session.subaccountId,
      subaccountIndex: session.subaccountIndex,
      ownerAddress: session.ownerInjectiveAddress,
      granteeAddress: session.granteeAddress,
    },
    policyHints: {
      minCollateralQuote: minCollateralHuman,
      note:
        "Collateral check uses max margin per order from your policy — not a simulated order; does not guarantee a fill.",
    },
    checkedAt,
    disclaimer:
      "Readiness is an informational pre-flight check only. Execution still enforces grants, policy, and chain state at submit time.",
    executeEnabled: params.executeEnabled,
  };
}

/** @internal test helper */
export function readinessStatusForTests(
  statuses: ReadinessCheckStatus[],
): ReadinessOverallStatus {
  const stub = {
    grants: { status: statuses[0] ?? "ready", summary: "" },
    granteeGas: { status: statuses[1] ?? "ready", summary: "" },
    subaccountCollateral: { status: statuses[2] ?? "ready", summary: "" },
    market: { status: statuses[3] ?? "ready", summary: "" },
  } as SessionReadinessResponse["checks"];
  return aggregateOverall(stub);
}
