// Money as integer cents. Prices cross the wire as "42.00" strings (PayPal's
// format) and never as floats, so 0.1 + 0.2 can't sneak in.

export type Cents = number;

export function toCents(s: string): Cents {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s.trim());
  if (!m) throw new Error(`money: bad amount "${s}"`);
  const whole = Number(m[1]);
  const frac = (m[2] ?? "").padEnd(2, "0");
  const cents = whole * 100 + Number(frac);
  // Past 2^53 a number can't hold every cent, so "90071992547409931.00" would quietly become another amount.
  if (!Number.isSafeInteger(cents)) throw new Error(`money: bad amount "${s}"`);
  return cents;
}

export function fromCents(c: Cents): string {
  if (!Number.isSafeInteger(c) || c < 0) throw new Error(`money: bad cents ${c}`);
  return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
}

/**
 * At or under a limit. A limit that isn't whole cents (NaN, missing, a string, Infinity) is no limit to be under, so it
 * fails closed: every comparison with NaN is false, so `price > limit` would have read a broken limit as no limit at all.
 */
export const withinLimit = (c: Cents, limit: Cents): boolean => Number.isSafeInteger(limit) && c <= limit;

export function roundCents(x: number): Cents {
  return Math.round(x);
}
