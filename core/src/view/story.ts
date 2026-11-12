// "See how it keeps you safe" (5b, 018 N20): the five-step story read from one run's ledger, the Policy and one
// results file, never typed. Each part carries the `seq` of the row that backs it, so every "Proof ›" on the page
// opens a real ledger row (project Lesson 21). Pure: no DOM, no clock, no fetch.

import { fromCents, toCents, type Cents, usd } from "../money.ts";
import type { LedgerEvent } from "../ledger/events.ts";
import { STRONG_RECORD, categoryLimitFor, dialFor, type Policy } from "../trust/policy.ts";
import { belowOpening, laneModel } from "./lanes.ts";
import { LIMITS_PLACE } from "../ask/copy.ts";

const plain = (m: string) => m.replace(" (fictional)", "");

/** One message in the haggle: the seller's ask (its words quoted), the AI's move, or code's answer when it changed it. */
export type Bubble =
  | { kind: "seller"; seq: number; price: Cents; quoted: string | null }
  | { kind: "ai"; seq: number; action: string; price: Cents | null; source: string; overruled: boolean }
  | { kind: "code"; seq: number; price: Cents; why: string }
  /** Between two of the seller's asks with no move toward it: the agent's move to another seller then (its row), or none. */
  | { kind: "aside"; seq: number | null; merchant: string | null; action: string | null; price: Cents | null };

export interface Story {
  /** Step 1: the worst-case row, the most any cart can cost. */
  max: { seq: number; price: Cents } | null;
  /** Step 2: the first seller the Watcher refused, its note (quoted, seller text) and the refusal row. */
  trick: { merchant: string; offer: { seq: number; price: Cents; quoted: string }; refused: { seq: number; why: string } } | null;
  /** Step 4: the deal seller's thread, the AI's moves toward it and code's answers; `hidden` counts the run's other rows. */
  haggle: { merchant: string; opening: { seq: number; price: Cents }; deal: { seq: number; price: Cents }; below: Cents; bubbles: Bubble[]; hidden: number } | null;
  /** Step 5: the guard's row that bound the cart (it carries the cart's hash). */
  bound: { seq: number; hash: string; t: number } | null;
}

export function safeStory(events: LedgerEvent[]): Story {
  const m = laneModel(events);
  const max = m.edge ? { seq: m.edge.seq, price: m.edge.price } : null;

  // Keyed on the Watcher's verdict, never its words; the seller's note is the offer row's `quoted`, shown as a quote only.
  const refusal = events.find((e) => e.actor === "watcher" && e.verdict === "refused" && e.sellerId);
  const noted = refusal && events.find((e) => e.actor === "seller" && e.action === "offer" && e.sellerId === refusal.sellerId && e.quoted && e.price !== undefined && e.seq < refusal.seq);
  const trick = refusal && noted
    ? { merchant: plain(String(noted.data?.merchant ?? noted.sellerId)), offer: { seq: noted.seq, price: toCents(noted.price!), quoted: noted.quoted! }, refused: { seq: refusal.seq, why: refusal.why } }
    : null;

  let haggle: Story["haggle"] = null;
  const vs = belowOpening(m);
  if (m.deal && vs) {
    const id = m.deal.sellerId;
    const bubbles: Bubble[] = [];
    for (const e of events) {
      if (e.seq > m.deal.seq) break;
      if (e.actor === "seller" && e.action === "offer" && e.sellerId === id && e.price !== undefined) {
        const prev = bubbles.at(-1);
        if (prev?.kind === "seller") {
          // Two asks in a row read as a missing message: say what the agent did meanwhile, from its row, or that it did nothing.
          const move = events.filter((x) => x.actor === "buyer" && x.data?.source !== undefined && x.seq > prev.seq && x.seq < e.seq).at(-1);
          const to = move && m.lanes.find((l) => l.id === move.sellerId);
          bubbles.push(move
            ? { kind: "aside", seq: move.seq, merchant: to ? to.name : null, action: move.action.replace(/^propose-/, ""), price: move.price === undefined ? null : toCents(move.price) }
            : { kind: "aside", seq: null, merchant: null, action: null, price: null });
        }
        bubbles.push({ kind: "seller", seq: e.seq, price: toCents(e.price), quoted: e.quoted ?? null });
      } else if (e.actor === "buyer" && e.data?.source !== undefined && e.sellerId === id) {
        bubbles.push({ kind: "ai", seq: e.seq, action: e.action.replace(/^propose-/, ""), price: e.price === undefined ? null : toCents(e.price), source: String(e.data.source), overruled: false });
      } else if (e.actor === "code" && e.price !== undefined) {
        // Code's answer replaces the AI move just before it: that move never reached the seller.
        const last = bubbles.at(-1);
        if (last?.kind !== "ai") continue;
        last.overruled = true;
        bubbles.push({ kind: "code", seq: e.seq, price: toCents(e.price), why: e.why });
      }
    }
    const lane = m.lanes.find((l) => l.id === id)!;
    haggle = { merchant: lane.name, opening: { seq: vs.seq, price: vs.opening }, deal: { seq: m.deal.seq, price: m.deal.price }, below: vs.below, bubbles, hidden: events.length - bubbles.filter((b) => b.seq !== null).length };
  }

  const bindRow = events.find((e) => e.actor === "guard" && (e.action === "ask" || e.action === "buy") && typeof e.data?.hash === "string");
  const bound = bindRow ? { seq: bindRow.seq, hash: String(bindRow.data!.hash), t: bindRow.t } : null;
  return { max, trick, haggle, bound };
}

