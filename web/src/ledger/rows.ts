// Small readings of the ledger's rows for the back room (Track L), shared by the grid, the phone's list and the side sheet.
// Each reads only a row's own fields; nothing here types a number or a seq.

import { SESSION_KINDS, csvField, type LedgerRow } from "@goose/core/session";

/**
 * The table's column widths (px), read by the grid (LedgerTable.tsx) and the shell drawn before it (ShellTable.tsx), so
 * each column sits where the grid's will. AS-15 slice 2 (the DD: Studio's "Every row" cut its From column at
 * "Seeded, simulate"): the fixed columns plus Why's least were 1,216 px with a session, wider than the Studio card
 * (1,064 at 1440) and the ledger (1,134), so the grid scrolled sideways and From fell off the edge. Now they total 888,
 * the Studio card at a 1024 window, and the long cells wrap to two lines (a 72 px row) instead.
 */
export const COL_W = { t: 112, who: 176, kind: 120, did: 128, price: 96, whyMin: 152, from: 112, open: 48 } as const;

/** Where a row came from, in words: the session's own source, or the demo week (recorded, except its one seeded row). */
export function fromWords(r: LedgerRow): string {
  if (r.part === "session") return r.sourceWords ?? "";
  return r.source === "seeded" ? "Seeded, simulated" : "Recorded";
}

/** The seeded row's Who, and the Filter menu's name for its toggle (DD, CD-1: the toggle in the row's own words). */
export const SEED_WHO = "Seed (simulated)";

/**
 * Who wrote a row, as the back room shows it. The demo week's one seeded row is the seed's, not PayPal's: core names it
 * PayPal (the event it stands in for), so on screen it says it is a simulation before it says anything else.
 */
export function whoWords(r: LedgerRow): string {
  return r.part === "week" && r.source === "seeded" ? SEED_WHO : r.who;
}

/** What a row did; the seeded row's capture is a simulated one. */
export function didWords(r: LedgerRow): string {
  return r.part === "week" && r.source === "seeded" ? `${r.did} (simulated)` : r.did;
}

/** Which record a row belongs to, in a download's first column: a file can't lose the labels the table's rows wear. */
export function sideWords(r: LedgerRow): string {
  if (r.part === "session") return "your session";
  return r.source === "seeded" ? "seeded, simulated" : "recorded demo";
}

/** The sign the table draws on an amount, as a word: a refund must not read as a second payment. */
export const flowWords = (r: LedgerRow): string => (!r.price ? "" : r.flow === "out" ? "money out" : r.flow === "back" ? "money back" : "");

/**
 * What the Why column's filters read: what its cell draws. A seller's quoted words are found here and are already on show in
 * the cell; they're matched, never shown anywhere new, and `viewCsv` still leaves them out.
 */
export const whyFindText = (r: LedgerRow): string => (r.quoted ? `${r.why} ${r.quoted}` : r.why);

/**
 * "CSV of these rows": what the table shows, in the order it shows it, every row saying which record it came from. Never
 * the seller's quoted words: a download of a view holds the code's own words and nothing anyone typed.
 */
export function viewCsv(rows: readonly LedgerRow[]): string {
  const head = ["Side", "Time (UTC)", "Who", "What", "Did", "Amount", "Flow", "Why", "Rule", "Layer", "From"];
  const kind = (r: LedgerRow) => SESSION_KINDS.find((k) => k.key === r.kind)?.one ?? r.kind;
  const lines = rows.map((r) => [sideWords(r), r.part === "session" ? new Date(r.t).toISOString() : "", whoWords(r), kind(r), didWords(r), r.price ?? "", flowWords(r), r.why, r.rule ?? "", r.layer, fromWords(r)].map(csvField).join(","));
  return `${[head.map(csvField).join(","), ...lines].join("\r\n")}\r\n`;
}

/** The same, in full, for the side sheet. */
export function fromSheet(r: LedgerRow): string {
  if (r.part === "session") return r.sourceWords ?? "this session";
  return r.source === "seeded"
    ? "The demo week's seeded row: simulated, no money moved"
    : "The recorded demo week: a recorded run, replayed in your browser. Fictional sellers, no money moved";
}

/** A row's amount as its card shows it: a minus where the shopper's money went out, a plus where it came back. */
export function amountShown(r: LedgerRow): string | null {
  if (!r.price) return null;
  return `${r.flow === "out" ? "−" : r.flow === "back" ? "+" : ""}${r.price}`;
}

/** The words PayPalMark draws on a signed webhook row. */
export const SIGNED_MARK = "Signed by PayPal";

/**
 * The phone card's visible words, in the order the card draws them (Cards.tsx): who, the amount, what it is, what it
 * did, when (or where from), why, the seller's quoted words, PayPal's signed mark. Empty parts are left out.
 */
export function cardWords(r: LedgerRow, when: string): string[] {
  const kind = SESSION_KINDS.find((k) => k.key === r.kind)?.one ?? "";
  return [whoWords(r), amountShown(r), kind, didWords(r), when, r.why, r.quoted, r.signed ? SIGNED_MARK : null]
    .filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
}

/**
 * The card button's name (Round 2 a11y, axe 4.14 "Label in Name", WCAG 2.5.3): it starts with exactly what the card
 * shows, in the same order, so a voice user can say what they see; then what the tap does.
 */
export function cardLabel(r: LedgerRow, when: string): string {
  return `${cardWords(r, when).join(" ")}. Open the full story.`;
}

export interface Look { key: string; seq: number; words: string }

/**
 * Where to look in the recorded run: the scam seller's first note, the Watcher setting it aside, code overruling the
 * AI's bid, and code stopping to ask the shopper. Each is found by its row's fields; a beat the run lacks is left out.
 */
export function lookFor(rows: readonly LedgerRow[]): Look[] {
  const rec = rows.filter((r) => r.part === "week" && r.source !== "seeded");
  const out: Look[] = [];
  const skip = rec.find((r) => r.kind === "skipped");
  const target = skip?.who.split(" → ")[1];
  const note = target ? rec.find((r) => r.actor === "seller" && r.who === target && r.quoted && r.seq < skip!.seq) : undefined;
  if (note) out.push({ key: "note", seq: note.seq, words: `${note.who}'s note gives orders` });
  if (skip && target) out.push({ key: "skip", seq: skip.seq, words: `The Watcher sets ${target} aside` });
  const over = rec.find((r) => r.actor === "code" && r.rule !== null && r.kind === "decision");
  if (over) out.push({ key: "code", seq: over.seq, words: "Code overrules the AI's bid" });
  const asked = [...rec].reverse().find((r) => r.tone === "asked");
  if (asked) out.push({ key: "ask", seq: asked.seq, words: `Code stops at ${asked.price ?? "the deal"} to ask you` });
  return out;
}
