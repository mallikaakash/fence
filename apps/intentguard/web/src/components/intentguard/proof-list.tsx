"use client";

import { useEffect, useState } from "react";

type ProofPayload = {
  ok: boolean;
  grantUrl?: string | null;
  execUrl?: string | null;
  grantTx?: string;
  execTx?: string;
  note?: string;
  allowed?: {
    deny?: { reasons?: string[] };
    grant?: { granter?: string; grantee?: string };
  };
  spike?: {
    checklist?: Record<string, { pass: boolean | null }>;
    summary?: { passed: number; failed: number };
  };
};

export function ProofList() {
  const [data, setData] = useState<ProofPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/proof", { cache: "no-store" });
      const json = (await res.json()) as ProofPayload;
      if (!cancelled) {
        setData(json);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="text-white/60 text-sm">Loading spike evidence…</p>
      ) : null}
      {data?.note ? (
        <p className="text-amber-200/90 text-sm bg-black/30 border border-white/10 rounded px-3 py-2">
          {data.note}
        </p>
      ) : null}

      <div className="grid gap-3">
        <ProofRow
          label="Typed MsgGrant"
          tx={data?.grantTx}
          href={data?.grantUrl ?? undefined}
        />
        <ProofRow
          label="Allowed MsgExec"
          tx={data?.execTx}
          href={data?.execUrl ?? undefined}
        />
        <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-xl p-4 text-sm">
          <p className="text-white/70 text-xs uppercase mb-2">Notional deny</p>
          <p className="text-white/85">
            {data?.allowed?.deny?.reasons?.join("; ") ??
              "Gateway-only — no transaction hash"}
          </p>
        </div>
      </div>

      {data?.spike?.checklist ? (
        <div className="border-t border-white/15 pt-4">
          <p className="text-xs uppercase text-white/60 mb-2">Spike checklist</p>
          <ul className="grid gap-2 text-sm">
            {Object.entries(data.spike.checklist).map(([key, row]) => (
              <li
                key={key}
                className="flex justify-between gap-2 border border-white/10 rounded px-3 py-2 bg-black/20"
              >
                <span className="text-white/80">{key}</span>
                <span>
                  {row.pass === true
                    ? "✓"
                    : row.pass === false
                      ? "✗"
                      : "○"}
                </span>
              </li>
            ))}
          </ul>
          {data.spike.summary ? (
            <p className="text-white/50 text-xs mt-2">
              {data.spike.summary.passed} passed · {data.spike.summary.failed}{" "}
              failed
            </p>
          ) : null}
        </div>
      ) : null}

      {data?.allowed?.grant ? (
        <p className="text-xs text-white/50 font-mono break-all">
          granter {data.allowed.grant.granter} · grantee{" "}
          {data.allowed.grant.grantee}
        </p>
      ) : null}
    </div>
  );
}

function ProofRow({
  label,
  tx,
  href,
}: {
  label: string;
  tx?: string;
  href?: string;
}) {
  return (
    <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-xl p-4">
      <p className="text-xs uppercase text-white/70">{label}</p>
      {tx && href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-[#75bfcf] text-sm break-all hover:underline"
        >
          {tx}
        </a>
      ) : (
        <p className="text-white/50 text-sm">—</p>
      )}
    </div>
  );
}