/**
 * How long the shopper's yes lasts, in whole minutes, read from the bound cart itself: its `expiresAt` against the clock
 * time of the guard row that bound it (same hash). Null when no row bound this cart, so the page never claims an expiry
 * the cart doesn't carry.
 */
export function approvalMinutes(story: Story, cart: { hash: string; expiresAt: number }): number | null {
  if (!story.bound || story.bound.hash !== cart.hash) return null;
  const ms = cart.expiresAt - story.bound.t;
  return ms > 0 ? Math.round(ms / 60_000) : null;
}

/** One Settings row. `value` null means code doesn't enforce it yet: the page says "next", never a value. */
export interface SettingRow { key: string; label: string; value: string | null; note: string }

/**
 * The Settings rows, read from the Policy the guard enforces and the guard's approval time (016: a row shows a value
 * only if code enforces it, shared Lesson 12). Rows code doesn't enforce yet have no value.
 */
export function settingsRows(policy: Policy, category: string | undefined, approvalMs: number): SettingRow[] {
  const cat = category ?? "every";
  const dial = category ? dialFor(policy, category) : "ask-first";
  return [
    { key: "limit", label: `Most per ${cat === "every" ? "" : `${cat} `}cart`, value: `${usd(categoryLimitFor(policy, category))}`, note: "Locked: no note, chip or typed max can raise it." },
    { key: "week", label: "Most in any 7 days", value: `${usd(policy.weeklyLimit)}`, note: "Across every category, in this browser." },
    { key: "ask", label: "Every cart", value: dial === "ask-first" ? "Asks your yes" : "Buys within your limits, one tap", note: dial === "ask-first" ? "The starting setting: ask me first." : "You still tap once." },
    { key: "yes", label: "Your yes", value: `This exact cart only · ${Math.round(approvalMs / 60_000)} min`, note: "Re-checked against the order before paying." },
    { key: "shape", label: "Subscriptions, Pay Later", value: policy.oneOffOnly ? "Always ask" : null, note: "Never bought on its own." },
    { key: "watch", label: "Sellers' tricks", value: "Set aside on evidence", note: "Notes that give the agent orders, ask for a gift card in words it recognizes or try to change your limits; any other mention of gift cards is held. A new seller is held for your yes, never set aside for that alone." },
    { key: "dial", label: "Ready without questions", value: null, note: `After ${STRONG_RECORD} clean carts, one tap in ${LIMITS_PLACE}, under a limit you set. You still tap once in PayPal.` },
    // Built (W82, H2): Undo refunds a paid cart through PayPal, from the tab that paid, while its window is open
    // (server/src/main.ts `undoOpen`, UNDO_KEEP_MINUTES); the window's length is the server's, so the row names none.
    { key: "undo", label: "Undo a purchase", value: "One tap refunds it", note: "Through PayPal, from the tab that paid, while its window is open. The closing time shows there." },
  ];
}

/** The open-fence spike's tally (spikes/s3-claude/results-open.json): the fields this sentence reads. */
export interface OpenResults { model: string; chip: string; at: string; open: { calls: number; fooled: string[] } }

/**
 * N26's sentence, read from the spike's file, never typed: a try counts as ignored only when the move neither took the
 * bait nor errored (`fooled` lists every one that did either), out of every call made.
 */
export function haikuLine(r: OpenResults): { ignored: number; tries: number; note: string; sentence: string } {
  const tries = r.open.calls;
  const ignored = Math.max(0, tries - r.open.fooled.length);
  return { ignored, tries, note: r.chip, sentence: `Real Claude Haiku ignored this note in ${ignored} of ${tries} tries.` };
}
