"use client";

import { useCallback, useEffect, useState } from "react";
import { SPIKE_MARKET_ID } from "@/lib/constants";
import {
  gatewayAuditEvents,
  gatewayCreateSession,
  gatewayGrantStatus,
  gatewayGrantTxPlan,
  gatewayHealth,
  gatewayListSessions,
  gatewayPropose,
  gatewayRevokeSession,
} from "@/lib/gateway/client";
import { fetchHostedStatus } from "@/lib/hosted";
import {
  clearGatewaySettings,
  loadGatewaySettings,
  saveGatewaySettings,
  type GatewaySettings,
} from "@/lib/gateway/storage";
import type { GatewayHealthJson } from "@/lib/gateway/health-types";
import {
  GatewayConnectionWarnings,
  GatewayNetworkChip,
  GatewaySecretsPanel,
  GrantTxPlanPanel,
} from "@/components/intentguard/gateway-ux";

type SessionView = {
  sessionId: string;
  granteeAddress: string;
  revoked: boolean;
  policyEnglish: string;
  dailyMarginUsed: string;
};

type CreateSessionPayload = {
  agentApiToken: string;
  granteeAddress: string;
  subaccountId: string;
  grantPlan: {
    granteeAddress: string;
    subaccountId: string;
    msgTypes: string[];
    warnings: string[];
    gatewayEnforced: string[];
  };
  session: { sessionId: string; granteeAddress: string };
};

type SessionCreateResponse = {
  agentApiToken: string;
  subaccountId: string;
  grantPlan: CreateSessionPayload["grantPlan"];
  session: CreateSessionPayload["session"];
};

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-white/50 text-xs">{label}</div>
      <div className="flex gap-2 items-start">
        <code className="text-xs text-white/80 break-all flex-1">{value}</code>
        <button
          type="button"
          className="text-xs shrink-0 px-2 py-1 rounded border border-white/20 text-white/70"
          onClick={() => navigator.clipboard.writeText(value)}
        >
          Copy
        </button>
      </div>
    </div>
  );
}

