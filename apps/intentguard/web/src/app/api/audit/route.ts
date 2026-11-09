import { NextResponse } from "next/server";
import { fetchGranterGrants } from "@/lib/intentguard/fetchGrants";
import { scoreGrants } from "@/lib/intentguard/score";
import { formatGrantAuditReport } from "@/lib/intentguard/formatAudit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const granter = searchParams.get("granter")?.trim();
  const mainnet = searchParams.get("mainnet") === "1";

  if (!granter?.startsWith("inj1")) {
    return NextResponse.json(
      { ok: false, error: "Query param granter=inj1… required" },
      { status: 400 },
    );
  }

  try {
    const fetched = await fetchGranterGrants({
      granter,
      network: mainnet ? "mainnet" : "testnet",
    });
    const report = scoreGrants(granter, fetched.grants);
    const pretty = formatGrantAuditReport(report);
    return NextResponse.json({
      ok: true,
      endpoint: fetched.endpoint,
      report,
      pretty,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
