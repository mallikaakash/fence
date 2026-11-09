import { NextResponse } from "next/server";
import { evaluateTradeIntent } from "@/lib/intentguard/evaluate";
import type { IntentGuardPolicy, TradeIntent } from "@/lib/intentguard/policy-types";
import { SPIKE_MARKET_ID } from "@/lib/constants";

export const runtime = "nodejs";

const defaultPolicy: IntentGuardPolicy = {
  version: 1,
  marketIds: [SPIKE_MARKET_ID],
  maxMarginPerOrder: "100",
  maxOrderNotional: "50",
  maxLeverage: 5,
  dailyMarginBudget: "500",
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      intent?: Partial<TradeIntent>;
      policy?: Partial<IntentGuardPolicy>;
    };
    const policy = { ...defaultPolicy, ...body.policy };
    const intent: TradeIntent = {
      marketId: body.intent?.marketId ?? SPIKE_MARKET_ID,
      margin: body.intent?.margin ?? "10",
      leverage: body.intent?.leverage ?? 2,
      price: body.intent?.price,
      quantity: body.intent?.quantity,
      side: body.intent?.side,
      reduceOnly: body.intent?.reduceOnly,
    };
    const decision = evaluateTradeIntent(policy, intent);
    return NextResponse.json({
      ok: true,
      mode: "offline_policy_mirror",
      status: decision.allow ? "allowed" : "denied",
      reasons: decision.reasons,
      wouldBroadcast: false,
      signed: false,
      broadcast: false,
      note:
        "Browser policy mirror only — use POST /v1/propose on the sidecar (or /console + agent token) for live sessions.",
      policy,
      intent,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 400 },
    );
  }
}