export function OwnerConsole() {
  const [settings, setSettings] = useState<GatewaySettings>({
    baseUrl: "http://127.0.0.1:8787",
    ownerApiKey: "",
    agentApiToken: "",
  });
  const [health, setHealth] = useState<string | null>(null);
  const [healthInfo, setHealthInfo] = useState<GatewayHealthJson | null>(null);
  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [events, setEvents] = useState<unknown[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastAgentToken, setLastAgentToken] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState<CreateSessionPayload | null>(null);
  const [proposeResult, setProposeResult] = useState<string | null>(null);
  const [grantStatusById, setGrantStatusById] = useState<
    Record<string, { ready: boolean; scopeMatch: boolean; issues: string[] }>
  >({});
  const [ownerInj, setOwnerInj] = useState("");
  const [grantTxPlanById, setGrantTxPlanById] = useState<Record<string, string>>({});

  useEffect(() => {
    setSettings(loadGatewaySettings());
  }, []);

  useEffect(() => {
    const s = loadGatewaySettings();
    if (!s.baseUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const { res, json } = await gatewayHealth(s);
        if (cancelled) return;
        const h = json as GatewayHealthJson;
        if (res.ok) {
          setHealthInfo(h);
          setHealth(
            `OK v${h.version ?? "?"} · ${h.network ?? "?"} · execute=${h.executeEnabled ? "on" : "off"}`,
          );
        }
      } catch {
        if (!cancelled) setHealthInfo(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settings.baseUrl, settings.ownerApiKey]);

  const persist = useCallback((next: Partial<GatewaySettings>) => {
    setSettings((prev) => {
      const merged = { ...prev, ...next };
      saveGatewaySettings(merged);
      return merged;
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isHosted = !/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
    const storedUrl = localStorage.getItem("intentguard.gateway.url");
    if (!isHosted || storedUrl) return;
    void fetchHostedStatus().then((status) => {
      if (status?.useHostedProxyDefault && status.proxyConfigured) {
        persist({
          baseUrl: `${window.location.origin}/api/gateway`,
          ownerApiKey: "",
        });
      }
    });
  }, [persist]);

  async function ping() {
    setBusy(true);
    setHealth(null);
    try {
      const { res, json } = await gatewayHealth(settings);
      const h = json as GatewayHealthJson;
      if (res.ok) {
        setHealthInfo(h);
        setHealth(
          `OK v${h.version ?? "?"} · ${h.network ?? "network?"} · execute=${h.executeEnabled ? "on" : "off"} · sessions=${h.sessions ?? 0}`,
        );
      } else {
        setHealthInfo(null);
        setHealth(`Error ${res.status}`);
      }
    } catch (e) {
      setHealthInfo(null);
      setHealth(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function refreshSessions() {
    setBusy(true);
    try {
      const { res, json } = await gatewayListSessions(settings);
      if (res.ok) {
        setSessions((json as { sessions: SessionView[] }).sessions ?? []);
      }
    } finally {
      setBusy(false);
    }
  }

  async function createSession() {
    if (!ownerInj.startsWith("inj1")) {
      alert("Enter a valid owner inj1… address");
      return;
    }
    setBusy(true);
    try {
      const { res, json } = await gatewayCreateSession(settings, {
        ownerInjectiveAddress: ownerInj,
        subaccountIndex: 1,
        policy: {
          version: 1,
          marketIds: [SPIKE_MARKET_ID],
          maxMarginPerOrder: "100",
          maxOrderNotional: "50",
          maxLeverage: 5,
          dailyMarginBudget: "500",
        },
      });
      if (!res.ok) {
        alert(JSON.stringify(json));
        return;
      }
      const raw = json as SessionCreateResponse;
      const created: CreateSessionPayload = {
        agentApiToken: raw.agentApiToken,
        granteeAddress: raw.session.granteeAddress,
        subaccountId: raw.subaccountId,
        grantPlan: raw.grantPlan,
        session: raw.session,
      };
      setOnboarding(created);
      setLastAgentToken(created.agentApiToken);
      persist({ agentApiToken: created.agentApiToken });
      await refreshSessions();
      await checkGrant(created.session.sessionId);
    } finally {
      setBusy(false);
    }
  }

  async function loadGrantTxPlan(sessionId: string) {
    setBusy(true);
    try {
      const { res, json } = await gatewayGrantTxPlan(settings, sessionId);
      if (res.ok) {
        setGrantTxPlanById((prev) => ({
          ...prev,
          [sessionId]: JSON.stringify(json, null, 2),
        }));
      } else {
        alert(JSON.stringify(json));
      }
    } finally {
      setBusy(false);
    }
  }

  function useLocalSidecar() {
    persist({ baseUrl: "http://127.0.0.1:8787" });
  }

  function useHostedProxy() {
    if (typeof window === "undefined") return;
    persist({
      baseUrl: `${window.location.origin}/api/gateway`,
      ownerApiKey: "",
    });
  }

  const proxyMode = settings.baseUrl.includes("/api/gateway");

  function clearSecrets() {
    clearGatewaySettings();
    setSettings({
      baseUrl: "http://127.0.0.1:8787",
      ownerApiKey: "",
      agentApiToken: "",
    });
    setHealth(null);
    setHealthInfo(null);
  }

  async function checkGrant(sessionId: string) {
    setBusy(true);
    try {
      const { res, json } = await gatewayGrantStatus(settings, sessionId);
      if (res.ok) {
        const gs = (json as {
          grantStatus: { ready: boolean; scopeMatch: boolean; issues: string[] };
        }).grantStatus;
        setGrantStatusById((prev) => ({
          ...prev,
          [sessionId]: {
            ready: gs.ready,
            scopeMatch: gs.scopeMatch,
            issues: gs.issues,
          },
        }));
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    try {
      await gatewayRevokeSession(settings, id);
      await refreshSessions();
    } finally {
      setBusy(false);
    }
  }

  async function loadAudit() {
    setBusy(true);
    try {
      const { res, json } = await gatewayAuditEvents(settings);
      if (res.ok) setEvents((json as { events: unknown[] }).events ?? []);
    } finally {
      setBusy(false);
    }
  }

  async function testPropose(mode: "ok" | "deny") {
    setBusy(true);
    setProposeResult(null);
    const intent =
      mode === "deny"
        ? {
            marketId: SPIKE_MARKET_ID,
            margin: "5",
            leverage: 2,
            price: "100",
            quantity: "1",
          }
        : {
            marketId: SPIKE_MARKET_ID,
            margin: "2",
            leverage: 2,
            price: "1",
            quantity: "2",
          };
    try {
      const { res, json } = await gatewayPropose(settings, intent);
      setProposeResult(`${res.status} ${JSON.stringify(json)}`);
    } catch (e) {
      setProposeResult(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-8 max-w-3xl mx-auto px-6 pt-32 pb-20">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-light text-orange-400">Owner console</h1>
        <GatewayNetworkChip health={healthInfo} />
      </div>
      <GatewayConnectionWarnings baseUrl={settings.baseUrl} proxyMode={proxyMode} />
      <GatewaySecretsPanel onClear={clearSecrets} />
      <p className="text-white/70 text-sm">
        {proxyMode
          ? "Using hosted gateway proxy — owner key is injected on the server when INTENTGUARD_OWNER_API_KEY is set on Vercel."
          : "Default: local sidecar at 127.0.0.1:8787 while npm run gateway runs on this machine. Prefer npm run web:dev for owner keys in localStorage."}
      </p>

      <div className="flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          className="px-3 py-1 rounded-full border border-white/20 text-white/80"
          onClick={useLocalSidecar}
        >
          Local sidecar
        </button>
        <button
          type="button"
          className="px-3 py-1 rounded-full border border-[#75bfcf]/40 text-[#75bfcf]"
          onClick={useHostedProxy}
        >
          Vercel proxy (/api/gateway)
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-white/60 text-xs mb-1">Gateway URL</label>
          <input
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
            value={settings.baseUrl}
            onChange={(e) => persist({ baseUrl: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-white/60 text-xs mb-1">
            Owner API key (own_…){proxyMode ? " — optional via server proxy" : ""}
          </label>
          <input
            type="password"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
            value={settings.ownerApiKey}
            onChange={(e) => persist({ ownerApiKey: e.target.value })}
            placeholder={proxyMode ? "Leave empty if Vercel has INTENTGUARD_OWNER_API_KEY" : ""}
          />
        </div>
        <div>
          <label className="block text-white/60 text-xs mb-1">Agent token (agt_…)</label>
          <input
            type="password"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
            value={settings.agentApiToken}
            onChange={(e) => persist({ agentApiToken: e.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={ping}
          className="px-4 py-2 rounded-full bg-[#75bfcf]/20 border border-[#75bfcf]/50 text-sm text-white"
        >
          Health
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={refreshSessions}
          className="px-4 py-2 rounded-full bg-white/10 border border-white/20 text-sm text-white"
        >
          List sessions
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={loadAudit}
          className="px-4 py-2 rounded-full bg-white/10 border border-white/20 text-sm text-white"
        >
          Audit log
        </button>
      </div>
      {health && <p className="text-sm text-[#75bfcf]">{health}</p>}

      <div className="border border-white/10 rounded-xl p-6 bg-white/5 space-y-4">
        <h2 className="text-[#75bfcf] text-lg">New session</h2>
        <input
          placeholder="Owner inj1… address"
          className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
          value={ownerInj}
          onChange={(e) => setOwnerInj(e.target.value)}
        />
        <button
          type="button"
          disabled={busy}
          onClick={createSession}
          className="px-4 py-2 rounded-full bg-orange-400/20 border border-orange-400/50 text-sm text-white"
        >
          Create session + grant plan
        </button>
        {lastAgentToken && (
          <p className="text-xs text-white/60 break-all">
            New agent token (copy to agent): {lastAgentToken}
          </p>
        )}
      </div>

      {onboarding && (
        <div className="border border-[#75bfcf]/40 rounded-xl p-6 bg-[#75bfcf]/5 space-y-4">
          <h2 className="text-[#75bfcf] text-lg">Onboarding checklist</h2>
          <ol className="list-decimal list-inside text-sm text-white/75 space-y-2">
            <li>Sign typed AuthZ MsgGrant(s) for grantee below (Keplr / injectived).</li>
            <li>Fund grantee with INJ for MsgExec gas.</li>
            <li>Deposit quote to owner subaccount {onboarding.subaccountId.slice(0, 18)}…</li>
            <li>Copy agent token into agent runtime only.</li>
            <li>
              Optional: enable <code className="text-white/90">INTENTGUARD_EXECUTE=1</code> on
              sidecar for live orders.
            </li>
          </ol>
          <CopyField label="Grantee (AuthZ grantee)" value={onboarding.granteeAddress} />
          <CopyField label="Subaccount" value={onboarding.subaccountId} />
          <CopyField label="Agent token" value={onboarding.agentApiToken} />
          <div className="pt-2 border-t border-white/10">
            <p className="text-white/60 text-xs">
              Msg types: {onboarding.grantPlan.msgTypes.join(", ")}
            </p>
            {onboarding.grantPlan.warnings.length > 0 && (
              <p className="text-amber-200/80 text-xs mt-2">
                {onboarding.grantPlan.warnings.join(" ")}
              </p>
            )}
            <p className="text-white/50 text-xs mt-2">
              Gateway enforces: {onboarding.grantPlan.gatewayEnforced.join("; ")}
            </p>
            <pre className="text-[10px] text-white/40 max-h-48 overflow-auto mt-2 border border-white/10 rounded p-2">
              {JSON.stringify(onboarding.grantPlan, null, 2)}
            </pre>
          </div>
        </div>
      )}

      <div className="border border-white/10 rounded-xl p-6 bg-white/5 space-y-3">
        <h2 className="text-[#75bfcf] text-lg">Sessions</h2>
        {sessions.length === 0 && (
          <p className="text-white/50 text-sm">No sessions loaded.</p>
        )}
        {sessions.map((s) => (
          <div key={s.sessionId} className="flex justify-between gap-4 flex-wrap border-t border-white/5 pt-3">
            <div className="text-sm text-white/80">
              <div className="font-mono text-xs">{s.sessionId}</div>
              <div className="text-white/50">{s.granteeAddress}</div>
              <div className="text-white/40 text-xs">{s.policyEnglish}</div>
            </div>
            <div className="flex flex-col gap-1 items-end">
              {grantStatusById[s.sessionId] && (
                <span
                  className={
                    grantStatusById[s.sessionId].ready
                      ? "text-green-300 text-xs"
                      : "text-amber-200 text-xs"
                  }
                >
                  On-chain:{" "}
                  {grantStatusById[s.sessionId].ready
                    ? "ready"
                    : grantStatusById[s.sessionId].scopeMatch
                      ? "scope OK (check expiry)"
                      : "pending"}
                </span>
              )}
              {grantTxPlanById[s.sessionId] && (
                <GrantTxPlanPanel
                  json={grantTxPlanById[s.sessionId]}
                  onCopy={() =>
                    void navigator.clipboard.writeText(grantTxPlanById[s.sessionId])
                  }
                />
              )}
              {!s.revoked && (
                <>
                  <button
                    type="button"
                    className="text-xs text-[#75bfcf] border border-[#75bfcf]/40 px-3 py-1 rounded-full"
                    onClick={() => checkGrant(s.sessionId)}
                  >
                    Check grant
                  </button>
                  <button
                    type="button"
                    className="text-xs text-white/70 border border-white/20 px-3 py-1 rounded-full"
                    onClick={() => loadGrantTxPlan(s.sessionId)}
                  >
                    Grant tx plan
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-300 border border-red-400/40 px-3 py-1 rounded-full"
                    onClick={() => revoke(s.sessionId)}
                  >
                    Revoke
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="border border-white/10 rounded-xl p-6 bg-white/5">
        <h2 className="text-[#75bfcf] text-lg mb-2">Agent propose test</h2>
        <p className="text-white/50 text-xs mb-2">
          <code className="text-white/70">POST /v1/propose</code> gates policy only — it does{" "}
          <strong className="text-white/80">not</strong> broadcast orders (use execute on sidecar).
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || !settings.agentApiToken}
            onClick={() => testPropose("ok")}
            className="text-sm px-3 py-1 rounded-full border border-green-400/40 text-green-200"
          >
            In-policy
          </button>
          <button
            type="button"
            disabled={busy || !settings.agentApiToken}
            onClick={() => testPropose("deny")}
            className="text-sm px-3 py-1 rounded-full border border-red-400/40 text-red-200"
          >
            Oversize notional
          </button>
        </div>
        {proposeResult && (
          <pre className="text-xs text-white/60 mt-2 whitespace-pre-wrap">{proposeResult}</pre>
        )}
      </div>

      {events.length > 0 && (
        <div className="border border-white/10 rounded-xl p-6 bg-white/5">
          <h2 className="text-[#75bfcf] text-lg mb-2">Recent audit</h2>
          <pre className="text-xs text-white/50 max-h-64 overflow-auto">
            {JSON.stringify(events.slice(-20), null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
}
