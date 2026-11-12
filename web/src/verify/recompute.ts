// "Recompute it yourself": the cart fingerprint, worked out again in the browser with Web Crypto. Written from the recipe
// (docs/fingerprint-v0.md), NOT from the guard: this file imports nothing, so it is a second, independent telling of
// `cartCanonical` and `bindingHash` (trust/src/cart.ts), and core/test/fingerprint-recompute.test.ts holds the two equal on
// every vector in trust/test/vectors.json and on a seeded sweep of bent carts. It makes no request and keeps nothing.
//
// The hash has no key. Anyone who has these fields can work the fingerprint out, so a match says "these fields give this
// value" and nothing about who made it. What binds a cart is that PayPal's order holds the value in custom_id from the
// moment the order is created, and the server refuses to capture when the cart it holds no longer works out to it.

/** Everything the fingerprint covers: the cart, and this approval's nonce and expiry. */
export interface FingerprintFields {
  item: string;
  merchant: string;
  sellerId: string;
  qty: number;
  /** The total in whole cents. The text hashed carries it as dollars and cents ("47.73"). */
  price: number;
  currency: string;
  shape: string;
  /** In the text only when the cart names a catalog entry or a payee; then both places are there, the missing one as null. */
  catalogId?: string;
  payee?: string;
  /** In the text only when present, as [key, value] pairs sorted by key. */
  attributes?: Readonly<Record<string, string>>;
  nonce: string;
  /** Milliseconds since 1970 (UTC) after which the approval is void. */
  expiresAt: number;
}

/** A bound cart as the guard holds it (`BoundCart`, trust/src/cart.ts), read by shape so this file needs no import. */
export interface BoundLike {
  cart: Omit<FingerprintFields, "nonce" | "expiresAt">;
  nonce: string;
  expiresAt: number;
}

export const fieldsOf = (b: BoundLike): FingerprintFields => ({ ...b.cart, nonce: b.nonce, expiresAt: b.expiresAt });

/** Whole cents as PayPal writes money: "47.73". Anything that isn't a whole, non-negative number of cents has no fingerprint. */
export function dollars(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error(`money: bad cents ${cents}`);
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/** "47.73" to 4773, or null when the text isn't dollars with at most two decimals. For the page's edit box. */
export function centsOf(text: string): number | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Step 1: the exact text that gets hashed. A JSON array, fixed order, no spaces. */
export function canonical(f: FingerprintFields): string {
  const named = f.catalogId === undefined && f.payee === undefined ? [] : [f.catalogId ?? null, f.payee ?? null];
  const attrs = f.attributes === undefined ? [] : [Object.entries(f.attributes).sort(([a], [b]) => (a < b ? -1 : 1))];
  return JSON.stringify([f.item, f.merchant, f.sellerId, f.qty, dollars(f.price), f.currency, f.shape, ...named, ...attrs, f.nonce, f.expiresAt]);
}

/** The one thing asked of Web Crypto, by shape, so this file reads the same to a browser's types and to Node's. */
export interface Digester { digest(algorithm: string, data: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> }

/** Steps 2 and 3: SHA-256 of the text's UTF-8 bytes, as lowercase hex, cut to its first 32 characters. */
export async function fingerprintOfText(text: string, subtle: Digester = globalThis.crypto.subtle): Promise<string> {
  const digest = new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(text)));
  let hex = "";
  for (const byte of digest) hex += byte.toString(16).padStart(2, "0");
  return hex.slice(0, 32);
}

/** The fingerprint the guard writes to PayPal's custom_id for these fields. */
export const fingerprint = (f: FingerprintFields, subtle?: Digester): Promise<string> => fingerprintOfText(canonical(f), subtle);
