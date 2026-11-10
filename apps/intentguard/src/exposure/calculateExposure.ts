import type {
  NormalizedOpenOrder,
  NormalizedPosition,
  NotionalSnapshot,
  QuoteDenomExposure,
} from "./types.ts";
import { formatScaled, multiplyDecimals, parseSignedDecimal } from "./decimal.ts";

function remainingOrderQuantity(order: NormalizedOpenOrder): string | null {
  const q = parseSignedDecimal(order.quantity);
  if (!q.ok) return null;
  if (order.fillQuantity) {
    const f = parseSignedDecimal(order.fillQuantity);
    if (!f.ok) return order.quantity;
    const scale = Math.max(q.scale, f.scale);
    const qM = q.mantissa * 10n ** BigInt(scale - q.scale);
    const fM = f.mantissa * 10n ** BigInt(scale - f.scale);
    if (qM <= fM) return "0";
    const rem = qM - fM;
    return formatScaled(rem, scale);
  }
  return order.quantity;
}

export function computePositionNotional(
  position: NormalizedPosition,
): NotionalSnapshot {
  const quoteDenom = position.quoteDenom;
  if (!quoteDenom) {
    return { status: "unavailable", reason: "quote denomination unknown" };
  }
  const qty = parseSignedDecimal(position.quantity);
  if (!qty.ok) {
    return { status: "unavailable", quoteDenom, reason: "invalid position quantity" };
  }
  const absQty = qty.negative ? qty.mantissa : qty.mantissa;
  const ref =
    position.markPrice !== undefined
      ? { field: "markPrice" as const, raw: position.markPrice }
      : position.entryPrice !== undefined
        ? { field: "entryPrice" as const, raw: position.entryPrice }
        : undefined;
  if (!ref?.raw) {
    return { status: "unavailable", quoteDenom, reason: "no mark or entry price" };
  }
  const price = parseSignedDecimal(ref.raw);
  if (!price.ok) {
    return { status: "unavailable", quoteDenom, reason: "invalid reference price" };
  }
  const notional = multiplyDecimals(absQty, qty.scale, price.mantissa, price.scale, 6);
  if (notional === null) {
    return { status: "unavailable", quoteDenom, reason: "notional calculation failed" };
  }
  return {
    status: "available",
    human: formatScaled(notional, 6),
    quoteDenom,
    referencePrice: ref.raw,
    referencePriceField: ref.field,
  };
}

export function computeOrderNotional(
  order: NormalizedOpenOrder,
): NotionalSnapshot {
  const quoteDenom = order.quoteDenom;
  if (!quoteDenom) {
    return { status: "unavailable", reason: "quote denomination unknown" };
  }
  const rem = remainingOrderQuantity(order);
  if (!rem || rem === "0") {
    return { status: "unavailable", quoteDenom, reason: "no remaining quantity" };
  }
  const qty = parseSignedDecimal(rem);
  if (!qty.ok) {
    return { status: "unavailable", quoteDenom, reason: "invalid order quantity" };
  }
  if (!order.limitPrice) {
    return { status: "unavailable", quoteDenom, reason: "limit price missing" };
  }
  const price = parseSignedDecimal(order.limitPrice);
  if (!price.ok) {
    return { status: "unavailable", quoteDenom, reason: "invalid limit price" };
  }
  const notional = multiplyDecimals(
    qty.mantissa,
    qty.scale,
    price.mantissa,
    price.scale,
    6,
  );
  if (notional === null) {
    return { status: "unavailable", quoteDenom, reason: "notional calculation failed" };
  }
  return {
    status: "available",
    human: formatScaled(notional, 6),
    quoteDenom,
    referencePrice: order.limitPrice,
    referencePriceField: "limitPrice",
  };
}

