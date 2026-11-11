// For merchants (scorecard row 20, Lead-12 Nov 6): each PayPal order Goose placed, and what ties it to the shopper's yes,
// read only. The recorded sandbox order comes first (Joshua's own, `pnpm e2e:sandbox`, his tap in PayPal, then
// `pnpm e2e:settle <orderId>`, which writes docs/fixtures/merchant-order.json); then this browser's own orders, from its
// own ledger rows. Nothing here types a number or an id: each cell is a field PayPal returned or a row the guard wrote.
//
//   Cart          the bound cart's hash, which the guard sends as PayPal's custom_id (trust/src/guard.ts `place`); the
//                 recorded order's is the custom_id PayPal itself returned, checked equal to the bound hash.
//   Seen approved when Goose read the order back from PayPal as APPROVED (a dash when it never did) (Q, Nov 6: never "the tap", which PayPal doesn't
//                 time-stamp for us). The recorded order's: the script's own re-read before its settle. This browser's: the
//                 first row the guard writes only after its re-read found the order APPROVED and the cart's own
//                 (`checkBoundCart` passed: paypal/authorized, captured, capture-failed or capture-mismatch). A refusal
//                 (cart/refuse) is never one: a re-read that found the order unapproved has no time here.
//   PayPal order  PayPal's order id, and its status (the recorded order's as PayPal returned it after the capture).
//   PayPal's word this browser's: the server's verified, matched webhook row (trust/src/webhook.ts `webhookRow`). The
//                 recorded order's: PayPal's own event for it, read back from PayPal's event list and matched to the
//                 order and the cart hash by the server's own `webhookMatches`; a list read carries no signature, so it
//                 is never called signed.

import { usdOf } from "../usd-of.ts";

/** One order's line in the table. */
export interface MerchantRow {
  /** Where the line comes from: the recorded order, or this browser's own. */
  from: "recorded" | "yours";
  /** The line's label: "Recorded sandbox order, Nov 6, 2026", or "Your sandbox order". */
  label: string;
  /** The cart's hash as PayPal's custom_id carries it (the full hash; the grid and the cards show its mark). */
  cart: string | null;
  /** The hash's first characters, as the ledger's own trail shows them (`cartMark`), or null with no hash. */
  mark: string | null;
  /** When Goose read the order back as APPROVED, in UTC words, or a dash when it never did (a blank cell reads as lost data). */
  approved: string;
  orderId: string;
  status: string;
  /** The money moved and stayed: PayPal's COMPLETED on the recorded order, or this browser's capture, not refunded. */
  done: boolean;
  /** PayPal's word on it: the event, or why there's none. */
  word: string;
  /** `word` is a verified, matched webhook (`MERCHANT_WORDS.signed`): the page draws its "signed by PayPal" as a badge. */
  signed: boolean;
  /** PayPal's event id, when there is one (the grid's copy target). */
  eventId: string | null;
  /** The amount with its currency, as the order row has it ("$50.13"). */
  amount: string;
}

/** What `pnpm e2e:settle` writes after a passing settle (docs/fixtures/merchant-order.json). Every field from PayPal. */
export interface RecordedOrder {
  /** The day it was recorded, YYYY-MM-DD (UTC). */
  recordedOn: string;
  orderId: string;
  intent: "AUTHORIZE" | "CAPTURE";
  /** The order's status as PayPal returned it after the settle ("COMPLETED"). */
  status: string;
  captureId: string;
  /** The amount PayPal returned, "50.13", and its currency. */
  amount: string;
  currency: string;
  /** The custom_id PayPal returned: the bound cart's hash (the script refuses to write one that isn't). */
  cartHash: string;
  /** When the script's re-read before the settle found the order APPROVED, ISO 8601 UTC (its read, not the tap). */
  approvedSeenAt: string;
  /** PayPal's own event for this capture, matched to the order and the cart hash; null when PayPal's list had none. */
  event: { id: string; type: string; createTime: string } | null;
}

