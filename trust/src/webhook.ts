// 021 §4 item 6: PayPal's signed webhooks become ledger rows. The server checks each event's signature with PayPal
// first (the port's `verifyWebhook`, a postback); only then is it read here. What's read is ids, an amount and the
// event's type, never PayPal's text: every row's words are fixed (Lesson 15). A webhook row is evidence of what PayPal
// says happened; it never moves money, and its action ("webhook") is one no spend, hold or dial fold counts.

import { fromCents, toCents, type Cents } from "./money.ts";
import type { NewEvent } from "./events.ts";
import { Cooldown, DailyCap, WindowCap, type CapStore } from "./caps.ts";

/** The four events Goose turns into rows (docs/claims.md: PayPal's event names). Any other verified event is acknowledged and skipped. */
export const WEBHOOK_EVENTS = {
  "PAYMENT.AUTHORIZATION.CREATED": "authorization-created",
  "PAYMENT.AUTHORIZATION.VOIDED": "authorization-voided",
  "PAYMENT.CAPTURE.COMPLETED": "capture-completed",
  "PAYMENT.CAPTURE.REFUNDED": "capture-refunded",
} as const;
export type WebhookKind = (typeof WEBHOOK_EVENTS)[keyof typeof WEBHOOK_EVENTS];

/** The five headers PayPal signs a webhook with, as the postback sends them back. */
export interface WebhookHeaders { transmissionId: string; transmissionTime: string; transmissionSig: string; certUrl: string; authAlgo: string }

/** What a verified event says, in ids and cents only. */
export interface WebhookFacts {
  eventId: string;
  kind: WebhookKind;
  /** The authorization's, capture's or refund's own id. */
  resourceId: string;
  orderId?: string;
  /** The capture a refund belongs to. */
  captureId?: string;
  /** The cart hash Goose wrote into custom_id. */
  customId?: string;
  amount?: Cents;
  currency?: string;
}
export type WebhookRead = { ok: true; facts: WebhookFacts } | { ok: false; code: "unreadable" | "other-event" };

const ID = /^[A-Za-z0-9-]{1,64}$/;
const id = (v: unknown): string | undefined => (typeof v === "string" && ID.test(v) ? v : undefined);

/**
 * Read a verified event. An event type Goose doesn't log is "other-event"; one missing its own id, its resource's id or
 * carrying an id that isn't letters, digits and dashes is "unreadable". Optional fields that can't be read are left out.
 */
