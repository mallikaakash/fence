const KEY = "intentguard.protection.summary";
const PRESET_KEY = "intentguard.protection.walletPresets";

export type ProtectionSummary = {
  sessionId: string;
  ownerInj: string;
  granteeInj: string;
  marketIds: string[];
  maxOrderNotional: string;
  dailyMarginBudget: string;
  maxLeverage: number;
  grantExpirySeconds: number;
  grantReady?: boolean;
  /** From session create response — bot access code lifetime (not on-chain grant expiry). */
  agentTokenExpiresAt?: string;
  updatedAt: string;
};

export function loadProtectionSummary(): ProtectionSummary | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ProtectionSummary;
  } catch {
    return null;
  }
}

export function saveProtectionSummary(summary: ProtectionSummary) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(summary));
}

export function clearProtectionSummary() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

export type PolicyPresetId = "conservative" | "standard" | "custom";

export function loadWalletPreset(ownerInj: string): PolicyPresetId | null {
  if (typeof window === "undefined" || !ownerInj.startsWith("inj1")) return null;
  try {
    const map = JSON.parse(localStorage.getItem(PRESET_KEY) ?? "{}") as Record<
      string,
      PolicyPresetId
    >;
    return map[ownerInj] ?? null;
  } catch {
    return null;
  }
}

export function saveWalletPreset(ownerInj: string, preset: PolicyPresetId) {
  if (typeof window === "undefined" || !ownerInj.startsWith("inj1")) return;
  try {
    const map = JSON.parse(localStorage.getItem(PRESET_KEY) ?? "{}") as Record<
      string,
      PolicyPresetId
    >;
    map[ownerInj] = preset;
    localStorage.setItem(PRESET_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}

export const POLICY_PRESETS: Record<
  PolicyPresetId,
  { maxOrder: string; dailyBudget: string; maxLeverage: string; label: string }
> = {
  conservative: {
    label: "Conservative",
    maxOrder: "25",
    dailyBudget: "200",
    maxLeverage: "3",
  },
  standard: {
    label: "Standard",
    maxOrder: "50",
    dailyBudget: "500",
    maxLeverage: "5",
  },
  custom: {
    label: "Custom",
    maxOrder: "50",
    dailyBudget: "500",
    maxLeverage: "5",
  },
};
