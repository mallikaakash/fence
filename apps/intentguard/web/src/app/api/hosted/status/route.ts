import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Whether this Vercel deployment can proxy to a real sidecar (no secrets in response). */
export async function GET() {
  const upstream = process.env.INTENTGUARD_GATEWAY_URL?.replace(/\/$/, "");
  const ownerConfigured = Boolean(process.env.INTENTGUARD_OWNER_API_KEY?.trim());

  return NextResponse.json({
    proxyConfigured: Boolean(upstream),
    ownerProxyConfigured: ownerConfigured,
    /** Console should default to /api/gateway when true */
    useHostedProxyDefault:
      Boolean(upstream) && process.env.NEXT_PUBLIC_INTENTGUARD_PROXY_DEFAULT !== "0",
  });
}
