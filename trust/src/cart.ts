// Layer 3: the bound cart. A "yes" approves one exact cart and expires. The
// hash travels to PayPal in custom_id and is re-checked before capture, so a
// price or item changed in between is refused (the TOCTOU attack).

import type { Hasher } from "./deps.ts";
import type { Cents } from "./money.ts";
import { fromCents } from "./money.ts";

export type PaymentShape = "one-off" | "pay-later" | "subscription" | "free-trial";

/**
 * How the order takes the money (021 §4 item 4). CAPTURE: the tap and the charge are one step. AUTHORIZE: PayPal holds the
 * money on the tap, the guard checks the cart once more, then captures exactly the bound amount or voids the hold.
 */
export type PaymentIntent = "CAPTURE" | "AUTHORIZE";

export interface Cart {
  item: string;
  merchant: string;
  sellerId: string;
  qty: number;
  price: Cents;
  currency: "USD";
  shape: PaymentShape;
  /** The catalog entry this cart is for (N9). The dial reads its category from the catalog by this id; none = the dial never covers it. */
  catalogId?: string;
  /** The PayPal merchant id paid (N15). None = the sandbox account the orders are created under, as today. */
  payee?: string;
  /** What the seller's listing says of the item (W49c), present only when an accepted chip asks for one. */
  attributes?: Readonly<Record<string, string>>;
}

export interface BoundCart {
  cart: Cart;
  /** Hex, 32 chars: what goes in PayPal's custom_id. Covers the cart, the nonce and the expiry. */
  hash: string;
  /** Per-binding nonce from the injected RNG, so the same cart bound twice never shares a hash. */
  nonce: string;
  /** Clock time after which the approval is void. */
  expiresAt: number;
  /** The one PayPal order this binding was placed as. Set by the guard; settle refuses any other. */
  orderId?: string;
  /** Single use: claimed synchronously the moment settle starts, before any I/O. */
  spent: boolean;
  /** Set by the guard when the order was placed with intent AUTHORIZE; absent means CAPTURE, as every cart before it. */
  intent?: PaymentIntent;
}

/**
 * Canonical form: the fields that define "this exact cart", in a fixed order, plus this binding's nonce and expiry.
 * The catalog entry and the payee are inside it whenever the cart names either (N9, N15); a cart that names neither
 * gives exactly the bytes it always did, so recorded tapes and fixtures stay byte-stable.
 */
export function cartCanonical(c: Cart, nonce: string, expiresAt: number): string {
  const named = c.catalogId === undefined && c.payee === undefined ? [] : [c.catalogId ?? null, c.payee ?? null];
  // W49c: the attributes are bound too, only when present, so a cart without them keeps its exact bytes.
  const attrs = c.attributes === undefined ? [] : [Object.entries(c.attributes).sort(([a], [b]) => (a < b ? -1 : 1))];
  return JSON.stringify([c.item, c.merchant, c.sellerId, c.qty, fromCents(c.price), c.currency, c.shape, ...named, ...attrs, nonce, expiresAt]);
}

export function bindCart(c: Cart, hash: Hasher, now: number, ttlMs: number, nonce: string): BoundCart {
  const expiresAt = now + ttlMs;
  return { cart: c, nonce, hash: bindingHash(c, nonce, expiresAt, hash), expiresAt, spent: false };
}

/**
 * The hash a binding must carry, recomputed from its fields. Settle compares it with the stored one, which catches
 * an edit that left the old hash in place. It has no key, so whoever can edit a saved cart can also write a matching
 * hash: what stops that is the hash PayPal holds in the order's custom_id, set when the order was created.
 */
export function bindingHash(c: Cart, nonce: string, expiresAt: number, hash: Hasher): string {
  return hash(cartCanonical(c, nonce, expiresAt)).slice(0, 32);
}

/** A nonce from the injected RNG: deterministic under a seed (replay), unguessable enough for a binding id. Not a secret. */
export function nonceFrom(rng: { next(): number }): string {
  let s = "";
  for (let i = 0; i < 4; i++) s += Math.floor(rng.next() * 0xffffffff).toString(16).padStart(8, "0");
  return s;
}

/** What PayPal reports about an order, as the guard needs it. */
export interface OrderSnapshot {
  id: string;
  status: string;
  amount: Cents;
  currency: string;
  customId: string | undefined;
  /** The merchant id the order pays (PayPal's purchase_units[0].payee.merchant_id). */
  payee?: string;
  /** The order's intent as PayPal reports it, when the port reads it. */
  intent?: string;
  /** AUTHORIZE orders: the order's authorization (purchase_units[0].payments.authorizations[0]), once there is one. */
  authorization?: Authorization;
  /** The order's capture id (purchase_units[0].payments.captures[0].id), once PayPal took the money: what Undo refunds when the capture's own reply was lost. */
  captureId?: string;
}

