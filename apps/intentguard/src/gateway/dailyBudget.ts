/** UTC calendar day key for session daily margin counters. */
export function utcDayKey(nowMs = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** Reset dailyMarginUsed when the UTC day rolls over. */
export function ensureDailyMarginCurrentDay(
  session: { dailyMarginUsed: string; dailyMarginDay?: string },
  nowMs = Date.now(),
): void {
  const today = utcDayKey(nowMs);
  if (session.dailyMarginDay !== today) {
    session.dailyMarginDay = today;
    session.dailyMarginUsed = "0";
  }
}
