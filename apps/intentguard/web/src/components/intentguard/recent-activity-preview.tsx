"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { gatewayAuditEvents } from "@/lib/gateway/client";
import { fetchHostedStatus } from "@/lib/hosted";
import { loadGatewaySettings } from "@/lib/gateway/storage";

type AuditEvent = { at: string; type: string; message: string };

function plainLabel(type: string, message: string): string {
  if (type.includes("denied")) return "Blocked";
  if (type.includes("allowed") || type.includes("propose")) return "Checked";
  if (type.includes("execute")) return "Sent to exchange";
  if (message.toLowerCase().includes("denied")) return "Blocked";
  if (message.toLowerCase().includes("allowed")) return "Allowed";
  return "Activity";
}

export function RecentActivityPreview() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const status = await fetchHostedStatus();
        const settings = loadGatewaySettings();
        if (!status?.proxyConfigured && !settings.ownerApiKey) {
          if (!cancelled) setLoading(false);
          return;
        }
        const { res, json } = await gatewayAuditEvents(settings);
        if (res.ok && !cancelled) {
          const all = ((json as { events?: AuditEvent[] }).events ?? []).slice().reverse();
          setEvents(all.slice(0, 5));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="border border-white/15 rounded-xl p-4 bg-black/25 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-white/90">Recent activity</h3>
        <Link href="/history" className="text-xs text-[#75bfcf] underline">
          View all
        </Link>
      </div>
      {loading ? (
        <p className="text-xs text-white/45">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-xs text-white/50">
          No activity yet. Try a{" "}
          <Link href="/trade" className="text-[#75bfcf] underline">
            practice trade
          </Link>{" "}
          or connect a bot.
        </p>
      ) : (
        <ul className="space-y-2">
          {events.map((ev, i) => (
            <li
              key={`${ev.at}-${i}`}
              className="text-xs border border-white/10 rounded-lg px-3 py-2 flex flex-wrap justify-between gap-2"
            >
              <span className="text-white/80">{ev.message}</span>
              <span className="text-[#75bfcf] shrink-0">{plainLabel(ev.type, ev.message)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
