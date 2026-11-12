// "Here's what I understood." (Joshua, Oct 30, the Desk as an app): before Goose shops, the shopper's words become a
// card of what code read in them: the item, any color or size, and the limit her cart will be held to and why. Code
// reads the words with fixed tables, no model. The words stay the one source: the market is still made from them, and
// taking a color or size off the card hands back the words without it (`without`), which are what Goose then shops for.
// A price in the words is shown back but never becomes a limit. Track H-3 (Round 3 consumer, worst moment 2): a cap she
// said ("under 80 dollars", "nothing over 40", `spokenCap`) can only LOWER what this ask's cart is held to: `held` is the
// lower of her cap and the category's limit in code, the line says both when they differ, and the item is read without
// the cap's words. No words raise a limit. Pure: words and her Policy in, a card out; nothing is kept.

import { fromCents } from "../money.ts";
import type { Policy } from "../trust/policy.ts";
import { DEMO_CLOTHING } from "../scenario.ts";
import { marketCategory, marketWords } from "./fictional-market.ts";
import { recordedMarket } from "./recorded-market.ts";
import { capLine, heldTo, spokenCap, spokenCaps } from "./cap.ts";

/** One color or size code read in the words, and the words without it (what Goose shops for if she takes it off). */
export interface Detail { kind: "color" | "size"; label: string; without: string }

export interface Understood {
  /** What Goose will shop for: the recorded item's own name, or her words without the price, details and filler. */
  item: string;
  details: Detail[];
  /** A price her words named ("under $90"), shown back as hers; it sets nothing. */
  said: string | null;
  /** The limit her cart is held to, in dollars, its category, and why, in `marketCategory`'s fixed words. */
  limit: string;
  category: string;
  why: string;
  /** `why` without its first clause (the category and amount the card already shows): "Set for this demo, because…". */
  because: string;
  /** The cap her words said ("under 80 dollars" → "80.00"), or null. The page sends it back as the cart's `maxPrice`. */
  cap: string | null;
  /** What this ask's cart is held to, in dollars: the lower of her cap and the limit. Never above `limit`. */
  held: string;
  /** Whose number `held` is: "your cap" when her cap is lower, else "your Other limit". */
  heldBy: string;
  /** The understood line (`capLine`), one sentence beside the big number: "Your Other limit in code stays $150.00." */
  line: string;
  /** Her words without the cap's words, as the run's title (DD H-4 nit): "a desk lamp for my dorm". With no cap, her words. */
  title: string;
}

const COLORS = ["black", "white", "red", "blue", "green", "yellow", "orange", "purple", "pink", "brown", "grey", "gray", "navy", "beige", "cream", "gold", "silver", "teal", "maroon", "olive", "tan", "ivory", "charcoal", "burgundy"];
const COLOR_RE = new RegExp(`\\b(?:in\\s+)?(${COLORS.join("|")})\\b`, "gi");
const NEGATED = /\b(?:not|no|without|except|never|nor)\s+(?:\w+\s+)?$/i;
/** "size 9", "size M"; XS, XL and XXL alone; small, medium or large only for clothing ("a large kettle" is no size). */
const SIZE_RE = /\b(?:in\s+)?size\s+(\d{1,2}(?:\.5)?|xxs|xs|s|m|l|xl|xxl|small|medium|large)\b|\b(xxs|xs|xl|xxl)\b/gi;
const WORD_SIZE_RE = /\b(?:in\s+)?(small|medium|large)\b/gi;
/** "black and white": two colors joined are the item's pattern, not one color chip. */
const PAIRED = new RegExp(`\\b(?:${COLORS.join("|")})\\s+(?:and|&)\\s+(?:${COLORS.join("|")})\\b`, "gi");
const PRICE_RE = /(?:\b(?:under|below|less than|at most|up to|max(?:imum)?|around|about|for)\s+)?(?:\$\s?\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*(?:\.\d{1,2})?\s?(?:dollars|bucks|usd)\b)/i;
const FILLER = /^(?:please\s+)?(?:i\s+(?:really\s+)?(?:want|need)|i(?:'d| would) like|(?:i'm\s+)?looking for|find me|get me|show me|buy me|can you find(?: me)?)\s+/i;

