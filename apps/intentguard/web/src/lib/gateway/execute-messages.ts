/** Turn gateway execute JSON into user-facing text. */
export function formatExecuteFeedback(json: unknown, fallbackStatus?: number): string {
  const o = json as {
    userHint?: string;
    reasons?: string[];
    error?: string;
    status?: string;
    txHash?: string;
  };
  if (o.txHash) {
    return `Trade submitted: ${o.txHash}`;
  }
  if (o.userHint) {
    const raw = o.reasons?.[0];
    return raw ? `${raw}\n\n${o.userHint}` : o.userHint;
  }
  if (o.reasons?.length) {
    return o.reasons.join("; ");
  }
  if (o.error) {
    return o.error;
  }
  if (fallbackStatus && fallbackStatus >= 400) {
    return JSON.stringify(json);
  }
  return JSON.stringify(json);
}
