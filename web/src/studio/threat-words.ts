// The Live Threat Board's own words (Track T), in one place with no imports: the widgets, the shell, the fixed rule and the
// claims probes all read them. Show, don't explain: every label is short, and each sentence is backed by a claims row.

export { BOARD_EYEBROW, BOARD_LOADING, BOARD_UNAVAILABLE, TRICK_HREF, TRY_LINK } from "./board-first-words.ts";
export const REAL_LABEL = "Real tries";
export const SEEDED_LABEL = "Seeded demo week";
/** Claims row tb-seeded-label: on screen whenever the seeded week is, and it never joins the count above. */
export const SEEDED_NOTE = "Notes we wrote, each run through the real check. Not counted above.";
export const WALLS_HEAD = "Got it to pay";
export const ASK_LABEL = "Ask for a view";
export const ASK_HINT = "Show me every Friends & Family attempt today";
export const ASK_HINT_SHORT = "Every Friends & Family try";
export const ASK_CHIPS: ReadonlyArray<{ label: string; prompt: string }> = [
  { label: "Friends & Family, today", prompt: "Show me every Friends & Family attempt today" },
  { label: "Gift cards set aside", prompt: "Gift cards set aside" },
  { label: "What got it to pay?", prompt: "What got it to pay?" },
  { label: "Waits for your yes", prompt: "Waits for your yes" },
];
export const THREAT_ASK_CANT = "I only read views of this board: a kind of trick, a verdict, a day. No AI call: a fixed rule read your words.";
export const TIME_HEAD = "Tries over time, by type";
export const RULES_HEAD = "The rule behind each verdict";
export const TRIES_HEAD = "Every try";
/** The tries as a chart, on request (the ask box): the heading is the question it answers. server/src/view.ts `TRIES_WIDGETS` says the same words. */
export const TRIES_WORD = "Tries";
export const TRIES_BY_HEAD = { type: "Tries by type", day: "Tries by day", verdict: "Tries by verdict" } as const;
export const SPARKS_HEAD = "Each kind of trick, over time";
export const sparkWords = (bars: readonly number[]): string => `Tries in each period, oldest first: ${bars.join(", ")}`;
export const TRIES_NOTE = "Verdict, rule, type and time. Never the note's words.";
export const NO_TRIES = "No real tries yet.";
export const BY_TYPE = "By type";
export const BY_SOURCE = "By source";
/** Claims rows tb-catch-real and tb-catch-seeded: a plain count of what the Watcher set aside, never a rate. */
export const CATCH_ALL = "set aside by the Watcher, of real tries";
export const CATCH_ALL_SEEDED = "set aside by the Watcher, of the seeded notes";
/** Claims row tb-catch: shows only with real scammer AI rows behind it, since each of its notes is a scam by construction. */
export const CATCH_AI = "set aside, of the scammer AI's tries";
/** Claims row tb-ask-no-ai: asked for the scammer AI with no such row, the view says so rather than answer with everyone's. */
export const ASK_NO_AI = "Nothing on the record came from a scammer AI.";
/** The bars' key (claims row tb-bars): the same words as the line under the catch rate. Paid shows only when a bar holds one. */
export const KEY_CAUGHT = "Set aside";
export const KEY_REST = "On to your limit and your tap";
export const KEY_PAID = "Paid";
/** The top row of the real record, in fixed words: true whenever it's shown, so it needs no timer. "Newest", never "your": rows are anonymous to the minute. */
export const newestWords = (type: string, verdict: string) => `Newest try: ${type}, ${verdict.toLowerCase()}.`;
export const SEE_NEWEST = "See it in every try";
/** Claims row tb-drill: the count comes from the rows on show. */
export const drillWords = (count: number, rule: string) => `${count.toLocaleString("en-US")} ${count === 1 ? "try" : "tries"} under “${rule}”.`;
export const DRILL_BACK = "Back to the rules";
export const CATCH_EMPTY = "No tries in this view.";
/**
 * Claims row tb-catch-rest: 82% set aside must not read as 18% getting through to payment. The rest went on to the code's
 * walls, and this says where they went; the tile beside the catch says what became of them.
 */
export function catchRestWords(rest: number): string | null {
  if (rest <= 0) return null;
  return `${rest === 1 ? "The other one" : `The other ${rest.toLocaleString("en-US")}`} went on to your limit and your tap.`;
}
/**
 * Claims row tb-catch-paid (Joshua, Nov 4, 3d): at least as visible as the catch, so the same size beside it, from the same
 * rows. It can only say None while none did.
 */
export const CATCH_PAID = "got it to pay";
export const catchPaidWords = (paid: number, of: number): string => paid > 0 ? `${paid.toLocaleString("en-US")} of ${of.toLocaleString("en-US")}` : "None";
/** Claims row tb-credit: what the fallback is drawn with. A phone reads lists and never fetches a grid, so it says only what it draws with. */
export const CREDIT = "Built on AG Grid and AG Charts.";
export const CREDIT_PHONE = "Built on AG Charts.";
export const cutWords = (shown: number, tried: number) => `Reads the newest ${shown.toLocaleString("en-US")} of ${tried.toLocaleString("en-US")}.`;
export const DOWNLOAD = "Download these rows";
export const DOWNLOAD_XLSX = "As Excel";
export const DOWNLOAD_XLSX_LABEL = "Download these rows as Excel";
/** The strip under Every try, in the home counter's words, from the same fold (`web/src/site/tries-fold.ts`). */
export { splitLine as totalsWords } from "../site/tries-fold.ts";
export const TRY_SIDE_SEEDED = "Seeded demo week: a practice row, from a note we wrote";
export const TRY_SIDE_REAL = "Real try, on the live record";
export const TRY_LEDGER_HEAD = "Ledger rows citing this rule";
export const TRY_LEDGER_NOTE = "A try keeps no link to any run, so these are the rows the same rule decided.";
export const TRY_LEDGER_NONE = "No row in this ledger cites this rule yet.";
export const FIND_LABEL = "Filter these tries";
export const FIND_HINT = "Filter: gift card, set aside, Watcher";
/** Said only while a filter hides rows. */
export const findWords = (on: number, of: number): string => `${on.toLocaleString("en-US")} of ${of.toLocaleString("en-US")} rows`;
export const OVER_HEAD = "All tries, on their own scale";
export const OVER_HEAD_VIEW = "These tries, on their own scale";
/** Said only when the record runs further back than the area does. */
export const overCutWords = (drawn: number, of: number): string => `The chart holds the newest ${drawn.toLocaleString("en-US")} of ${of.toLocaleString("en-US")} tries.`;
/** The text the area and the donut stand for, in the bars' own words. */
export const overWords = (p: { caught: number; rest: number; paid: number }): string => `${(p.caught + p.rest + p.paid).toLocaleString("en-US")} ${p.caught + p.rest + p.paid === 1 ? "try" : "tries"}: ${p.caught.toLocaleString("en-US")} set aside, ${p.rest.toLocaleString("en-US")} on to your limit and your tap, ${p.paid.toLocaleString("en-US")} paid.`;
export const SHOW_DEMO = "See it in the seeded demo week";
export const CLEAR = "Show all";
