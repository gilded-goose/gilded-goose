// A cap the shopper said (Track H-3, Round 3 consumer worst moment 2): "headphones under 80 dollars", "a desk lamp,
// nothing over 40". Code reads it from her own words with fixed patterns (no model), and it can only LOWER what her
// cart is held to: held = the lower of her cap and her category's limit in code. No words can raise a limit, so a cap
// over the limit changes nothing, and an amount that isn't a sane price ("under -5", "under 1e9 dollars", "under 0")
// isn't a cap at all. Only her words are read here: never a seller's note, never the AI's market, never a want.
// The server takes the cap back as `maxPrice` only through `parsePrice` (a junk one is a 400), and the guard holds the
// cart to it like any max. Pure: words in, cents out; nothing is kept.

import { fromCents, toCents, usd, type Cents } from "../money.ts";

/** The highest cap read from words: the same ceiling the server's `parsePrice` gate takes (MAX_JUDGE_PRICE, $100,000;
 *  a test pins them equal). Above it, the words name no cap: it could never lower anything anyway. */
export const CAP_MAX: Cents = 10_000_000;

/** One cap her words said: its cents, and where its words are (so the item's name can be read without them). */
export interface SpokenCap { cents: Cents; text: string; at: number }

// A dollar amount: "$80", "$ 80", "80", "1,200", "79.99", "80 dollars", "80 bucks", "80 usd". Never "-5", "1e9", "40k",
// "40%" or "40.555": the amount must end at a space, a comma, a stop or the end.
const AMOUNT = String.raw`(\$\s?)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(\s?(?:dollars?|bucks|usd))?`;
const END = String.raw`(?=$|[\s,;:!?)]|\.(?!\d))`;
/** Words before the amount that make it a ceiling. "over" alone ("over 80") is a floor, so only "nothing over" counts. */
const BEFORE = String.raw`under|below|less\s+than|cheaper\s+than|no\s+more\s+than|not\s+more\s+than|no\s+higher\s+than|nothing\s+(?:over|above|more\s+than|higher\s+than)|not\s+(?:over|above)|max(?:imum)?(?:\s+of)?|at\s+most|up\s+to|within|(?:my\s+|a\s+)?budget(?:\s+(?:is|of))?|capped\s+at`;
/** Words after the amount that make it a ceiling: "$40 tops", "60 max", "50 dollars or less". */
const AFTER = String.raw`tops|max(?:imum)?|or\s+less|or\s+under|or\s+below|at\s+most`;
const BEFORE_RE = new RegExp(String.raw`\b(?:${BEFORE})\s*:?\s+${AMOUNT}${END}`, "gi");
const AFTER_RE = new RegExp(String.raw`(?<![\w.,$-])${AMOUNT}\s+(?:${AFTER})\b`, "gi");
/** "no less than 50", "not under 50": a floor, not a cap. */
const FLOOR = /\b(?:not|no|never)\s+$/i;
/** A bare number followed by one of these measures something else: "under 300 grams", "below 2 years", "max 4 people". */
const UNIT = /^\s*(?:%|percent|lbs?|pounds?|kgs?|kilos?|grams?|g\b|oz|ounces?|inch(?:es)?|in\b|"|cm|mm|m\b|meters?|metres?|ft|feet|foot|miles?|km|years?|yrs?|months?|weeks?|days?|nights?|hours?|hrs?|minutes?|mins?|seconds?|people|persons?|guests?|adults?|kids?|pieces?|pcs|items?|watts?|w\b|volts?|v\b|mph|db|gb|tb|mb|hz|liters?|litres?|l\b|ml|cups?|stars?|reviews?|euros?|eur|gbp|cad|aud|yen)/i;

const amountCents = (whole: string, frac: string | undefined): Cents | null => {
  try {
    const c = toCents(`${whole.replace(/,/g, "")}${frac ? `.${frac}` : ""}`);
    return c > 0 && c <= CAP_MAX ? c : null;
  } catch { return null; }
};

/**
 * Her words as the Ask reads them (Round 4 red team, fix 4): NFKC, except a character that is a number but not a digit
 * (`\p{No}`: superscripts "¹", subscripts "₂", circled "①", fractions "½") stays as she typed it. NFKC would fold "80¹" into
 * "801", so a footnote mark could join the amount ($801); kept, it ends no amount, and "under 80¹ dollars" names no cap.
 * Full-width digits ("８０") still fold to ASCII here; other scripts' digits ("٨٠") are read by `spokenCaps` itself.
 */
export const askFold = (raw: string): string => raw.split(/(\p{No})/u).map((s, i) => (i % 2 ? s : s.normalize("NFKC"))).join("");

/** A decimal digit of any script ("٨", "८", "８") as its ASCII digit, one code unit for one (so places in the words hold).
 *  Its value is its place in its run of ten (`\p{Nd}` digits come in runs of ten, 0 first). Astral digits stay as they are:
 *  missing a cap holds her cart at the limit, the careful side. */
const asciiDigits = (w: string): string => w.replace(/[^\x00-\x7f]/g, (ch) => {
  if (!/\p{Nd}/u.test(ch)) return ch;
  const cp = ch.charCodeAt(0);
  let k = 0;
  while (k < 9 && /\p{Nd}/u.test(String.fromCharCode(cp - k - 1))) k++;
  return String(k % 10);
});

/** Every cap her words said, in order. A floor, a bare number that measures something else, or a nonsense amount isn't one.
 *  Digits of any script count ("under ٨٠ dollars" is $80.00); a superscript never joins an amount. */
export function spokenCaps(words: string): SpokenCap[] {
  const raw = String(words);
  const w = asciiDigits(raw);
  const found: SpokenCap[] = [];
  for (const re of [BEFORE_RE, AFTER_RE]) {
    for (const m of w.matchAll(re)) {
      const at = m.index!;
      if (FLOOR.test(w.slice(0, at))) continue;
      const [, dollar, whole, frac, unit] = m;
      if (!dollar && !unit && UNIT.test(w.slice(at + m[0].length))) continue;
      const cents = amountCents(whole!, frac);
      // "under 80 max" is one cap, read by both patterns: a span overlapping one already found is the same cap.
      const end = at + m[0].length;
      if (cents !== null && !found.some((f) => at < f.at + f.text.length && f.at < end)) found.push({ cents, text: raw.slice(at, end), at });
    }
  }
  return found.sort((a, b) => a.at - b.at);
}

/** The cap her words said, or null. Said twice ("under 80, max 60"), the lower one: when unsure, hold. */
export function spokenCap(words: string): SpokenCap | null {
  return spokenCaps(words).reduce<SpokenCap | null>((low, c) => (low === null || c.cents < low.cents ? c : low), null);
}

/** A name without any cap's words in it (Round 4 data, "Lower"): the AI market named a $500 ask's item "Noise cancelling
 *  headphones, under $500", the name the ledger and PayPal's line item carry, while the cart was held to $150.00. Each
 *  cap's span is cut and the joins tidied; a name that was only a cap stays as it was. */
export function withoutCaps(name: string): string {
  const cut = spokenCaps(name).reverse().reduce((t, c) => `${t.slice(0, c.at)} ${t.slice(c.at + c.text.length)}`, name);
  const tidy = cut.replace(/\s+([,;:.!?)])/g, "$1").replace(/\s*[,;:–—-]+\s*([.!?]+)$/, "$1").replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, "").replace(/\s+(?:for|in|and|with|at)$/i, "").trim();
  return tidy === "" ? name : tidy;
}

