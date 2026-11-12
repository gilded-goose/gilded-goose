// The three promises (Joshua, Tue Nov 3 11:35 PM, section 2): the hackathon asks "Would you let AI shop for you?", and
// people say no out of three fears: it'll get tricked, it'll overspend, I won't know what it did. Each `head` is his
// sentence; each `line` says exactly how far the code backs it, never further (docs/claims.md, the `p-promise-*` rows,
// whose probes run the guard and the ledger). The landing, the judge tour, the menu, the README, Devpost and the press
// release all read these words. Its own module with no imports: the hero draws it on the first screen, the menu's light
// index reads it, and neither should pull anything else in.

export type PromiseId = "fooled" | "overspend" | "hide";

export interface GoosePromise {
  id: PromiseId;
  /** The promise, Joshua's words. */
  head: string;
  /** How far the code backs it: what can't happen, and the one thing that still can. */
  line: string;
}

export const PROMISES: readonly GoosePromise[] = [
  { id: "fooled", head: "Goose can't be fooled into paying.", line: "Goose can't pay. Only your tap in PayPal does. The Watcher can miss a scam, so you see the exact cart first." },
  { id: "overspend", head: "Goose can't overspend.", line: "Your limits live in code, where a seller's words can't change them. Code checks each cart before your tap and again before money moves." },
  { id: "hide", head: "Goose can't hide anything.", line: "Every decision in your visit is a row with its reason. Rows are only added, never changed." },
];

/** The proof under "Goose can't overspend": a ticket asked for under its limit, held to your own lower cap (`c-cap-chip`).
 *  It moved from the hero's chips to the promise it proves, which keeps the hero at <=40 words. */
export const CAP_CHIP = "A Marsh Lights ticket, nothing over $85";

/** A real apostrophe for words set at display size (the DD, Nov 4: at 68 px the straight tick is the first flaw on the
 *  page). The data stays straight, so the docs, the menu and the tests read one spelling; only the drawing changes. */
export const curly = (s: string): string => s.replace(/'/g, "\u2019");

export const promiseOf = (id: PromiseId): GoosePromise => PROMISES.find((p) => p.id === id)!;

/** Joshua's supporting line, in his two sentences, word for word. */
export const SUPPORT_MARKET = "Goose compresses the whole market into one safe decision.";
export const SUPPORT_PROTECT = ["PayPal protects the payment;", "Goose protects everything before it."] as const;
/** The whole line, as the README, Devpost and the press release set it. */
export const SUPPORT_LINE = `${SUPPORT_MARKET} ${SUPPORT_PROTECT.join(" ")}`;
