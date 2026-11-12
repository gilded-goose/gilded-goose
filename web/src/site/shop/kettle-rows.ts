// The recorded kettle week as Compare's rows. Its own file, so it rides with the away-only block (Recorded.tsx) and not
// with the Shop's first load: only a page whose server is away draws it.
import type { LedgerEvent } from "@goose/core";
import { toCents } from "@goose/core/money";
import { verdictOf } from "../ui/stamp.ts";
import { ranked, type CompareRow } from "./compare-rows.ts";

/** The recorded week's sellers at their last ask, with the Watcher's rows on them. */
export function kettleRows(events: readonly LedgerEvent[], limitCents: number): CompareRow[] {
  const last = new Map<string, LedgerEvent>();
  for (const e of events) if (e.actor === "seller" && e.action === "offer" && e.sellerId && e.price) last.set(e.sellerId, e);
  return ranked([...last.entries()].map(([id, offer]) => {
    const watch = events.filter((e) => e.actor === "watcher" && e.sellerId === id).at(-1);
    const watcher = watch?.action === "refuse" ? "refuse" : watch ? "hold" : "clear";
    const under = toCents(offer.price!) <= limitCents;
    const verdict = verdictOf(watcher, !under);
    // The Watcher's sentence names the seller first ("Watcher set X aside: …"); its reasons are what follows.
    const reason = watch ? (watch.why.split(": ").slice(1).join(": ").replace(/\.$/, "") || null) : null;
    const name = typeof offer.data?.merchant === "string" ? offer.data.merchant : id;
    return { id, name, price: offer.price!, verdict, reason, underLimit: under, quoted: watcher === "refuse" ? offer.quoted ?? null : null };
  }));
}
