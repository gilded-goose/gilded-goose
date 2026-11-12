// "Verify this order" (Joshua, Nov 11): anyone pastes an order id and reads what this server holds for it: the cart the
// shopper approved, its fingerprint, PayPal's order as it stands, the rows Goose wrote, and whether PayPal's signed event
// arrived. For a merchant settling a "my AI did it" dispute. READ ONLY: nothing here creates, approves, authorizes,
// captures, voids or refunds, writes a ledger row, sets a cookie, or changes a run. It reads a run's bound cart and rows,
// and asks the payment port for the order with its existing read (`PaymentPort.get`), which already returns only the
// order's id, status, amount, currency, custom_id, payee and intent.
//
// The match is not a rule of its own. It is the guard's: `bindingHash` re-derives the fingerprint from the stored cart
// (as `settle` does before any capture), and `checkBoundCart` compares the order with that cart (id, custom_id, amount,
// currency, payee, intent). Only its two time-bound checks are stood down, because this page reads an order after the
// fact: the approval's expiry and the order's status say whether it may be captured now, not whether it is this cart's.
//
// Privacy: the answer is built field by field from a closed list, never by spreading a row, a cart or PayPal's reply, so a
// field this file doesn't name can't reach it. No payer name, email, address or funding source is read or held here, and
// none of PayPal's other ids (capture, authorization, refund, event) is sent. A row's own words (`why`, `quoted`,
// `data`) never leave: each row is said in this file's fixed words for its actor and action.
//
// Unknown, malformed and other people's order ids all get the same answer, `NOT_FOUND`, and none of them reaches PayPal:
// only an id this server itself placed is ever read there, so the answer and its timing say nothing about anyone else's
// account. An exact id is the only key; nothing here lists or searches.

import { bindingHash, checkBoundCart, fromCents, type BoundCart, type CartCode, type Hasher, type LedgerEvent, type OrderSnapshot } from "@goose/core";
import { yourLines } from "@goose/core/merchants";

/** PayPal's order id as it prints it: 17 capitals and digits. */
export const PAYPAL_ORDER_ID = /^[0-9A-Z]{17}$/;
/** The local stand-in's order id (`FakePaymentPort`), accepted only on a server running that stand-in. */
export const PRACTICE_ORDER_ID = /^FAKE-[0-9]{4,8}$/;

export type Rail = "sandbox" | "practice";
/** What every page of this answer says about the money, for each rail. */
export const RAIL_LABEL: Readonly<Record<Rail, string>> = {
  sandbox: "PayPal sandbox · test money",
  practice: "Practice · not a PayPal order, no money",
};

export const VERIFY_WORDS = {
  /** Said only when Goose saw PayPal's approval (a row written after its re-read found the order APPROVED). */
  match: "This order was approved for exactly this cart",
  mismatch: "This order does not match the approved cart",
  /** No approval seen: a comparison is not an event, so the headline never borrows the word. A press of Goose's own Approve button is not one. */
  created: "This order was created for exactly this cart. Goose never saw it approved at PayPal.",
  mismatchCreated: "This order does not match the cart it was created for. Goose never saw it approved at PayPal.",
  /** PayPal's own record says approved (or completed) and this server has no row of it: the return never reached us. Both are said. */
  createdElsewhere: "This order was created for exactly this cart. PayPal's record shows it approved; this server did not see that approval.",
  mismatchElsewhere: "This order does not match the cart it was created for. PayPal's record shows it approved; this server did not see that approval.",
  /** Where the order's side of the comparison came from. */
  fromPayPal: "PayPal was asked for this order just now, and its custom_id was compared with the cart's fingerprint.",
  fromStandIn: "This build's stand-in for PayPal was asked for this order just now, and its custom_id was compared with the cart's fingerprint.",
  fromStore: "PayPal wasn't asked just now, so this compares the cart with what this server recorded when it created the order.",
  matchWhy: "The fingerprint worked out again from the stored cart is the one the order carries, and the amount is the cart's total.",
  /** One line per re-check the guard can fail, in a merchant's words. The order's own value is never quoted. */
  why: {
    stored: "The stored cart no longer works out to the fingerprint the order was created with, so the cart changed after the order was made.",
    order: "The order on record is not this cart's order.",
    hash: "The order carries a different fingerprint than this cart's.",
    amount: "The order's amount is not this cart's total.",
    currency: "The order's currency is not this cart's.",
    payee: "The order pays someone other than this cart's seller.",
    intent: "The order was placed to take the money a different way than this cart was.",
  },
  hookArrived: "PayPal's signed event arrived. Its signature was checked with PayPal before the row was written.",
  hookNone: "No PayPal event for this order has reached this server. An event that fails PayPal's signature check is refused and never recorded, so none can show here.",
  noApproval: "Not seen approved",
  refund: { none: "No refund on record.", refunded: "Refunded through PayPal.", failed: "A refund was asked for and did not go through, so the payment stands." },
} as const;

