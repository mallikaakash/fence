"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SPIKE_MARKET_ID } from "@/lib/constants";
import {
  INJECTIVE_TESTNET_FAUCET_URL,
  HELIX_TESTNET_URL,
} from "@/lib/testnet-resources";
import {
  defaultSelectedMarketIds,
  TESTNET_PERP_MARKETS,
} from "@/lib/markets-testnet";
import {
  gatewayCreateSession,
  gatewayExecute,
  gatewayGrantStatus,
  gatewayGrantTxPlan,
  gatewayHealth,
  gatewayRevokeSession,
} from "@/lib/gateway/client";
import {
  loadGatewaySettings,
  saveGatewaySettings,
  type GatewaySettings,
} from "@/lib/gateway/storage";
import { fetchHostedStatus } from "@/lib/hosted";
import { OwnerWalletConnect } from "@/components/intentguard/owner-wallet-connect";
import { GrantBroadcastButton } from "@/components/intentguard/grant-broadcast-button";
import { GrantRevokeButton } from "@/components/intentguard/grant-revoke-button";
import { broadcastSendInj } from "@/lib/chain/broadcast-send-inj";
import { formatExecuteFeedback } from "@/lib/gateway/execute-messages";
import { ProtectionLiveStatus } from "@/components/intentguard/protection-live-status";
import {
  clearProtectionSummary,
  loadProtectionSummary,
  POLICY_PRESETS,
  saveProtectionSummary,
  saveWalletPreset,
  loadWalletPreset,
  type PolicyPresetId,
} from "@/lib/protection-state";

type WizardStep = "intro" | "connect" | "limits" | "sign" | "done";

const GRANT_EXPIRY_OPTIONS: { label: string; seconds: number }[] = [
  { label: "24 hours", seconds: 86_400 },
  { label: "7 days", seconds: 604_800 },
];

