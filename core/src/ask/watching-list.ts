// The Watching list (Joshua, Nov 5, section 4a): each want with its target, today's best price and its status, read from
// the same price watch as Your week (`watchPrice` on `offersFor`), on the recorded week's simulated day. Pure, and read
// only: nothing here can start a run, bind a cart or pay. A ping is a line on this list and an ask's words the shopper's
// tap may send; `spokenCap` then holds that ask to her price, and every guard check runs as for any other ask.

import { fromCents, type Cents, usd } from "../money.ts";
import type { Catalog } from "../trust/catalog.ts";
import type { Policy } from "../trust/policy.ts";
import { watchPrice, type WatchedOffer } from "../trust/pricewatch.ts";
import { verdictOf } from "../trust/watch.ts";
import { BEAT_DAY, offersFor, watchedItem, watchedWant } from "./watching.ts";
import { byPriority, type Priority, type SavedWant } from "./wants.ts";
import { recordedMarket } from "./recorded-market.ts";
import { whenFor } from "../view/shelf.ts";
import { ITEM_WORDS } from "./shops.ts";

export interface WatchRow {
  catalogId: string;
  item: string;
  priority: Priority;
  /** Where the prices came from, said on the row so a recorded price never reads as live. */
  when: string;
  /** Her price: never over today's limit (`wantMax`). */
  target: Cents;
  /** The lowest price not set aside, and where. Null: the record has none today. */
  best: { total: Cents; at: string } | null;
  /** The price reached her number: the list says so, and that is all a ping does. */
  pinged: boolean;
  status: string;
  /** "Rising", only when the record shows it. No line about stock: the record has no stock to read. */
  heads: string | null;
  /** The words "Shop at your price" sends, her price in them. Null: not pinged, or the record has no market to open. */
  ask: string | null;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const notSetAside = (os: readonly WatchedOffer[]) => os.filter((o) => o.flags === null || verdictOf(o.flags) !== "refuse");
const lowest = (os: readonly WatchedOffer[]) => os.reduce<WatchedOffer | undefined>((a, o) => (a === undefined || o.total < a.total ? o : a), undefined);

/** The words of an ask held to her price: `spokenCap` reads "$90.00 max", and the cart can then only be at or under it. */
export const askAtPrice = (item: string, target: Cents): string => `${item}, ${usd(target)} max`;

/** A want's row on `day`. Null: the catalog no longer has the item. */
export function watchRow(w: SavedWant, catalog: Catalog, policy: Policy, day: number = BEAT_DAY): WatchRow | null {
  const ww = watchedWant(w, catalog, policy);
  const e = catalog.get(w.catalogId);
  if (!ww || !e) return null;
  const offers = offersFor(w, day);
  const p = watchPrice(ww, offers, policy);
  const target = p.max;
  const best = lowest(notSetAside(offers));
  const o = p.offer;
  // Only a cleared seller pings (Lead-12, Nov 5, R's red team F1): a ping is an invitation to tap, so a seller the Watcher
  // holds (a new one with no sales, say) is said with its hold and never pinged, or a scammer could list just under the
  // prices people watch for and be advertised in Goose's name. When unsure, hold.
  const pinged = p.kind === "under";
  let status: string;
  if (p.kind === "under" && o) status = `Pinged: ${usd(o.total)} is ${o.total === target ? "right at" : `${usd(target - o.total)} under`} your ${usd(target)}.`;
  else if (p.kind === "held" && o) status = `${o.name} is ${usd(o.total)}, ${o.total === target ? "right at" : "under"} your ${usd(target)}, but held for your yes, so no ping. Still watching.`;
  else if (p.kind === "refused" && o) status = `Goose set aside ${o.name} at ${usd(o.total)}. Still watching for ${usd(target)} or less.`;
  else if (best) status = `${usd(best.total - target)} over your ${usd(target)}. Still watching.`;
  else status = `Watching for ${usd(target)} or less.`;
  // Rising: the lowest price not set aside is higher than the record's day before. A moving item only: the kettle's asks don't move.
  const was = day > 0 && watchedItem(w.catalogId) ? lowest(notSetAside(offersFor(w, day - 1))) : undefined;
  const heads = best && was && best.total > was.total ? `Rising: ${usd(was.total)} the day before.` : null;
  const words = ITEM_WORDS[w.catalogId] ?? e.item;
  const item = w.color ? `${w.color} ${words}` : words;
  const ask = askAtPrice(item, target);
  return {
    catalogId: w.catalogId, item: cap(item), priority: w.priority, when: whenFor(w.catalogId, day), target,
    best: best ? { total: best.total, at: best.name } : null, pinged, status, heads,
    ask: pinged && recordedMarket(ask) ? ask : null,
  };
}

/** Every want's row, "really want" first (the list's own order). */
export const watchingRows = (wants: readonly SavedWant[], catalog: Catalog, policy: Policy, day: number = BEAT_DAY): WatchRow[] =>
  byPriority(wants).flatMap((w) => { const r = watchRow(w, catalog, policy, day); return r ? [r] : []; });

// ---------- The ping (Joshua, Nov 5 6:40 PM: "when it's right it PINGS you") ----------

/** The ping, replayed: the recorded week from day 1 to the first day the price reached her number, read with the same
 *  watch as the row (`watchPrice`, the Watcher's set-aside out), and the words a notification shows. Every word is made
 *  here, on the server; the page only plays the lines in order and hands the last one to the browser. It never buys,
 *  approves or reserves: tapping it opens the ask held to her price, and her tap in PayPal is still the only thing that pays. */
export interface WatchPing {
  /** One line a simulated day, day 1 first; the last is the ping. */
  steps: string[];
  /** The notification's title, labeled simulated, and its body. */
  title: string;
  body: string;
}

const whole = (c: Cents) => usd(c).replace(/\.00$/, "");

/** Her want's ping on the recorded week, up to the list's day. Null: the record never reaches her price by then. */
export function pingFor(w: SavedWant, catalog: Catalog, policy: Policy, upTo: number = BEAT_DAY): WatchPing | null {
  const ww = watchedWant(w, catalog, policy);
  const e = catalog.get(w.catalogId);
  if (!ww || !e) return null;
  const words = ITEM_WORDS[w.catalogId] ?? e.item;
  const item = cap(w.color ? `${w.color} ${words}` : words);
  const steps: string[] = [];
  for (let d = 0; d <= upTo; d++) {
    const offers = offersFor(w, d);
    const p = watchPrice(ww, offers, policy);
    if (p.kind === "under" && p.offer) {
      const t = p.offer.total;
      // The DD (Nov 5, panel-r6): every line true read alone on a lock screen, so "simulated" in the title and the body,
      // no "now" for a recorded price, and "your $90 price" names what the $90 is.
      const body = `Simulated day ${d + 1}: ${item} is ${whole(t)}, ${t === p.max ? "right at" : "under"} your ${whole(p.max)} price. Tap to review.`;
      steps.push(`Simulated day ${d + 1}: ${whole(t)} at ${p.offer.name}. Pinged.`);
      return { steps, title: "Goose · simulated price alert", body };
    }
    const best = lowest(notSetAside(offers));
    // The day a seller under her price is refused says so: the cheap one was the scam, and it never pings.
    if (p.kind === "refused" && p.offer) steps.push(`Simulated day ${d + 1}: Goose set aside ${p.offer.name} at ${whole(p.offer.total)}. No ping.`);
    else if (p.kind === "held" && p.offer) steps.push(`Simulated day ${d + 1}: ${p.offer.name} at ${whole(p.offer.total)}, held for your yes. No ping.`);
    else steps.push(`Simulated day ${d + 1}: ${best ? `${whole(best.total)}, over your ${whole(p.max)}` : "no price on record"}.`);
  }
  return null;
}

/** Each want's ping, by item. Only this session's wants: the server builds it from the cookie's own session. */
export const pingsFor = (wants: readonly SavedWant[], catalog: Catalog, policy: Policy): Record<string, WatchPing> =>
  Object.fromEntries(wants.flatMap((w) => { const p = pingFor(w, catalog, policy); return p ? [[w.catalogId, p]] : []; }));