/** The site's name for the local stand-in (the receipt's own words), so a practice order's headline never says "at PayPal". */
const STAND_IN = "this build's stand-in for PayPal";
/**
 * The headline when this server holds no approval row. `elsewhere`: the payment provider's own record, read just now,
 * shows the order APPROVED or COMPLETED, so the approval happened and only this server missed it.
 */
export function unseenHeadline(mismatch: boolean, rail: Rail, elsewhere: boolean): string {
  const said = elsewhere ? (mismatch ? VERIFY_WORDS.mismatchElsewhere : VERIFY_WORDS.createdElsewhere) : mismatch ? VERIFY_WORDS.mismatchCreated : VERIFY_WORDS.created;
  if (rail === "sandbox") return said;
  return said.replace("PayPal's record shows", "The stand-in's record shows").replace("approved at PayPal.", `approved at ${STAND_IN}.`);
}

/** Fixed words for each row Goose writes about an order, keyed by actor and action. The row's own text never leaves. */
export const ROW_WORDS: Readonly<Record<string, string>> = {
  "guard/buy": "Code cleared this cart for the shopper's approval.",
  "guard/ask": "Code held this cart for the shopper's own yes.",
  "paypal/order-created": "The order was created for this cart, carrying its fingerprint.",
  "paypal/error": "The order could not be placed. Nothing was charged.",
  "shopper/cancel": "Cancel was pressed on the payment page. Nothing was charged.",
  "guard/capturing": "Goose began settling and re-read the order before taking anything.",
  "paypal/authorized": "The money was held, not charged yet.",
  "paypal/captured": "The payment was taken.",
  "paypal/voided": "The hold was released. Nothing was charged.",
  "paypal/void-failed": "Releasing the hold was not confirmed.",
  "paypal/capture-mismatch": "A different amount than the approved cart's was captured.",
  "cart/refuse": "Goose refused to capture this cart.",
  "paypal/refunded": "The payment was refunded.",
  "paypal/refund-failed": "A refund was asked for and did not go through.",
  "paypal/webhook": "PayPal's signed event arrived.",
  "seller/price-swap": "The cart was changed after the approval (staged by this demo, as the seller).",
  "paypal/shipped": "The seller's tracking was handed to PayPal.",
  "paypal/ship-unconfirmed": "Handing the seller's tracking to PayPal was not confirmed.",
  "paypal/dispute-none": "PayPal was asked for disputes on this purchase and listed none.",
  "paypal/dispute-unchecked": "PayPal was asked for disputes and did not answer.",
  "paypal/reconcile-agrees": "PayPal's transaction report agrees with this record's amount.",
  "paypal/reconcile-differs": "PayPal's transaction report differs from this record's amount.",
  "paypal/reconcile-pending": "PayPal's transaction report doesn't list this capture yet.",
  "paypal/reconcile-unchecked": "PayPal's transaction report could not be read.",
};
const CAPTURE_FAILED = { unknown: "The payment was not confirmed, so this record can't say whether it was charged.", other: "The payment did not go through. Nothing was captured." } as const;
const HOOK_TYPES: ReadonlySet<string> = new Set(["PAYMENT.AUTHORIZATION.CREATED", "PAYMENT.AUTHORIZATION.VOIDED", "PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.REFUNDED"]);
/** The rows the guard writes only after its re-read found the order APPROVED and the cart's own (core/src/view/merchants.ts). */
const AFTER_CHECK: ReadonlySet<string> = new Set(["authorized", "captured", "capture-failed", "capture-mismatch"]);
const ROWS_SHOWN = 60;
/** The verdict words a row may carry out; any other value leaves as none. */
const VERDICTS: ReadonlySet<string> = new Set(["ok", "refused", "flagged", "asked"]);