const SIGNED_BY = "signed by PayPal";
export const MERCHANT_WORDS = {
  head: "For merchants: each order and what ties it to the shopper's approval",
  sub: "One row per PayPal order. Goose writes the cart's hash into the order's custom_id and reads it back before any capture: Goose refuses to capture unless the hash still matches. Read only.",
  cols: { cart: "Cart (custom_id)", approved: "Seen approved (UTC)", order: "PayPal order", status: "Status", word: "PayPal webhook", amount: "Amount" },
  recorded: (on: string) => `Recorded sandbox order, ${on}`,
  yours: "Your sandbox order",
  /** The recorded order's event: PayPal's own record, read back, never "signed" (a list read carries no signature). */
  listed: (type: string) => `${type}, from PayPal's event list`,
  signed: (type: string) => `${type}, ${SIGNED_BY}`,
  signedBy: SIGNED_BY,
  waiting: "Not yet",
  nothing: "Nothing taken, so nothing to confirm",
  /** A second settle that found the order already paid: the money moved once, on an earlier settle. */
  paid: "Already paid: never charged twice",
  /** PayPal's word on an already-paid order with no capture event in this browser's rows: the earlier settle has it. */
  dash: "—",
  /** The grid's chunk never came (offline, or a stale tab after a release): the page stays, this says why the table didn't. */
  lost: "The table didn't load. Reload the page to see it.",
  /** The empty table: a card with its heading, then what a row will fill. */
  noneHead: "No orders yet",
  none: "When you pay in PayPal's sandbox, your order is a row here: its cart hash, when Goose saw it approved, and PayPal's signed capture event once it arrives.",
} as const;

/** The table's row and header heights, px: one source for the grid's theme and the frame that holds its place before the
 *  grid's lazy chunk lands (the frame is exactly 44 + rows x ROW + 2 tall, so nothing below moves). A row holds PayPal's
 *  event type, its "signed by PayPal" badge and its event id. `min`: the narrowest column the grid draws in (its widths,
 *  borders in); a narrower one draws each order as a card. */
export const MERCHANT_GRID = { row: 84, head: 44, most: 6, min: 1016 } as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** The cart's mark, as `cartMark` (core/src/view/trail.ts) draws it: the hash's first 8, lower case. Its own copy, so the
 *  ledger's first files never take the trail module for one slice (merchants.test pins the two equal). */
export const markOf = (hash: string | null): string | null => (hash && /^[0-9a-f]{16,}$/i.test(hash) ? hash.slice(0, 8).toLowerCase() : null);

