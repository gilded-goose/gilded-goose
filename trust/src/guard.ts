// Layer 2: the spend guard. The only code that may talk to a payment port, and
// it re-derives every number from state, never from text. The buyer agent has no
// PayPal tool; it can only propose a cart, and the guard decides.
//
// ADR 0002: payments go through a PaymentPort. The PayPal adapter lives in
// server/, a recorded port serves seeded mode, so no SDK or secret ever reaches
// the browser bundle.

import type { WebhookHeaders } from "./webhook.ts";
import { DAY_MS, type Deps } from "./deps.ts";
import { RunLedger, isShoppers, type LedgerEvent, type LedgerStore, type NewEvent } from "./events.ts";
import { fromCents, toCents, withinLimit, type Cents } from "./money.ts";
import { bindCart, bindingHash, checkBoundCart, nonceFrom, recheckAuthorized, type Authorization, type BoundCart, type Cart, type OrderSnapshot, type PaymentIntent, type VoidCode } from "./cart.ts";
import { catalogItem, type Catalog } from "./catalog.ts";
import { quoteNote } from "./fence.ts";
import { attributeCheck, chipsHold, type Chip } from "./chips.ts";
import { categoryLimitFor, dialFor, type Policy, type Want } from "./policy.ts";
import { evidenceSaid, verdictOf, watch, type Evidence, type Flag, type WatchRule } from "./watch.ts";

export interface PaymentPort {
  /** Create an order for exactly this bound cart, with this intent (CAPTURE when omitted). Returns the order id and the approve URL. */
  create(b: BoundCart, returnUrl: string, intent?: PaymentIntent): Promise<{ orderId: string; approveUrl: string }>;
  get(orderId: string): Promise<OrderSnapshot>;
  /** Capture an approved order. Throws with a reason (e.g. INSTRUMENT_DECLINED) on failure. */
  capture(orderId: string): Promise<{ status: string; captureId: string }>;
  /**
   * Refund one capture in full (Undo, H2). `requestId` is PayPal's idempotency key: the same id always names the same
   * refund, so a retry never refunds twice. Optional: a port without it can't undo, and the server says so.
   */
  refund?(captureId: string, requestId: string): Promise<{ status: string; refundId: string }>;
  /**
   * 021 §4 item 6: whether PayPal signed this webhook, asked of PayPal itself (true only on its "SUCCESS"). `rawBody` is
   * the event exactly as it arrived. Optional: a port without it can't take webhooks, and the route says so.
   */
  verifyWebhook?(h: WebhookHeaders, rawBody: string): Promise<boolean>;
  /**
   * AUTHORIZE intent only (021 §4 item 4): hold the approved order's money without taking it. These three are plain REST
   * in the PayPal adapter because PayPal's Agent Toolkit 1.11.0 has no authorize, capture-authorization or void tool.
   * Optional: a port without all three can't run AUTHORIZE, and the server refuses to boot that way. Every `requestId`
   * is PayPal's idempotency key, fixed per cart, so a retry names the same authorization, capture or void.
   */
  authorize?(orderId: string, requestId: string): Promise<Authorization>;
  /**
   * Capture an authorization for exactly `amount`. Whether PayPal would ever take more than the authorization is not
   * verified (docs/claims.md), so the guard never leans on PayPal to cap it: it passes the bound cart's amount and
   * checks the reply's. `final` closes the authorization to any later capture.
   */
  captureAuthorization?(authorizationId: string, req: { amount: Cents; currency: string; final: boolean; requestId: string }): Promise<{ status: string; captureId: string; amount: Cents; currency: string }>;
  /** Release the hold: nothing is charged and the authorization can never be captured. */
  voidAuthorization?(authorizationId: string, requestId: string): Promise<{ status: string }>;
}

/**
 * The intent the server places orders with, from PAYMENT_INTENT: AUTHORIZE when unset, CAPTURE when asked for, and
 * anything else stops the boot. 021 §3 decision 1: the default flipped once `e2e:sandbox` passed on AUTHORIZE (Joshua's
 * attended run, Oct 28).
 */
export function paymentIntent(v: string | undefined): PaymentIntent {
  if (v === undefined || v === "" || v === "AUTHORIZE") return "AUTHORIZE";
  if (v === "CAPTURE") return "CAPTURE";
  throw new Error(`PAYMENT_INTENT must be CAPTURE or AUTHORIZE, not ${JSON.stringify(v.slice(0, 24))}`);
}

/** PayPal idempotency keys, one per cart and step, like `orderRequestId`: a retried call names the first one's result. */
export const authorizeRequestId = (hash: string): string => `goose-authorize-${hash}`;
export const captureRequestId = (hash: string): string => `goose-capture-${hash}`;
export const voidRequestId = (hash: string): string => `goose-void-${hash}`;

// Sentences many ledger rows end in, one copy each: the classic page ships this file (the ratchet, Nov 4).
const FRESH_CART = "This cart is closed; I'll ask you again with a fresh one.";
const FRESH_CART_SINGLE = "This cart is closed (single use); I'll ask you again with a fresh one.";
const CHECK_SANDBOX = "This cart is closed; check the order in the PayPal sandbox before trying again.";

/**
 * What a voided cart says (021 §4 item 4), fixed words per code: the re-check reads PayPal's reply, and none of its text
 * reaches the ledger or the screen. `reason` is the settle's answer, `why` the ledger row.
 */
export const VOID_WORDS: Readonly<Record<VoidCode, { reason: string; why: string }>> = {
  changed: { reason: "the cart changed after your tap, so the hold was voided; nothing was charged", why: `Voided, not charged: the cart changed after your tap, so the hold on the money was released. ${FRESH_CART}` },
  expired: { reason: "your approval ran out before the capture, so the hold was voided; nothing was charged", why: `Voided, not charged: your approval ran out before the capture, so the hold on the money was released. ${FRESH_CART}` },
  amount: { reason: "the hold was for a different amount than the cart you approved, so it was voided; nothing was charged", why: `Voided, not charged: the hold was for a different amount than the cart you approved, so it was released. ${FRESH_CART}` },
  authorization: { reason: "the hold on this cart can't be captured as it is, so it was voided; nothing was charged", why: `Voided, not charged: the hold on this cart wasn't one we can capture, so it was released. ${FRESH_CART}` },
  unread: { reason: "the order didn't answer when we checked it again, so the hold was voided; nothing was charged", why: `Voided, not charged: the order didn't answer when we checked it once more, so the hold on the money was released. ${FRESH_CART}` },
};
/**
 * A void that wasn't confirmed: nothing was captured and nothing here will capture it. When the held money is released
 * then is the payment service's rule, not verified here (docs/claims.md), so these words don't say.
 */