export interface VerifyRow { at: string; actor: string; action: string; verdict: string | null; amount: string | null; currency: string | null; words: string }
export interface VerifyFound {
  found: true;
  rail: Rail;
  label: string;
  orderId: string;
  verdict: "match" | "mismatch";
  headline: string;
  why: string;
  /** Where the order's side came from: asked just now, or this server's own record of what it sent. */
  witness: "paypal" | "stored";
  witnessWords: string;
  /** `status`: PayPal's own word when it was asked. `outcome`: Goose's reading of its own rows, in its words. */
  order: { status: string; outcome: string; amount: string; currency: string; fingerprint: string | null };
  /** True only when a row the guard writes after reading the order back as APPROVED exists. */
  seenApproved: boolean;
  /** When this answer was read (PayPal's side of it included), so a kept answer never passes for a fresh one. */
  readAt: string;
  cart: { item: string; payee: string; qty: number; total: string; currency: string; fingerprint: string; boundWith: string };
  /** `approved`: the time Goose saw the approval, or the fixed words for never. */
  times: { created: string | null; approved: string; captured: string | null; refunded: string | null };
  rows: VerifyRow[];
  webhook: { arrived: boolean; verified: boolean; events: { type: string; at: string }[]; words: string };
  refund: { state: "none" | "refunded" | "failed"; words: string };
}
export const NOT_FOUND = { found: false, error: "No order with that id is on record here." } as const;
/** `VERIFY_ORDER=off`: the route answers this, 404, before any lookup or order read. */
export const SWITCHED_OFF = { found: false, off: true, error: "Order lookups are switched off on this server." } as const;
export const TOO_MANY = { found: false, error: "Too many lookups from this network. Try again in a minute." } as const;
export type VerifyAnswer = { status: 200; body: VerifyFound | typeof NOT_FOUND } | { status: 429; body: typeof TOO_MANY };

/** What this server holds for one order: the run's bound cart and its rows. Nothing of the shopper's own settings. */
export interface OrderRecord { bound: BoundCart; rows: readonly LedgerEvent[] }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Nov 11, 2026, 4:05 AM UTC", or null for a time that isn't one. */
export function utcWords(t: unknown): string | null {
  if (typeof t !== "number" || !Number.isFinite(t)) return null;
  const d = new Date(t);
  if (!Number.isFinite(d.getTime())) return null;
  const h = d.getUTCHours();
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"} UTC`;
}

const HASH = /^[0-9a-f]{32}$/;
const STATUS = /^[A-Z_]{3,40}$/;
const MONEY = /^\d{1,9}\.\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;
const WORD = /^[a-z-]{1,24}$/;
/** Text of ours a stranger reads: control characters out, capped. The page prints it as text. */
const shown = (s: unknown, max = 120): string => String(s ?? "").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").trim().slice(0, max);
const cents = (n: unknown): string | null => (typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? fromCents(n) : null);

/** The order as this server recorded it when it created it: what it sent PayPal, from its own `order-created` row. */
function storedOrder(bound: BoundCart, created: LedgerEvent | undefined): OrderSnapshot | null {
  if (!created || !bound.orderId) return null;
  const hash = created.data?.hash;
  // The amount is read from the row's own decimal text, never through a float.
  const m = /^(\d{1,9})\.(\d{2})$/.exec(created.price ?? "");
  if (typeof hash !== "string" || !m) return null;
  return { id: String(created.data?.orderId ?? ""), status: "APPROVED", amount: Number(m[1]) * 100 + Number(m[2]), currency: String(created.currency ?? ""), customId: hash, ...(bound.cart.payee === undefined ? {} : { payee: bound.cart.payee }) };
}

