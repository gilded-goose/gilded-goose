// The Desk's "Behind the scenes" ledger (slice 3; Joshua, Fri Oct 30): the session's whole shopper ledger as grid rows,
// every ask, item, decision, skipped seller, payment, refund and PayPal webhook, one row per ledger row and nothing else.
// Pure. The server streams the shopper ledger's rows; the page turns each into a row here and adds it to the grid as
// a transaction. A row reads only the ledger up to itself, so once added it never changes: a transaction only ever adds,
// and the rows streamed one at a time equal the rows made at once (the required test, core/test/session.test.ts).

import { fromCents, toCents, type Cents, usd } from "../money.ts";
import { isShoppers, type LedgerEvent, type ShopperLedger, type Source } from "../ledger/events.ts";
import { catalogItem } from "../trust/catalog.ts";
import type { Chip } from "../trust/chips.ts";
import { DEMO_SHOPPER, demoCatalogItems, demoPolicy } from "../scenario.ts";
import { categoryLimitFor, type Policy } from "../trust/policy.ts";
import { verdictOf, watch, type WatchVerdict } from "../trust/watch.ts";
import { BEAT_DAY } from "../ask/watching.ts";
import { MOVING_DAYS, MOVING_ITEMS, priceOn, type MovingItem } from "../sellers/moving.ts";
import { gridRow, type ActorGroup, type GridRow, type Tone } from "./grid.ts";
import { SEEDED_NOTE } from "./wallet.ts";
import { gotWhilst, howOverDays } from "./how-got.ts";

/** What a row is, for the Desk's filter and its renderers. Every ledger row has exactly one. */
export type SessionKind = "ask" | "item" | "decision" | "skipped" | "payment" | "refund" | "webhook";
/** `label` names the filter (many rows), `one` a row's own cell. One verb for the Watcher's act on screen and in the CSV:
 *  "set aside" (DD, NITS-1 / B-7); the key stays `skipped`, and search still finds the row by "skipped". */
export const SESSION_KINDS: readonly { key: SessionKind; label: string; one: string }[] = [
  { key: "ask", label: "Asks", one: "Ask" }, { key: "item", label: "Items", one: "Item" }, { key: "decision", label: "Decisions", one: "Decision" },
  { key: "skipped", label: "Sellers set aside", one: "Set aside" }, { key: "payment", label: "Payments", one: "Payment" },
  { key: "refund", label: "Refunds", one: "Refund" }, { key: "webhook", label: "PayPal webhooks", one: "PayPal webhook" },
];

/** Where a row came from, in words (N19). A Record, so a new source needs its words. */
export const SOURCE_WORDS: Readonly<Record<Source, string>> = {
  seeded: SEEDED_NOTE, recorded: "a recorded run", live: "live", market: "the market", attack: "a test of the guard", ask: "your Ask",
};

export interface SessionRow {
  /** The shopper ledger's seq: the row id the grid keys on, unique across every run in the session. */
  seq: number;
  /** The ledger's clock (ms) and its day; the grid shows the time, never a date it made up (N6). */
  t: number;
  run: string | null;
  source: Source | null;
  sourceWords: string | null;
  kind: SessionKind;
  actor: ActorGroup;
  who: string;
  did: string;
  price: string | null;
  cents: Cents | null;
  why: string;
  /** Seller text, quoted: never instructions. */
  quoted: string | null;
  fenced: string | null;
  label: string | null;
  tone: Tone;
  eventId: string | null;
  /** The rule that decided it (`data.rule`, in words), or null: the side sheet's "which rule". */
  rule: string | null;
  /** The trust layer that wrote it, in words ("4 · Watcher"), or "The haggle". */
  layer: string;
  /**
   * PayPal's own signed webhook row: `actor: "paypal"`, `action: "webhook"` and `data.verified === true`, which the server
   * writes only after PayPal's verify-webhook-signature check passed (trust/src/webhook.ts `webhookRow`). The PayPal badge
   * reads only this, never a row that merely names PayPal.
   */
  signed: boolean;
  /** Money that moved for this shopper: "out" a capture, "back" a refund; null for every other row (a price asked, a cap). */
  flow: "out" | "back" | null;
}