// A cut cap's own punctuation goes with it (Track T, Nov 5): "…Saturday, under $90." was "…Saturday, ." and headed the
// run "…Saturday,". Her end mark stays; the separator before the cap doesn't.
const tidy = (s: string): string => s.replace(/\s{2,}/g, " ").replace(/\s*[,;:–—-]+\s*([.!?]+)$/, "$1").replace(/\s+([.!?]+)$/, "$1").replace(/^[\s,;]+|[\s,;:–—-]+$/g, "").replace(/\s+(?:in|and|with|,)$/i, "").trim();
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const sizeLabel = (v: string): string => `Size ${/^\d/.test(v) ? v : /^(small|medium|large)$/i.test(v) ? cap(v.toLowerCase()) : v.toUpperCase()}`;

/** Each match of `re` in the words, with its span, unless a negator stands just before it ("not black"). */
function spans(words: string, re: RegExp): Array<{ text: string; value: string; at: number }> {
  return [...words.matchAll(re)].filter((m) => !NEGATED.test(words.slice(0, m.index))).map((m) => ({ text: m[0], value: (m[1] ?? m[2])!, at: m.index! }));
}
const cut = (words: string, at: number, text: string): string => tidy(`${words.slice(0, at)} ${words.slice(at + text.length)}`);

/** The card for these words under her Policy. Its limit is the one her cart is held to: the same words the server
 *  places the market by (a recorded item's own name, else her words), so the card and the cart can't disagree. */
export function understand(raw: string, policy: Policy): Understood {
  const words = marketWords(raw);
  const rec = recordedMarket(words);
  const place = marketCategory(rec ? rec.market.words : words, [], policy);
  const found: Array<{ d: Detail; at: number; text: string }> = [];
  const add = (kind: Detail["kind"], label: string, s: { text: string; at: number }) => {
    if (found.some((f) => f.d.kind === kind)) return; // one of each: a second color is part of the item ("black and white")
    found.push({ d: { kind, label, without: cut(words, s.at, s.text) }, at: s.at, text: s.text });
  };
  const paired = [...words.matchAll(PAIRED)].map((m) => [m.index!, m.index! + m[0].length] as const);
  for (const s of spans(words, COLOR_RE)) if (!paired.some(([a, b]) => s.at + s.text.length > a && s.at < b)) add("color", cap(s.value.toLowerCase()), s);
  for (const s of spans(words, SIZE_RE)) add("size", sizeLabel(s.value), s);
  if (place.category === DEMO_CLOTHING) for (const s of spans(words, WORD_SIZE_RE)) add("size", sizeLabel(s.value), s);
  const price = PRICE_RE.exec(words);
  let item = rec ? rec.market.item.replace(/\s*\(fictional\)$/, "") : words;
  if (!rec) {
    // Cut from the end first, so earlier spans keep their places.
    // A cap's words and a price's may overlap ("under 80 dollars" is both), so the spans are joined before cutting.
    const cutAt = [...found, ...(price ? [{ at: price.index, text: price[0] }] : []), ...spokenCaps(words)].map((c) => [c.at, c.at + c.text.length] as [number, number]).sort((a, b) => a[0] - b[0]);
    const joined = cutAt.reduce<Array<[number, number]>>((acc, [a, b]) => { const last = acc.at(-1); if (last && a <= last[1]) last[1] = Math.max(last[1], b); else acc.push([a, b]); return acc; }, []);
    for (const [a, b] of joined.reverse()) item = `${item.slice(0, a)} ${item.slice(b)}`;
    item = tidy(tidy(item).replace(FILLER, "").replace(/^(?:for\s+)?(?:a|an|the|some)\s+/i, ""));
  }
  const details = found.map((f) => f.d);
  // Her cap, read from her own words (never the recorded item's name), held under the limit: it only ever lowers.
  const spoken = spokenCap(words);
  const category = cap(place.category);
  const held = heldTo(place.limit, spoken?.cents);
  return {
    item: cap(item || words), details, said: price ? price[0].replace(/\s+/g, " ").toLowerCase() : null, limit: fromCents(place.limit), category, why: place.why, because: cap(place.why.replace(/^.*? limit \$[\d,.]+, /, "")),
    title: spokenCaps(words).reverse().reduce((t, c) => tidy(`${t.slice(0, c.at)} ${t.slice(c.at + c.text.length)}`), words) || words,
    cap: spoken ? fromCents(spoken.cents) : null, held: fromCents(held), heldBy: held < place.limit ? "your cap" : `your ${category} limit`, line: capLine(spoken?.cents ?? null, place.limit, category),
  };
}
