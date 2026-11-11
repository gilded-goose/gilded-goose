// Ask Goose's fixed words and sizes (A1), with no imports, so the page's first screen can show them without loading the
// catalog, the guard or the rule (those come in their own chunk when the browser has to read words itself, H1).

/** Claims row ask-not-an-ask: words that name nothing to buy (`notAnAsk`) end here: no market, no model call, no deal. */
export const NO_ITEM = "Try naming something to buy.";
export const NOT_UNDERSTOOD = `Goose didn't understand that. ${NO_ITEM}`;
export const NOT_SHOPPING = "Goose only shops for things to buy. It can't pay a bill or send money.";
export const DIDNT_SHOP = "Goose didn't shop for that.";
/** Claims rows ask-a-question and ask-no-item: a question about Goose, or words about her day, get these and a way to how it works, never a deal. */
export const A_QUESTION = "That sounds like a question.";
/**
 * Claims rows ask-hold-medicine and ask-hold-pressure: a hold, not a refusal, so it says where to go instead (Lead-11, Nov 4).
 */
export const HOLD_MEDICINE = "Goose is holding off on medicine. Your pharmacist or doctor is the place for that.";
export const HOLD_PRESSURE = "Goose is holding off on this one. Someone asking for gift cards or fast money is how many scams start. Call them back on a number you know.";
/** "No market, and none is coming": the Desk knows these lines by their openings, so the whole lines stay out of its bundle. Other "Goose ..." reasons aren't these. */
export const NOT_AN_ASK_LINE = /^Goose (?:is holding off|only shops for|didn't understand)/;
/** A want is a sentence, not a seller's blurb: long text costs tokens and is never needed to name a kettle. */
export const MAX_ASK_CHARS = 200;
/**
 * Where her limits are set, by name: the Desk's limits pane, which S1-6 named "Limits in code" (`LIMITS_NAME`,
 * core/src/view/menu.ts). A literal here, not an import: view/menu.ts imports scenario.ts, which imports ask/wants.ts,
 * so ask importing it would make a cycle. core/test/limits-name.test.ts pins the two equal.
 */
export const LIMITS_PLACE = "Limits in code";
/** One call, no race, the shopper waits on their own tap: the judge box's single-call budget (ADR 0009). */
export const ASK_TIMEOUT_MS = 3000;
/** What the screen says when the words asked for a limit, a quantity, a standing approval or a memory. Fixed words. */
export const SETTINGS_ONLY = `Your words can't set a limit, a quantity or a standing approval: limits are set only in ${LIMITS_PLACE}, a cart is always one item, and only your tap in PayPal pays.`;
/** The answer to a typed or dictated yes (N27, the video's "yes, buy it" beat): words never approve. */
export const TAP_TO_BUY = "Tap Approve to buy.";
/**
 * Shown under every answer (W49c): what the chips do to the next run, and no more. A color chip picks the sellers Goose
 * asks and the guard refuses a cart that contradicts it; the item and the max are still the Go button's.
 */
export const CHIPS_IN_RUNS = "A color chip picks which sellers Goose asks, and code refuses a cart in another color. Go shops the kettle at the max you set, or the ticket, night or seat you name at its category's limit.";
/** "I saw it for $X" (021 item 8): its own field, filled from the words and fixed words around it. */
export const SAW_LABEL = "I saw it for";
/** Under the field (item 9): it's only a comparison, read by the answer under it, never by a run, a limit or a cart. */
export const SAW_ONLY = "Only to compare: it never sets a limit, a max or a quantity.";
export const SAW_WHICH = "Which price did you see?";
export const SAW_MAYBE = "Is that the price you saw? Tap it to compare.";
export const SAW_SPOKEN = "Read from your words: check the amount.";
export const SAW_NOT_A_PRICE = "That amount can't be a shop price, so the field is empty.";
export const SAW_TYPE_A_PRICE = `Just the amount, like 54.99. A limit is set only in ${LIMITS_PLACE}.`;

/** A yes ("yes", "ok", "buy it"), in folded words. It names nothing: its one chip is the limit code adds. */
export const YES = /^\s*(yes|yeah|yep|yup|ok|okay|sure|buy it|buy now|approve|confirm|go ahead|do it|pay)\b/;
/** A yes keeps the chips the last want set, never wipes them: the server's session and the page alike (W49c). */
export const keepsLastChips = (words: string, chips: readonly { kind: string }[]) =>
  YES.test(words.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()) && chips.every((c) => c.kind === "limit");

/** A photo no catalog entry matches (item 12): an honest miss, never a guess. */
export const PHOTO_NONE = "Nothing in the catalog matches that yet.";
/** Why the camera can't read a photo now; typing still works (item 12). Only the AI reads an image: there's no rule. */
export const PHOTO_OFF = {
  off: "Live AI is off on this server, so the camera can't read a photo. Typing still works.",
  away: "Live mode isn't answering, so the camera can't read a photo. Typing still works.",
  // R-13: offline, the cause the code saw is her network (built like PAIR_WORDS.offline).
  offline: "You're offline, so the camera can't read a photo. Typing still works.",
  token: "You've used this browser's live AI asks for today, so the camera can't read a photo. Typing still works.",
  ip: "This network has used its live AI asks for today, so the camera can't read a photo. Typing still works.",
  global: "Today's live AI cap is reached, so the camera can't read a photo. Typing still works.",
  timeout: "The AI didn't answer in time, so this photo wasn't read. Try again, or type it.",
  error: "The AI call failed, so this photo wasn't read. Try again, or type it.",
  "bad-answer": "The AI's answer was unusable, so this photo wasn't read. Try again, or type it.",
} as const;
