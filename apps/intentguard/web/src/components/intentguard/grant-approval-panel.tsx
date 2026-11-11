"use client";

import { useCallback, useMemo, useState } from "react";
import { getNetworkInfo, Network } from "@injectivelabs/networks";
import {
  gatewayGetSession,
  gatewayGrantStatus,
  gatewayGrantTxPlan,
} from "@/lib/gateway/client";
import type { GatewaySettings } from "@/lib/gateway/storage";
import { GrantBroadcastButton } from "@/components/intentguard/grant-broadcast-button";
import {
  formatDurationSeconds,
  GRANT_EXPIRY_PRESETS,
  validateExpiryChoice,
} from "@/lib/grant/grant-expiry";
import {
  interpretGrantStatus,
  sessionFingerprint,
  validatePreSignGrant,
  type GrantTxPlanResponse,
  type GrantVerificationPhase,
  type SessionGrantContext,
} from "@/lib/grant/grant-plan-validation";

export function GrantApprovalPanel({
  settings,
  session,
  connectedWallet,
  network = "testnet",
  chainIdHint,
  initialExpirySeconds = 86_400,
  onAfterBroadcast,
}: {
  settings: GatewaySettings;
  session: SessionGrantContext;
  connectedWallet: string;
  network?: "testnet" | "mainnet";
  chainIdHint?: string;
  /** Pre-select duration (e.g. wizard limits step); owner must still confirm explicitly. */
  initialExpirySeconds?: number;
  onAfterBroadcast?: () => void;
}) {
  const [expirySeconds, setExpirySeconds] = useState<number>(initialExpirySeconds);
  const [customExpiry, setCustomExpiry] = useState("");
  const [expiryConfirmed, setExpiryConfirmed] = useState(false);
  const [planJson, setPlanJson] = useState<string | null>(null);
  const [planEnvelope, setPlanEnvelope] = useState<GrantTxPlanResponse | null>(null);
  const [sessionSnapshot, setSessionSnapshot] = useState<SessionGrantContext | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifyPhase, setVerifyPhase] = useState<GrantVerificationPhase>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [grantIssues, setGrantIssues] = useState<string[]>([]);

  const resolvedChainId =
    chainIdHint ??
    getNetworkInfo(
      network === "mainnet" ? Network.MainnetSentry : Network.TestnetSentry,
    ).chainId;

  const localTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const nowLabel = useMemo(() => new Date().toString(), []);

  const expiryError = validateExpiryChoice(expirySeconds);
  const expirationPreview = useMemo(() => {
    if (expiryError) return null;
    const unix = Math.floor(Date.now() / 1000) + Math.floor(expirySeconds);
    return {
      unix,
      isoUtc: new Date(unix * 1000).toISOString(),
      local: new Date(unix * 1000).toString(),
    };
  }, [expirySeconds, expiryError]);

  const preSign = useMemo(() => {
    if (!planEnvelope) return { ok: false, errors: ["Load grant plan after confirming expiry"] };
    return validatePreSignGrant({
      network,
      connectedWallet: connectedWallet || null,
      session,
      planEnvelope,
      expirySecondsChosen: expirySeconds,
      sessionSnapshotAtFetch: sessionSnapshot,
    });
  }, [
    planEnvelope,
    network,
    connectedWallet,
    session,
    expirySeconds,
    sessionSnapshot,
  ]);

  const walletMismatch =
    connectedWallet.startsWith("inj1") &&
    session.ownerInjectiveAddress.startsWith("inj1") &&
    connectedWallet !== session.ownerInjectiveAddress;

  async function fetchPlan() {
    setFetchError(null);
    setPlanJson(null);
    setPlanEnvelope(null);
    setExpiryConfirmed(false);
    setVerifyPhase("idle");
    setTxHash(null);

    const choiceErr = validateExpiryChoice(expirySeconds);
    if (choiceErr) {
      setFetchError(choiceErr);
      return;
    }

    setBusy(true);
    try {
      const sessionRes = await gatewayGetSession(settings, session.sessionId);
      if (!sessionRes.res.ok) {
        setFetchError("Failed to re-fetch session");
        return;
      }
      const live = (sessionRes.json as { session: SessionGrantContext }).session;
      const snap: SessionGrantContext = {
        sessionId: live.sessionId,
        ownerInjectiveAddress: live.ownerInjectiveAddress ?? session.ownerInjectiveAddress,
        granteeAddress: live.granteeAddress,
        subaccountId: live.subaccountId ?? session.subaccountId,
        policy: live.policy ?? session.policy,
        revoked: live.revoked,
      };
      setSessionSnapshot(snap);

      const { res, json } = await gatewayGrantTxPlan(
        settings,
        session.sessionId,
        expirySeconds,
      );
      if (!res.ok) {
        setFetchError(
          typeof (json as { error?: string }).error === "string"
            ? (json as { error: string }).error
            : JSON.stringify(json),
        );
        return;
      }
      const env = json as GrantTxPlanResponse;
      setPlanEnvelope(env);
      setPlanJson(JSON.stringify(env, null, 2));
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const verifyOnChain = useCallback(async () => {
    setBusy(true);
    setGrantIssues([]);
    try {
      const { res, json } = await gatewayGrantStatus(settings, session.sessionId);
      if (!res.ok) {
        setVerifyPhase("verification_unavailable");
        setGrantIssues(["grant-status request failed — LCD may be unavailable"]);
        return;
      }
      const gs = (json as { grantStatus: Record<string, unknown> }).grantStatus as {
        ready: boolean;
        scopeMatch?: boolean;
        issues?: string[];
        limitGrant?: { ok?: boolean };
        cancelGrant?: { ok?: boolean };
      };
      setGrantIssues(gs.issues ?? []);
      setVerifyPhase(interpretGrantStatus(gs));
    } finally {
      setBusy(false);
    }
  }, [settings, session.sessionId]);

  async function beforeKeplrSign() {
    const sessionRes = await gatewayGetSession(settings, session.sessionId);
    if (!sessionRes.res.ok) {
      throw new Error("Re-fetch session failed — aborting sign");
    }
    const live = (sessionRes.json as { session: SessionGrantContext }).session;
    const fresh: SessionGrantContext = {
      sessionId: live.sessionId,
      ownerInjectiveAddress: live.ownerInjectiveAddress ?? session.ownerInjectiveAddress,
      granteeAddress: live.granteeAddress,
      subaccountId: live.subaccountId ?? session.subaccountId,
      policy: live.policy ?? session.policy,
      revoked: live.revoked,
    };
    if (sessionSnapshot && sessionFingerprint(fresh) !== sessionFingerprint(sessionSnapshot)) {
      throw new Error("Session changed since plan generation — re-fetch plan before signing");
    }
    const v = validatePreSignGrant({
      network,
      connectedWallet,
      session: fresh,
      planEnvelope: planEnvelope!,
      expirySecondsChosen: expirySeconds,
      sessionSnapshotAtFetch: sessionSnapshot,
    });
    if (!v.ok) {
      throw new Error(v.errors.join("; "));
    }
  }

  const policy = session.policy;

  return (
    <div className="w-full max-w-lg border border-white/10 rounded-lg bg-black/25 p-3 space-y-3 text-left">
      <p className="text-[10px] uppercase tracking-wide text-[#75bfcf]">
        AuthZ grant approval (session {session.sessionId.slice(0, 12)}…)
      </p>

      {walletMismatch && (
        <p className="text-xs text-red-300/90">
          Connected wallet does not match this session&apos;s owner (
          {session.ownerInjectiveAddress}). Connect the correct Keplr account before signing.
        </p>
      )}

      <section className="space-y-2">
        <h3 className="text-xs text-white/70 font-medium">1 — On-chain grant expiry</h3>
        <p className="text-[10px] text-white/45">
          This is the Injective AuthZ authorization expiry (not the Fence policy clock). Times
          below use your browser timezone ({localTz}); ISO timestamps are UTC. Now: {nowLabel}
        </p>
        <div className="flex flex-wrap gap-2">
          {GRANT_EXPIRY_PRESETS.map((p) => (
            <button
              key={p.seconds}
              type="button"
              className={
                expirySeconds === p.seconds
                  ? "text-[10px] px-2 py-1 rounded-full border border-[#75bfcf] text-[#75bfcf]"
                  : "text-[10px] px-2 py-1 rounded-full border border-white/20 text-white/60"
              }
              onClick={() => {
                setExpirySeconds(p.seconds);
                setCustomExpiry("");
                setExpiryConfirmed(false);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="text-[10px] text-white/50 block">
          Custom duration (seconds, {formatDurationSeconds(expirySeconds)})
          <input
            type="number"
            className="mt-1 w-full bg-black/40 border border-white/15 rounded px-2 py-1 text-xs text-white/80"
            value={customExpiry || String(expirySeconds)}
            onChange={(e) => {
              setCustomExpiry(e.target.value);
              const n = Number(e.target.value);
              if (Number.isFinite(n)) setExpirySeconds(Math.floor(n));
              setExpiryConfirmed(false);
            }}
          />
        </label>
        {expiryError && <p className="text-xs text-red-300/90">{expiryError}</p>}
        {expirationPreview && (
          <p className="text-[10px] text-white/55">
            Duration: {formatDurationSeconds(expirySeconds)} · Expires UTC{" "}
            {expirationPreview.isoUtc} · Local {expirationPreview.local}
          </p>
        )}
        <label className="flex gap-2 items-start text-[10px] text-white/60">
          <input
            type="checkbox"
            checked={expiryConfirmed}
            onChange={(e) => setExpiryConfirmed(e.target.checked)}
          />
          I confirm this on-chain authorization expiry duration (this does not extend an existing
          grant automatically).
        </label>
        <button
          type="button"
          disabled={busy || !expiryConfirmed || !!expiryError}
          className="text-xs px-3 py-1 rounded-full border border-[#75bfcf]/50 text-[#75bfcf] disabled:opacity-40"
          onClick={() => void fetchPlan()}
        >
          {busy ? "Loading…" : "Generate grant tx plan"}
        </button>
        {fetchError && <p className="text-xs text-red-300/90">{fetchError}</p>}
      </section>

      {planEnvelope && (
        <section className="space-y-2 border-t border-white/10 pt-3">
          <h3 className="text-xs text-white/70 font-medium">2 — Review before Keplr</h3>
          <OnChainVsGatewaySummary policy={policy} plan={planEnvelope} />
          <dl className="text-[10px] text-white/55 space-y-1 font-mono">
            <div>Network: {network} · chainId {resolvedChainId}</div>
            <div>Connected: {connectedWallet || "(not connected)"}</div>
            <div>Granter (owner): {session.ownerInjectiveAddress}</div>
            <div>Grantee: {session.granteeAddress}</div>
            <div>Subaccount: {session.subaccountId}</div>
            <div>Markets: {session.policy.marketIds.join(", ")}</div>
            <div>
              Expiry: {planEnvelope.txPlan.expirationIso} ({planEnvelope.expirySeconds}s)
            </div>
          </dl>
          {!preSign.ok && (
            <ul className="text-xs text-amber-200/90 list-disc list-inside">
              {preSign.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <GrantBroadcastButton
            ownerInjectiveAddress={session.ownerInjectiveAddress}
            grantTxPlanJson={planJson ?? ""}
            network={network}
            disabled={!preSign.ok || !expiryConfirmed || walletMismatch}
            onBeforeSign={beforeKeplrSign}
            onSuccess={(hash) => {
              setTxHash(hash);
              setVerifyPhase("broadcast_ok");
              onAfterBroadcast?.();
              void verifyOnChain();
            }}
            onWalletRejected={() => setVerifyPhase("wallet_rejected")}
            onBroadcastFailed={() => setVerifyPhase("broadcast_failed")}
            actionLabel="3 — Approve in Keplr (this session only)"
          />
        </section>
      )}

      {(txHash || verifyPhase !== "idle") && (
        <section className="border-t border-white/10 pt-3 space-y-1 text-[10px]">
          <h3 className="text-xs text-white/70 font-medium">4 — Post-broadcast verification</h3>
          <StatusRow label="Wallet approval" value={verifyPhase === "wallet_rejected" ? "rejected" : txHash ? "signed" : "pending"} />
          <StatusRow label="Broadcast" value={verifyPhase === "broadcast_failed" ? "failed" : txHash ? "submitted" : "—"} />
          {txHash && <div className="text-[#75bfcf] break-all">Tx hash: {txHash}</div>}
          <StatusRow label="On-chain verification" value={phaseLabel(verifyPhase)} />
          {grantIssues.length > 0 && (
            <ul className="text-amber-200/80 list-disc list-inside">
              {grantIssues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="text-[10px] text-[#75bfcf] border border-[#75bfcf]/40 px-2 py-0.5 rounded-full mt-1"
            onClick={() => void verifyOnChain()}
          >
            Re-check grant-status
          </button>
          <p className="text-white/40">
            A transaction hash does not prove both authorizations exist — wait for independent
            grant-status verification.
          </p>
        </section>
      )}
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-white/55">
      <span>{label}</span>
      <span className="text-white/75">{value}</span>
    </div>
  );
}

function phaseLabel(phase: GrantVerificationPhase): string {
  switch (phase) {
    case "verified_ready":
      return "both auths OK · gateway ready";
    case "verified_partial":
      return "partial — only one authorization on-chain";
    case "verification_unavailable":
      return "verification unavailable";
    case "broadcast_unknown":
      return "broadcast outcome uncertain";
    default:
      return "pending";
  }
}

function OnChainVsGatewaySummary({
  policy,
  plan,
}: {
  policy: SessionGrantContext["policy"];
  plan: GrantTxPlanResponse;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 text-[10px]">
      <div className="border border-white/10 rounded p-2 bg-white/5">
        <p className="text-[#75bfcf] uppercase tracking-wide mb-1">On-chain permissions</p>
        <ul className="text-white/60 list-disc list-inside space-y-0.5">
          <li>CreateDerivativeLimitOrderAuthz</li>
          <li>CancelDerivativeOrderAuthz</li>
          <li>Subaccount: {plan.grantPlan.subaccountId.slice(0, 18)}…</li>
          <li>{plan.grantPlan.marketIds.length} market(s) in scope</li>
        </ul>
      </div>
      <div className="border border-amber-400/20 rounded p-2 bg-amber-400/5">
        <p className="text-amber-200/90 uppercase tracking-wide mb-1">Gateway policy (off-chain)</p>
        <ul className="text-white/60 list-disc list-inside space-y-0.5">
          <li>maxOrderNotional: {policy.maxOrderNotional ?? "—"}</li>
          <li>maxMarginPerOrder: {policy.maxMarginPerOrder}</li>
          <li>maxLeverage: {policy.maxLeverage}×</li>
          <li>dailyMarginBudget: {policy.dailyMarginBudget}</li>
        </ul>
        <p className="text-white/40 mt-1">
          Injective AuthZ does not encode these limits — Fence enforces them before execute.
        </p>
      </div>
    </div>
  );
}
