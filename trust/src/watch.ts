// Layer 4, the Watcher (ADR 0008): states hold, acts refuse. A state (no sales yet, or no record available) can only
// ever hold a cart for the shopper's yes; an act (seller text that instructs the agent, asks for a gift card or to be
// paid outside PayPal, or tries to write the shopper's memory or limits) refuses, and the same words said too broadly
// to prove it only hold (W36, W37, W41). Flags never sum: two holds are still a hold. Pure, and the one
// function both the guard and the engine call, so a probe that skips the engine still meets it (shared Lesson 30).

import { quoteNote } from "./fence.ts";
import { cardIsAside, HOLDING_RULES, liftsCash, listed, paysAway, sendsCash, textEvidence, type EvidenceRule, type NoteReader, type NoteEvidence, type ScamKind, type TextField } from "./notes.ts";
import { escalate, READER_SAID, type Reading, type ReaderSign } from "./reader.ts";

/** What the Watcher reads about one seller's offer: everything it wrote, and its sales record. */
export interface Evidence {
  /** The seller's note, as quoted for the ledger (`quoteNote`), so the screen can show what fired. */
  quoted: string;
  merchant?: string;
  item?: string;
  /** Completed sales on record; `null` = no record available, which is not zero sales (shared Lesson 9). */
  history: number | null;
  /** The AI reader's reading of this seller's words (W41 part 3), as `askReader` froze it. It can only add caution. */
  reading?: Reading | null;
}

export type WatchRule = EvidenceRule | "no-history" | "no-record" | "ai-reader";

/**
 * One flag. `field` names where an act's words were; a state has none, and neither does the AI reader's. `said` is
 * fixed words, never the seller's or the model's; `sign` is the reader's kind of sign, from a fixed list.
 */
export interface Flag { rule: WatchRule; severity: "hold" | "refuse"; field?: TextField; said: string; sign?: ReaderSign; /** The peer scam it names, fixed words (Track S). Absent on every other flag. */ kind?: ScamKind }

export type WatchVerdict = "refuse" | "hold" | "clear";

/**
 * The flags on one seller: acts first (they refuse), then its record (it only ever holds), then the AI reader's, if it raised them.
 * `read` is `textEvidence` unless a run passes its own `runReader`, which gives the same reading.
 */
export function watch(ev: Evidence, read: NoteReader = textEvidence): Flag[] {
  const acts: NoteEvidence[] = [
    ...read(ev.quoted, "note"),
    ...(ev.merchant === undefined ? [] : read(quoteNote(ev.merchant), "merchant")),
    ...(ev.item === undefined ? [] : read(quoteNote(ev.item), "item")),
  ];
  // Cash sent, not handed over ("Cash only" over a note "mail it and I'll ship"): its hold is an off-PayPal one, outside
  // `NEVER_REFUSE`, so the reader may refuse it (security review after 1fb3613). Only the note's own words send: a store
  // name or item title alone ("Ships nationwide") never lifts cash-alone protection (Joshua's answers via the lead,
  // 2026-10-28). Its cash words still count in any field.
  // Security review of the push (2026-10-28, decided by default): so does a money sentence the code can't place in the
  // note (`paysAway`), and a deposit asked for in the store name or title (`liftsCash`, on the fence's capped copy).
  const sent = sendsCash(ev.quoted) || paysAway(ev.quoted) || [ev.merchant, ev.item].some((f) => f !== undefined && liftsCash(quoteNote(f)));
  // Acts refuse; a stated limit or a gift card in a list only holds (W36, W37), so it sorts after every act.
  const flags: Flag[] = [
    ...acts.filter((a) => !HOLDING_RULES.has(a.rule)).map((a): Flag => ({ rule: a.rule, severity: "refuse", field: a.field, said: a.said, ...(a.kind ? { kind: a.kind } : {}) })),
    ...acts.filter((a) => HOLDING_RULES.has(a.rule) && !(sent && a.rule === "asks-for-cash" && acts.some((o) => o.rule === "lists-off-paypal" && o.field === a.field)))
      .map((a): Flag => ({ rule: sent && a.rule === "asks-for-cash" ? "lists-off-paypal" : a.rule, severity: "hold", field: a.field, said: a.said })),
  ];
  // Only a whole count above zero is a record (as `chipsHold`); zero sales and no record are told apart.
  if (!(Number.isSafeInteger(ev.history) && ev.history! > 0)) {
    flags.push(ev.history === 0
      ? { rule: "no-history", severity: "hold", said: "new seller, no sales yet" }
      : { rule: "no-record", severity: "hold", said: "no sales record available" });
  }
  return escalate(flags, ev.reading, cardIsAside(ev.quoted));
}