export const VOID_FAILED_WHY = "Not charged: we asked to release the hold on the money and it wasn't confirmed. Nothing was captured, and nothing here will capture it. This cart is closed.";

/** Before the capture, a throw nothing expects: the words say whether a hold was found and released (null: no hold). */
const SETTLE_FAILED_WHY = {
  null: "Not capturing: something failed before the capture; nothing was captured and this cart is closed.",
  true: "Not capturing: something failed before the capture; nothing was captured, the hold on the money was released, and this cart is closed.",
  false: "Not capturing: something failed before the capture; nothing was captured, releasing the hold on the money wasn't confirmed, and this cart is closed.",
} as const;
/** A capture reply that says PENDING: the money may still move, so it counts against the week as "can't say". */
const PENDING_REASON = "PayPal is still processing the payment, so we can't say yet whether it was charged";
const PENDING_WHY = `PayPal is still processing the payment, so we can't say yet whether it was charged. ${CHECK_SANDBOX}`;
/** A capture PayPal didn't confirm, and an order it didn't answer for when read again: the money may have moved. */
const UNREAD_REASON = "PayPal didn't confirm the payment and didn't answer again, so we can't say whether it was charged";
const UNREAD_WHY = `PayPal didn't confirm the payment and didn't answer when asked again, so we can't say whether it was charged. ${CHECK_SANDBOX}`;
/** A capture reply that says DECLINED or FAILED: PayPal took nothing. */
const NOT_TAKEN_REASON = "payment failed; PayPal didn't take the money, so nothing was charged";
const NOT_TAKEN_WHY = `Payment failed: PayPal didn't take the money, so nothing was charged. ${FRESH_CART_SINGLE}`;

/** On a row whose hold on the money may still stand: the void wasn't confirmed. The wallet says so in its own words. */
const UNRELEASED = { release: "unconfirmed" } as const;

/** Release an AUTHORIZE hold under the cart's fixed void key: true only when the void is confirmed. Never throws. */
const voidHold = (port: PaymentPort, authorizationId: string, hash: string): Promise<boolean> =>
  port.voidAuthorization ? port.voidAuthorization(authorizationId, voidRequestId(hash)).then(() => true, () => false) : Promise.resolve(false);

/** A hold whose release wasn't confirmed, as PayPal shows it now: released, still held, or captured (money moved). */
export type HeldState = "released" | "held" | "captured";
/** Released only on PayPal's own word (VOIDED, EXPIRED); captured on CAPTURED; anything else, unread included, still held. */
export const heldState = (status: string | undefined): HeldState =>
  status === "VOIDED" || status === "EXPIRED" ? "released" : status === "CAPTURED" || status === "PARTIALLY_CAPTURED" ? "captured" : "held";

/**
 * Joshua's answer (Wed Oct 28): a hold whose release PayPal never confirmed holds back that cart's Approve until PayPal
 * confirms it. Re-checked by reading the order again, never guessed. A hold this server placed (`own`, from its own
 * void-failed row) that PayPal still shows CREATED is asked to be released once more (keyed per cart, so it can't
 * release twice), then read again. Without `own` this only reads: a cookie's order id can make its browser wait, never
 * make this server void a hold.
 */
export async function recheckHeld(port: PaymentPort, orderId: string, own?: { authorizationId: string; hash: string }): Promise<HeldState> {
  const read = () => port.get(orderId).then((o) => o.authorization, () => undefined);
  let a = await read();
  if (a && own && a.id === own.authorizationId && a.status === "CREATED" && await voidHold(port, a.id, own.hash)) a = await read();
  return heldState(a?.status);
}

/** A limit in a refusal's words. A broken one still refuses, in words, instead of throwing where the refusal is written. */
const limitSaid = (c: Cents): string => (Number.isSafeInteger(c) && c >= 0 ? `$${fromCents(c)}` : "an unreadable limit");
const declined = (e: unknown): boolean => /\bINSTRUMENT_DECLINED\b/.test(e instanceof Error ? e.message : "");

/** Which check refused a cart: a fixed id on the ledger row's `data.rule`, so a screen can say which rule fired without parsing text. */
/**
 * Two item names, compared as words rather than bytes (007 #1): trimmed, case-folded and with runs of whitespace made
 * one space, so "Kettle" is the shopper's "kettle". Never fuzzy and never a substring: "Kettle" is not "Teapot", and
 * "kettle" is not "kettle descaler". An empty name matches nothing, so two empty names fail closed.
 */
export function sameItem(a: string, b: string): boolean {
  const words = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return words(a) !== "" && words(a) === words(b);
}

export type GuardRule = "item" | "currency" | "qty" | "price" | "max" | "cap" | "limit" | "week" | "total" | "deadline" | "watcher" | "attribute";

export type GuardDecision =
  | { kind: "refused"; reason: string; rule: GuardRule }
  /** `holds`: the Watcher's holds on this seller (no sales yet, no record, its words state your limit), present only when there are some. */
  | { kind: "ask"; bound: BoundCart; reason: string; holds?: Flag[] }
  | { kind: "buy"; bound: BoundCart; reason: string };

export const APPROVAL_TTL_MS = 15 * 60 * 1000;
/** The weekly total is a rolling 7 days, so no calendar boundary lets two weeks' limits land back to back. */
export const WEEK_MS = 7 * DAY_MS;

/**
 * What the shopper sees at the top of the screen: the ceiling, enforced by code. The category comes from the
 * catalog entry, never the want; none given, the strictest limit holds.
 */
export function worstCase(policy: Policy, want: Want, category?: string): { cap: number; why: string } {
  const cap = Math.min(want.maxPrice, categoryLimitFor(policy, category));
  return { cap, why: `The most any cart can cost right now: $${fromCents(cap)}. Held by the guard, not by the AI.` };
}

