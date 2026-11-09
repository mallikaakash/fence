"use client";

import { useCallback, useEffect, useState } from "react";
import { SPIKE_MARKET_ID } from "@/lib/constants";
import {
  gatewayAuditEvents,
  gatewayCreateSession,
  gatewayHealth,
  gatewayListSessions,
  gatewayPropose,
  gatewayRevokeSession,
} from "@/lib/gateway/client";
import {
  loadGatewaySettings,
  saveGatewaySettings,
  type GatewaySettings,
} from "@/lib/gateway/storage";

type SessionView = {
  sessionId: string;
  granteeAddress: string;
  revoked: boolean;
  policyEnglish: string;
  dailyMarginUsed: string;
};

export function OwnerConsole() {
  const [settings, setSettings] = useState<GatewaySettings>({
    baseUrl: "http://127.0.0.1:8787",
    ownerApiKey: "",
    agentApiToken: "",
  });
  const [health, setHealth] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [events, setEvents] = useState<unknown[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastAgentToken, setLastAgentToken] = useState<string | null>(null);
  const [proposeResult, setProposeResult] = useState<string | null>(null);
  const [ownerInj, setOwnerInj] = useState("");

  useEffect(() => {
    setSettings(loadGatewaySettings());
  }, []);

  const persist = useCallback((next: Partial<GatewaySettings>) => {
    setSettings((prev) => {
      const merged = { ...prev, ...next };
      saveGatewaySettings(merged);
      return merged;
    });
  }, []);

  async function ping() {
    setBusy(true);
    setHealth(null);
    try {
      const { res, json } = await gatewayHealth(settings);
      setHealth(
        res.ok
          ? `OK v${(json as { version?: string }).version ?? "?"} execute=${(json as { executeEnabled?: boolean }).executeEnabled}`
          : `Error ${res.status}`,
      );
    } catch (e) {
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
      const token = (json as { agentApiToken: string }).agentApiToken;
      setLastAgentToken(token);
      persist({ agentApiToken: token });
      await refreshSessions();
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
      <h1 className="text-3xl font-light text-orange-400">Owner console</h1>
      <p className="text-white/70 text-sm">
        Connects to your sidecar gateway. Keys stay in this browser localStorage — use
        on a trusted machine or run the web app locally.
      </p>

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
          <label className="block text-white/60 text-xs mb-1">Owner API key (own_…)</label>
          <input
            type="password"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
            value={settings.ownerApiKey}
            onChange={(e) => persist({ ownerApiKey: e.target.value })}
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
            {!s.revoked && (
              <button
                type="button"
                className="text-xs text-red-300 border border-red-400/40 px-3 py-1 rounded-full"
                onClick={() => revoke(s.sessionId)}
              >
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="border border-white/10 rounded-xl p-6 bg-white/5">
        <h2 className="text-[#75bfcf] text-lg mb-2">Agent propose test</h2>
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