/** The kind of one ledger row. A shopper's Ask is the only "ask"; a seller's offer is an "item" found. */
export function kindOf(e: LedgerEvent): SessionKind {
  if (e.actor === "paypal") {
    if (e.action === "webhook" || typeof e.data?.eventType === "string") return "webhook";
    return e.action === "refunded" ? "refund" : "payment";
  }
  if (e.actor === "shopper" && e.action === "ask") return "ask";
  if (e.actor === "seller") return "item";
  if ((e.actor === "watcher" || e.actor === "fence") && e.verdict === "refused" && e.sellerId) return "skipped";
  if (e.actor === "guard" && e.action === "buy") return "payment";
  return "decision";
}

/** PayPal's signed webhook: the only row the PayPal badge may sit on. */
export function isSigned(e: LedgerEvent): boolean {
  return e.actor === "paypal" && e.action === "webhook" && e.data?.verified === true;
}

/** Money that moved: a capture or a refund of the shopper's own (never the seeded week's, which moved none). */
function flowOf(e: LedgerEvent): "out" | "back" | null {
  if (e.actor !== "paypal" || e.price === undefined || !isShoppers(e)) return null;
  return e.action === "captured" ? "out" : e.action === "refunded" ? "back" : null;
}

/**
 * The Watcher's set-aside row's "Did" (DD, POL-3 and L-did rulings, system.md §8): "What" names the kind ("Set aside")
 * and "Who" names the actor ("Watcher → QuickQuack Deals"), so "Did" names neither: it says only what is left, the
 * ground. The grid, the phone's cards and the side sheet all read it from here.
 */
export const WATCHER_DID = "on evidence";

/**
 * Rows as the ledger streams in. `add` takes each shopper-ledger row once, in seq order (a repeat is ignored, as the SSE
 * replay may send one twice), and returns its row, or null for a repeat. Store names and refusals are kept per run:
 * seller ids repeat across runs, so one run's refusal never colours another's sellers.
 */
export class SessionRows {
  private readonly names = new Map<string, Map<string, string>>();
  private readonly refusals = new Map<string, Map<string, number>>();
  private last = -1;
  readonly rows: SessionRow[] = [];

  add(e: LedgerEvent): SessionRow | null {
    if (e.seq <= this.last) return null;
    if (e.seq !== this.last + 1 && this.last !== -1) throw new Error(`session rows: seq ${e.seq} after ${this.last}, a row is missing`);
    this.last = e.seq;
    const run = e.runId ?? "";
    const names = this.names.get(run) ?? new Map<string, string>();
    const refusals = this.refusals.get(run) ?? new Map<string, number>();
    this.names.set(run, names);
    this.refusals.set(run, refusals);
    if (e.actor === "seller" && e.sellerId && !names.has(e.sellerId)) names.set(e.sellerId, String(e.data?.merchant ?? e.sellerId).replace(" (fictional)", ""));
    if (e.actor === "watcher" && e.verdict === "refused" && e.sellerId && !refusals.has(e.sellerId)) refusals.set(e.sellerId, e.seq);
    const g: GridRow = gridRow({ e, also: [], count: 1 }, names, refusals);
    const did = e.actor === "shopper" && e.action === "ask" ? "asked Goose" : e.actor === "watcher" && e.action === "refuse" ? WATCHER_DID : g.did;
    const row: SessionRow = {
      seq: e.seq, t: e.t, run: e.runId ?? null, source: e.source ?? null, sourceWords: e.source ? SOURCE_WORDS[e.source] : null,
      kind: kindOf(e), actor: g.actor, who: g.who, did, price: g.price, cents: g.cents, why: g.why,
      quoted: g.quoted, fenced: g.fenced, label: g.label, tone: g.tone, eventId: g.eventId,
      rule: g.rule, layer: g.layerLabel, signed: isSigned(e), flow: flowOf(e),
    };
    this.rows.push(row);
    return row;
  }
}