/**
 * Money out in the last 7 days, read from the shopper's rows (N4, W8, W12): captured, captured for another amount than
 * the cart's (`capture-mismatch`: never paid, but the money moved), any capture PayPal never confirmed either way (that
 * money may be gone too), and every capture still in flight (a "capturing" row that no
 * answer has closed). Seeded and attack rows never count (N19). The guard holds carts to this, and the wallet's week
 * shows the same number (`shopperFold`).
 */
export function weekSpend(rows: readonly LedgerEvent[], shopperId: string, now: number): Cents {
  return moneyOutAfter(rows, shopperId, now - WEEK_MS);
}

function moneyOutAfter(rows: readonly LedgerEvent[], shopperId: string, after: number): Cents {
  const mine = rows.filter((e) => e.shopperId === shopperId && isShoppers(e));
  // A hold ends with the answer its own settle writes (each carries the hold's seq), never with another call's row for the same cart.
  const answered = new Set(mine.map((e) => e.data?.hold).filter((h) => typeof h === "number"));
  const out = (e: LedgerEvent) => (e.actor === "paypal" && (e.action === "captured" || e.action === "capture-mismatch" || (e.action === "capture-failed" && e.data?.code === "unknown")))
    || (e.actor === "guard" && e.action === "capturing" && !answered.has(e.seq));
  return mine.filter((e) => e.t > after && e.price !== undefined && out(e)).reduce((sum, e) => sum + toCents(e.price!), 0);
}

/**
 * A list's total budget (Joshua, Nov 3, 4d): the most carts can cost from the moment the shopper sets it, all together, for
 * as long as it stands. It is a row in the shopper's ledger, not a Policy field, because the guard reads rows again at
 * capture: a cart bound before the total was set or lowered still meets it. Only the shopper's tap writes one (`listTotalRow`).
 */
export const LIST_TOTAL = "list-total";
export interface ListTotal { total: Cents; since: number }

export function listTotalRow(t: number, shopperId: string, total: Cents | null): NewEvent {
  const why = total === null ? "You took your list's total off." : `You set your list's total to $${fromCents(total)}.`;
  return { t, shopperId, visibility: "owner", actor: "shopper", action: LIST_TOTAL, layer: 2, verdict: "ok", why, data: { total } };
}

/** The total standing now, from the rows in order; `since` is when it was first set. A row that can't be read holds every cart (a total of 0), never lifts the total. */
export function listTotal(rows: readonly LedgerEvent[], shopperId: string): ListTotal | null {
  let on: ListTotal | null = null;
  for (const e of rows) {
    if (e.shopperId !== shopperId || e.actor !== "shopper" || e.action !== LIST_TOTAL) continue;
    const v = e.data?.total;
    if (v === null) { on = null; continue; }
    on = { total: typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : 0, since: on ? on.since : e.t };
  }
  return on;
}

/** Money out since the total was set, counted as the week counts it: a hold in flight counts, and a refund never frees room. */
export const listSpend = (rows: readonly LedgerEvent[], shopperId: string, since: number): Cents => moneyOutAfter(rows, shopperId, since - 1);

/**
 * The row the server writes when PayPal's page comes back with Cancel (020 default): not a bad pick, since leaving PayPal
 * says nothing about the agent's pick ("Not this one" is, `isBadPick`). Since Round 3 (O1) it no longer closes the cart:
 * PayPal's checkout token is the order id, so the press may not be the shopper's, and the cart stays approvable until
 * its approval time runs out; `data.cart: "open"` tells the views (`laneModel`, `payTrail`) it closed nothing, where a
 * row saved before Round 3 (no such field) did close its cart. It doesn't say who pressed it: the server can't tell.
 */
export function cancelledInPayPal(t: number, shopperId: string): NewEvent {
  return { t, shopperId, visibility: "owner", actor: "shopper", action: "cancel", layer: 3, verdict: "refused", why: "Cancel was pressed on PayPal's page. Nothing was charged. The cart stays open until its approval time runs out.", data: { cart: "open" } };
}

/**
 * What a settle that threw ended as (W24), read from the answer its cart's hold got, never assumed: paid when that answer
 * is a captured row, else the answer's own words. Null when the cart has no hold or the hold no answer.
 */
export function settleAnswer(rows: readonly LedgerEvent[], hash: string): { ok: true; captureId: string } | { ok: false; reason: string } | null {
  const hold = rows.filter((e) => e.actor === "guard" && e.action === "capturing" && e.data?.hash === hash).at(-1);
  const answer = hold && rows.find((e) => e.data?.hold === hold.seq);
  if (!answer) return null;
  return answer.action === "captured" && answer.verdict === "ok" ? { ok: true, captureId: String(answer.data?.captureId ?? "") } : { ok: false, reason: answer.why };
}


const WATCHER_HOLDS = ": the Watcher holds this exact cart for your yes, even with the dial on.";
const sellerWords = (saying: string) => `This seller's words ${saying}, which isn't proof of an attack${WATCHER_HOLDS}`;

/**
 * The guard's sentence for a cart the Watcher holds with the dial on (020 W13), one per holding family and state, fixed
 * words. Typed over every hold, so a new holding family (W41) can't ship without its own line.
 */
const HOLD_REASON: Record<Exclude<WatchRule, "instructs-agent" | "gift-card" | "writes-memory" | "off-paypal" | "claims-shipped" | "overpay-refund">, string> = {
  "states-your-limit": sellerWords("state a value for your limit"),
  "lists-gift-card": sellerWords("list gift cards among the ways to pay"),
  "addresses-agent": sellerWords("speak to the agent or claim your approval"),
  "mentions-gift-card": sellerWords("mention gift cards or payment codes"),
  "lists-off-paypal": sellerWords("mention a way to pay outside PayPal"),
  "asks-money-away": sellerWords("mention paying some way other than checkout"),
  "asks-for-code": sellerWords("mention a code or your details"),
  "speaks-as": sellerWords("may speak as someone else, or to your shopping agent"),
  "mentions-shipped": sellerWords("say it already shipped before any sale"),
  "mentions-overpay": sellerWords("talk about paying more than the price and getting the rest back"),
  "mentions-link": sellerWords("carry a link to another site"),
  "mentions-step": sellerWords("ask for a step outside checkout, like a chat app, a fee or a code"),
  "mentions-upfront": sellerWords("ask for money up front"),
  "no-history": `New seller, no sales yet${WATCHER_HOLDS}`,
  "no-record": `No sales record available for this seller${WATCHER_HOLDS}`,
  "asks-for-cash": `This seller asks to be paid in cash, which isn't proof of an attack, but payment only goes through PayPal checkout and PayPal's protection doesn't cover cash${WATCHER_HOLDS}`,
  "ai-reader": `An AI reader thinks this seller's words may be a scam, which isn't proof of an attack${WATCHER_HOLDS}`,
};
type SettleBase = { t: number; shopperId: string; visibility: "owner"; layer: 3; price: string; currency: string; sellerId: string };