export function readWebhook(json: unknown): WebhookRead {
  if (json === null || typeof json !== "object" || Array.isArray(json)) return { ok: false, code: "unreadable" };
  const e = json as Record<string, any>;
  const kind = Object.hasOwn(WEBHOOK_EVENTS, e.event_type) ? WEBHOOK_EVENTS[e.event_type as keyof typeof WEBHOOK_EVENTS] : undefined;
  if (!kind) return { ok: false, code: typeof e.event_type === "string" ? "other-event" : "unreadable" };
  const r = e.resource && typeof e.resource === "object" ? e.resource : {};
  const eventId = id(e.id), resourceId = id(r.id);
  if (!eventId || !resourceId) return { ok: false, code: "unreadable" };
  const related = r.supplementary_data?.related_ids ?? {};
  // A refund names its capture in `related_ids` or in its "up" link (…/v2/payments/captures/{id}).
  const up = Array.isArray(r.links) ? r.links.find((l: any) => l?.rel === "up" && typeof l.href === "string") : undefined;
  const fromUp = up ? /\/captures\/([^/?#]+)$/.exec(up.href)?.[1] : undefined;
  const captureId = id(related.capture_id) ?? id(fromUp);
  let amount: Cents | undefined;
  try { amount = typeof r.amount?.value === "string" ? toCents(r.amount.value) : undefined; } catch { amount = undefined; }
  const currency = typeof r.amount?.currency_code === "string" && /^[A-Z]{3}$/.test(r.amount.currency_code) ? r.amount.currency_code : undefined;
  const orderId = id(related.order_id), customId = id(r.custom_id);
  return {
    ok: true,
    facts: {
      eventId, kind, resourceId,
      ...(orderId ? { orderId } : {}), ...(kind === "capture-refunded" && captureId ? { captureId } : {}), ...(customId ? { customId } : {}),
      ...(amount === undefined ? {} : { amount }), ...(currency ? { currency } : {}),
    },
  };
}

/** A cart as webhooks see it: its order, its capture once paid, and its hash. */
export interface WebhookCart { orderId?: string | undefined; captureId?: string | undefined; hash: string }

/**
 * Whether a verified event is about this cart: its order id (or, for a refund, its capture id) is the cart's, and when the
 * event carries a custom_id, it is this cart's hash. An event for another cart never lands on this one.
 */
export function webhookMatches(f: WebhookFacts, cart: WebhookCart): boolean {
  const byOrder = f.orderId !== undefined && f.orderId === cart.orderId;
  const byCapture = f.kind === "capture-refunded" && f.captureId !== undefined && f.captureId === cart.captureId;
  if (!byOrder && !byCapture) return false;
  return f.customId === undefined || f.customId === cart.hash;
}

const money = (f: WebhookFacts): string =>
  f.amount === undefined || !Number.isFinite(f.amount) ? "" : f.currency === "USD" || f.currency === undefined ? ` $${fromCents(f.amount)}` : ` ${fromCents(f.amount)} ${f.currency}`;

/** The fixed words for each event. PayPal's own text never reaches them. */
export const WEBHOOK_WORDS: Readonly<Record<WebhookKind, (f: WebhookFacts) => string>> = {
  "authorization-created": (f) => `PayPal confirmed the hold of${money(f) || " the money"} on this cart (event ${f.eventId}).`,
  "authorization-voided": (f) => `PayPal confirmed the hold on this cart was released (event ${f.eventId}).`,
  "capture-completed": (f) => `PayPal confirmed it took${money(f) || " the payment"} for this cart (event ${f.eventId}).`,
  "capture-refunded": (f) => `PayPal confirmed${money(f) || " the refund"} went back for this cart (event ${f.eventId}).`,
};
/** A verified event no cart here matches: noted, labeled, and attached to nothing. */
export const unmatchedWhy = (f: WebhookFacts): string => `PayPal sent an event that matches no cart here (${f.kind}, event ${f.eventId}), so it is only noted.`;

/** PayPal's own name for each kind, back from Goose's. */
const EVENT_TYPE = Object.fromEntries(Object.entries(WEBHOOK_EVENTS).map(([type, kind]) => [kind, type])) as Record<WebhookKind, keyof typeof WEBHOOK_EVENTS>;

/**
 * The row for a verified event: matched to a cart, or labeled unmatched. `t` and `shopperId` are the caller's. Its `data`
 * is the "Every decision" grid's contract for PayPal rows (Track C, 022 §2): `eventType` is PayPal's own name, and
 * `verified` says the signature check passed (only a verified event is ever read here).
 */
export function webhookRow(f: WebhookFacts, matched: boolean): Omit<NewEvent, "t" | "shopperId"> {
  return {
    visibility: "owner", actor: "paypal", action: "webhook", layer: 3, verdict: "ok",
    why: matched ? WEBHOOK_WORDS[f.kind](f) : unmatchedWhy(f),
    ...(matched && f.amount !== undefined && Number.isFinite(f.amount) ? { price: fromCents(f.amount), currency: f.currency ?? "USD" } : {}),
    data: { eventId: f.eventId, eventType: EVENT_TYPE[f.kind], event: f.kind, verified: true, resourceId: f.resourceId, matched, ...(f.orderId ? { orderId: f.orderId } : {}) },
  };
}

/** Event ids already written, so PayPal's retried deliveries write once. Bounded: the oldest ids go first. */
export class SeenEvents {
  private readonly ids = new Set<string>();
  private readonly max: number;
  constructor(max = 5000) { this.max = max; }
  /** True the first time an id is seen. */
  first(eventId: string): boolean {
    if (this.ids.has(eventId)) return false;
    this.ids.add(eventId);
    if (this.ids.size > this.max) this.ids.delete(this.ids.values().next().value!);
    return true;
  }
}

// ---------- before PayPal is asked (the push review's MEDIUM, Thu Oct 29) ----------
// Anyone can post five plausible headers, and each one used to spend the day's one webhook budget before PayPal said
// whether it signed them, so a script could fill it and PayPal's own events got 429 until midnight. Now the headers
// are read first (free), a check reserves a place in budgets only unverified checks keep (per address per day, and a
// rate across everyone that frees itself once a burst stops), and the day's event budget is charged only once PayPal
// says it signed.

/** The hosts PayPal serves its signing certificates from, live and sandbox (docs/claims.md). */
export const PAYPAL_CERT_HOSTS: readonly string[] = ["api.paypal.com", "api.sandbox.paypal.com"];
/** How far a transmission's time may be from this server's clock, either way: a day, since PayPal sends again for days. */
export const WEBHOOK_CLOCK_MS = 24 * 60 * 60 * 1000;
/** One PayPal check per transmission id in this window; a second send inside it is told to come back later. */
export const WEBHOOK_AGAIN_MS = 60_000;
/** The window the unverified rate across everyone is counted over. */
export const WEBHOOK_UNVERIFIED_WINDOW_MS = 10 * 60_000;
export type WebhookShapeMiss = "cert-url" | "auth-algo" | "time";

/** Which header can't be PayPal's, or null: the certificate on PayPal's https host, PayPal's algorithm, a time near now. */
export function webhookShapeMiss(h: Pick<WebhookHeaders, "certUrl" | "authAlgo" | "transmissionTime">, now: number): WebhookShapeMiss | null {
  let cert: URL | null;
  try { cert = new URL(h.certUrl); } catch { cert = null; }
  if (!cert || cert.protocol !== "https:" || cert.username !== "" || cert.password !== "" || cert.port !== "" || !PAYPAL_CERT_HOSTS.includes(cert.hostname)) return "cert-url";
  if (h.authAlgo !== "SHA256withRSA") return "auth-algo";
  const t = Date.parse(h.transmissionTime);
  if (!Number.isFinite(t) || Math.abs(now - t) > WEBHOOK_CLOCK_MS) return "time";
  return null;
}

/** Why a webhook isn't checked with PayPal: headers that can't be PayPal's (400), or a budget or the cooldown (429, PayPal sends again). */
export type WebhookGateHit = { status: 400; why: WebhookShapeMiss } | { status: 429; why: "ip" | "global" | "again" };

/**
 * The webhook route's gate. `before` runs ahead of PayPal's check: headers first, then the unverified budgets (per
 * address per day, per window across everyone, and a day's ceiling across everyone, kept across restarts, that bounds
 * PayPal calls), then the transmission id's cooldown. Passing reserves one unverified place for the address;
 * `signed` gives it back once PayPal confirms, and only then charges the day's event budget. So only checks PayPal
 * refused (or is still answering) fill the unverified budgets, and one address's forgeries never block another's. The
 * shared one is a rate (it bounds PayPal calls), so forgeries from many addresses hold PayPal's events back only while
 * they keep coming, and PayPal's next send lands.
 */
export class WebhookGate {
  readonly unverifiedPerIp: DailyCap;
  readonly unverifiedWindow: WindowCap;
  readonly unverifiedDay: DailyCap;
  readonly eventsDay: DailyCap;
  private readonly again: Cooldown<true>;
  private readonly now: () => number;

  constructor(limits: { unverifiedPerIp: number; unverifiedPerWindow: number; unverifiedDay: number; eventsDay: number; againMs?: number; windowMs?: number }, now: () => number, stores: { unverified?: CapStore; events?: CapStore } = {}) {
    this.now = now;
    this.unverifiedPerIp = new DailyCap(limits.unverifiedPerIp, now);
    this.unverifiedWindow = new WindowCap(limits.unverifiedPerWindow, limits.windowMs ?? WEBHOOK_UNVERIFIED_WINDOW_MS, now);
    this.unverifiedDay = new DailyCap(limits.unverifiedDay, now, stores.unverified);
    this.eventsDay = new DailyCap(limits.eventsDay, now, stores.events);
    this.again = new Cooldown(limits.againMs ?? WEBHOOK_AGAIN_MS, now);
  }

  /** Null when PayPal may be asked (one unverified place is then held for `ip`), else why not. Nothing is counted on a hit. */
  before(h: WebhookHeaders, ip: string): WebhookGateHit | null {
    const miss = webhookShapeMiss(h, this.now());
    if (miss) return { status: 400, why: miss };
    if (this.unverifiedPerIp.left(ip) === 0) return { status: 429, why: "ip" };
    if (this.unverifiedWindow.left() === 0 || this.unverifiedDay.left("all") === 0) return { status: 429, why: "global" };
    // After the budgets, so the cooldown holds no more ids than they let through.
    if (this.again.take(h.transmissionId, true)) return { status: 429, why: "again" };
    this.unverifiedPerIp.take(ip);
    this.unverifiedWindow.take();
    this.unverifiedDay.take("all");
    return null;
  }

  /** PayPal signed it: the place `before` held goes back, and the day's event budget is charged (false when it's full). */
  signed(ip: string): boolean {
    this.release(ip);
    return this.eventsDay.take("all");
  }

  /** PayPal didn't answer: that's no sign of a forgery, so the place goes back and PayPal's next send is checked. */
  release(ip: string): void {
    this.unverifiedPerIp.give(ip);
    this.unverifiedWindow.give();
    this.unverifiedDay.give("all");
  }
}
