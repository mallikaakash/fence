/** True when web runs on Vercel / public host (not local dev). */
export function isHostedHostname(hostname: string): boolean {
  return !/^(localhost|127\.0\.0\.1)$/i.test(hostname);
}

export type HostedStatus = {
  proxyConfigured: boolean;
  ownerProxyConfigured: boolean;
  useHostedProxyDefault: boolean;
};

export async function fetchHostedStatus(): Promise<HostedStatus | null> {
  try {
    const res = await fetch("/api/hosted/status", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as HostedStatus;
  } catch {
    return null;
  }
}
