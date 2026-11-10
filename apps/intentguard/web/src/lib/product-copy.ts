/** Canonical user-facing labels — Phase 1 product language. */

export const TESTNET_DISCLOSURE =
  "Injective testnet — preview only. Practice with test funds. Not investment advice.";

export const HOSTED_RIBBON =
  "Injective testnet preview — set protection, connect a bot, and trade within your rules.";

export const NAV = {
  home: "Home",
  setup: "Set up",
  dashboard: "Dashboard",
  walletCheck: "Wallet check",
} as const;

export const FOOTER = {
  sampleTrade: "Try a sample trade",
  sampleAi: "Try sample AI phrases",
  activity: "Activity",
  howItWorks: "How it works & limits",
  developers: "Developers (API & MCP)",
} as const;

export const SETUP_STEPS = [
  "Understand protection",
  "Connect wallet",
  "Set limits",
  "Approve permissions",
  "Confirmation",
] as const;

export const SETUP_STEP_SUBTITLES: Record<number, string> = {
  0: "Why limits matter on Injective testnet — about three minutes.",
  1: "Connect Keplr or Leap on Injective testnet.",
  2: "Choose markets and size limits for any bot or AI.",
  3: "Review what you approve in your wallet — not active until Keplr confirms.",
  4: "Your rules are saved — finish optional steps on the Dashboard.",
};
