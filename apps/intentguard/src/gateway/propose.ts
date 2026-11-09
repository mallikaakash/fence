import { evaluateTradeIntent } from "../policy/evaluate.ts";
import type {
  EvaluateOptions,
  IntentGuardPolicy,
  TradeIntent,
} from "../policy/types.ts";
import {
  assertAgentHasNoSigningKey,
  type AgentCredential,
} from "./keys.ts";

export type ProposeResult =
  | {
      status: "allowed";
      decisionReasons: string[];
      /** Placeholder until chain signing is wired. */
      signed: false;
      wouldSign: true;
    }
  | {
      status: "denied";
      decisionReasons: string[];
      signed: false;
      wouldSign: false;
    };

/**
 * Gateway entry: agent proposes; gateway evaluates; signing happens only here later.
 * Spike: no private key in this path yet — proves deny short-circuit before broadcast.
 */
export function proposeTrade(params: {
  agent: AgentCredential;
  policy: IntentGuardPolicy;
  intent: TradeIntent;
  evaluateOptions?: EvaluateOptions;
}): ProposeResult {
  assertAgentHasNoSigningKey(params.agent);

  const decision = evaluateTradeIntent(
    params.policy,
    params.intent,
    params.evaluateOptions,
  );

  if (!decision.allow) {
    return {
      status: "denied",
      decisionReasons: decision.reasons,
      signed: false,
      wouldSign: false,
    };
  }

  return {
    status: "allowed",
    decisionReasons: decision.reasons,
    signed: false,
    wouldSign: true,
  };
}
