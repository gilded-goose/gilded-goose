// The guard-off control (v3's right-hand card; 006 §3, 011 §11 #7): the judge's price sent straight to the same
// payment port the guard uses, with no guard in between, as an agent that believed the note would. PayPal creates a
// real, unapproved sandbox order; nobody can capture it from here (no return route takes it). Beside the guard-on
// card, the two differ only in the guard. Capped per browser (3 a day); when it can't run live, the card shows the
// order made by `trust/examples/control-no-guard.ts` and says so, never a made-up id.

import type { Hasher } from "../deps.ts";
import { fromCents, type Cents } from "../money.ts";
import { bindCart, type Cart } from "../trust/cart.ts";
import type { PaymentPort } from "../trust/guard.ts";
import type { CapHit } from "./caps.ts";
import { DEMO_ITEM } from "../scenario.ts";
import { JUDGE_SELLER } from "./judge.ts";

/** Control orders per browser per day (Joshua, 011 §11 #7). */
export const CONTROL_CAP = 3;

/** The saved control order (docs/fixtures/control-order.json). */
export interface RecordedControl { orderId: string; status: string; amount: string; currency: string; ranAt: string }

export type ControlCard =
  | { state: "landed"; orderId: string; status: string; amount: string; currency: string; at: string; left: number; fake: boolean }
  | { state: "capped" | "off" | "failed"; sentence: string; recorded: RecordedControl; left: number };

export interface ControlOptions {
  price: Cents;
  /** Null when this server has no payment port. */
  port: PaymentPort | null;
  fake: boolean;
  /** Takes one control order from the caps, or says which is full. Called only when an order would be made. */
  take: () => CapHit | null;
  left: () => number;
  recorded: RecordedControl;
  hash: Hasher;
  now: number;
  nonce: string;
  returnUrl: string;
}

/** What the card says when it shows the saved order instead of a new one. Fixed words; PayPal's error text never reaches the page. */
export const CONTROL_SAYS = {
  // One sentence per cap that can be full: the browser's, the network's, or everyone's (a phone on the same
  // network as a laptop that used the network's orders must not be told it made 3 itself).
  token: "You've made this browser's 3 control orders for today, so this is the one we made earlier.",
  ip: "This network has made its control orders for today, so this is the one we made earlier.",
  global: "Today's control orders for everyone are used up, so this is the one we made earlier.",
  off: "PayPal isn't connected on this server, so this is the control order we made earlier.",
  failed: "PayPal didn't create the order this time, so this is the control order we made earlier.",
} as const;

export async function controlOrder(o: ControlOptions): Promise<ControlCard> {
  const saved = (state: "capped" | "off" | "failed", says: keyof typeof CONTROL_SAYS = state === "capped" ? "token" : state): ControlCard =>
    ({ state, sentence: CONTROL_SAYS[says], recorded: o.recorded, left: o.left() });
  if (!o.port) return saved("off");
  const hit = o.take();
  if (hit !== null) return saved("capped", hit);
  // No guard.decide, no max, no dial: the judge's number as the seller asked it.
  const cart: Cart = { item: DEMO_ITEM, merchant: JUDGE_SELLER.merchant, sellerId: JUDGE_SELLER.id, qty: 1, price: o.price, currency: "USD", shape: "one-off" };
  try {
    const placed = await o.port.create(bindCart(cart, o.hash, o.now, 15 * 60 * 1000, o.nonce), o.returnUrl);
    const snap = await o.port.get(placed.orderId);
    if (snap.amount !== o.price) return saved("failed");
    return { state: "landed", orderId: snap.id, status: snap.status, amount: fromCents(snap.amount), currency: snap.currency, at: new Date(o.now).toISOString(), left: o.left(), fake: o.fake };
  } catch {
    return saved("failed");
  }
}