export function ProtectionWizard() {
  const [step, setStep] = useState<WizardStep>("intro");
  const [settings, setSettings] = useState<GatewaySettings>({
    baseUrl: "",
    ownerApiKey: "",
    agentApiToken: "",
  });
  const [ownerInj, setOwnerInj] = useState("");
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>(defaultSelectedMarketIds);
  const [preset, setPreset] = useState<PolicyPresetId>("standard");
  const [maxOrder, setMaxOrder] = useState(POLICY_PRESETS.standard.maxOrder);
  const [dailyBudget, setDailyBudget] = useState(POLICY_PRESETS.standard.dailyBudget);
  const [maxLeverage, setMaxLeverage] = useState(POLICY_PRESETS.standard.maxLeverage);
  const [grantExpirySeconds, setGrantExpirySeconds] = useState(86_400);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [granteeInj, setGranteeInj] = useState<string | null>(null);
  const [grantTxJson, setGrantTxJson] = useState<string | null>(null);
  const [grantReady, setGrantReady] = useState(false);
  const [gasTx, setGasTx] = useState<string | null>(null);
  const [executeEnabled, setExecuteEnabled] = useState(false);
  const [liveTx, setLiveTx] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);

  const persistSummary = useCallback(
    (partial: {
      sessionId: string;
      granteeInj: string;
      grantReady?: boolean;
    }) => {
      saveProtectionSummary({
        sessionId: partial.sessionId,
        ownerInj,
        granteeInj: partial.granteeInj,
        marketIds: selectedMarkets,
        maxOrderNotional: maxOrder,
        dailyMarginBudget: dailyBudget,
        maxLeverage: Number(maxLeverage),
        grantExpirySeconds,
        grantReady: partial.grantReady,
        updatedAt: new Date().toISOString(),
      });
    },
    [ownerInj, selectedMarkets, maxOrder, dailyBudget, maxLeverage, grantExpirySeconds],
  );

  useEffect(() => {
    const s = loadGatewaySettings();
    const saved = loadProtectionSummary();
    setSettings(s);
    if (saved) {
      setSessionId(saved.sessionId);
      setOwnerInj(saved.ownerInj);
      setGranteeInj(saved.granteeInj);
      setSelectedMarkets(saved.marketIds.length ? saved.marketIds : defaultSelectedMarketIds());
      setMaxOrder(saved.maxOrderNotional);
      setDailyBudget(saved.dailyMarginBudget);
      setMaxLeverage(String(saved.maxLeverage));
      setGrantExpirySeconds(saved.grantExpirySeconds);
      setGrantReady(Boolean(saved.grantReady));
      setPreset("custom");
    }

    void (async () => {
      const hosted = await fetchHostedStatus();
      let merged = s;
      if (hosted?.proxyConfigured && typeof window !== "undefined") {
        const proxy = `${window.location.origin}/api/gateway`;
        merged = { ...s, baseUrl: proxy, ownerApiKey: "" };
        setSettings(merged);
        saveGatewaySettings(merged);
      }

      const sid = saved?.sessionId;
      if (!sid || !merged.agentApiToken) return;

      const { res, json } = await gatewayGrantStatus(merged, sid);
      if (!res.ok) return;
      const gs = (json as { grantStatus: { ready: boolean } }).grantStatus;
      setGrantReady(gs.ready);
      setStep(gs.ready ? "done" : "sign");
      if (gs.ready) {
        void gatewayHealth(merged).then(({ res: hr, json: hj }) => {
          if (hr.ok) {
            setExecuteEnabled(Boolean((hj as { executeEnabled?: boolean }).executeEnabled));
          }
        });
      }
      const planRes = await gatewayGrantTxPlan(merged, sid);
      if (planRes.res.ok) {
        setGrantTxJson(JSON.stringify(planRes.json, null, 2));
      }
    })();
  }, []);

  const persist = useCallback((next: Partial<GatewaySettings>) => {
    setSettings((prev) => {
      const merged = { ...prev, ...next };
      saveGatewaySettings(merged);
      return merged;
    });
  }, []);

  function applyPreset(id: PolicyPresetId) {
    setPreset(id);
    if (id === "custom") return;
    const p = POLICY_PRESETS[id];
    setMaxOrder(p.maxOrder);
    setDailyBudget(p.dailyBudget);
    setMaxLeverage(p.maxLeverage);
  }

  function toggleMarket(marketId: string) {
    setSelectedMarkets((prev) => {
      if (prev.includes(marketId)) {
        if (prev.length <= 1) return prev;
        return prev.filter((id) => id !== marketId);
      }
      return [...prev, marketId];
    });
    setPreset("custom");
  }

  async function refreshGrantStatus() {
    if (!sessionId) return;
    const { res, json } = await gatewayGrantStatus(settings, sessionId);
    if (!res.ok) return;
    const gs = (json as { grantStatus: { ready: boolean } }).grantStatus;
    setGrantReady(gs.ready);
    if (granteeInj) {
      persistSummary({ sessionId, granteeInj, grantReady: gs.ready });
    }
    if (gs.ready) {
      setStep("done");
      void gatewayHealth(settings).then(({ res: hr, json: hj }) => {
        if (hr.ok) {
          setExecuteEnabled(Boolean((hj as { executeEnabled?: boolean }).executeEnabled));
        }
      });
    }
  }

  async function placeTestTrade() {
    setBusy(true);
    setError(null);
    setLiveTx(null);
    const marketId = selectedMarkets.includes(SPIKE_MARKET_ID)
      ? SPIKE_MARKET_ID
      : selectedMarkets[0]!;
    try {
      const { res, json } = await gatewayExecute(settings, {
        marketId,
        margin: "2",
        leverage: 2,
        price: "1",
        quantity: "2",
      });
      if (!res.ok) {
        setError(formatExecuteFeedback(json, res.status));
        return;
      }
      setLiveTx(formatExecuteFeedback(json, res.status));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function activateProtection() {
    if (!ownerInj.startsWith("inj1")) {
      setError("Connect your Injective wallet first.");
      return;
    }
    if (selectedMarkets.length < 1) {
      setError("Select at least one market.");
      return;
    }
    setBusy(true);
    setError(null);
    if (preset !== "custom") saveWalletPreset(ownerInj, preset);
    try {
      const { res, json } = await gatewayCreateSession(settings, {
        ownerInjectiveAddress: ownerInj,
        subaccountIndex: 1,
        grantExpirySeconds,
        policy: {
          version: 1,
          marketIds: selectedMarkets,
          maxMarginPerOrder: maxOrder,
          maxOrderNotional: maxOrder,
          maxLeverage: Number(maxLeverage),
          dailyMarginBudget: dailyBudget,
        },
      });
      if (!res.ok) {
        setError(JSON.stringify(json));
        return;
      }
      const raw = json as {
        agentApiToken: string;
        session: { sessionId: string; granteeAddress: string };
      };
      persist({ agentApiToken: raw.agentApiToken });
      setSessionId(raw.session.sessionId);
      setGranteeInj(raw.session.granteeAddress);
      persistSummary({
        sessionId: raw.session.sessionId,
        granteeInj: raw.session.granteeAddress,
        grantReady: false,
      });

      const planRes = await gatewayGrantTxPlan(settings, raw.session.sessionId);
      if (planRes.res.ok) {
        setGrantTxJson(JSON.stringify(planRes.json, null, 2));
      }
      setStep("sign");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function fundAssistantGas() {
    if (!granteeInj || !ownerInj) return;
    setBusy(true);
    setError(null);
    try {
      const { txHash } = await broadcastSendInj({
        network: "testnet",
        fromInj: ownerInj,
        toInj: granteeInj,
        amountInj: "0.2",
      });
      setGasTx(txHash);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function afterOnChainRevoke() {
    if (sessionId) {
      await gatewayRevokeSession(settings, sessionId).catch(() => undefined);
    }
    clearProtectionSummary();
    persist({ agentApiToken: "" });
    setRevoked(true);
    setSessionId(null);
    setGranteeInj(null);
    setGrantReady(false);
    setStep("intro");
  }

  useEffect(() => {
    if (step !== "sign" || !sessionId) return;
    void refreshGrantStatus();
    const t = setInterval(() => void refreshGrantStatus(), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sessionId]);

  const marketLabels = selectedMarkets
    .map((id) => TESTNET_PERP_MARKETS.find((m) => m.id === id)?.symbol ?? "market")
    .join(", ");

  return (
    <div className="border border-white/15 rounded-2xl bg-white/5 p-6 md:p-8 space-y-6">
      <StepBar step={step} />

      {step === "intro" && (
        <>
          <h2 className="text-lg text-white">AI trading power — not unlimited authority</h2>
          <div className="space-y-4 text-white/80 text-sm leading-relaxed">
            <p>
              Choose markets, set caps (per order, daily margin, leverage), and sign one timed AuthZ
              grant. IntentGuard runs every agent trade through your rules on Injective testnet before
              it hits the exchange.
            </p>
            <ul className="list-disc list-inside text-white/60 space-y-1 text-xs">
              <li>You sign in Keplr — we never see your seed phrase.</li>
              <li>Revoke anytime; grants expire automatically.</li>
            </ul>
            {revoked && (
              <p className="text-green-300/90 text-xs">Protection turned off. Start again when ready.</p>
            )}
            <button
              type="button"
              className="w-full md:w-auto px-6 py-3 rounded-md bg-orange-400 text-black font-medium"
              onClick={() => setStep("connect")}
            >
              Start — about 3 minutes
            </button>
          </div>
        </>
      )}

      {step === "connect" && (
        <>
          <h2 className="text-lg text-white">Connect your wallet</h2>
          <OwnerWalletConnect
            network="testnet"
            onAddress={(addr) => {
              setOwnerInj(addr);
              const saved = loadWalletPreset(addr);
              if (saved) applyPreset(saved);
            }}
          />
          {!ownerInj && (
            <p className="text-white/50 text-xs">
              Install Keplr and enable <strong>Injective testnet</strong>.
            </p>
          )}
          <button
            type="button"
            disabled={!ownerInj.startsWith("inj1")}
            className="px-6 py-2 rounded-full bg-[#75bfcf] text-black disabled:opacity-40"
            onClick={() => setStep("limits")}
          >
            Continue
          </button>
        </>
      )}

      {step === "limits" && (
        <>
          <h2 className="text-lg text-white">Your trading limits</h2>
          <p className="text-white/55 text-xs">
            Trades above max order notional or outside selected markets are blocked at the gateway.
          </p>

          <div className="mb-4">
            <span className="text-white/70 text-xs block mb-2">Markets</span>
            <div className="flex flex-wrap gap-2">
              {TESTNET_PERP_MARKETS.map((m) => {
                const on = selectedMarkets.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      on
                        ? "border-[#75bfcf] bg-[#75bfcf]/15 text-[#c8ecf4]"
                        : "border-white/20 text-white/50"
                    }`}
                    onClick={() => toggleMarket(m.id)}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-4">
            <span className="text-white/70 text-xs block mb-2">Preset</span>
            <div className="flex flex-wrap gap-2">
              {(["conservative", "standard", "custom"] as PolicyPresetId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`text-xs px-3 py-1.5 rounded-full border ${
                    preset === id
                      ? "border-orange-400/60 text-orange-300"
                      : "border-white/15 text-white/45"
                  }`}
                  onClick={() => applyPreset(id)}
                >
                  {POLICY_PRESETS[id].label}
                </button>
              ))}
            </div>
          </div>

          <LimitField
            label="Max size per order (USDT notional cap)"
            value={maxOrder}
            onChange={(v) => {
              setMaxOrder(v);
              setPreset("custom");
            }}
          />
          <LimitField
            label="Max per day (margin budget)"
            value={dailyBudget}
            onChange={(v) => {
              setDailyBudget(v);
              setPreset("custom");
            }}
          />
          <LimitField
            label="Max leverage"
            value={maxLeverage}
            onChange={(v) => {
              setMaxLeverage(v);
              setPreset("custom");
            }}
          />

          <label className="block space-y-1 mb-4">
            <span className="text-white/70 text-xs">On-chain grant expires</span>
            <select
              className="w-full bg-black/30 border border-white/15 rounded-lg px-3 py-2 text-white text-sm"
              value={grantExpirySeconds}
              onChange={(e) => setGrantExpirySeconds(Number(e.target.value))}
            >
              {GRANT_EXPIRY_OPTIONS.map((o) => (
                <option key={o.seconds} value={o.seconds}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            disabled={busy}
            className="px-6 py-2 rounded-full bg-orange-400 text-black disabled:opacity-40"
            onClick={() => void activateProtection()}
          >
            {busy ? "Creating…" : "Create protection"}
          </button>
        </>
      )}

      {step === "sign" && (
        <>
          <h2 className="text-lg text-white">Approve in Keplr</h2>
          <p className="text-white/70 text-sm">
            Limited trading on <strong>{marketLabels}</strong> — expires in{" "}
            {grantExpirySeconds === 604_800 ? "7 days" : "24 hours"}.
          </p>
          {grantTxJson && ownerInj && (
            <GrantBroadcastButton
              ownerInjectiveAddress={ownerInj}
              grantTxPlanJson={grantTxJson}
              network="testnet"
              onSuccess={() => void refreshGrantStatus()}
            />
          )}
          <p className="text-xs text-white/50">
            Status:{" "}
            <span className={grantReady ? "text-green-300" : "text-amber-200"}>
              {grantReady ? "Protection active on-chain" : "Waiting for Keplr…"}
            </span>
          </p>
        </>
      )}

      {step === "done" && (
        <>
          <h2 className="text-lg text-green-300">You&apos;re protected</h2>
          <p className="text-white/80 text-sm">
            Active on {marketLabels}. Max order {maxOrder}, daily margin {dailyBudget}, leverage ≤{" "}
            {maxLeverage}.
          </p>
          <ProtectionLiveStatus />
          <ol className="text-white/60 text-xs list-decimal list-inside space-y-2 border border-white/10 rounded-lg p-3">
            <li>
              Send assistant gas (Keplr, ~0.2 INJ) —{" "}
              <button
                type="button"
                disabled={busy || !granteeInj}
                className="text-[#75bfcf] underline"
                onClick={() => void fundAssistantGas()}
              >
                tap here
              </button>
              {gasTx && <span className="text-green-300"> ✓</span>}
            </li>
            <li>
              Deposit a little USDT to trade on{" "}
              <a
                href={HELIX_TESTNET_URL}
                target="_blank"
                rel="noreferrer"
                className="text-[#75bfcf] underline"
              >
                Helix testnet
              </a>{" "}
              (same wallet).
            </li>
            <li>
              Need INJ? Use the{" "}
              <a
                href={INJECTIVE_TESTNET_FAUCET_URL}
                target="_blank"
                rel="noreferrer"
                className="text-[#75bfcf] underline"
              >
                testnet faucet
              </a>{" "}
              on your wallet or assistant address.
            </li>
          </ol>
          {executeEnabled ? (
            <button
              type="button"
              disabled={busy}
              className="w-full px-4 py-2 rounded-full bg-orange-400 text-black text-sm font-medium"
              onClick={() => void placeTestTrade()}
            >
              Place small protected trade
            </button>
          ) : (
            <p className="text-amber-200/80 text-xs">Activating live trading on server… refresh in a minute.</p>
          )}
          {liveTx && (
            <p className="text-[10px] text-white/75 whitespace-pre-wrap border border-white/10 rounded p-2">
              {liveTx}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Link
              href="/trade"
              className="px-5 py-2 rounded-full bg-[#75bfcf] text-black text-sm font-medium"
            >
              Try your limits
            </Link>
            <Link
              href="/agent"
              className="px-5 py-2 rounded-full border border-white/30 text-white text-sm"
            >
              Demo agent
            </Link>
            <Link href="/portfolio" className="px-5 py-2 rounded-full border border-white/30 text-white text-sm">
              Scan risky grants
            </Link>
          </div>
          {ownerInj && granteeInj && (
            <div className="border border-red-400/25 rounded-lg p-3 space-y-2">
              <p className="text-white/60 text-xs">Turn off protection</p>
              <GrantRevokeButton
                granter={ownerInj}
                grantee={granteeInj}
                network="testnet"
                onSuccess={() => void afterOnChainRevoke()}
              />
            </div>
          )}
        </>
      )}

      {error && (
        <p className="text-red-300/90 text-xs border border-red-400/30 rounded px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}

function StepBar({ step }: { step: WizardStep }) {
  const order: WizardStep[] = ["intro", "connect", "limits", "sign", "done"];
  const idx = order.indexOf(step);
  return (
    <div className="flex gap-2 flex-wrap">
      {["Learn", "Wallet", "Limits", "Approve", "Done"].map((label, i) => (
        <span
          key={label}
          className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${
            i <= idx ? "border-[#75bfcf]/50 text-[#75bfcf]" : "border-white/15 text-white/35"
          }`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function LimitField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1 mb-3">
      <span className="text-white/70 text-xs">{label}</span>
      <input
        className="w-full bg-black/30 border border-white/15 rounded-lg px-3 py-2 text-white text-sm"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </label>
  );
}