/** PayPal's hold on the shopper's money for an AUTHORIZE order: nothing is charged until it is captured. */
export interface Authorization {
  id: string;
  /** PayPal's status: CREATED (held, capturable), CAPTURED, VOIDED, DENIED, PENDING... */
  status: string;
  amount: Cents;
  currency: string;
}

/** Which re-check refused the order: a fixed code, so the words are ours (`CART_WORDS`) and PayPal's values never reach them. */
export type CartCode = "expired" | "unplaced" | "order" | "hash" | "amount" | "currency" | "payee" | "intent" | "paid" | "status";

/** Fixed words per code. The order's own value (its id, custom_id, payee, status) is PayPal's text, so it goes on `quoted`, never here. */
export const CART_WORDS: Readonly<Record<CartCode, string>> = {
  expired: "approval expired",
  unplaced: "cart was never placed as an order",
  order: "the order PayPal returned is not this cart's order",
  hash: "cart changed: the order's cart hash is not this cart's",
  amount: "amount changed: the order's amount is not this cart's",
  currency: "currency changed: the order's currency is not this cart's",
  payee: "payee changed: the order pays someone other than this cart's payee",
  intent: "the order's intent is not this cart's",
  paid: "already captured: PayPal shows this order paid, so it is never charged twice",
  status: "order not approved",
};

export type CartCheck = { ok: true } | { ok: false; code: CartCode; reason: string; quoted?: string };

const refused = (code: CartCode, quoted?: string): CartCheck => ({ ok: false, code, reason: CART_WORDS[code], ...(quoted === undefined ? {} : { quoted }) });

/** The re-check before capture. Pure: no I/O, so it is trivially testable and mutation-tested. */
export function checkBoundCart(b: BoundCart, snap: OrderSnapshot, now: number): CartCheck {
  if (!(now <= b.expiresAt)) return refused("expired"); // written so a NaN or missing expiry reads as expired
  if (b.orderId === undefined) return refused("unplaced");
  if (snap.id !== b.orderId) return refused("order", String(snap.id));
  if (snap.customId !== b.hash) return refused("hash", String(snap.customId ?? "none"));
  if (snap.amount !== b.cart.price) return refused("amount", Number.isSafeInteger(snap.amount) && snap.amount >= 0 ? fromCents(snap.amount) : "unreadable");
  if (snap.currency !== b.cart.currency) return refused("currency", String(snap.currency));
  // N15: the hash in custom_id can't see a payee swapped on the order itself, so the order's payee is read back.
  // A cart that names no payee pays the account the order was created under, as before.
  if (b.cart.payee !== undefined && snap.payee !== b.cart.payee) return refused("payee", String(snap.payee ?? "none"));
  // The order takes the money the way this cart was placed: no CAPTURE path for an order placed to be authorized, or back.
  if (snap.intent !== undefined && snap.intent !== (b.intent ?? "CAPTURE")) return refused("intent", String(snap.intent));
  // A second settle of a paid order (Joshua's attended run, Oct 28) says so, not "not approved": the money already moved.
  if (snap.status === "COMPLETED") return refused("paid");
  if (snap.status !== "APPROVED") return refused("status", String(snap.status));
  return { ok: true };
}

/** Why an authorized cart is voided instead of captured: a fixed code, so the words are the guard's own (`VOID_WORDS`). */
export type VoidCode = "changed" | "expired" | "amount" | "authorization" | "unread";

/**
 * The re-check after PayPal holds the money and before it is taken (021 §4 item 4). Pure. `rehash` is the cart's hash
 * computed again now; `snap` the order read again after the authorization, or null when PayPal didn't answer. Null back
 * means capture; any code means void. Nothing here reads a number from text: every amount is the bound cart's.
 */
export function recheckAuthorized(b: BoundCart, rehash: string, auth: Authorization, snap: OrderSnapshot | null, now: number): VoidCode | null {
  if (rehash !== b.hash) return "changed";
  if (!(now <= b.expiresAt)) return "expired";
  if (auth.amount !== b.cart.price || auth.currency !== b.cart.currency) return "amount";
  if (auth.status !== "CREATED") return "authorization";
  if (snap === null) return "unread";
  if (snap.id !== b.orderId || snap.customId !== b.hash || (b.cart.payee !== undefined && snap.payee !== b.cart.payee)) return "changed";
  if (snap.amount !== b.cart.price || snap.currency !== b.cart.currency) return "amount";
  // The authorization captured must be this order's own, not one the adapter found elsewhere, and still only held.
  if (snap.authorization?.id !== auth.id || snap.authorization.status !== "CREATED") return "authorization";
  return null;
}
