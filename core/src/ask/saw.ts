// "I saw it for $X" (021 §4 item 8, W61; restart notes §8.2, §14): one amount from the shopper's own words, typed or
// dictated, for a field that is only ever a comparison. Never a limit, a max, a quantity or a buy: nothing here returns
// anything a Policy, a want or a cart could read, and the field lives in the browser alone (no server keeps it). An
// amount said beside a limit word ("my budget is $500") is never the seen price, two seen prices ask which one, and
// what isn't a price ("$0", "$-5", "$1e9") is said so. Seller text never comes here: only the Ask box and the field do.

import { fromCents, type Cents, usd } from "../money.ts";

/** Over this is no shop price a shopper saw ($10,000): said so, never shown as one. */
export const MAX_SAW_CENTS: Cents = 1_000_000;

/**
 * What the words gave the field. `one`: the amount, for the shopper to see and fix before Go (`spoken` when it was
 * words or cents, the forms §14 says to confirm; `seen` when a seen word came before it, "saw it for", "it was", "paid"). `which`: more than one seen price, so Goose asks. `not-a-price`: an
 * amount that can't be one. `none`: no seen price. `limitWords` in every case: the words also named an amount for a
 * limit, which only Settings sets.
 */
export type Saw =
  | { kind: "one"; cents: Cents; spoken: boolean; seen: boolean; limitWords: boolean }
  | { kind: "which"; cents: Cents[]; limitWords: boolean }
  | { kind: "not-a-price"; limitWords: boolean }
  | { kind: "none"; limitWords: boolean };