/** What a cart is held to: the lower of her cap and the limit in code. Only lowers; with no cap, the limit. */
export const heldTo = (limit: Cents, cap: Cents | null | undefined): Cents => (cap != null && cap > 0 && cap < limit ? cap : limit);

/** A dollar amount in the card's one money form (DD §8): "$80.00", never "$80" beside it; thousands with commas
 *  ("$80,000.00", Round 4 red team fix 4). */
export const capUsd = usd; // the one formatter (core/src/money.ts)

/**
 * The understood line (Track H-3, the DD's H-4 ruling): one sentence that never repeats the card's big number (what
 * the cart is held to), money in one form, the category mid-sentence.
 * - lower (big number her cap): "Your Other limit in code stays $150.00."
 * - equal: "The same as your Other limit in code."
 * - over (big number the limit): "You said $500.00. Words never raise a limit in code."
 * - none: "Your Other limit in code." (not drawn: the card says "Your cart is held to it.")
 */
export function capLine(cap: Cents | null, limit: Cents, category: string): string {
  if (cap === null) return `Your ${category} limit in code.`;
  if (cap < limit) return `Your ${category} limit in code stays ${capUsd(limit)}.`;
  if (cap === limit) return `The same as your ${category} limit in code.`;
  return `You said ${capUsd(cap)}. Words never raise a limit in code.`;
}

/**
 * The cap line in the deal card's "Before you approve" (DD H-5): it names her cap and never repeats the limit, which the
 * line above it already says. lower: "Your $45.00 cap holds this cart, under your Other limit in code." · equal: "Your
 * $150.00 cap is the same as your Other limit in code." · over: as the understood card ("You said $500.00. …").
 */
export function capHoldsLine(cap: Cents, limit: Cents, category: string): string {
  if (cap < limit) return `Your ${capUsd(cap)} cap holds this cart, under your ${category} limit in code.`;
  if (cap === limit) return `Your ${capUsd(cap)} cap is the same as your ${category} limit in code.`;
  return capLine(cap, limit, category);
}

/** Whose number a cart is held to, in words, with its amount (Round 4 data, F2): "your $40.00 cap" when her cap is lower,
 *  else "your $150.00 Other limit", the number the understood card showed a screen earlier. */
export const heldWords = (cap: Cents | null, limit: Cents, category: string): string =>
  cap !== null && cap < limit ? `your ${capUsd(cap)} cap` : `your ${capUsd(limit)} ${category} limit`;

/** A seller over what she's held to, in fixed words (DD §5 "Over-cap row"): "Over your $40.00 cap", "Over your $150.00
 *  Other limit"; never "set aside", which is the Watcher's. */
export const overWords = (cap: Cents | null, limit: Cents, category: string): string => `Over ${heldWords(cap, limit, category)}`;