export class Guard {
  // Explicit fields, not constructor parameter properties: Node's type stripping runs core as-is.
  private readonly deps: Deps;
  private readonly ledger: LedgerStore;
  private readonly policy: Policy;
  private readonly catalog: Catalog;
  /** No catalog (the default): no cart names a known entry, so the dial never buys on its own and every cart asks. */
  constructor(deps: Deps, ledger: LedgerStore, policy: Policy, catalog: Catalog = new Map()) {
    this.deps = deps;
    this.ledger = ledger;
    this.policy = policy;
    this.catalog = catalog;
  }

  /**
   * The buyer proposes; the guard decides. Pure except for the ledger write. Chips (checked by `validateChips`) and the
   * seller's sales record can only hold a cart the dial would buy (N3); no chip reaches a limit, the dial or the entry.
   * `evidence` is what the Watcher reads about the seller (ADR 0008); a bare number or null is the sales record alone
   * (F4's form). The cart's own store name and item title are always read too. Omitted, it is "no record available":
   * a hold, never "no Watcher".
   */
  decide(want: Want, cart: Cart, chips: readonly Chip[] = [], evidence: Evidence | number | null = null): GuardDecision {
    const now = this.deps.clock.now();
    // A price that isn't whole cents is refused below, with a row that carries no amount, never a throw (the property test's first find).
    const priced = Number.isSafeInteger(cart.price) && cart.price > 0;
    const base = { t: now, shopperId: this.policy.shopperId, visibility: "owner" as const, actor: "guard" as const, layer: 2 as const, sellerId: cart.sellerId, currency: cart.currency, ...(priced ? { price: fromCents(cart.price) } : {}) };
    const refuse = (rule: GuardRule, reason: string, extra: { quoted?: string; data?: Record<string, string> } = {}): GuardDecision => {
      this.ledger.append({ ...base, action: "refuse", verdict: "refused", why: reason, ...(extra.quoted === undefined ? {} : { quoted: extra.quoted }), data: { rule, ...extra.data } });
      return { kind: "refused", reason, rule };
    };

    // N8: the cart's item title is the seller's text, so it is quoted on the row, never written into `why`.
    if (!sameItem(cart.item, want.item)) return refuse("item", `wrong item: this cart's item is not "${want.item}"`, { quoted: quoteNote(cart.item) });
    // N9: the entry the cart names must sell this item, so an id can't lend a Laptop the kitchen's category.
    const entry = catalogItem(this.catalog, cart.catalogId);
    if (entry && !sameItem(cart.item, entry.item)) return refuse("item", `wrong item: this cart's item is not the catalog's "${entry.item}"`, { quoted: quoteNote(cart.item) });
    // W49c: a cart that contradicts an accepted chip is the wrong item, refused in code. The colour is named in the
    // catalog's own words, never the seller's; a cart that doesn't say is held for your yes below (when unsure, hold).
    const attr = attributeCheck(chips, cart.attributes, entry?.attributes);
    if (attr.wrong) return refuse("attribute", `wrong ${attr.wrong.name}: this cart's is ${attr.wrong.have}, and your chip says ${attr.wrong.want}`, { data: { attribute: attr.wrong.name } });
    if (cart.currency !== want.currency) return refuse("currency", `wrong currency ${cart.currency}`);
    if (cart.qty !== want.qty) return refuse("qty", `quantity ${cart.qty} != wanted ${want.qty}`);
    if (!priced) return refuse("price", "price is not a positive amount");
    if (!withinLimit(cart.price, want.maxPrice)) return refuse("max", `$${fromCents(cart.price)} is over your max ${limitSaid(want.maxPrice)}`);
    if (!withinLimit(cart.price, this.policy.perPurchaseCap)) return refuse("cap", `$${fromCents(cart.price)} is over the per-purchase cap ${limitSaid(this.policy.perPurchaseCap)}`);
    // N9, N18: words can't widen the limit. The category is the catalog's; no entry, and the strictest limit holds.
    const limit = categoryLimitFor(this.policy, entry?.category);
    if (!withinLimit(cart.price, limit)) return refuse("limit", entry ? `$${fromCents(cart.price)} is over your ${entry.category} limit ${limitSaid(limit)}` : `$${fromCents(cart.price)} is over ${limitSaid(limit)}, your strictest limit: this cart names no entry in the catalog`);
    const week = this.weekSpend(now);
    if (!withinLimit(week + cart.price, this.policy.weeklyLimit)) return refuse("week", `$${fromCents(cart.price)} would take this week's spend to $${fromCents(week + cart.price)}, over your weekly limit ${limitSaid(this.policy.weeklyLimit)}`);
    const over = this.overTotal(cart.price);
    if (over) return refuse("total", `$${fromCents(cart.price)} would take your list's spend to $${fromCents(over.spent + cart.price)}, over the ${limitSaid(over.total)} total you set`);
    if (!(now <= want.deadline)) return refuse("deadline", "the deadline has passed");
    // ADR 0008: the Watcher, before the dial. An act refuses, named by its evidence and never by the record; a state
    // (no sales yet, no record) only holds, below. It reads the cart's own name and title whatever the caller passed.
    const ev = typeof evidence === "object" && evidence !== null ? evidence : { quoted: "", history: evidence };
    const flags = watch({ ...ev, merchant: cart.merchant, item: cart.item });
    if (verdictOf(flags) === "refuse") {
      return refuse("watcher", `the Watcher's evidence: ${evidenceSaid(flags)}`, { data: { evidence: [...new Set(flags.filter((f) => f.severity === "refuse").map((f) => f.rule))].join(",") } });
    }
    const holds = flags.filter((f) => f.severity === "hold");
    const held = holds.length > 0 ? { holds } : {};
    // Row data for a held cart (only then, so a cart from a seller with a record keeps its exact bytes).
    const watched = holds.length > 0 ? { watch: holds.map((f) => f.rule).join(",") } : {};

    const bound = bindCart(cart, this.deps.hash, now, APPROVAL_TTL_MS, nonceFrom(this.deps.rng));
    // Recurring or deferred payment is never covered by "buy within my limits".
    if (cart.shape !== "one-off") {
      const reason = `${cart.shape} is a ${cart.shape === "pay-later" ? "deferred" : "recurring"} payment: I always ask first, with the real total.`;
      this.ledger.append({ ...base, layer: 5, action: "ask", verdict: "asked", why: reason, data: { hash: bound.hash, ...watched } });
      return { kind: "ask", bound, reason, ...held };
    }
    // N9: the dial reads the category from the catalog entry the cart names, never from the want or a chip.
    // No entry, or one the catalog doesn't have: the dial can't cover the cart, so it asks.
    if (entry && dialFor(this.policy, entry.category) === "buy-within-limits") {
      // W49c: a chip's attribute the cart doesn't state is held for the shopper's yes, never bought on its own.
      if (attr.unsaid) {
        const reason = `Your ${attr.unsaid.want} chip can't be checked: this seller's listing doesn't say its ${attr.unsaid.name}, so this exact cart needs your yes.`;
        this.ledger.append({ ...base, layer: 5, action: "ask", verdict: "asked", why: reason, data: { hash: bound.hash, ...watched } });
        return { kind: "ask", bound, reason, ...held };
      }
      // N3: "new sellers ask first" holds a seller with no record for the shopper's yes; it never refuses or drops one.
      const hold = chipsHold(chips, ev.history);
      if (hold !== undefined) {
        this.ledger.append({ ...base, layer: 5, action: "ask", verdict: "asked", why: hold, data: { hash: bound.hash, ...watched } });
        return { kind: "ask", bound, reason: hold, ...held };
      }
      // 020 W13: with the dial on, a seller with no record is held for your yes with no chip too. Held, never refused.
      if (holds.length > 0) {
        const reason = HOLD_REASON[holds[0]!.rule as keyof typeof HOLD_REASON];
        this.ledger.append({ ...base, layer: 4, action: "ask", verdict: "asked", why: reason, data: { hash: bound.hash, ...watched } });
        return { kind: "ask", bound, reason, holds };
      }
      const reason = `Within your limits and the dial is on for ${entry.category}: preparing the exact cart for your one tap.`;
      this.ledger.append({ ...base, layer: 5, action: "buy", verdict: "ok", why: reason, data: { hash: bound.hash } });
      return { kind: "buy", bound, reason };
    }
    // Wording only, never the decision: with no entry, the want's category names the dial when that dial says
    // "ask me first" anyway, so the recorded runs (carts that name no entry) keep their exact bytes.
    const named = entry?.category ?? want.category;
    if (!entry && dialFor(this.policy, named) !== "ask-first") {
      const reason = "This cart names no entry in the catalog, so the dial can't cover it: this exact cart needs your yes.";
      this.ledger.append({ ...base, layer: 5, action: "ask", verdict: "asked", why: reason, data: { hash: bound.hash, ...watched } });
      return { kind: "ask", bound, reason, ...held };
    }
    // Honesty: "ask me first" is the starting setting, not a choice the shopper made (M1 critique, note 5).
    const how = this.policy.dial[named] === undefined ? "the starting setting" : "set for this category";
    const reason = `The dial for ${named} is on "ask me first" (${how}), so this exact cart needs your yes.`;
    this.ledger.append({ ...base, layer: 5, action: "ask", verdict: "asked", why: reason, data: { hash: bound.hash, ...watched } });
    return { kind: "ask", bound, reason, ...held };
  }

