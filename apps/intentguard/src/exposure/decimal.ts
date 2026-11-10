/** Non-negative decimal → scaled bigint (no floats). */
export function parseSignedDecimal(
  raw: string | undefined,
): { ok: true; mantissa: bigint; scale: number; negative: boolean } | { ok: false } {
  if (raw === undefined || raw === null) return { ok: false };
  const trimmed = String(raw).trim();
  if (!trimmed) return { ok: false };
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return { ok: false };
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole, frac = ""] = unsigned.split(".");
  const scale = frac.length;
  const digits = (whole + frac).replace(/^0+/, "") || "0";
  try {
    return { ok: true, mantissa: BigInt(digits), scale, negative };
  } catch {
    return { ok: false };
  }
}

/** |a| × |b| at combined scale, returned at outScale (truncate toward zero). */
export function multiplyDecimals(
  a: bigint,
  aScale: number,
  b: bigint,
  bScale: number,
  outScale: number,
): bigint | null {
  if (outScale < 0 || aScale < 0 || bScale < 0) return null;
  const product = a * b;
  const combined = aScale + bScale;
  const diff = combined - outScale;
  if (diff >= 0) {
    const div = 10n ** BigInt(diff);
    return product / div;
  }
  const mul = 10n ** BigInt(-diff);
  return product * mul;
}

export function formatScaled(mantissa: bigint, scale: number, maxFrac = 6): string {
  const neg = mantissa < 0n;
  const abs = neg ? -mantissa : mantissa;
  const s = abs.toString();
  if (scale === 0) return `${neg ? "-" : ""}${s}`;
  const pad = s.padStart(scale + 1, "0");
  const whole = pad.slice(0, -scale) || "0";
  let frac = pad.slice(-scale).replace(/0+$/, "");
  if (frac.length > maxFrac) frac = frac.slice(0, maxFrac);
  const body = frac ? `${whole}.${frac}` : whole;
  return `${neg ? "-" : ""}${body}`;
}

export function absScaled(
  m: bigint,
  negative: boolean,
): { mantissa: bigint; negative: false } {
  return { mantissa: negative ? m : m, negative: false };
}