/**
 * The guard's own comparison of this cart with an order, after the fact: null when it is this cart's order, else which
 * re-check failed. `bindingHash` first, as `settle` does; then `checkBoundCart` with its expiry and status stood down.
 */
export function cartMismatch(bound: BoundCart, snap: OrderSnapshot, hash: Hasher): keyof typeof VERIFY_WORDS.why | null {
  if (bindingHash(bound.cart, bound.nonce, bound.expiresAt, hash) !== bound.hash) return "stored";
  const check = checkBoundCart(bound, { ...snap, status: "APPROVED" }, bound.expiresAt);
  if (check.ok) return null;
  const code: CartCode = check.code;
  // Stood down above, so neither can come back; if the guard ever adds a re-check, it reads as "not this cart's order".
  return code === "hash" || code === "amount" || code === "currency" || code === "payee" || code === "intent" ? code : "order";
}

const rowWords = (e: LedgerEvent): string => {
  if (e.actor === "paypal" && e.action === "capture-failed") return e.data?.code === "unknown" ? CAPTURE_FAILED.unknown : CAPTURE_FAILED.other;
  return ROW_WORDS[`${e.actor}/${e.action}`] ?? "";
};
/** A row of the order's lifecycle: one this file has fixed words for. Any other row (a seller's note, a haggle move) never leaves. */
const lifecycle = (e: LedgerEvent): boolean => rowWords(e) !== "";

