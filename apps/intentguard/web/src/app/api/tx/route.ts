import { NextResponse } from "next/server";

export const runtime = "nodejs";

const REST = {
  testnet: "https://testnet.sentry.lcd.injective.network",
  mainnet: "https://sentry.lcd.injective.network",
};

/** Verify a tx hash against Injective LCD (read-only). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hash = searchParams.get("hash")?.trim().replace(/^0x/i, "");
  const mainnet = searchParams.get("mainnet") === "1";
  if (!hash || hash.length < 16) {
    return NextResponse.json({ ok: false, error: "hash required" }, { status: 400 });
  }

  const rest = REST[mainnet ? "mainnet" : "testnet"];
  const url = `${rest}/cosmos/tx/v1beta1/txs/${hash.toUpperCase()}`;
  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { ok: false, error: `LCD ${res.status}`, detail: text.slice(0, 200) },
        { status: 404 },
      );
    }
    const body = (await res.json()) as {
      tx_response?: {
        height?: string;
        txhash?: string;
        code?: number;
        codespace?: string;
        raw_log?: string;
        timestamp?: string;
      };
    };
    const tr = body.tx_response;
    return NextResponse.json({
      ok: true,
      network: mainnet ? "mainnet" : "testnet",
      height: tr?.height,
      txHash: tr?.txhash ?? hash,
      code: tr?.code,
      success: tr?.code === 0,
      rawLog: tr?.raw_log,
      timestamp: tr?.timestamp,
      lcd: url,
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