/** Every row at once: what the stream adds up to. */
export function sessionRows(events: readonly LedgerEvent[]): SessionRow[] {
  const s = new SessionRows();
  for (const e of events) s.add(e);
  return s.rows;
}

/**
 * The pinned totals row: what this shopper spent, what Goose kept off the asking prices, and how many sellers it
 * skipped. Only the shopper's own rows count (`isShoppers`): the seeded week moved no money and a test of the guard
 * isn't shopping, so neither is a dollar here. Spent is each capture less its refund; kept is, for each capture not
 * refunded, the seller's opening ask in that run less the price paid (never below zero); skipped counts each seller
 * the Watcher refused, once per run.
 */
export interface SessionTotals {
  spent: Cents; kept: Cents; skipped: number;
  /** Sellers Goose read an offer from, once per run (the header strip's "sellers checked"). */
  checked: number;
  /** PayPal's signed webhook rows (`isSigned`): what PayPal itself confirmed. */
  confirmed: number;
}

/**
 * The totals row's own label (Joshua, Fri Oct 30): it says the seeded week isn't in it, so "$0.00 spent" beside the
 * seeded $54.00 kettle never reads as a bug. True because `sessionTotals` counts only `isShoppers` rows.
 */
export const TOTALS_WHO = "This session · seeded week not counted";

export function sessionTotals(events: readonly LedgerEvent[]): SessionTotals {
  const own = events.filter(isShoppers);
  const captured = own.filter((e) => e.actor === "paypal" && e.action === "captured" && e.price !== undefined);
  const refundedRuns = new Set(own.filter((e) => e.actor === "paypal" && e.action === "refunded").map((e) => e.runId ?? ""));
  let spent = 0;
  let kept = 0;
  for (const c of captured) {
    const run = c.runId ?? "";
    if (refundedRuns.has(run)) continue; // refunded: the money came back, so it's neither spent nor kept
    spent += toCents(c.price!);
    const opening = own.find((e) => (e.runId ?? "") === run && e.actor === "seller" && e.action === "offer" && e.sellerId === c.sellerId && e.price !== undefined);
    if (opening) kept += Math.max(0, toCents(opening.price!) - toCents(c.price!));
  }
  const skipped = new Set(own.filter((e) => e.actor === "watcher" && e.verdict === "refused" && e.sellerId).map((e) => `${e.runId ?? ""}:${e.sellerId}`)).size;
  const checked = new Set(own.filter((e) => e.actor === "seller" && e.sellerId).map((e) => `${e.runId ?? ""}:${e.sellerId}`)).size;
  const confirmed = own.filter(isSigned).length;
  return { spent: spent as Cents, kept: kept as Cents, skipped, checked, confirmed };
}

/**
 * What `kept` is called wherever it shows (Joshua, Fri Oct 30, PART 5): haggling only. It is a seller's own opening ask
 * in a run less what that run paid, and a run lasts seconds, so a price that fell over the simulated days (Lantern
 * Hall's $112.00 on day 1 to $84.00 on day 5) is never in it: a posted seller asks the same total every round
 * (`postedSellers`), so a posted run keeps $0.00 off. The fall over the days is the week chart's (`weekStory`), named apart.
 */
export const KEPT_SAID = "kept off by haggling";

/** The totals row's words: "spent · kept off by haggling · sellers set aside". */
export function totalsWords(t: SessionTotals): { spent: string; kept: string; skipped: string } {
  return { spent: `${usd(t.spent)} spent`, kept: `${usd(t.kept)} ${KEPT_SAID}`, skipped: `${t.skipped} seller${t.skipped === 1 ? "" : "s"} set aside` };
}

/** How an Ask arrived, for its row's words. */
export type AskHow = "words" | "voice" | "photo";
const HOW: Readonly<Record<AskHow, string>> = { words: "typed", voice: "said", photo: "photo" };

