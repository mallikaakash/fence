/** Shared sizing helpers for /trade and /agent demos. */

export function inPolicyPayload(maxOrder: string) {
  const max = Math.max(1, Number(maxOrder) || 50);
  const price = "1";
  const quantity = String(Math.min(5, Math.max(1, Math.floor(max / 4))));
  return { price, quantity, margin: "5", leverage: 2 };
}

export function oversizePayload(maxOrder: string) {
  const max = Math.max(1, Number(maxOrder) || 50);
  const price = "10";
  const quantity = String(Math.ceil(max / 10) + 3);
  return { price, quantity, margin: "20", leverage: 2 };
}
