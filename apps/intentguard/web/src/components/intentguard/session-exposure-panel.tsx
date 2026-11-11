"use client";

import { useCallback, useEffect, useState } from "react";
import { gatewaySessionExposure } from "@/lib/gateway/client";
import { loadGatewaySettings } from "@/lib/gateway/storage";
import { loadProtectionSummary } from "@/lib/protection-state";
import {
  exposureHeadline,
  exposurePanelClass,
  exposureSectionCaption,
  type SessionExposureJson,
} from "@/lib/exposure";

function PositionList({
  items,
  source,
  overallStatus,
}: {
  items: SessionExposureJson["positions"];
  source: SessionExposureJson["dataSources"]["positions"];
  overallStatus: SessionExposureJson["overallStatus"];
}) {
  const caption = exposureSectionCaption({
    kind: "positions",
    source,
    itemCount: items.length,
    overallStatus,
  });
  if (caption) {
    return <p className="text-xs text-white/45">{caption}</p>;
  }
  return (
    <ul className="space-y-2 text-xs">
      {items.map((p) => (
        <li key={`${p.marketId}-${p.direction}-${p.quantity}`} className="border border-white/10 rounded-lg px-3 py-2">
          <p className="text-white/85">
            {p.ticker ?? "Market"} · {p.direction.toUpperCase()} · qty {p.quantity}
            {p.quoteSymbol ? ` (${p.quoteSymbol})` : ""}
          </p>
          <p className="text-white/50 mt-0.5">
            {p.markPrice ? `Mark ${p.markPrice}` : null}
            {p.entryPrice ? ` · Entry ${p.entryPrice}` : null}
            {p.margin ? ` · Margin ${p.margin}` : null}
            {p.unrealizedPnl ? ` · uPnL ${p.unrealizedPnl}` : null}
          </p>
          {p.notional?.status === "available" ? (
            <p className="text-white/40">Est. notional (mark/entry): {p.notional.human}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function OpenOrdersList({
  items,
  source,
  overallStatus,
}: {
  items: SessionExposureJson["openOrders"];
  source: SessionExposureJson["dataSources"]["openOrders"];
  overallStatus: SessionExposureJson["overallStatus"];
}) {
  const caption = exposureSectionCaption({
    kind: "openOrders",
    source,
    itemCount: items.length,
    overallStatus,
  });
  if (caption) {
    return <p className="text-xs text-white/45">{caption}</p>;
  }
  return (
    <ul className="space-y-2 text-xs">
      {items.map((o) => (
        <li key={o.orderHash} className="border border-white/10 rounded-lg px-3 py-2">
          <p className="text-white/85">
            {o.ticker ?? "Market"} · {o.direction.toUpperCase()} limit
            {o.reduceOnly ? " (reduce-only)" : ""}
          </p>
          <p className="text-white/50 mt-0.5">
            Price {o.limitPrice ?? "—"} · Qty {o.quantity} · {o.state}
          </p>
          {o.notional?.status === "available" ? (
            <p className="text-white/40">Pending notional (limit × remaining): {o.notional.human}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function UnknownOrdersList({ items }: { items: NonNullable<SessionExposureJson["unknownStateOrders"]> }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-[10px] uppercase text-amber-200/80 mb-1">Unrecognized order states</p>
      <ul className="space-y-2 text-xs">
        {items.map((o) => (
          <li key={o.orderHash} className="border border-amber-500/25 rounded-lg px-3 py-2">
            <p className="text-amber-100/90">
              {o.ticker ?? "Market"} · state &quot;{o.state}&quot; (not counted as open)
            </p>
            <p className="text-white/50 mt-0.5">
              Price {o.limitPrice ?? "—"} · Qty {o.quantity}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExposureSummary({ data }: { data: SessionExposureJson }) {
  const { summary } = data;
  const unknownCount = summary.unknownOrderStateCount ?? 0;
  return (
    <div className="text-xs text-white/60 space-y-1">
      <p>
        {summary.positionCount} position(s) · {summary.openOrderCount} confirmed open order(s)
        {unknownCount > 0 ? ` · ${unknownCount} unrecognized state(s)` : ""}
      </p>
      {data.warnings?.length ? (
        <ul className="text-amber-200/85 list-disc list-inside space-y-0.5">
          {data.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
      {summary.byQuoteDenom.map((row) => (
        <div key={row.quoteDenom} className="border border-white/10 rounded-md px-2 py-1">
          <p className="text-white/70">{row.quoteSymbol ?? row.quoteDenom}</p>
          <p>
            Long:{" "}
            {row.longPositionNotional.status === "available"
              ? row.longPositionNotional.human
              : "—"}
            · Short:{" "}
            {row.shortPositionNotional.status === "available"
              ? row.shortPositionNotional.human
              : "—"}
          </p>
          <p>
            Open orders:{" "}
            {row.openOrderNotional.status === "available"
              ? row.openOrderNotional.human
              : "—"}
          </p>
        </div>
      ))}
    </div>
  );
}

export function SessionExposurePanel({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<SessionExposureJson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const summary = loadProtectionSummary();
    const settings = loadGatewaySettings();
    if (!summary?.sessionId || !settings.ownerApiKey) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { res, json } = await gatewaySessionExposure(settings, summary.sessionId);
      if (res.status === 410) {
        setError("Session ended on the gateway.");
        setData(null);
        return;
      }
      if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
      setData(json as SessionExposureJson);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!loadProtectionSummary()) {
    return (
      <p className="text-xs text-white/50">Complete setup to view subaccount exposure.</p>
    );
  }

  return (
    <div
      className={`border rounded-xl bg-black/30 space-y-3 ${compact ? "p-3" : "p-4"} ${
        data ? exposurePanelClass(data.overallStatus) : "border-white/10"
      }`}
    >
      <div className="flex flex-wrap justify-between gap-2 items-center">
        <p className="text-[#75bfcf] uppercase tracking-wide text-[10px]">
          Exposure snapshot (read-only)
        </p>
        <button
          type="button"
          className="text-[10px] px-2 py-0.5 rounded border border-white/20"
          disabled={loading}
          onClick={() => void refresh()}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      {error ? <p className="text-amber-200 text-xs">{error}</p> : null}
      {data ? (
        <>
          <p className="text-sm">{exposureHeadline(data.overallStatus)}</p>
          <p className="text-[10px] text-white/45">
            Retrieved {new Date(data.retrievedAt).toLocaleString()}. Indexer data may lag chain
            state. Pending orders are not positions.
          </p>
          {(data.overallStatus === "partial" || data.overallStatus === "unavailable") && (
            <p className="text-xs text-amber-200/90">
              {data.dataSources.positions.status !== "available"
                ? `Positions: ${data.dataSources.positions.error ?? "unavailable"}. `
                : null}
              {data.dataSources.openOrders.status !== "available"
                ? `Orders: ${data.dataSources.openOrders.error ?? "unavailable"}.`
                : null}
            </p>
          )}
          <ExposureSummary data={data} />
          <div>
            <p className="text-[10px] uppercase text-white/45 mb-1">Positions</p>
            <PositionList
              items={data.positions}
              source={data.dataSources.positions}
              overallStatus={data.overallStatus}
            />
          </div>
          <div>
            <p className="text-[10px] uppercase text-white/45 mb-1">Open orders</p>
            <OpenOrdersList
              items={data.openOrders}
              source={data.dataSources.openOrders}
              overallStatus={data.overallStatus}
            />
          </div>
          <UnknownOrdersList items={data.unknownStateOrders ?? []} />
          <p className="text-[10px] text-white/40">{data.disclaimer}</p>
        </>
      ) : !loading && !error ? (
        <p className="text-xs text-white/50">Loading exposure…</p>
      ) : null}
    </div>
  );
}