/** A chip in words, from the catalog's own vocabulary (never a shopper's words). */
function chipWords(c: Chip): string {
  if (c.kind === "item") return (catalogItem(demoCatalogItems(), c.value)?.item ?? c.value).replace(" (fictional)", "");
  return c.value;
}

/**
 * An Ask as a ledger row (Desk-A's Ask and market routes; Joshua's "every ask"): only the checked chips, the catalog's
 * own words, never what the shopper typed, said or snapped (N10). Written through its own run view with source "ask",
 * which counts toward neither the week nor the dial (COUNTS_AS_SHOPPERS, COUNTS_TOWARD_RECORD), so an Ask moves no money
 * and no record. Returns the row as written; it streams to "Behind the scenes" like any other.
 */
export function writeAsk(shopper: ShopperLedger, chips: readonly Chip[], t: number, how: AskHow = "words"): LedgerEvent {
  const words = chips.map(chipWords);
  const why = words.length
    ? `You asked Goose for ${words.join(" · ")}. Only these catalog words are kept, never your own.`
    : "You asked Goose for something outside the catalog. Nothing you asked with is kept.";
  return shopper.run(`ask-${shopper.size}`, "ask").append({ t, shopperId: DEMO_SHOPPER, visibility: "owner", actor: "shopper", action: "ask", why, data: { chips: chips.length, how: HOW[how] } });
}

/** The CSV's columns, in order, from the row's own fields: the download holds what the grid holds. */
export const CSV_COLUMNS = ["seq", "t", "run", "sourceWords", "kind", "who", "did", "price", "why", "quoted", "eventId"] as const satisfies readonly (keyof SessionRow)[];

// ---------- Behind the scenes, the Midnight ledger (Desk-B-4; Joshua, Fri Oct 30) ----------
// The page opens on the seeded demo week (never an empty grid) and streams this session's rows in above it. Two parts,
// never mixed: "session" is every row this browser's session wrote (the stream, less its seeded row); "week" is the
// seeded demo week (the stream's seeded row, then recorded week 1 replayed in the browser). The header strip, the totals
// row and the download read only the session's own stream, so nothing from the demo week is ever counted.

/** The demo week's label, on every row of it and over it. */
export const WEEK_LABEL = "Seeded demo week";

export type LedgerPart = "session" | "week";
/** A grid row with its part and the id the grid keys on: a session row keeps its seq; a demo-week row is `w` + seq. */
export type LedgerRow = SessionRow & { part: LedgerPart; id: string };

/** Where a streamed row belongs: the session's seeded row is the demo week's; everything else is the session's own. */
export function partOf(r: SessionRow): LedgerPart {
  return r.source === "seeded" ? "week" : "session";
}

/** A streamed row as a grid row. */
export function streamed(r: SessionRow): LedgerRow {
  const part = partOf(r);
  return { ...r, part, id: part === "session" ? String(r.seq) : `w${r.seq}` };
}

/** The recorded demo week (`recordedWeek`'s events) as grid rows, each labeled, keyed apart from the session's seqs. */
export function weekRows(events: readonly LedgerEvent[]): LedgerRow[] {
  return sessionRows(events).map((r) => ({ ...r, part: "week" as const, id: `w${r.seq}`, sourceWords: WEEK_LABEL }));
}

/**
 * The grid's rows, in order: the session's own rows in seq order (new ones land at the end of these, above the week),
 * then the demo week: the stream's seeded row(s), then the recorded week. Every input row is one output row.
 */
export function ledgerRows(stream: readonly SessionRow[], week: readonly LedgerRow[]): LedgerRow[] {
  const s = stream.map(streamed);
  return [...s.filter((r) => r.part === "session"), ...s.filter((r) => r.part === "week"), ...week];
}

/**
 * The filter chips (Joshua: Sellers · Goose · Code · PayPal · You), by who wrote the row (its real `actor`), and one more,
 * Seeded (Round 2 data review, Round 0 leftover 3): the demo week's seeded capture stands in for a PayPal event but
 * PayPal never wrote it ("captured (simulated)", no money moved), so "PayPal, 1 row" beside "PayPal confirmations 0"
 * counted a simulation as PayPal's. The PayPal chip counts only rows PayPal really sent (its answers to this session's
 * orders and its verified webhooks); the seeded row is the Seeded chip's.
 */
