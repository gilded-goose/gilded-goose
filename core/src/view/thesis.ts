// The thesis, What Goose keeps and What Goose doesn't do (Joshua, Thu Nov 5 2026, 6:20 and 6:40 PM): one source for
// Devpost (Track C), the landing (Track P) and the video kit (Track T). Every sentence here is a row in docs/claims.md,
// and check-claims requires Devpost to say these words, in this order. Words only: nothing here reads, stores or pays.

/** Why now. The quote and the first sentence are our view, not a fact: "We think" marks both (rows c-thesis-quote,
 *  c-thesis-vision). The second sentence says "shows you the deal" until the ping is live (row c-thesis-checks). */
export const THESIS_LABEL = "Why now";
export const THESIS_QUOTE = "The next era runs on approvals.";
export const THESIS_LINES = [
  "We think every AI that acts for you will soon ask for your yes, and a yes is only safe if what you approve is exactly what you asked for.",
  "Goose reads every seller, watches the price and shows you the deal when it's right, and your one tap in PayPal is the only thing that pays.",
] as const;

/** What Goose keeps: the headline, then only what the code backs (rows c-kept-head, c-kept-words, chal-kept,
 *  c-kept-photo, c-kept-browser). The fold that says it in full is the Challenge's, at `#kept` (row c-kept-fold). */
export const KEPT_LABEL = "What Goose keeps";
export const KEPT_HEAD = "No account, no email, no phone number.";
export const KEPT_LINES = [
  "When you try to trick Goose, your words are shown back only to you: we never store your words or show them to anyone else. When an AI reads your note, it goes to the AI service for that one answer.",
  "We keep the verdict, the rule, the kind of trick, that it came through this form and the minute.",
  "A photo goes to the AI service for one read and is never stored: not a file, a log line or the ledger.",
  "Your limits, wants and week live in this browser's session: another browser starts fresh, and so does this one after seven days without a visit.",
] as const;
export const KEPT_FOLD = "What counts, what's kept";

/** What's next: Joshua's screenless line, word for word (row c-vision-screenless), then the line that keeps it from
 *  contradicting "you see the exact cart" (row c-vision-cart). Both are a vision, not a feature; Devpost puts "That's
 *  where we're headed, not what we built" between them, and the video marks them as our view. */
export const VISION_SCREENLESS = "AI is moving into rings and earbuds, where there's no screen to check. That's when a shopper that can't be fooled into paying matters most.";
export const VISION_CART = "Even there, we'd still send you the exact cart, on a screen you trust like your phone, before your tap.";

/** What Goose doesn't do, one honest line (row c-doesnt-do). */
export const DOESNT_LABEL = "What Goose doesn't do";
export const DOESNT_LINE = "It moves no real money (PayPal sandbox only), its sellers are a practice market, your limits live in one browser, and real-store prices are references you can't buy through Goose.";