  /** This week's spend across the shopper's runs (W8): a run's guard reads its shopper's whole ledger, not its own rows. */
  private weekSpend(now: number): Cents {
    return weekSpend((this.ledger instanceof RunLedger ? this.ledger.shopper : this.ledger).read(), this.policy.shopperId, now);
  }

  /** The list's total, when this cart would pass it. Read from the shopper's rows each time, so a cart bound earlier meets today's total. */
  private overTotal(price: Cents): { spent: Cents; total: Cents } | null {
    const rows = (this.ledger instanceof RunLedger ? this.ledger.shopper : this.ledger).read();
    const on = listTotal(rows, this.policy.shopperId);
    if (!on) return null;
    const spent = listSpend(rows, this.policy.shopperId, on.since);
    return withinLimit(spent + price, on.total) ? null : { spent, total: on.total };
  }

  /** Create the PayPal order for a bound cart. The amount comes from the cart, not from any text. */
  async place(bound: BoundCart, port: PaymentPort, returnUrl: string, intent: PaymentIntent = "CAPTURE"): Promise<{ orderId: string; approveUrl: string }> {
    if (bound.orderId !== undefined || bound.spent) throw new Error("guard: this cart was already placed");
    const res = await port.create(bound, returnUrl, intent);
    bound.orderId = res.orderId;
    if (intent === "AUTHORIZE") bound.intent = intent; // absent for CAPTURE, so every CAPTURE cart keeps its exact shape
    this.ledger.append({
      t: this.deps.clock.now(), shopperId: this.policy.shopperId, visibility: "owner", actor: "paypal", action: "order-created", layer: 3, verdict: "ok",
      price: fromCents(bound.cart.price), currency: bound.cart.currency, sellerId: bound.cart.sellerId,
      why: `Order ${res.orderId} created for the bound cart ${bound.hash.slice(0, 8)}…; waiting for your tap.`,
      data: { orderId: res.orderId, hash: bound.hash },
    });
    return res;
  }

