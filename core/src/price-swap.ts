// Attack corpus 12 (021 §4 M3): the price swap, live. The seller changes the cart by one cent after the shopper's tap,
// in the one window the re-check guards: PayPal already holds the money, and nothing has been taken. The guard is not
// told; it finds the change on its own (the cart no longer matches its hash) and releases the hold. Nothing is charged.
import { fromCents, usdOf } from "./money.ts";
import type { BoundCart } from "./trust/cart.ts";
import type { PaymentPort } from "./trust/guard.ts";
import type { LedgerStore } from "./ledger/events.ts";

/**
 * The seller's row: what it changed, in our words with our numbers (both from the bound cart, never from a reply). It says
 * the demo staged it: the server changes its own copy of the cart; PayPal's order still holds the amount you approved.
 */
export const swapWhy = (was: string, now: string): string =>
  `Price swap (staged by this demo, as the seller): the cart changed after your tap, ${usdOf(was)} became ${usdOf(now)}. Code checks the cart again before any money moves.`;

/**
 * The payment port for a price-swap run: every call is the real port's. Once PayPal has placed the hold, the seller adds
 * one cent to the bound cart and says so in the ledger, just before the guard reads the order again (so the rows read:
 * money held, cart changed, hold released). Without AUTHORIZE there is no hold to wait for, so the server calls `swapNow`
 * before the settle instead (the guard then refuses it before anything moves).
 */
export function swapAfterHold(port: PaymentPort, bound: BoundCart, ledger: LedgerStore, shopperId: string, now: () => number): PaymentPort {
  const authorize = port.authorize?.bind(port);
  if (!authorize) return port;
  let held = false;
  const swapping = async (orderId: string, requestId: string) => { const a = await authorize(orderId, requestId); held = true; return a; };
  const reading = (orderId: string) => { if (held) swapNow(bound, ledger, shopperId, now()); return port.get(orderId); };
  // Every other call runs on the real port itself, so its own state (counters, maps) stays its own.
  return new Proxy(port, { get: (p, k) => (k === "authorize" ? swapping : k === "get" ? reading : bindOwn(p, k)) });
}
const bindOwn = (p: PaymentPort, k: string | symbol): unknown => { const v: unknown = Reflect.get(p, k, p); return typeof v === "function" ? v.bind(p) : v; };

/** One cent more on the bound cart, said in a seller row. Once per cart: a second call changes nothing. */
export function swapNow(bound: BoundCart, ledger: LedgerStore, shopperId: string, t: number): void {
  if (ledger.read().some((e) => e.action === "price-swap")) return;
  const was = fromCents(bound.cart.price);
  bound.cart.price += 1;
  ledger.append({ t, shopperId, visibility: "owner", actor: "seller", action: "price-swap", layer: 3, sellerId: bound.cart.sellerId, price: fromCents(bound.cart.price), currency: bound.cart.currency, why: swapWhy(was, fromCents(bound.cart.price)), data: { attack: "price-swap" } });
}