export type LedgerChip = "sellers" | "goose" | "code" | "paypal" | "you" | "seeded";
export const LEDGER_CHIPS: readonly { key: LedgerChip; label: string }[] = [
  { key: "sellers", label: "Sellers" }, { key: "goose", label: "Goose" }, { key: "code", label: "Code" }, { key: "paypal", label: "PayPal" }, { key: "you", label: "You" }, { key: "seeded", label: "Seeded" },
];
/** Each actor group has exactly one chip, so the chips partition the rows. Goose is its AI agent and its Watcher. */
const CHIP_OF: Readonly<Record<ActorGroup, LedgerChip>> = { seller: "sellers", agent: "goose", watcher: "goose", code: "code", paypal: "paypal", you: "you" };
export function chipOf(r: SessionRow): LedgerChip {
  return r.source === "seeded" ? "seeded" : CHIP_OF[r.actor];
}
/** None picked shows every row; otherwise a row shows when its chip is picked. */
export function passesLedgerChips(r: SessionRow, picked: ReadonlySet<LedgerChip>): boolean {
  return picked.size === 0 || picked.has(chipOf(r));
}

const KIND_ONE = (k: SessionKind) => SESSION_KINDS.find((x) => x.key === k)!.one;

/** The words quick search reads on the phone's cards (the grid's quick filter reads its own columns). */
export function rowSearchText(r: SessionRow): string {
  // "skipped" stays a search word for a set-aside row: people search with their own word (DD, B-7).
  return [r.seq, r.who, r.did, r.price, KIND_ONE(r.kind), r.kind === "skipped" ? "skipped seller" : null, r.why, r.quoted, r.sourceWords, r.rule, r.layer, r.eventId].filter((x) => x !== null).join(" ").toLowerCase();
}
/** Every word typed appears somewhere in the row, as AG Grid's quick filter matches. */
export function matchesSearch(r: SessionRow, search: string): boolean {
  const text = rowSearchText(r);
  return search.toLowerCase().split(/\s+/).filter(Boolean).every((w) => text.includes(w));
}

/** The header strip: five big numbers, each straight from `sessionTotals` of the session's own stream. */
export function headerStrip(t: SessionTotals): { key: keyof SessionTotals; value: string; label: string }[] {
  const n = (x: number, one: string, many: string) => ({ value: String(x), label: x === 1 ? one : many });
  return [
    { key: "checked", ...n(t.checked, "seller checked", "sellers checked") },
    { key: "skipped", ...n(t.skipped, "seller set aside", "sellers set aside") },
    { key: "spent", value: `${usd(t.spent)}`, label: "spent" },
    { key: "kept", value: `${usd(t.kept)}`, label: KEPT_SAID },
    { key: "confirmed", ...n(t.confirmed, "PayPal confirmation", "PayPal confirmations") },
  ];
}

/** The download's header line: the grid's own column names, in CSV_COLUMNS order. */
export const CSV_HEADERS: Readonly<Record<(typeof CSV_COLUMNS)[number], string>> = {
  seq: "#", t: "Time (UTC)", run: "Run", sourceWords: "From", kind: "What", who: "Who", did: "Did", price: "Amount", why: "Why", quoted: "Seller's words", eventId: "PayPal event",
};

/**
 * One CSV field: quoted when it must be, and ";" must (a spreadsheet in a ";" locale splits on it, so words after one start
 * a cell of their own). A leading = + - @ (a spreadsheet formula, also typed full-width or behind spaces) is defused with a ',
 * as seller words may hold one.
 */
export function csvField(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[\t\r]|^\s*[=+\-@＝＋－＠]/.test(s)) s = `'${s}`;
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * "Download your ledger": the session's own rows (never the demo week) in CSV_COLUMNS order, one line per row, the same
 * file on desktop and phone. Time is the ledger's clock in UTC (ISO 8601); What is the row's kind in words.
 */