const ONES: Record<string, number> = { zero: 0, one: 1, a: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
const SCALE = String.raw`(?:hundred|${Object.keys(SCALES).join("|")})`;
const NUM_WORD = String.raw`\b(?:${[...Object.keys(ONES).filter((w) => w !== "a"), ...Object.keys(TENS)].join("|")}|${SCALE})\b`;
// A run of number words ("fifty-five", "a hundred and twenty", "forty nine ninety nine"); "a" only before a scale, and
// "and" only after one, so "between sixty and seventy" is two amounts.
const WORDS = String.raw`(?:(?:\ba\s+(?=${SCALE}\b))?${NUM_WORD}(?:(?:(?<=${SCALE})\s+and\s+|[\s-]+)${NUM_WORD})*)`;
const UNIT = String.raw`(?:dollars?|bucks|usd|cents?|¢)`;
// Where an amount is a seen price with no unit at all: "I saw it for 55", "was it 19.99", "between sixty and seventy".
const PRICED = new RegExp(String.raw`\b(?:for|at|was|was it|is it|it is|it's|price is|price was|cost|costs|costing|priced at|marked|paid|selling for|sells for|going for|listed at|tagged at|between)\s+$`, "i");
// Right after a seen price, another one offered in its place ("19.99 or 24.99", "sixty and seventy").
const ALTERNATIVE = /^\s*,?\s*(?:or|and|to|-)\s+(?:maybe\s+|perhaps\s+|possibly\s+|was it\s+)?$/i;
// Either side of an amount, the words that make it a limit's, never the seen price ("my budget is $500", "$500 max").
// "under $45" and "below $45" name a most, as a limit does; "cheaper than $55" names the seen price.
const LIMIT_BEFORE = /\b(?:budget|limit|max(?:imum)?|cap|spend(?:ing)?(?:\s+up\s+to)?|up\s+to|no\s+more\s+than|under|below|less\s+than|allowance)\b[^.,;!?$]{0,16}$/i;
const LIMIT_AFTER = /^\s*(?:(?:is|was|'s|:)\s+(?:my|the|our)?\s*(?:total\s+)?)?(?:budget|limit|max(?:imum)?|cap|tops|or\s+less|at\s+most)\b/i;
// Right before an amount, what the shopper would pay, not what they saw ("I'd pay $60", "I'll go to $70"). Only right
// before it: "go to Target for $55" is a seen price.
const LIMIT_RIGHT_BEFORE = /\b(?:i'?d\s+pay|(?:i\s+)?would\s+pay|willing\s+to\s+pay|happy\s+to\s+pay|i\s+can\s+do|(?:i'?ll\s+)?go\s+(?:up\s+)?to|pay\s+up\s+to)\s*$/i;
// Right after bare digits, what makes them no plain price: a scale letter or more digits ("$55k", "$1.5k", "49,99",
// "$1,2,3"). And after any amount, a rate ("$19.99/mo", "fifty dollars a month"): a one-off price is never compared with it.
const RUNS_ON = /^(?:[,.]\d|[a-z\d])/i;
const RATE = /^\s*(?:\/\s*(?:mo|month|yr|year|wk|week)|per\s+(?:month|year|week)|a\s+(?:month|year|week)|monthly|yearly|annually|weekly)\b/i;
// A difference, not a price ("find it for 4 less", "$10 off").
const DIFFERENCE = /^\s*(?:less|more|off|cheaper|lower|higher|over|under)\b/i;
// What may follow a bare number (no "$", no unit) for it to be a seen price: the end, a mark, or words that go on about
// the price ("for 55 at Target", "49.99 plus tax", "19.99 or 24.99"). Anything else fails closed to no price: "a kettle
// for 2 people", "at 7pm", "it's 3 feet wide", a phone number. The field stays empty for the shopper to type.
const FOLLOW = /^(?:\s*(?:[.,;:!?)]|$)|\s+(?:at|in|on|from|or|and|to|but|so|then|plus|with|w\/|each|ea|apiece|new|used|online|there|here|yesterday|today|tonight|last|this|earlier|before|retail|msrp|shipped|delivered|total|i|we|it|is|was|can|could|find|see|any|anything|cheaper|elsewhere)\b)/i;
// Words that say the shopper saw the amount ("I saw it for", "it was", "paid", "listed at"), close before it. Without
// one, "a kettle for $40" may be a budget, so the Ask rule's Settings line stays for it (`withoutSeenPrices`). Not "is"
// or "costs": "the most I'll pay is $60" is a limit said plainly.
// Words about what Goose may pay ("charge whatever", "I'll pay", "spend what it takes"): the line stays beside them.
const PAY_TALK = /\b(?:pay|paying|charge|spend|whatever|any\s+price|no\s+matter|at\s+any\s+cost)\b/i;
// A count said without a number ("a pair please", "order a couple"): only Settings and one-item carts answer it.
const COUNT_TALK = /\b(?:pair|couple|few|several|dozen|half|multiple|bunch)\b/i;
const SEEN_CUE = /\b(?:saw|seen|spotted|found|paid|was|listed|selling|sells|priced|tagged|marked)\b[^.,;!?]{0,24}$/i;
// A number a label names ("a room for 2", "a size for 10").
const LABELED = /\b(?:number|phone|cell|zip|code|model|size|year|room|apt|unit|age|aged|#)\b[^.,;!?]{0,12}$/i;

// One amount: a sign, then digits (with an exponent or a scale, read only to be refused or multiplied) or number words,
// then a unit, then cents.
// Digits as a price is written: "1,299" or "1299", never "49,99" or "1,2,3". The typed field uses the same (`sawField`).
const DIGITS = String.raw`\d{1,3}(?:,\d{3})+|\d+`;
const AMOUNT = new RegExp(String.raw`(?<sign>-\s?)?(?:(?<cur>\$|usd\s?)\s?(?<sign2>-\s?)?)?(?:(?<digits>(?:${DIGITS})(?:\.\d+)?(?:e[+-]?\d+)?)(?:\s+(?<dscale>${SCALE})\b)?|(?<words>${WORDS}))(?:\s?(?<unit>${UNIT}))?(?:\s+(?:and\s+)?(?<cdigits>\d{1,2}|${WORDS})\s+cents?)?`, "gi");

/**
 * Number words as dollars and cents: "fifty-five" → 55, "a hundred and twenty" → 120, "one hundred ninety nine" → 199,
 * and two spoken groups as a price tag says it, "forty nine ninety nine" → 49.99. Null for anything else.
 */
function wordsToAmount(s: string): { whole: number; cents: number } | null {
  const groups: number[] = [];
  let total = 0;
  let part = 0;
  let last: "ones" | "teen" | "tens" | "scale" | null = null;
  const next = () => { groups.push(total + part); total = 0; part = 0; last = null; };
  for (const w of s.toLowerCase().split(/[\s-]+/).filter((x) => x !== "and")) {
    if (w in ONES) {
      const v = ONES[w]!;
      // A second ones word, or a teen after anything but a scale, starts a new group ("thirty-two fifty", "twelve ninety").
      if (last === "ones" || last === "teen" || (last === "tens" && v >= 10)) next();
      part += v; last = v < 10 ? "ones" : "teen";
    } else if (w in TENS) {
      if (last === "ones" || last === "teen" || last === "tens") next();
      part += TENS[w]!; last = "tens";
    } else if (w === "hundred") { part = (part || 1) * 100; last = "scale"; }
    else if (w in SCALES) { total += (part || 1) * SCALES[w]!; part = 0; last = "scale"; }
    else return null;
  }
  groups.push(total + part);
  if (groups.length === 1) return { whole: groups[0]!, cents: 0 };
  if (groups.length === 2 && groups[0]! <= 999 && groups[1]! >= 10 && groups[1]! <= 99) return { whole: groups[0]!, cents: groups[1]! };
  return null;
}

/** The seen price in the shopper's words, as `Saw`. Pure; nothing is kept. */
export function sawPrice(words: string): Saw {
  return readSaw(words).saw;
}

/**
 * The words with the one price the shopper said they saw (`SEEN_CUE`) blanked out, so the Ask rule's "your words can't
 * set a limit" line (`settingsOnly`) answers only what's left: "I saw it for $55" says nothing of Settings. Hiding that
 * line fails closed: the words come back whole, so the line stays, unless they read as one sure price with no limit
 * words and no other number is left ("get me 3", "$49.99 or $54.99", "the ceiling is $70" keep it, as does a bare
 * "a kettle for $40", maybe a budget).
 */
export function withoutSeenPrices(words: string): string {
  const { saw, text, spans } = readSaw(words);
  // A limit's amount is never blanked, so it is always left as a number below.
  if (saw.kind !== "one") return text;
  const out = spans.reduceRight((t, [a, b]) => t.slice(0, a) + " ".repeat(b - a) + t.slice(b), text);
  return /\d/.test(out) || new RegExp(NUM_WORD, "i").test(out) || PAY_TALK.test(out) || COUNT_TALK.test(out) ? text : out;
}

function readSaw(words: string): { saw: Saw; text: string; spans: Array<[number, number]> } {
  const text = words.normalize("NFKC").replace(/[−‒-—]/g, "-")
    // A dash between two amounts, a "$" on either side, is a range, never a minus: "$50-$55" and "$50-55" are two
    // prices, so Goose asks which. A phone number ("555-867-5309") has no "$" and stays as it was.
    .replace(/(\$\s?\d[\d,]*(?:\.\d+)?)\s*-\s*(?=\$?\s?\d)/g, "$1 to ").replace(/(\d)\s*-\s*(?=\$\s?\d)/g, "$1 to ").replace(/\bdollar\s+sign\s+/gi, "$").replace(/\b(?:minus|negative)\s+/gi, "-");
  const seen: Array<{ cents: Cents; spoken: boolean; cued: boolean }> = [];
  let limitWords = false;
  let bad = false;
  let lastEnd = -1;
  const spans: Array<[number, number]> = [];
  let lastCued = false;
  for (const m of text.matchAll(AMOUNT)) {
    const g = m.groups!;
    const before = text.slice(0, m.index);
    const after = text.slice(m.index + m[0].length);
    const hasUnit = Boolean(g.cur || g.unit);
    // A bare number is a seen price only right after a pricing word or another seen price; else it's a size or a count.
    if (!hasUnit && !PRICED.test(before) && !(lastEnd >= 0 && ALTERNATIVE.test(text.slice(lastEnd, m.index)))) continue;
    if (!hasUnit && (!FOLLOW.test(after) || LABELED.test(before))) continue;
    if ((g.digits && !g.unit && !g.cdigits && !g.dscale && RUNS_ON.test(after)) || RATE.test(after)) { bad = true; continue; }
    if (DIFFERENCE.test(after)) continue;
    if (g.words && wordsToAmount(g.words) === null) continue;
    if (LIMIT_BEFORE.test(before) || LIMIT_RIGHT_BEFORE.test(before) || LIMIT_AFTER.test(after)) { limitWords = true; continue; }
    const alt = lastEnd >= 0 && ALTERNATIVE.test(text.slice(lastEnd, m.index));
    lastEnd = m.index + m[0].length;
    const cents = amountCents(g);
    if (cents === null) { bad = true; continue; }
    // A price offered in place of a seen one ("it was $49.99 or $54.99") was seen too.
    lastCued = SEEN_CUE.test(before) || (alt && lastCued);
    if (lastCued) spans.push([m.index, lastEnd]);
    const same = seen.find((s) => s.cents === cents);
    if (same) same.cued ||= lastCued;
    else seen.push({ cents, spoken: Boolean(g.words) || /^(?:cents?|¢)$/i.test(g.unit ?? "") || Boolean(g.cdigits), cued: lastCued });
  }
  const saw: Saw = seen.length > 1 ? { kind: "which", cents: seen.map((s) => s.cents), limitWords }
    // One price beside one that can't be ("$55 or $55k") is not one sure price: the field stays empty.
    : seen.length === 1 && !bad ? { kind: "one", cents: seen[0]!.cents, spoken: seen[0]!.spoken, seen: seen[0]!.cued, limitWords }
    : { kind: bad ? "not-a-price" : "none", limitWords };
  return { saw, text, spans };
}

/** The amount in cents, or null when it can't be a shop price: zero, negative, an exponent, too many decimals, too big. */
function amountCents(g: Record<string, string | undefined>): Cents | null {
  if (g.sign || g.sign2) return null;
  let whole: number;
  let cents = 0;
  if (g.digits) {
    if (/e/i.test(g.digits)) return null;
    const [w, f = ""] = g.digits.replace(/,/g, "").split(".");
    if (f.length > 2) return null;
    whole = Number(w) * (g.dscale ? (g.dscale.toLowerCase() === "hundred" ? 100 : SCALES[g.dscale.toLowerCase()]!) : 1);
    cents = Number(f.padEnd(2, "0"));
  } else {
    const a = wordsToAmount(g.words!)!;
    whole = a.whole;
    cents = a.cents;
  }
  if (g.cdigits) {
    const c = /^\d+$/.test(g.cdigits) ? Number(g.cdigits) : wordsToAmount(g.cdigits)?.whole ?? null;
    if (c === null || c > 99) return null;
    cents = c;
  }
  // "55 cents" is fifty-five cents, not dollars.
  const total = /^(?:cents?|¢)$/i.test(g.unit ?? "") && !g.cur ? whole + cents : whole * 100 + cents;
  if (!Number.isSafeInteger(total) || total <= 0 || total > MAX_SAW_CENTS) return null;
  return total;
}

/** The field as the shopper reads it: "$55.00". */
export const sawShown = (cents: Cents) => `${usd(cents)}`;

/** The field: what is in the box, the prices to pick from, the note under it, and whether the words named a limit. */
export interface SawState { value: string; choices: Cents[]; note: "spoken" | "not-a-price" | "maybe" | null; limitWords: boolean }

/** The field before any Ask: empty and optional (Joshua, via the lead, 2026-10-28: the week-3 beat types $55 first). */
export const SAW_EMPTY: SawState = { value: "", choices: [], note: null, limitWords: false };

/**
 * The field after an Ask, from `sawPrice`: the amount filled in to see and fix before Go (`spoken`: say to check it),
 * the prices to pick from when there were two or more (the field stays empty: Goose never guesses), and whether the
 * words also named a limit. One amount with no seen word before it ("a kettle for $40", maybe a budget) is offered
 * to tap (`maybe`), never filled: the answer under the field says "Buy it where you saw it" (visual review, item 9).
 */
export function sawPrefill(s: Saw): SawState {
  if (s.kind === "one" && !s.seen) return { value: "", choices: [s.cents], note: "maybe", limitWords: s.limitWords };
  if (s.kind === "one") return { value: fromCents(s.cents), choices: [], note: s.spoken ? "spoken" : null, limitWords: s.limitWords };
  if (s.kind === "which") return { value: "", choices: s.cents, note: null, limitWords: s.limitWords };
  return { value: "", choices: [], note: s.kind === "not-a-price" ? "not-a-price" : null, limitWords: s.limitWords };
}

/**
 * The field after the next Ask (Joshua, via the lead, 2026-10-28: "a typed price survives the next Ask for the same item
 * and clears when the item changes"). Words that name a price, or an amount that can't be one, fill it again: the newest
 * words win (decided by default, 025). Otherwise what is in the field stays, unless both Asks named an item and they
 * differ; an Ask that names none ("find it cheaper") is the same item. `limitWords` is always the new words'. An amount
 * only offered to tap (`maybe`) never replaces a price in the field: the price there is one the shopper put there.
 */
export function sawNext(was: SawState, fresh: SawState, wasItem: string | null, item: string | null): SawState {
  if (fresh.note !== "maybe" && (fresh.value !== "" || fresh.choices.length > 0 || fresh.note !== null)) return fresh;
  const kept = wasItem !== null && item !== null && wasItem !== item ? SAW_EMPTY : was;
  if (fresh.note === "maybe" && kept.value === "") return fresh;
  return { ...kept, limitWords: fresh.limitWords };
}

/**
 * A photo's tag (item 12), as the `fresh` state for `sawNext`: it fills an empty field, but never replaces a price the
 * shopper put there for the same item; then the field keeps theirs. A new item starts empty, so its tag fills it.
 */
export function sawTag(was: SawState, tag: Cents | null, wasItem: string | null, item: string | null): SawState {
  if (tag === null) return SAW_EMPTY;
  const kept = wasItem !== null && item !== null && wasItem !== item ? SAW_EMPTY : was;
  return kept.value === "" ? { ...SAW_EMPTY, value: fromCents(tag) } : { ...SAW_EMPTY, choices: [tag], note: "maybe" };
}

/** What the shopper typed in the field itself: a plain amount ("55", "$54.99", "1,299"), else not a price. */
export function sawField(text: string): { kind: "empty" } | { kind: "one"; cents: Cents } | { kind: "not-a-price" } {
  const t = text.trim().replace(/^\$\s*/, "");
  if (t === "") return { kind: "empty" };
  const m = new RegExp(String.raw`^(${DIGITS})(?:\.(\d{1,2}))?$`).exec(t);
  if (!m) return { kind: "not-a-price" };
  const cents = Number(m[1]!.replace(/,/g, "")) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 && cents <= MAX_SAW_CENTS ? { kind: "one", cents } : { kind: "not-a-price" };
}