/** The answer for an order this server holds. Pure: `snap` is PayPal's order read just now, or null when it wasn't read. */
export function verifyRecord(orderId: string, rec: OrderRecord, snap: OrderSnapshot | null, hash: Hasher, rail: Rail, now: number): VerifyFound | null {
  const { bound } = rec;
  if (bound.orderId !== orderId) return null;
  const created = rec.rows.find((e) => e.actor === "paypal" && e.action === "order-created" && e.data?.orderId === orderId);
  const stored = storedOrder(bound, created);
  // PayPal's answer counts only when it is for the id asked; anything else falls back to this server's own record.
  const live = snap && snap.id === orderId ? snap : null;
  const order = live ?? stored;
  if (!order) return null;
  const bad = cartMismatch(bound, order, hash);
  // This order's rows: the ones that name its cart, and everything the run wrote from the order's creation on.
  const from = created?.seq ?? Number.POSITIVE_INFINITY;
  // A run may hold another order's rows too (an earlier cart's late webhook or refund), so "since the order was created"
  // is never enough: a row that names a cart, an order, a capture or a PayPal resource must name this order's.
  const own = new Set<string>();
  const named = (e: LedgerEvent) => e.data?.hash === bound.hash || e.data?.orderId === orderId;
  for (const e of rec.rows) if (named(e)) for (const k of ["captureId", "authorizationId"] as const) { const v = e.data?.[k]; if (typeof v === "string" && v !== "") own.add(v); }
  for (const e of rec.rows) if (e.action === "refunded" && typeof e.data?.captureId === "string" && own.has(e.data.captureId) && typeof e.data.refundId === "string") own.add(e.data.refundId);
  const about = (e: LedgerEvent): boolean => {
    const d = e.data ?? {};
    if (typeof d.hash === "string") return d.hash === bound.hash;
    if (typeof d.orderId === "string") return d.orderId === orderId;
    if (e.seq < from) return false;
    if (typeof d.captureId === "string") return own.has(d.captureId);
    if (typeof d.resourceId === "string") return own.has(d.resourceId);
    return true; // names nothing of PayPal's (a cancel, a set-aside): the run's own row since this order was made
  };
  const mine = rec.rows.filter((e) => about(e) && lifecycle(e));
  // Approved is an event, not a comparison: only a row the guard wrote after it read the order back as APPROVED says so.
  const seenAt = mine.find((e) => e.actor === "paypal" && AFTER_CHECK.has(e.action));
  const line = yourLines(mine).find((l) => l.orderId === orderId);
  const first = (pick: (e: LedgerEvent) => boolean) => utcWords(mine.find(pick)?.t);
  const hooks = mine.filter((e) => e.actor === "paypal" && e.action === "webhook" && e.data?.matched === true && e.data.verified === true && HOOK_TYPES.has(String(e.data.eventType)));
  const refunded = mine.some((e) => e.actor === "paypal" && e.action === "refunded");
  const refund = refunded ? "refunded" : mine.some((e) => e.actor === "paypal" && e.action === "refund-failed") ? "failed" : "none";
  const custom = typeof order.customId === "string" && HASH.test(order.customId) ? order.customId : null;
  const currency = CURRENCY.test(order.currency) ? order.currency : "???";
  return {
    found: true, rail, label: RAIL_LABEL[rail], orderId,
    verdict: bad ? "mismatch" : "match",
    headline: seenAt ? (bad ? VERIFY_WORDS.mismatch : VERIFY_WORDS.match) : unseenHeadline(bad !== null, rail, live !== null && (live.status === "APPROVED" || live.status === "COMPLETED")),
    seenApproved: seenAt !== undefined, readAt: utcWords(now) ?? "",
    why: bad ? VERIFY_WORDS.why[bad] : VERIFY_WORDS.matchWhy,
    witness: live ? "paypal" : "stored",
    witnessWords: live ? (rail === "sandbox" ? VERIFY_WORDS.fromPayPal : VERIFY_WORDS.fromStandIn) : VERIFY_WORDS.fromStore,
    order: {
      // PayPal's own status word when it was asked. Its COMPLETED also covers an order whose hold was later released, so
      // Goose's reading of its own rows (core/src/view/merchants.ts `yourLines`) always stands beside it.
      status: live ? (STATUS.test(live.status) ? live.status : "UNREADABLE") : "Not asked just now",
      outcome: shown(line?.status ?? "On record", 60),
      amount: cents(order.amount) ?? "unreadable", currency, fingerprint: custom,
    },
    cart: {
      item: shown(bound.cart.item), payee: shown(bound.cart.merchant), qty: Number.isSafeInteger(bound.cart.qty) ? bound.cart.qty : 0,
      total: cents(bound.cart.price) ?? "unreadable", currency: bound.cart.currency,
      fingerprint: bindingHash(bound.cart, bound.nonce, bound.expiresAt, hash),
      boundWith: HASH.test(bound.hash) ? bound.hash : "unreadable",
    },
    times: {
      created: utcWords(created?.t),
      approved: utcWords(seenAt?.t) ?? VERIFY_WORDS.noApproval,
      captured: first((e) => e.actor === "paypal" && e.action === "captured"),
      refunded: first((e) => e.actor === "paypal" && e.action === "refunded"),
    },
    rows: mine.slice(0, ROWS_SHOWN).map((e) => ({
      at: utcWords(e.t) ?? "", actor: WORD.test(e.actor) ? e.actor : "other", action: WORD.test(e.action) ? e.action : "other",
      verdict: typeof e.verdict === "string" && VERDICTS.has(e.verdict) ? e.verdict : null, amount: e.price !== undefined && MONEY.test(e.price) ? e.price : null, currency: e.currency !== undefined && CURRENCY.test(e.currency) ? e.currency : null,
      words: rowWords(e),
    })),
    webhook: {
      arrived: hooks.length > 0, verified: hooks.length > 0,
      events: hooks.map((e) => ({ type: String(e.data!.eventType), at: utcWords(e.t) ?? "" })),
      words: hooks.length > 0 ? VERIFY_WORDS.hookArrived : VERIFY_WORDS.hookNone,
    },
    refund: { state: refund, words: VERIFY_WORDS.refund[refund] },
  };
}