export function sessionCsv(rows: readonly SessionRow[]): string {
  const cell = (r: SessionRow, c: (typeof CSV_COLUMNS)[number]) => (c === "t" ? new Date(r.t).toISOString() : c === "kind" ? KIND_ONE(r.kind) : r[c]);
  const lines = [CSV_COLUMNS.map((c) => csvField(CSV_HEADERS[c])).join(","), ...rows.map((r) => CSV_COLUMNS.map((c) => csvField(cell(r, c))).join(","))];
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * Behind the scenes' charts (Joshua, Fri Oct 30: "each one answers a question a judge would actually ask"). Pure, and
 * read from the same session rows as the grid and its totals row: only the shopper's own rows (`isShoppers`), never the
 * seeded week. Three questions:
 * - "Where did my money go?": the asking prices of what you bought, what haggling kept off them, what your tap paid.
 *   Paid and kept are `sessionTotals`' spent and kept, so asking is their sum (the opening asks of what was paid for).
 * - "How many sellers did Goose set aside?": sellers checked, held for your yes, and set aside (refused in code).
 * - "What did Goose check?": each Watcher rule that fired, by count, refusals apart from holds.
 * `summary` is each chart's text alternative, said in full, so a screen reader hears every number the bars show.
 */
export interface LedgerCharts {
  money: { key: "asking" | "kept" | "paid"; label: string; cents: Cents; dollars: number; words: string }[];
  sellers: { key: "checked" | "held" | "skipped"; label: string; count: number }[];
  rules: { rule: string; label: string; refused: number; held: number }[];
  summary: { money: string; sellers: string; rules: string };
}

/** The Watcher's rule ids in a shopper's words (trust/src/watch.ts `WatchRule`); an id without words shows as itself. */
const WATCH_RULE_WORDS: Readonly<Record<string, string>> = {
  "instructs-agent": "Read like orders to Goose", "gift-card": "Read like a gift card ask", "writes-memory": "Read like rewriting Goose's memory",
  "off-paypal": "Read like paying outside PayPal", "states-your-limit": "Read like a value for your limit", "lists-gift-card": "Read like gift cards as a way to pay",
  "addresses-agent": "Read like talking to Goose", "lists-off-paypal": "Read like a way to pay outside PayPal", "mentions-gift-card": "Named a possible gift card",
  "claims-shipped": "Read like it already shipped", "mentions-shipped": "Read like it already shipped, before any sale", "overpay-refund": "Read like overpaying for the rest back", "mentions-overpay": "Read like paying more to get the rest back", "mentions-link": "Carried a link to another site", "mentions-step": "Read like a step outside checkout", "mentions-upfront": "Read like money up front",
  "asks-money-away": "Mentioned paying outside checkout", "asks-for-code": "Mentioned a code or details", "speaks-as": "May have spoken as someone else, or to your agent",
  "asks-for-cash": "Read like asking for cash", "no-history": "New seller, no sales", "no-record": "No sales record", "ai-reader": "AI reader flagged it",
};
export const watchRuleWords = (rule: string): string => WATCH_RULE_WORDS[rule] ?? rule;

export function ledgerCharts(events: readonly LedgerEvent[]): LedgerCharts {
  const t = sessionTotals(events);
  const s = new SessionRows();
  const own: SessionRow[] = [];
  for (const e of events) {
    const r = s.add(e);
    if (r && isShoppers(e)) own.push(r);
  }
  const priced = (c: number) => ({ cents: c as Cents, dollars: c / 100, words: usd(c as Cents) });
  const money: LedgerCharts["money"] = [
    { key: "asking", label: "Opening asks", ...priced(t.spent + t.kept) },
    { key: "kept", label: "Kept off by haggling", ...priced(t.kept) },
    { key: "paid", label: "Paid by your tap", ...priced(t.spent) },
  ];
  // Held: sellers the Watcher held for your yes (once per run), less any it then refused.
  const ownEvents = events.filter(isShoppers);
  const sellerKey = (e: LedgerEvent) => `${e.runId ?? ""}:${e.sellerId}`;
  const refused = new Set(ownEvents.filter((e) => e.actor === "watcher" && e.verdict === "refused" && e.sellerId).map(sellerKey));
  const held = new Set(ownEvents.filter((e) => e.actor === "watcher" && e.verdict === "asked" && e.sellerId).map(sellerKey).filter((k) => !refused.has(k))).size;
  const sellers: LedgerCharts["sellers"] = [
    { key: "checked", label: "Checked", count: t.checked },
    { key: "held", label: "Held for your yes", count: held },
    { key: "skipped", label: "Set aside", count: t.skipped },
  ];
  // Each Watcher row's rules (the grid's "which rule" cell), counted once per row they appear on.
  const tally = new Map<string, { refused: number; held: number }>();
  for (const r of own) {
    if (r.actor !== "watcher" || r.rule === null) continue;
    for (const rule of r.rule.split(", ")) {
      const n = tally.get(rule) ?? { refused: 0, held: 0 };
      if (r.kind === "skipped") n.refused++; else n.held++;
      tally.set(rule, n);
    }
  }
  const rules = [...tally].map(([rule, n]) => ({ rule, label: watchRuleWords(rule), ...n }))
    .sort((a, b) => b.refused + b.held - (a.refused + a.held) || a.label.localeCompare(b.label));
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return {
    money, sellers, rules,
    summary: {
      money: t.spent === 0 && t.kept === 0 ? "No money has moved this session yet."
        : `Opening asks ${money[0]!.words}. Haggling kept ${money[1]!.words} off them. Your tap paid ${money[2]!.words}. A price that fell over the days is not counted as haggling.`,
      sellers: `${plural(t.checked, "seller", "sellers")} checked, ${held} held for your yes, ${t.skipped} set aside.`,
      rules: rules.length === 0 ? "No Watcher rule has fired this session yet."
        : `${rules.map((r) => `${r.label}: ${r.refused} set aside, ${r.held} held`).join(". ")}.`,
    },
  };
}

// ---------- The week's story (Desk-B-5; Joshua, Fri Oct 30, PART 4.3) ----------
// One chart tells the recorded week: the Marsh Lights ticket's total by day for each fictional seller, the Events limit,
// the deal Goose brings on the beat's day, and the seller the Watcher set aside. The point: the cheapest offer all week
// was the scam. Every value here is read from `MOVING_ITEMS` (core/src/sellers/moving.ts), the Watcher (`watch`) and the
// policy's own limit (`categoryLimitFor`), never typed; core/test/session.test.ts checks the chart's data against them.

/** The item the week chart follows: the ticket on the shopper's hero shelf. */
export const WEEK_ITEM = "marsh-lights-ticket";

export interface WeekSeller {
  id: string;
  /** The store name; "(fictional)" is said once in the chart's label instead. */
  name: string;
  verdict: WatchVerdict;
  /** The Watcher's rules in words when it holds or refuses, else null. */
  why: string | null;
  /** The total each day (fees and taxes in), in cents and in dollars for the chart; null before the seller lists. */
  cents: (Cents | null)[];
  dollars: (number | null)[];
}

export interface WeekStory {
  item: string;
  /** "Day 1" … "Day 7": the screen counts days from 1, as the shelf does (`postedNote`). */
  days: string[];
  limit: { cents: Cents; dollars: number; words: string; label: string };
  sellers: WeekSeller[];
  /** The cheapest seller the Watcher clears at or under the limit on the beat's day: the deal Goose brings. */
  pick: { id: string; name: string; day: number; cents: Cents; words: string; firstDay: number; firstWords: string; fellWords: string };
  /** The cheapest offer the Watcher refuses, all week: set aside. */
  scam: { id: string; name: string; day: number; cents: Cents; words: string; why: string };
  /** Cleared sellers other than the pick, each with its lowest total of the week. */
  others: { id: string; name: string; lowWords: string; underLimit: boolean }[];
  /** Whether the set-aside offer undercut every cleared seller's total on every day: "the cheapest offer was the scam". */
  cheapestWasScam: boolean;
  /** The chart's text alternative, every number it marks. */
  summary: string;
}

const usdWords = (c: number) => `${usd(c as Cents)}`;
// One name everywhere (Track D, Round 0): the Desk, the claims and the landing say "Lantern Hall Box Office", so the
// week chart's key and facts do too; only the "(fictional)" tag goes, since the section says the sellers are fictional.
const plainName = (n: string) => n.replace(" (fictional)", "");
const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function weekStory(policy: Policy = demoPolicy(), item: MovingItem = MOVING_ITEMS.find((i) => i.id === WEEK_ITEM)!, beat: number = BEAT_DAY): WeekStory {
  const limit = categoryLimitFor(policy, item.category);
  const days = Array.from({ length: MOVING_DAYS }, (_, d) => `Day ${d + 1}`);
  const sellers: WeekSeller[] = item.sellers.map((s) => {
    const flags = watch({ quoted: s.note, merchant: s.name, history: s.history });
    const verdict = verdictOf(flags);
    const cents = Array.from({ length: MOVING_DAYS }, (_, d) => priceOn(s.curve, d)?.total ?? null);
    const why = verdict === "clear" ? null : [...new Set(flags.filter((f) => f.severity === verdict).map((f) => watchRuleWords(f.rule).toLowerCase()))].join(", ");
    return { id: s.sellerId, name: plainName(s.name), verdict, why, cents, dollars: cents.map((c) => (c === null ? null : c / 100)) };
  });
  const cleared = sellers.filter((s) => s.verdict === "clear");
  const lowOf = (s: WeekSeller) => Math.min(...s.cents.filter((c): c is Cents => c !== null));
  const onBeat = cleared.flatMap((s) => (s.cents[beat] != null && s.cents[beat]! <= limit ? [{ s, c: s.cents[beat]! }] : [])).sort((a, b) => a.c - b.c)[0];
  if (!onBeat) throw new Error(`week story: no cleared seller at or under the limit on day ${beat + 1}`);
  const firstDay = onBeat.s.cents.findIndex((c) => c !== null);
  const first = onBeat.s.cents[firstDay]!;
  const refused = sellers.filter((s) => s.verdict === "refuse").flatMap((s) => s.cents.flatMap((c, d) => (c === null ? [] : [{ s, c, d }]))).sort((a, b) => a.c - b.c || a.d - b.d)[0];
  if (!refused) throw new Error("week story: no seller set aside");
  const pick = { id: onBeat.s.id, name: onBeat.s.name, day: beat, cents: onBeat.c, words: usdWords(onBeat.c), firstDay, firstWords: usdWords(first), fellWords: usdWords(first - onBeat.c) };
  const scam = { id: refused.s.id, name: refused.s.name, day: refused.d, cents: refused.c, words: usdWords(refused.c), why: refused.s.why ?? "" };
  const others = cleared.filter((s) => s.id !== pick.id).map((s) => ({ id: s.id, name: s.name, lowWords: usdWords(lowOf(s)), underLimit: lowOf(s) <= limit }));
  const label = `${capFirst(item.category)} limit`;
  return {
    item: item.item.replace(" (fictional)", ""), days, sellers, pick, scam, others,
    cheapestWasScam: refused.c < Math.min(...cleared.map(lowOf)),
    limit: { cents: limit, dollars: limit / 100, words: usdWords(limit), label },
    summary: [
      `${pick.name}'s total fell from ${pick.firstWords} on day ${firstDay + 1} to ${pick.words} on day ${beat + 1}, under your ${usdWords(limit)} ${label}${gotWhilst(howOverDays(onBeat.s.cents, beat))}.`,
      ...others.map((o) => (o.underLimit ? `${o.name}'s lowest was ${o.lowWords}.` : `${o.name} never came under the limit; its lowest was ${o.lowWords}.`)),
      `The cheapest offer all week was ${scam.name} at ${scam.words}, set aside by the Watcher: ${scam.why}.`,
    ].join(" "),
  };
}
