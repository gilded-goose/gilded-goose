// The dashboard page's own words (Track AS, slice 9), in one place with no AG import: the shell drawn before the Studio
// chunk (Shell.tsx) and the dashboard itself (Studio.tsx) say the same things, and the chips the ask box offers are
// the agent's prompt starters too (ai.ts re-exports them).

// AS-15 (Joshua, Sat 3:30 AM: "show, don't explain"): the hero says what the page is in five words; the ask box and
// the Edit switch show the rest. The honesty line is on screen, short (ASK_VIEW_ONLY, claims row as-view-only: the DD,
// stack 107, "shorten it, not hide it"; C's words), and the full sentence (ASK_IDLE) is the box's screen-reader description.
export const EYEBROW = "Built with AG Studio";
export const H1 = "Behind the scenes";
export const LEDE = "Every decision, as a dashboard.";
/**
 * The phone query, in one place (the DD's AS-13 nit): below 768 px the Edit switch hides and the lede says rearranging
 * waits for a wider screen. studio.css holds both in this one `@media`, and Shell.tsx and Studio.tsx read it from here;
 * core/test/as14.test.ts keeps the CSS to this value, so moving one moves the other.
 */
export const PHONE = "(max-width: 767px)";
/** On a phone there is no Edit (the switch is hidden below 768 px), so the lede says what is true there (Round 4 judges). */
export const LEDE_PHONE = "Every decision, as a dashboard.";
export const ASK_LABEL = "Ask for a view";
export const ASK_PLACEHOLDER = "Show me everything Goose blocked this week";
/** Below 721 px the long placeholder was cut mid-word ("…Goose bl"); the short one fits the 390 field whole (measured AS-10: "What did Goose block this week?" still ran 249 px into 222). */
export const ASK_PLACEHOLDER_SHORT = "What did Goose block?";
/** The line under the ask box, always on screen (8 words, so the header stays <=36): what it can and cannot do. */
export const ASK_VIEW_ONLY = "Views only: can't pay, approve or change limits.";
/** The same, in full: the box's description, read with it by a screen reader. */
export const ASK_IDLE = "Views only: nothing you type here can pay, approve or change a limit.";
export const ASK_RUNNING = "Building the view…";
export const MAX_ASK = 300;
export const EDIT_ON = "Edit this view";
export const EDIT_OFF = "Done editing";
export const EDIT_NOTE = "Move, resize, add or remove cards. Nothing is saved to the server.";
/**
 * Each card's keyboard stop (AG Studio's widget focus, Round 6's accessibility seat): Tab moves card to card, Enter goes
 * into a card's own controls, Escape comes back out. The chip shows on the focused card; the sentence is what a screen
 * reader hears after the card's name.
 */
export const CARD_KEYS = "Enter to use this card · Esc to come back";
export const CARD_KEYS_SR = "Press Enter to use this card's controls, and Escape to come back to the cards.";
export const CARD_UNNAMED = "A card";
export const FOOT = "Fictional sellers. PayPal sandbox. Practice only: no real money.";

/** The three asks on the box, each a question one of the six Goose widgets answers. */
export const PROMPT_STARTERS: ReadonlyArray<{ label: string; prompt: string }> = [
  { label: "Everything Goose blocked", prompt: "Show me everything Goose blocked this week" },
  { label: "What you paid", prompt: "What did I pay, and when?" },
  { label: "The haggle", prompt: "The haggle, round by round" },
];

/**
 * The pinned answer (`.st-said`, dd/system.md §5 "Answer pin", the Design Director's AS-9 ruling): at most two sentences,
 * at most 3 lines at 390 px. The refusal first when the reply refused to act (its first sentence says it can't approve,
 * pay or change a limit; the server puts a refusal first whenever the words asked to act), then where the answer is: the
 * lit card named by its own heading, in curly quotes. Everything else ("Nothing was added.", the rule's honesty line)
 * stays in the note beside the ask box, which is the spoken one; the pin is aria-hidden.
 */
/** The set-aside card's count: sellers, by name, and the times when a seller came back (the recorded week offers one again each round). */
export function setAsideCount(names: readonly string[]): string {
  const sellers = new Set(names).size;
  const who = sellers === 1 ? "One seller set aside" : `${sellers} sellers set aside`;
  return names.length > sellers ? `${who}, ${names.length} times` : who;
}
export const STOCK_CLOSEST = "Goose can't draw that chart here, so this is the closest card.";
export const PIN_REFUSAL = "I can't pay, approve or change a limit: only your tap in PayPal pays.";
const REFUSED = /^[^.!?]*\b(can't|cannot|can not|won't|will not|unable to|not able to)\b[^.!?]*\b(approv|pay|limit|buy|purchas|refund)/i;
/** The pin's sentences, one entry each: at ≥768 px each sits on its own line (two spans, AS-11; §5 Answer pin). */
export function pinSentences(reply: string, heading: string | null): string[] {
  const pointer = heading ? `Lit below: “${heading.trim()}”${/[?.!]$/.test(heading.trim()) ? "" : "."}` : "";
  const refusal = REFUSED.test(reply.trim()) ? PIN_REFUSAL : "";
  // A chart the page can't draw: whoever landed on the nearest card has scrolled past the note that says why it isn't what they asked for.
  const closest = reply.trim() === STOCK_CLOSEST ? STOCK_CLOSEST : "";
  const both = [refusal, closest, pointer].filter(Boolean);
  return both.length ? both : [reply];
}
export function pinWords(reply: string, heading: string | null): string {
  return pinSentences(reply, heading).join(" ");
}

// The ledger as an audit log (Joshua, Nov 4). Claims row p-promise-hide, word for word.
export const APPEND_ONLY = "Rows are only added, never changed.";
export const FIND_ROWS = "Find in these rows";
export const FIND_RULE = "Every row with a rule";
export const findWordsOf = (found: number, of: number): string => `${found.toLocaleString("en-US")} of ${of.toLocaleString("en-US")} rows`;
