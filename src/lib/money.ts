/**
 * Money helpers. The store sells in Ghana cedis (GHS). Amounts are exact decimals in the
 * database (numeric(10,2)); Paystack wants integer pesewas. Convert only at the edges.
 */
export const CURRENCY = "GHS" as const;
export const CURRENCY_SYMBOL = "GH₵";

export function toMinorUnits(amount: string | number): number {
  if (typeof amount === "number" && !Number.isFinite(amount)) throw new RangeError("Invalid amount");
  const text = typeof amount === "number" ? amount.toFixed(2) : amount.trim();
  const m = /^(-?)(\d{1,10})(?:\.(\d{1,2}))?$/.exec(text);
  if (!m) throw new RangeError("Invalid amount");
  const [, sign, whole, frac = ""] = m;
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return sign ? -minor : minor;
}

export function formatGHS(amount: number | string): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  const v = Number.isFinite(n) ? n : 0;
  return `${CURRENCY_SYMBOL} ${v.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