/** "Nov 6, 2026" from YYYY-MM-DD; the string itself if it isn't one. */
export function dayWords(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : ymd;
}
/** "Nov 6, 4:05 PM" (UTC: the column says so) from a time in ms. */
export function whenWords(t: number): string {
  const d = new Date(t);
  if (!Number.isFinite(d.getTime())) return "";
  const h = d.getUTCHours(), mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${h % 12 || 12}:${mm} ${h < 12 ? "AM" : "PM"}`;
}
const money = (amount: string, currency: string) => (currency === "USD" ? usdOf(amount) : `${amount} ${currency}`);

const ID = /^[A-Za-z0-9-]{1,64}$/;
const HASH = /^[0-9a-f]{16,128}$/i;
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** The recorded order from its file, or null for anything that isn't exactly one (a bent file draws nothing). */
export function readRecorded(json: unknown): RecordedOrder | null {
  if (json === null || typeof json !== "object" || Array.isArray(json)) return null;
  const r = json as Record<string, unknown>;
  const ev = r.event as Record<string, unknown> | null | undefined;
  const event = ev === null ? null : ev && typeof ev === "object" && ID.test(String(ev.id)) && /^[A-Z.]+$/.test(String(ev.type)) && !Number.isNaN(Date.parse(String(ev.createTime))) ? { id: String(ev.id), type: String(ev.type), createTime: String(ev.createTime) } : undefined;
  if (event === undefined) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.recordedOn)) || !ID.test(String(r.orderId)) || !ID.test(String(r.captureId))) return null;
  if (r.intent !== "AUTHORIZE" && r.intent !== "CAPTURE") return null;
  if (!/^[A-Z_]{3,40}$/.test(String(r.status)) || !/^\d+\.\d{2}$/.test(String(r.amount)) || !/^[A-Z]{3}$/.test(String(r.currency))) return null;
  if (!HASH.test(String(r.cartHash)) || Number.isNaN(Date.parse(String(r.approvedSeenAt)))) return null;
  return { recordedOn: String(r.recordedOn), orderId: String(r.orderId), intent: r.intent, status: String(r.status), captureId: String(r.captureId), amount: String(r.amount), currency: String(r.currency), cartHash: String(r.cartHash), approvedSeenAt: String(r.approvedSeenAt), event };
}

/** The recorded order's line. */
export function recordedLine(r: RecordedOrder): MerchantRow {
  return {
    from: "recorded", label: MERCHANT_WORDS.recorded(dayWords(r.recordedOn)), cart: r.cartHash, mark: markOf(r.cartHash), approved: whenWords(Date.parse(r.approvedSeenAt)) || MERCHANT_WORDS.dash,
    orderId: r.orderId, status: r.status, done: r.status === "COMPLETED", word: r.event ? MERCHANT_WORDS.listed(r.event.type) : MERCHANT_WORDS.waiting, signed: false, eventId: r.event?.id ?? null, amount: money(r.amount, r.currency),
  };
}

/** A ledger row as the stream sends it: only the fields this reads. */
export interface OrderEvent { t?: unknown; actor?: unknown; action?: unknown; price?: unknown; currency?: unknown; why?: unknown; data?: unknown }
/** The guard's refusal row for an order PayPal already shows paid (trust/src/cart.ts CART_WORDS.paid; a test pins it). */
export const PAID_WHY = "Not capturing: already captured: PayPal shows this order paid, so it is never charged twice.";
/** The rows the guard writes only after its re-read found the order APPROVED and the cart's own. */
const AFTER_CHECK = new Set(["authorized", "captured", "capture-failed", "capture-mismatch"]);
const data = (e: OrderEvent): Record<string, unknown> => (typeof e.data === "object" && e.data !== null ? e.data as Record<string, unknown> : {});
const is = (e: OrderEvent, actor: string, action: string) => e.actor === actor && e.action === action;

/** This browser's own orders, oldest first: one line per `paypal/order-created` row, from the rows naming its order. */
export function yourLines(events: readonly OrderEvent[]): MerchantRow[] {
  const lines: MerchantRow[] = [];
  const seen = new Set<string>();
  for (const created of events) {
    if (!is(created, "paypal", "order-created")) continue;
    const orderId = str(data(created).orderId);
    if (!orderId || !ID.test(orderId) || seen.has(orderId)) continue;
    seen.add(orderId);
    const mine = events.filter((e) => e !== created && str(data(e).orderId) === orderId);
    const captured = mine.find((e) => is(e, "paypal", "captured"));
    const captureId = captured ? str(data(captured).captureId) : null;
    const refunded = captureId ? events.find((e) => is(e, "paypal", "refunded") && str(data(e).captureId) === captureId) : undefined;
    const voided = mine.find((e) => is(e, "paypal", "voided"));
    const held = mine.find((e) => is(e, "paypal", "authorized"));
    const stopped = mine.find((e) => is(e, "paypal", "capture-failed") || is(e, "paypal", "capture-mismatch") || is(e, "paypal", "void-failed") || is(e, "cart", "refuse"));
    // A stop where the guard can't say no money moved (as `payTrail`'s "unsure"): never "nothing taken".
    const unsure = !!stopped && (is(stopped, "paypal", "capture-mismatch") || is(stopped, "paypal", "void-failed") || data(stopped).code === "unknown" || data(stopped).code === "settle-failed");
    // A second settle of an order already paid: money moved once, so never "nothing taken" (the earlier settle took it).
    const paid = !captured && mine.some((e) => is(e, "cart", "refuse") && e.why === PAID_WHY);
    const status = refunded ? "Refunded" : captured ? "Captured" : voided ? "Voided (hold released)" : paid ? MERCHANT_WORDS.paid : unsure ? "Stopped: check it in PayPal" : stopped ? "Not captured" : held ? "Held" : "Waiting for the tap";
    // Seen approved: the first row written only after the guard's re-read found the order APPROVED. Never a refusal.
    const seenAt = mine.filter((e) => e.actor === "paypal" && AFTER_CHECK.has(String(e.action)) && typeof e.t === "number").sort((a, b) => (a.t as number) - (b.t as number))[0];
    // PayPal's signed word on how it ended: the capture's event for a capture, the release's for a void.
    const want = captured || paid ? ["PAYMENT.CAPTURE.COMPLETED"] : voided ? ["PAYMENT.AUTHORIZATION.VOIDED"] : held ? ["PAYMENT.AUTHORIZATION.CREATED"] : [];
    const hook = mine.find((e) => is(e, "paypal", "webhook") && data(e).verified === true && data(e).matched === true && want.includes(String(data(e).eventType)));
    const eventType = hook ? String(data(hook).eventType) : null;
    const eventId = hook ? str(data(hook).eventId) : null;
    const price = str(created.price), currency = str(created.currency) ?? "USD";
    const cart = str(data(created).hash);
    lines.push({
      from: "yours", label: MERCHANT_WORDS.yours, cart, mark: markOf(cart), approved: (seenAt && whenWords(seenAt.t as number)) || MERCHANT_WORDS.dash,
      orderId, status, done: !!captured && !refunded, word: eventType ? MERCHANT_WORDS.signed(eventType) : paid ? MERCHANT_WORDS.dash : stopped && !unsure && !captured && !voided ? MERCHANT_WORDS.nothing : MERCHANT_WORDS.waiting, signed: !!eventType, eventId,
      amount: price && /^\d+\.\d{2}$/.test(price) ? money(price, currency) : "",
    });
  }
  return lines;
}

/** The table: the recorded order first, then this browser's own. */
export function merchantRows(recorded: RecordedOrder | null, events: readonly OrderEvent[]): MerchantRow[] {
  return [...(recorded ? [recordedLine(recorded)] : []), ...yourLines(events)];
}