/** A small per-address cap: at most `perMinute` lookups in any one minute's window, kept in memory, oldest keys dropped. */
export class LookupCap {
  private readonly hits = new Map<string, { from: number; n: number }>();
  private readonly perMinute: number;
  private readonly now: () => number;
  private readonly max: number;
  constructor(perMinute: number, now: () => number, max = 20_000) { this.perMinute = perMinute; this.now = now; this.max = max; }
  /** True when this lookup may go; false past the cap (and nothing is counted). */
  take(key: string): boolean {
    const t = this.now();
    const h = this.hits.get(key);
    if (h && t - h.from < 60_000) { if (h.n >= this.perMinute) return false; h.n++; return true; }
    this.hits.delete(key);
    this.hits.set(key, { from: t, n: 1 });
    if (this.hits.size > this.max) for (const [k, v] of this.hits) { if (t - v.from < 60_000) break; this.hits.delete(k); }
    if (this.hits.size > this.max) this.hits.delete(this.hits.keys().next().value!);
    return true;
  }
}

export interface VerifyDeps {
  /** The record for exactly this order id, or null. Never a search: the caller compares whole ids. */
  find(orderId: string): OrderRecord | null;
  /** The payment port's order read, or null when there is no port (or it is paused). Read only. */
  read: ((orderId: string) => Promise<OrderSnapshot>) | null;
  hash: Hasher;
  rail: Rail;
  now(): number;
  perMinute?: number;
  /** How long one order's answer is kept, so repeats don't ask PayPal again. */
  cacheMs?: number;
  /** How long PayPal's read may take before the answer falls back to this server's own record. */
  readTimeoutMs?: number;
  log?(m: string): void;
}

const CACHE_KEPT = 500;

/** The lookup behind GET /api/verify/:id. Every miss is the same `NOT_FOUND`; only an order found here reaches PayPal. */
export function verifyOrders(deps: VerifyDeps): (id: string, address: string) => Promise<VerifyAnswer> {
  const cap = new LookupCap(deps.perMinute ?? 20, deps.now);
  const cacheMs = deps.cacheMs ?? 5_000, readTimeoutMs = deps.readTimeoutMs ?? 4000;
  const cache = new Map<string, { at: number; body: VerifyFound }>();
  const inFlight = new Map<string, Promise<VerifyAnswer>>();
  const shape = deps.rail === "practice" ? PRACTICE_ORDER_ID : PAYPAL_ORDER_ID;
  return async (id, address) => {
    // Counted before anything is read, a malformed id included, so guessing costs the guesser and nothing else.
    if (!cap.take(address)) return { status: 429, body: TOO_MANY };
    if (typeof id !== "string" || !shape.test(id)) return { status: 200, body: NOT_FOUND };
    const t = deps.now();
    const kept = cache.get(id);
    if (kept && t - kept.at < cacheMs) return { status: 200, body: kept.body };
    const rec = deps.find(id);
    if (!rec || rec.bound.orderId !== id) return { status: 200, body: NOT_FOUND };
    // One read in flight per order: lookups that arrive while PayPal is answering wait for that answer.
    const flying = inFlight.get(id);
    if (flying) return flying;
    const answer = fresh(id, rec, t).finally(() => inFlight.delete(id));
    inFlight.set(id, answer);
    return answer;
  };
  async function fresh(id: string, rec: OrderRecord, t: number): Promise<VerifyAnswer> {
    let snap: OrderSnapshot | null = null;
    if (deps.read) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        snap = await Promise.race([deps.read(id), new Promise<null>((r) => { timer = setTimeout(() => r(null), readTimeoutMs); })]);
      } catch (e) {
        // The port's error text is PayPal's or the network's: the log keeps it, the answer says only that PayPal wasn't asked.
        deps.log?.(`verify: the order read failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally { clearTimeout(timer); }
    }
    const body = verifyRecord(id, rec, snap, deps.hash, deps.rail, t);
    if (!body) return { status: 200, body: NOT_FOUND };
    cache.delete(id);
    cache.set(id, { at: t, body });
    if (cache.size > CACHE_KEPT) cache.delete(cache.keys().next().value!);
    return { status: 200, body };
  }
}
