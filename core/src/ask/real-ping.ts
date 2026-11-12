// The ping's real trigger (Joshua, Nov 5 6:40 PM, THE PING level 1 (b)): a real Channel3 read of her watched product, at
// her store, comes in at or under her price while she's on the page. Pure: the page hands it the Watching list's real rows,
// when this visit started and the pings already sent; it answers what to ping now. A ping's every word comes from her own
// row (her item's name, her store, the price read there, her price), so it can't name another store's price or anyone
// else's watch. A row whose read is older than this visit never pings: no read today (the switch off, a cap full, a
// failed read) keeps the old read, and an old read isn't news. It never buys, approves or reserves: it only says.

import type { Cents } from "../money.ts";
import { usdWide, type RealRow } from "./real-watch.ts";

/** What the page's notification shows; P's ping renders it. `kind` "simulated" is the demo week's (trigger a). */
export interface PingFact {
  kind: "real" | "simulated";
  item: string;
  price: Cents;
  target: Cents;
  /** Her store's domain for a real row; the seller's name for the demo week. */
  where: string;
  /** A real row's Channel3 product, so a tap opens that row. */
  productId?: string;
  /** When the price was read (real) or reached (simulated). */
  at: number;
  /** Once per read: the same read never pings twice, on any page of this visit. */
  key: string;
}

/** A real row as the page has it, with the read's time (RealRow.checkedAt: null before the first read). */
export type RealRowRead = Pick<RealRow, "productId" | "domain" | "item" | "target" | "best" | "pinged"> & { checkedAt: number | null };

export const realPingKey = (r: Pick<RealRowRead, "productId" | "domain">, checkedAt: number) => `real:${r.productId}@${r.domain}:${checkedAt}`;

/**
 * The real rows to ping now: read during this visit (`checkedAt >= visitStart`), with a price at her store at or under
 * her price, and not pinged already (`sent` holds the keys). Reads before the visit started are the list's to show, not news.
 */
export function realPings(rows: readonly RealRowRead[], visitStart: number, sent: ReadonlySet<string>): PingFact[] {
  const out: PingFact[] = [];
  for (const r of rows) {
    if (r.checkedAt === null || !Number.isFinite(r.checkedAt) || r.checkedAt < visitStart) continue;
    if (!r.pinged || !r.best || r.best.at !== r.domain || r.best.total > r.target || r.best.total <= 0) continue;
    const key = realPingKey(r, r.checkedAt);
    if (sent.has(key)) continue;
    out.push({ kind: "real", item: r.item, price: r.best.total, target: r.target, where: r.domain, productId: r.productId, at: r.checkedAt, key });
  }
  return out;
}

/** The real ping's title, the pair of P's "Goose · simulated price alert": never "simulated", because this read is real.
 * Every line must be true read alone on a lock screen (the DD's rule). */
export const REAL_PING_TITLE = "Goose · price alert";

/** When the read was made, as the Real prices list says it (RealPrices.tsx's `date` and `time`): "Nov 5 at 7:42 PM", in
 * the shopper's own zone; `timeZone` is for tests. Always the date, never "today" (DD, Nov 5): a lock screen read
 * tomorrow must still be true. */
export const pingWhen = (at: number, timeZone?: string): string => {
  const zone = timeZone ? { timeZone } : {};
  const d = new Date(at);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...zone })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...zone })}`;
};

/**
 * The real ping's words, as the DD signed them (Nov 5): "{item} at {where} was {price} when checked on {date} at {time},
 * under your {target} price. Tap to review." Never "now", never "today": the price is the one read then, and a lock
 * screen can show the line hours later. "your $90.00 price" names what the number is. At exactly her price it says
 * "right at", never "under": a ping must never say more than the read did.
 */
export function realPingWords(f: Pick<PingFact, "item" | "where" | "price" | "target" | "at">, timeZone?: string): { title: string; body: string } {
  const side = f.price === f.target ? "right at" : "under";
  return { title: REAL_PING_TITLE, body: `${f.item} at ${f.where} was ${usdWide(f.price)} when checked on ${pingWhen(f.at, timeZone)}, ${side} your ${usdWide(f.target)} price. Tap to review.` };
}

/**
 * The pings already shown that stopped being true (DD, Nov 5: a notification left on a lock screen must not claim what
 * the row no longer says): her row is gone, a newer read came, or the price or her price moved. The page takes each back
 * (`unnotify`, as the simulated week's ping does), so an old notification can't stand for an old price.
 */
export function stalePings(rows: readonly RealRowRead[], shown: readonly Pick<PingFact, "key" | "price" | "target" | "where" | "productId">[]): string[] {
  return shown.filter((p) => {
    const r = rows.find((x) => x.productId === p.productId && x.domain === p.where);
    if (!r || r.checkedAt === null) return true;
    return realPingKey(r, r.checkedAt) !== p.key || r.target !== p.target || r.best?.total !== p.price || r.best?.at !== r.domain || !r.pinged;
  }).map((p) => p.key);
}
