import { NextResponse } from "next/server";
import { EXPLORER_TX } from "@/lib/constants";
import { readSpikeJson } from "@/lib/server/spike";

export const runtime = "nodejs";

export async function GET() {
  const allowed = readSpikeJson<unknown>("allowed-order.json");
  const spike = readSpikeJson<unknown>("spike-results.json");

  type Grant = { txHash?: string };
  type Ok = { txHash?: string };
  const grantTx = (allowed as { grant?: Grant })?.grant?.txHash;
  const execTx = (allowed as { ok?: Ok })?.ok?.txHash;

  return NextResponse.json({
    ok: true,
    explorerBase: EXPLORER_TX,
    grantTx,
    execTx,
    grantUrl: grantTx ? `${EXPLORER_TX}/${grantTx}` : null,
    execUrl: execTx ? `${EXPLORER_TX}/${execTx}` : null,
    allowed,
    spike,
    note: !allowed
      ? "Run npm run spike:notional in apps/intentguard for local proof files."
      : undefined,
  });
}