function addAvailableNotionals(
  a: NotionalSnapshot,
  b: NotionalSnapshot,
  quoteDenom: string,
  quoteSymbol?: string,
): NotionalSnapshot {
  if (a.status !== "available" && b.status !== "available") {
    return a.status === "unavailable" ? a : b;
  }
  if (a.status !== "available") return b;
  if (b.status !== "available") return a;
  const aN = parseSignedDecimal(a.human);
  const bN = parseSignedDecimal(b.human);
  if (!aN.ok || !bN.ok) {
    return {
      status: "unavailable",
      quoteDenom,
      reason: "failed to aggregate notionals",
    };
  }
  const scale = 6;
  const aM = aN.mantissa * 10n ** BigInt(scale - aN.scale);
  const bM = bN.mantissa * 10n ** BigInt(scale - bN.scale);
  const sum = aM + bM;
  return {
    status: "available",
    human: formatScaled(sum, scale),
    quoteDenom,
    referencePrice: "aggregate",
    referencePriceField: "markPrice",
  };
}

const emptyUnavailable = (quoteDenom: string): NotionalSnapshot => ({
  status: "unavailable",
  quoteDenom,
  reason: "no positions or orders in this quote denom",
});

export function buildExposureByQuoteDenom(
  positions: NormalizedPosition[],
  orders: NormalizedOpenOrder[],
): QuoteDenomExposure[] {
  const denoms = new Map<
    string,
    { quoteSymbol?: string; long: NotionalSnapshot; short: NotionalSnapshot; orders: NotionalSnapshot }
  >();

  function bucket(quoteDenom: string, quoteSymbol?: string) {
    let b = denoms.get(quoteDenom);
    if (!b) {
      b = {
        quoteSymbol,
        long: emptyUnavailable(quoteDenom),
        short: emptyUnavailable(quoteDenom),
        orders: emptyUnavailable(quoteDenom),
      };
      denoms.set(quoteDenom, b);
    }
    return b;
  }

  for (const p of positions) {
    if (!p.quoteDenom || !p.notional) continue;
    const b = bucket(p.quoteDenom, p.quoteSymbol);
    if (p.notional.status !== "available") continue;
    if (p.direction === "long") {
      b.long = addAvailableNotionals(b.long, p.notional, p.quoteDenom, p.quoteSymbol);
    } else if (p.direction === "short") {
      b.short = addAvailableNotionals(b.short, p.notional, p.quoteDenom, p.quoteSymbol);
    }
  }

  for (const o of orders) {
    if (!o.quoteDenom || !o.notional) continue;
    const b = bucket(o.quoteDenom, o.quoteSymbol);
    if (o.notional.status === "available") {
      b.orders = addAvailableNotionals(b.orders, o.notional, o.quoteDenom, o.quoteSymbol);
    }
  }

  const out: QuoteDenomExposure[] = [];
  for (const [quoteDenom, b] of denoms) {
    const gross =
      b.long.status === "available" && b.short.status === "available"
        ? addAvailableNotionals(b.long, b.short, quoteDenom, b.quoteSymbol)
        : b.long.status === "available"
          ? b.long
          : b.short.status === "available"
            ? b.short
            : emptyUnavailable(quoteDenom);

    out.push({
      quoteDenom,
      quoteSymbol: b.quoteSymbol,
      longPositionNotional: b.long,
      shortPositionNotional: b.short,
      grossPositionNotional: gross,
      openOrderNotional: b.orders,
    });
  }
  return out.sort((a, c) => a.quoteDenom.localeCompare(c.quoteDenom));
}

export function buildMarketBreakdown(
  positions: NormalizedPosition[],
  orders: NormalizedOpenOrder[],
): import("./types.ts").MarketBreakdownRow[] {
  const map = new Map<string, import("./types.ts").MarketBreakdownRow>();
  for (const p of positions) {
    const row = map.get(p.marketId) ?? {
      marketId: p.marketId,
      ticker: p.ticker,
      quoteDenom: p.quoteDenom,
      positionCount: 0,
      openOrderCount: 0,
      hasLong: false,
      hasShort: false,
    };
    row.positionCount++;
    if (p.direction === "long") row.hasLong = true;
    if (p.direction === "short") row.hasShort = true;
    map.set(p.marketId, row);
  }
  for (const o of orders) {
    const row = map.get(o.marketId) ?? {
      marketId: o.marketId,
      ticker: o.ticker,
      quoteDenom: o.quoteDenom,
      positionCount: 0,
      openOrderCount: 0,
      hasLong: false,
      hasShort: false,
    };
    row.openOrderCount++;
    map.set(o.marketId, row);
  }
  return [...map.values()].sort((a, b) => a.marketId.localeCompare(b.marketId));
}