  /**
   * After the tap: re-read the order, re-check the bound cart, then capture. Layer 3 in full.
   * The cart is claimed synchronously before any I/O, so two settle calls can never both capture.
   */
  async settle(bound: BoundCart, orderId: string, port: PaymentPort): Promise<{ ok: true; captureId: string } | { ok: false; reason: string }> {
    const now = this.deps.clock.now();
    const base = { t: now, shopperId: this.policy.shopperId, visibility: "owner" as const, layer: 3 as const, price: fromCents(bound.cart.price), currency: bound.cart.currency, sellerId: bound.cart.sellerId };
    // W11: every settle row names the cart's catalog entry, so the dial counts a capture toward its own category only.
    let data: Record<string, string | number> = { orderId, hash: bound.hash, ...(bound.cart.catalogId === undefined ? {} : { catalogId: bound.cart.catalogId }) };
    const refuse = (reason: string, code?: string, quoted?: string, extra: Record<string, string> = {}) => {
      this.ledger.append({ ...base, actor: "cart", action: "refuse", verdict: "refused", why: `Not capturing: ${reason}.`, ...(quoted === undefined ? {} : { quoted: quoteNote(quoted) }), data: code ? { ...data, code, ...extra } : data });
      return { ok: false as const, reason };
    };
    // Cheap checks first, so a stray or hostile call with the wrong order id can't burn a real cart...
    // Fixed words: the order id here comes from the return URL, so it is the caller's text, not ours.
    if (bound.orderId !== orderId) return refuse("the order PayPal returned is not this cart's order", "wrong-order");
    if (bound.spent) return refuse("cart already used");
    // Single use by the ledger, not only by this object (Fable F4): a copy of the cart (reloaded, serialized) whose hash
    // already holds money never settles a second time.
    if (this.ledger.read().some((e) => e.actor === "guard" && e.action === "capturing" && e.data?.hash === bound.hash)) return refuse("cart already used");
    // Re-hash: a cart edited after binding (a later expiry, another item) no longer matches its own hash.
    if (bindingHash(bound.cart, bound.nonce, bound.expiresAt, this.deps.hash) !== bound.hash) return refuse("cart changed since it was bound");
    if (!(now <= bound.expiresAt)) return refuse("approval expired");
    // N4: the weekly total again, at capture: a cart bound before another was paid can't carry the week past its limit.
    if (!withinLimit(this.weekSpend(now) + bound.cart.price, this.policy.weeklyLimit)) return refuse(`this cart would take this week's spend over your weekly limit ${limitSaid(this.policy.weeklyLimit)}`, "week");
    const over = this.overTotal(bound.cart.price);
    if (over) return refuse(`this cart would take your list's spend over the ${limitSaid(over.total)} total you set`, "total");
    bound.spent = true; // ...then claim before any I/O, so nothing below can run twice for this cart.
    // W12: held in the shopper's ledger, not in this guard, until this settle answers, so two carts settling at once (in
    // this run or another of the same shopper's) can't both fit under the weekly limit. Every answer names its hold,
    // a throw nothing here expects included (below), so no hold stands unanswered for the week.
    const hold = this.ledger.append({ ...base, actor: "guard", action: "capturing", why: `Holding $${fromCents(bound.cart.price)} against your weekly limit while PayPal captures this cart.`, data }).seq;
    data = { ...data, hold };
    let asked = false; // turns true just before PayPal is asked to capture
    let held: string | undefined; // AUTHORIZE: the authorization PayPal holds, once it does
    // W25: a hold is answered once. A throw after its answer (a ledger listener on the captured row) adds no second one.
    const answered = () => this.ledger.read().some((r) => r.data?.hold === hold);
    try {
      let snap: OrderSnapshot;
      try {
        snap = await port.get(orderId);
      } catch {
        // Fixed words (project Lesson 15): the adapter's error text is PayPal's or the network's, and the ledger reaches the browser.
        return refuse("PayPal didn't answer when we re-read the order; nothing was captured and this cart is closed", "get-failed");
      }
      // Re-read the clock: the approval must still be live after the network call, not only before it.
      const check = checkBoundCart(bound, snap, this.deps.clock.now());
      // Fixed words per code; the order's own value (PayPal's text) is quoted, never written into `why`.
      if (!check.ok) return refuse(check.reason, undefined, check.quoted);
      if (bound.intent === "AUTHORIZE") return await this.settleAuthorized(bound, orderId, port, base, data, refuse, { asking: () => { asked = true; }, held: (id) => { held = id; } });
      // Paid is paid: an order PayPal shows COMPLETED took the money, whatever the capture's reply said or lost. The order
      // read names its capture, so Undo can still refund it.
      const paidAnyway = (o: OrderSnapshot) => {
        const captureId = o.captureId ?? "";
        this.ledger.append({ ...base, actor: "paypal", action: "captured", verdict: "ok", why: `Paid: PayPal's reply to the capture was lost, but the order shows as paid: $${fromCents(bound.cart.price)} for ${bound.cart.item}.`, data: { ...data, code: "reply-lost", ...(captureId ? { captureId } : {}) } });
        return { ok: true as const, captureId };
      };
      const order = () => port.get(orderId).catch(() => null);
      try {
        asked = true;
        const cap = await port.capture(orderId);
        // A reply is not a payment until the capture says COMPLETED: PENDING may still take the money. DECLINED or FAILED
        // is the reply's word, so the order is read before "nothing was charged" is said (Lesson 53); unread, can't say.
        if (cap.status !== "COMPLETED") {
          const failed = cap.status === "DECLINED" || cap.status === "FAILED";
          const read = failed ? await order() : null;
          const after = read?.status ?? null;
          if (read?.status === "COMPLETED") return paidAnyway(read);
          const [code, reason, why] = !failed ? ["unknown", PENDING_REASON, PENDING_WHY]
            : after === null ? ["unknown", UNREAD_REASON, UNREAD_WHY]
            : ["not-captured", NOT_TAKEN_REASON, NOT_TAKEN_WHY];
          this.ledger.append({ ...base, actor: "paypal", action: "capture-failed", verdict: "refused", why, data: { ...data, code } });
          return { ok: false, reason };
        }
        this.ledger.append({ ...base, actor: "paypal", action: "captured", verdict: "ok", why: `Captured ${cap.captureId}: $${fromCents(bound.cart.price)} for ${bound.cart.item}.`, data: { ...data, captureId: cap.captureId } });
        return { ok: true, captureId: cap.captureId };
      } catch (e) {
        // The captured row is written and something after it threw: that is no failed capture, and the hold has its answer.
        if (answered()) throw e;
        // PayPal's decline is a known issue code (the video's decline beat), said in our words, never in theirs.
        // Read back first, as for any reply: an order already COMPLETED was paid, decline code or not.
        if (declined(e)) {
          const read = await order();
          if (read?.status === "COMPLETED") return paidAnyway(read);
          // Unread, the decline is only the reply's word (Lesson 53; the property test's find, seed 7): nothing is said about money, and the hold stays on the week.
          if (read === null) {
            this.ledger.append({ ...base, actor: "paypal", action: "capture-failed", verdict: "refused", why: UNREAD_WHY, data: { ...data, code: "unknown" } });
            return { ok: false, reason: UNREAD_REASON };
          }
          const reason = "PayPal declined the payment method; nothing was charged";
          this.ledger.append({ ...base, actor: "paypal", action: "capture-failed", verdict: "refused", why: `PayPal declined the payment method, so nothing was charged. ${FRESH_CART_SINGLE}`, data: { ...data, code: "INSTRUMENT_DECLINED" } });
          return { ok: false, reason };
        }
        // A capture that threw may still have gone through (the reply can be lost after PayPal took the money), so
        // nothing is said about money until the order is read again.
        const read = await order();
        const after = read?.status ?? null;
        if (read?.status === "COMPLETED") return paidAnyway(read);
        const [code, reason, why] = after === null
            ? ["unknown", UNREAD_REASON, UNREAD_WHY]
            : ["not-captured", "payment failed; PayPal shows the order unpaid, so nothing was charged", `Payment failed: PayPal shows the order unpaid, so nothing was charged. ${FRESH_CART_SINGLE}`];
        this.ledger.append({ ...base, actor: "paypal", action: "capture-failed", verdict: "refused", why, data: { ...data, code } });
        return { ok: false, reason };
      }
    } catch (e) {
      // A throw nothing here expects: answer the hold before the error goes on (no hold stands for the week). Before the
      // capture call nothing was captured, so the hold is released; after it the money may have moved, so it still counts.
      // Nothing is written when the hold already has its answer (the throw came after it).
      if (!answered()) {
        // AUTHORIZE: a hold nothing will capture is released, and the row says whether that was confirmed.
        const released = !asked && held !== undefined ? await voidHold(port, held, bound.hash) : null;
        this.ledger.append(asked
          ? { ...base, actor: "paypal", action: "capture-failed", verdict: "refused", why: `Something failed after we asked PayPal to capture, so we can't say whether it was charged. ${CHECK_SANDBOX}`, data: { ...data, code: "unknown" } }
          : { ...base, actor: "cart", action: "refuse", verdict: "refused", why: SETTLE_FAILED_WHY[String(released) as keyof typeof SETTLE_FAILED_WHY], data: { ...data, code: "settle-failed", ...(released === false && held !== undefined ? { ...UNRELEASED, authorizationId: held } : {}) } });
      }
      throw e;
    }
  }

