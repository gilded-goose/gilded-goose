// One real price in Goose's Read (Joshua, Fri Nov 6 1:10 PM: "Show one real price in the verdict: YES, as a reference
// line only ('real stores start at $75'); it never changes BUY NOW / WAIT / SKIP. Link out to stores: NO."). The page reads
// the real-prices answer (GET /api/prices, live or recorded, the same answer the Real prices panel shows) and this file
// turns it into one plain line: the lowest real price and its store's name, as text, said live or recorded with its time.
// With no live or recorded answer there is no line at all, never a made-up one. `withReference` adds the line and nothing
// else: the call and its reason are the Read's own, so a real price can't move BUY NOW / WAIT / SKIP (claims row c3-read;
// core/test/real-reference.test.ts, and its mutants in scripts/mutants.ts). Pure: an answer in, a line out.

import { usdOf } from "../money.ts";
import type { GooseRead, ReadLine } from "./gooses-read.ts";

/** The line's name in the Read's folded list. */
export const REAL_REF_NAME = "Real stores";
/** What the line is, said every time (claims row c3-read). */
export const REAL_REF_ONLY = "A reference only: it never changes the call.";

/** Only a live or recorded answer with its time, its query and at least one item with a real price makes a line.
 *  `liveSource`: the answer's source when it is live, named by the page (core names no price provider). */
export function realReference(answer: unknown, liveSource: string): ReadLine | null {
  if (!answer || typeof answer !== "object") return null;
  const a = answer as { source?: unknown; fetchedAt?: unknown; query?: unknown; items?: unknown };
  if ((a.source !== liveSource && a.source !== "recorded") || !liveSource || typeof a.fetchedAt !== "string" || typeof a.query !== "string" || !Array.isArray(a.items)) return null;
  const at = new Date(a.fetchedAt);
  if (!Number.isFinite(at.getTime())) return null;
  const priced = a.items.flatMap((it: unknown) => {
    const i = it as { store?: unknown; price?: unknown } | null;
    const n = typeof i?.price === "string" ? Number(i.price) : NaN;
    return typeof i?.store === "string" && i.store.trim() && Number.isFinite(n) && n > 0 ? [{ store: i.store.trim(), price: i.price as string, n }] : [];
  });
  if (priced.length === 0) return null;
  const low = priced.reduce((m, p) => (p.n < m.n ? p : m));
  const when = a.source === liveSource
    ? `start at ${usdOf(low.price)} (${low.store}), checked ${at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.`
    : `started at ${usdOf(low.price)} (${low.store}) when recorded ${at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`;
  return { name: REAL_REF_NAME, said: `For “${a.query}”, real stores ${when} ${REAL_REF_ONLY}` };
}

/** The Read with the reference line under its signals. The call and its reason are never touched. */
export function withReference(read: GooseRead, line: ReadLine | null): GooseRead {
  return line ? { call: read.call, because: read.because, lines: [...read.lines, line] } : read;
}
