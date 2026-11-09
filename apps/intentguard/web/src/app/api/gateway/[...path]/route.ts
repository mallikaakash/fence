import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const UPSTREAM = process.env.INTENTGUARD_GATEWAY_URL?.replace(/\/$/, "");
const OWNER_KEY = process.env.INTENTGUARD_OWNER_API_KEY;

/**
 * Optional server proxy for hosted Vercel + remote sidecar (design partners).
 * Set INTENTGUARD_GATEWAY_URL + INTENTGUARD_OWNER_API_KEY on Vercel.
 * Agent routes: client must send Authorization Bearer agt_…
 */
async function proxy(req: NextRequest, pathSegs: string[]) {
  if (!UPSTREAM) {
    return NextResponse.json(
      {
        error:
          "Gateway proxy not configured — run web locally with sidecar or set INTENTGUARD_GATEWAY_URL on Vercel",
      },
      { status: 503 },
    );
  }

  const path = "/" + pathSegs.join("/");
  const url = `${UPSTREAM}${path}${req.nextUrl.search}`;

  const headers = new Headers();
  const clientAuth = req.headers.get("authorization");
  const bearerToken = clientAuth?.startsWith("Bearer ")
    ? clientAuth.slice(7).trim()
    : clientAuth?.trim();
  if (bearerToken?.startsWith("agt_")) {
    headers.set("authorization", `Bearer ${bearerToken}`);
  } else if (bearerToken?.startsWith("own_")) {
    headers.set("authorization", `Bearer ${bearerToken}`);
  } else if (OWNER_KEY) {
    headers.set("authorization", `Bearer ${OWNER_KEY}`);
  }

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    const body = await req.text();
    if (body) {
      headers.set("content-type", "application/json");
      init.body = body;
    }
  }

  const upstream = await fetch(url, init);
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      "content-type":
        upstream.headers.get("content-type") ?? "application/json",
    },
  });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
