// The Challenge's three layers, on purpose (Joshua, Nov 4, 7:10 AM, 3a and 3c): three ready-made notes, each there to show one
// layer, and the words that name which layer caught a round or a row. The words read the round's own answer, never the
// example that was tapped: an AI-reader example the AI reader didn't read says so, and can't claim a catch it didn't make.
//
// Pure, with type imports only. The landing's lazy chunk reads the words; the notes are in `challenge-chips.ts`, which `attempts.ts`
// reads too, so a page that loads the record never carries these words.
// The reader's part is measured on real reads: `scripts/challenge-examples-read.ts`, kept in docs/fixtures.

import type { AttemptRule, AttemptVerdict } from "../judge/attempts.ts";
import type { ThreatType } from "../judge/attempts.ts";

export { CHALLENGE_CHIPS, type ChallengeChip, type ChallengeLayer } from "./challenge-chips.ts";
import type { ChallengeLayer } from "./challenge-chips.ts";
import { usdOf } from "../money.ts";

/** A chip's small line. The reader's says when it can't read here: `away` is no live mode, `rested` is live mode with no AI reads left or none switched on. */
export type ReaderState = "on" | "away" | "rested";
const CHIP_LAYER: Record<ChallengeLayer, string> = { code: "Plain code", reader: "AI reader", limit: "Limit in code" };
export function chipLayerWords(layer: ChallengeLayer, reader: ReaderState): string {
  if (layer !== "reader" || reader === "on") return CHIP_LAYER[layer];
  // "Goose's": beside the scammer AI's "Let an AI try", a bare "AI reader, off" read as the page contradicting itself (the DD
  // on Option B, Fri Nov 6). The reader is Goose's side; the scammer AI is the other side, and it is on.
  return reader === "away" ? "AI reader, live only" : "Goose's AI reader: off";
}

/** What a round in this browser runs, wherever the block says so. */
export const IN_BROWSER_RUNS = "with the same code and no AI reader";

/** The three layers, for the column under the counter while there are no tries to show. */
export const LAYERS_HEAD = "What a note has to get past";
export const LAYER_CODE_WORDS = "Reads every note for known scam wording.";
export const LAYER_READER_WORDS = "In live mode, reads the note too. It can only add caution.";
export const LAYER_LIMIT_WORDS = "No note can move your limit, and nothing is bought without your tap.";
export const THREE_LAYERS: ReadonlyArray<{ key: ChallengeLayer; name: string; words: string }> = [
  { key: "code", name: CHIP_LAYER.code, words: LAYER_CODE_WORDS },
  { key: "reader", name: CHIP_LAYER.reader, words: LAYER_READER_WORDS },
  { key: "limit", name: CHIP_LAYER.limit, words: LAYER_LIMIT_WORDS },
];

/** The feed under the counter: closed-list fields only, so it has nowhere to hold anyone's words. */
export const FEED_HEAD = "Latest tries";
export const FEED_NOTE = "Verdict, kind of trick, layer and time. Never anyone's words.";
export const FEED_ROWS = 5;

/** The Watcher's rules that only ever hold on their own: set aside with one of these first, the AI reader raised it (trust `HOLDING_RULES`, pinned by a test). */
const HOLDS: ReadonlySet<AttemptRule> = new Set(["states-your-limit", "lists-gift-card", "addresses-agent", "lists-off-paypal", "mentions-gift-card", "asks-for-cash", "mentions-shipped", "mentions-overpay", "mentions-link", "mentions-step", "mentions-upfront", "asks-money-away", "asks-for-code", "speaks-as"]);
/** A hold that says nothing about the words: the shop's record, or nothing fired. */
const NOT_THE_WORDS: ReadonlySet<AttemptRule> = new Set(["no-history", "no-record", "your-tap"]);

/** A row's layer, read from its closed-list fields alone. A row has no price, so one over the limit that the code also caught reads as the code. */
export function rowLayerWords(verdict: AttemptVerdict, rule: AttemptRule): string {
  if (verdict === "paid") return "Nothing stopped it";
  if (verdict === "refused") return rule === "watcher" ? CHIP_LAYER.code : CHIP_LAYER.limit;
  if (verdict === "set-aside") return HOLDS.has(rule) ? "Code and AI reader" : CHIP_LAYER.code;
  if (rule === "ai-reader") return CHIP_LAYER.reader;
  return NOT_THE_WORDS.has(rule) ? "Your tap" : CHIP_LAYER.code;
}

/** To the minute, as the rows are. */
export function agoWords(at: number, now: number): string {
  const min = Math.floor((now - at) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ago`;
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** A feed row's key parts, so the feed's own type stays closed. */
export interface FeedRow { at: number; verdict: AttemptVerdict; rule: AttemptRule; type: ThreatType }

export const CAUGHT_BY = "Caught by";
const LIMIT_SAID = (price: string, max: string) => `The limit in code. ${usdOf(price)} is over your ${usdOf(max)} max, and no note can move it.`;

export interface RoundFacts {
  verdict: AttemptVerdict;
  rule: AttemptRule;
  /** Dollars, as asked and as the server's max: "500.00", "60.00". */
  price: string;
  max: string;
  /** Whether the AI reader read this round, or why not (the round's own `reader`). */
  reader: "read" | "off" | "timeout" | "error" | "bad-answer" | undefined;
  /** Where the round ran: "live" means on the server, anything else in this browser. */
  live: boolean;
  /** The example that was tapped, when the note is still that example's. */
  example: ChallengeLayer | null;
}

const cents = (dollars: string) => Math.round(Number(dollars) * 100);

/**
 * Which layer caught this round, in a sentence, or null when one got through (the verdict says that itself). Read from the
 * round's own answer. A note over the limit is the guard's first refusal whatever its words say, so the limit is named first,
 * and a catch by the words beside it is said too.
 */
export function layerSaid(r: RoundFacts): string | null {
  if (r.verdict === "paid") return null;
  const raised = r.verdict === "set-aside" && HOLDS.has(r.rule);
  if (cents(r.price) > cents(r.max)) {
    const also = raised ? " The plain code and the AI reader flagged its words too." : r.verdict === "set-aside" ? " The plain code caught its words too." : "";
    return `${LIMIT_SAID(r.price, r.max)}${also}`;
  }
  if (r.verdict === "refused") return r.rule === "watcher" ? "The plain code, on these words alone. No AI was needed." : "The limit in code. No note can move it.";
  if (raised) return "The plain code held it on these words, and the AI reader raised it to set aside.";
  if (r.verdict === "set-aside") return "The plain code, on these words alone. No AI was needed.";
  if (r.rule === "ai-reader") return "The AI reader alone. The plain code found nothing in these words, and the reader can only add caution, so this waits for your tap.";
  if (!NOT_THE_WORDS.has(r.rule)) return "The plain code held it on these words, for your tap.";
  // Nothing caught it. Never say the AI reader cleared what it didn't read.
  const read = r.reader === "read";
  if (r.example === "reader" && !read) return `Not caught here. This example is for the AI reader, ${r.live ? "which didn't read it this round" : "which only runs in live mode"}.`;
  if (read) return "Not caught, by the plain code or the AI reader.";
  return `Not caught by the plain code. The AI reader ${r.live ? "didn't read this round" : "only runs in live mode"}.`;
}