/** The worst flag decides, and only an act can refuse. */
export function verdictOf(flags: readonly Flag[]): WatchVerdict {
  return flags.some((f) => f.severity === "refuse") ? "refuse" : flags.length > 0 ? "hold" : "clear";
}

/** The evidence a refusal names, in order, each phrase once. Never the record: a refusal is never "no sales record". */
export function evidenceSaid(flags: readonly Flag[]): string {
  return listed([...new Set(flags.filter((f) => f.severity === "refuse").map((f) => f.said))]);
}

/** The Watcher row's sentence, by verdict. `name` is the store name the screen may show (`shownName`). */
export function watchWhy(name: string, flags: readonly Flag[]): string {
  if (verdictOf(flags) === "refuse") return `Watcher set ${name} aside: ${evidenceSaid(flags)}.`;
  const hold = flags.find((f) => f.severity === "hold");
  if (hold?.rule === "ai-reader") return `Watcher held ${name}: ${READER_SAID.hold}, so a cart from it waits for your yes.`;
  if (hold && HOLDING_RULES.has(hold.rule as EvidenceRule)) return `Watcher held ${name}: ${hold.said}, which isn't proof of an attack, so a cart from it waits for your yes.`;
  return hold?.rule === "no-history"
    ? `Watcher: ${name} is a new seller with no sales yet and nothing it wrote is evidence against it, so a cart from it waits for your yes.`
    : `Watcher: no sales record is available for ${name} and nothing it wrote is evidence against it, so a cart from it waits for your yes.`;
}

/**
 * The Watcher's ledger row for one seller's flags, or null when they're clear: the verdict, the sentence, and the rule
 * ids the screen keys on (`data.rule`: the acts for a refusal, the state for a hold). The engine and the judge box both
 * write it, so a refusal on evidence is on the record even when the guard refuses first on the price (W29).
 */
export function watchRow(name: string, flags: readonly Flag[]) {
  const now = verdictOf(flags);
  if (now === "clear") return null;
  const rule = [...new Set(flags.filter((f) => f.severity === (now === "refuse" ? "refuse" : "hold")).map((f) => f.rule))].join(",");
  const fields = [...new Set(flags.flatMap((f) => (f.field ? [f.field] : [])))].join(",");
  const sign = flags.find((f) => f.rule === "ai-reader")?.sign;
  const kind = flags.find((f) => f.kind)?.kind;
  return {
    actor: "watcher" as const, action: now, layer: 4 as const, verdict: now === "refuse" ? "refused" as const : "asked" as const,
    why: watchWhy(name, flags), data: { rule, ...(fields ? { fields } : {}), ...(sign ? { sign } : {}), ...(kind ? { kind } : {}) },
  };
}

/** The fixed words shown in place of a store name or item title the screen can't show as written (018 N8). */
export const NAME_WITHHELD = "a seller (name withheld)";
export const ITEM_WITHHELD = "an item (title withheld)";

// A name the ledger may carry as written: letters, digits, spaces and a few name marks, short. No "$", ":", "!" or
// quotes, so a store name can't carry an amount, a role marker or an order into `why` or `data`.
const NAME_SHAPED = /^[\p{L}\p{N} &'.()-]{1,48}$/u;

/**
 * What the ledger's `why` and `data` may carry for a seller-written name or title: the text as written when it is
 * name-shaped and carries no evidence, else the fixed words. The text itself then goes only in the row's `fenced`.
 */
export function shownName(text: string, field: "merchant" | "item", read: NoteReader = textEvidence): { shown: string; withheld: boolean } {
  const ok = NAME_SHAPED.test(text) && read(text, field).length === 0;
  return ok ? { shown: text, withheld: false } : { shown: field === "merchant" ? NAME_WITHHELD : ITEM_WITHHELD, withheld: true };
}