  /**
   * AUTHORIZE intent (021 §4 item 4), after the order passed `checkBoundCart`: PayPal holds the money, the cart is checked
   * once more (`recheckAuthorized`), then exactly the bound amount is captured, or the hold is voided. Charged only when
   * the cart is the one you tapped, still live, and held for exactly its amount. The hold row stays unanswered (counted
   * against the week) until the capture or the void answers it; the "authorized" row carries no `hold`, so it never does.
   */
  private async settleAuthorized(bound: BoundCart, orderId: string, port: PaymentPort, base: SettleBase, data: Record<string, string | number>, refuse: (reason: string, code?: string, quoted?: string, extra?: Record<string, string>) => { ok: false; reason: string }, on: { asking(): void; held(authorizationId: string): void }): Promise<{ ok: true; captureId: string } | { ok: false; reason: string }> {
    if (!port.authorize || !port.captureAuthorization || !port.voidAuthorization) return refuse("this payment port can't authorize, so nothing was captured and this cart is closed", "no-authorize");
    const release = (id: string) => voidHold(port, id, bound.hash);
    let auth: Authorization;
    try {
      auth = await port.authorize(orderId, authorizeRequestId(bound.hash));
    } catch (e) {
      if (declined(e)) {
        this.ledger.append({ ...base, actor: "paypal", action: "capture-failed", verdict: "refused", why: `PayPal declined the payment method, so nothing was charged. ${FRESH_CART_SINGLE}`, data: { ...data, code: "INSTRUMENT_DECLINED" } });
        return { ok: false, reason: "PayPal declined the payment method; nothing was charged" };
      }
      // The reply can be lost after PayPal held the money: a hold found on the order is voided, since nothing will capture
      // it, and the words say what was found and whether the release was confirmed (Lesson 53), not what threw.
      const read = await port.get(orderId).then((o) => ({ found: o.authorization }), () => null);
      // Unread, a hold may stand on the money with no id to release it by (the property test's find, seed 7): the row says so, and the wallet's hold check takes it from there.
      if (read === null) return refuse("PayPal's reply was lost and the order couldn't be read, so money may still be held for this cart; nothing was captured and this cart is closed", "authorize-failed", undefined, UNRELEASED);
      const { found } = read;
      if (found?.status !== "CREATED") return refuse("PayPal didn't confirm holding the money, so nothing was captured and this cart is closed", "authorize-failed");
      return await release(found.id)
        ? refuse("PayPal's reply was lost after it held the money, so the hold was released; nothing was captured and this cart is closed", "authorize-failed")
        : refuse("PayPal's reply was lost after it held the money, and releasing the hold wasn't confirmed; nothing was captured and this cart is closed", "authorize-failed", undefined, { ...UNRELEASED, authorizationId: found.id });
    }
    on.held(auth.id);
    const { hold: _hold, ...plain } = data;
    this.ledger.append({ ...base, actor: "paypal", action: "authorized", verdict: "ok", why: `The money is held for this cart: $${fromCents(bound.cart.price)}, not charged yet. Checking the cart once more before capturing.`, data: { ...plain, authorizationId: auth.id } });
    const after = await port.get(orderId).catch(() => null);
    const code = recheckAuthorized(bound, bindingHash(bound.cart, bound.nonce, bound.expiresAt, this.deps.hash), auth, after, this.deps.clock.now());
    if (code !== null) {
      const voided = await release(auth.id);
      this.ledger.append({ ...base, actor: "paypal", action: voided ? "voided" : "void-failed", verdict: "refused", why: voided ? VOID_WORDS[code].why : VOID_FAILED_WHY, data: { ...data, code, authorizationId: auth.id, ...(voided ? {} : UNRELEASED) } });
      return { ok: false, reason: VOID_WORDS[code].reason };
    }
    // Can't tell from the reply (it threw, or came back without a usable amount): the order is read again before anything is said.
    const readBack = async (): Promise<{ ok: true; captureId: string } | { ok: false; reason: string }> => {
      const read = await port.get(orderId).catch(() => null);
      const state = read === null ? null : read.authorization?.id === auth.id ? read.authorization.status : "none";
      if (state === "CAPTURED") {
        // The price is the bound cart's: the guard sent exactly that amount, final, so a capture of this hold took that.
        // The order read names the capture, so Undo can still refund it.
        const captureId = read?.captureId ?? "";
        this.ledger.append({ ...base, actor: "paypal", action: "captured", verdict: "ok", why: `Paid: PayPal's reply to the capture was lost, but its hold shows as captured: $${fromCents(bound.cart.price)} for ${bound.cart.item}.`, data: { ...data, code: "reply-lost", authorizationId: auth.id, ...(captureId ? { captureId } : {}) } });
        return { ok: true, captureId };
      }
      if (state === "VOIDED" || (state === "CREATED" && await release(auth.id))) {
        this.ledger.append({ ...base, actor: "paypal", action: "capture-failed", verdict: "refused", why: `Payment failed: PayPal still showed the money held, not taken, so the hold was released and nothing was charged. ${FRESH_CART_SINGLE}`, data: { ...data, code: "not-captured", authorizationId: auth.id } });
        return { ok: false, reason: "payment failed; the hold was released, so nothing was charged" };
      }
      this.ledger.append({ ...base, actor: "paypal", action: "capture-failed", verdict: "refused", why: `PayPal didn't confirm the payment and we couldn't confirm its hold was released, so we can't say whether it was charged. ${CHECK_SANDBOX}`, data: { ...data, code: "unknown", authorizationId: auth.id } });
      return { ok: false, reason: "PayPal didn't confirm the payment, so we can't say whether it was charged" };
    };
    // Not taken, by the reply's word: the order is read before anything is said (Lesson 53). A hold the order shows captured
    // goes the way of a lost reply (paid at the bound price); one still held is released. Unread, the void is tried
    // anyway (it is keyed, so it can't release twice), and the row says whether it was confirmed.
    const notTaken = async (code: string, why: string, reason: string): Promise<{ ok: true; captureId: string } | { ok: false; reason: string }> => {
      const state = await port.get(orderId).then((o) => (o.authorization?.id === auth.id ? o.authorization.status : "none"), () => null);
      if (state === "CAPTURED") return await readBack();
      const released = state === "VOIDED" || ((state === "CREATED" || state === null) && await release(auth.id));
      this.ledger.append({ ...base, actor: "paypal", action: "capture-failed", verdict: "refused", why: `${why} ${released ? "The hold on the money was released." : "Releasing the hold on the money wasn't confirmed; nothing here will capture it."} ${FRESH_CART_SINGLE}`, data: { ...data, code, authorizationId: auth.id, ...(released ? {} : UNRELEASED) } });
      return { ok: false, reason };
    };
    let cap: { status: string; captureId: string; amount: Cents; currency: string };
    try {
      on.asking();
      cap = await port.captureAuthorization(auth.id, { amount: bound.cart.price, currency: bound.cart.currency, final: true, requestId: captureRequestId(bound.hash) });
    } catch (e) {
      if (declined(e)) {
        return await notTaken("INSTRUMENT_DECLINED", "PayPal declined the payment method, so nothing was charged.", "PayPal declined the payment method; nothing was charged");
      }
      return await readBack();
    }
    // A reply is not a payment until the capture says COMPLETED: PENDING may still take the money; DECLINED or FAILED took none.
    if (cap.status === "PENDING") {
      this.ledger.append({ ...base, actor: "paypal", action: "capture-failed", verdict: "refused", why: PENDING_WHY, data: { ...data, code: "unknown", authorizationId: auth.id } });
      return { ok: false, reason: PENDING_REASON };
    }
    if (cap.status === "DECLINED" || cap.status === "FAILED") {
      return await notTaken("not-captured", "Payment failed: PayPal didn't take the money, so nothing was charged.", NOT_TAKEN_REASON);
    }
    // Any other status, or an amount the reply didn't carry: the reply says nothing we can trust, so the order is read again.
    if (cap.status !== "COMPLETED" || !Number.isSafeInteger(cap.amount) || cap.amount < 0) return await readBack();
    // The money moved: the row says what PayPal took. Anything but the bound amount is never called paid, so its row is
    // not a "captured" one (no screen reads it as paid), though it counts against the week like one (`weekSpend`).
    if (cap.amount !== bound.cart.price || cap.currency !== bound.cart.currency) {
      // Another currency is said as such, never as "$X, not $X". The row carries PayPal's currency only when it reads
      // as a currency code. weekSpend counts the face amount; a cross-currency count is past what the guard can know.
      const other = cap.currency !== bound.cart.currency;
      const why = other ? "PayPal captured this cart in another currency than the one you approved. Check the order in the PayPal sandbox." : `PayPal captured $${fromCents(cap.amount)}, not the $${fromCents(bound.cart.price)} you approved. Check the order in the PayPal sandbox.`;
      this.ledger.append({ ...base, price: fromCents(cap.amount), currency: /^[A-Z]{3}$/.test(cap.currency) ? cap.currency : "???", actor: "paypal", action: "capture-mismatch", verdict: "refused", why, data: { ...data, code: "amount-mismatch", captureId: cap.captureId, authorizationId: auth.id, approved: fromCents(bound.cart.price), approvedCurrency: bound.cart.currency } });
      return { ok: false, reason: "PayPal captured a different amount than the cart you approved; check the order in the PayPal sandbox" };
    }
    this.ledger.append({ ...base, actor: "paypal", action: "captured", verdict: "ok", why: `Captured ${cap.captureId}: $${fromCents(bound.cart.price)} for ${bound.cart.item}.`, data: { ...data, captureId: cap.captureId, authorizationId: auth.id } });
    return { ok: true, captureId: cap.captureId };
  }
}
