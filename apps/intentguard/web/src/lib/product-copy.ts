/** Canonical user-facing labels — Phase 1 product language. */

export const TESTNET_DISCLOSURE =
  "Injective testnet. Practice with test funds only. Not investment advice.";

export const HOSTED_RIBBON =
  "Injective testnet. Set protection, connect a bot, trade within your rules.";

export const NAV = {
  home: "Home",
  setup: "Get started",
  dashboard: "My session",
  help: "How it works",
  walletCheck: "Wallet check",
} as const;

export const FOOTER = {
  howItWorks: "How it works",
  walletCheck: "Wallet check",
  activity: "Activity",
  sampleTrade: "Sample trade",
  sampleAi: "Sample AI demo",
  developers: "Developers",
} as const;

export const SETUP_STEPS = [
  "Overview",
  "Connect wallet",
  "Your limits",
  "Approve in wallet",
  "All set",
] as const;

export const SETUP_STEP_SUBTITLES: Record<number, string> = {
  0: "Takes about three minutes. Testnet only.",
  1: "Keplr or Leap on Injective testnet.",
  2: "Pick markets and size caps.",
  3: "Sign what Keplr shows you.",
  4: "Fund the assistant wallet if you want live test trades.",
};
