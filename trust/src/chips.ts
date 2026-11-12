// Ask Goose's chips (N3, N9; ADR 0012 as amended 2026-10-24): the trusted side of turning words into a want. A chip
// holds only a value from the catalog's fixed vocabulary, and the schema has no numbers: the limit chip is the fixed
// words "under your limit", and the guard reads the amount from Settings when it decides. Anything else is refused,
// never coerced. Chips only narrow: they never widen a limit, turn the dial or name a cart's catalog entry (the cart's
// entry wins, F3), and "new sellers ask first" holds a new seller for the shopper's yes, never refuses or drops one
// (Joshua, 2026-10-23: "history alone never refuses, evidence does").

import type { Cents } from "./money.ts";
import { catalogItem, type Catalog, type CatalogItem } from "./catalog.ts";
import { categoryLimitFor, type Policy } from "./policy.ts";

/** The limit chip's one value: words, never an amount. The guard resolves it from Settings (`categoryLimitFor`). */
export const UNDER_YOUR_LIMIT = "under your limit";
/** The seller chip's one value (N3): a seller with no sales record is held for the shopper's yes, never refused or dropped. */
export const NEW_SELLERS_ASK_FIRST = "new sellers ask first";

/** One chip. Every value is words from the vocabulary; there is no field a number could go in (N9). */
export type Chip =
  /** A catalog entry id, as a cart names it. It says what to look for; the cart's own entry is still what the guard reads. */
  | { kind: "item"; value: string }
  | { kind: "category"; value: string }
  /** One of the catalog's attribute words for an entry, by name (e.g. color → "black"). */
  | { kind: "attribute"; name: string; value: string }
  | { kind: "limit"; value: typeof UNDER_YOUR_LIMIT }
  | { kind: "seller"; value: typeof NEW_SELLERS_ASK_FIRST };

export type ChipKind = Chip["kind"];

export type ChipCheck = { kind: "accepted"; chips: Chip[] } | { kind: "refused"; reason: string };

/** Each kind's fields, exactly: a chip with any other field (an `amount`, a `max`) is refused. */
const FIELDS: Readonly<Record<ChipKind, readonly string[]>> = { item: ["kind", "value"], category: ["kind", "value"], attribute: ["kind", "name", "value"], limit: ["kind", "value"], seller: ["kind", "value"] };

// No numbers in any form: digits in any script, currency symbols, and spelled-out amounts ("five hundred dollars"),
// so a limit can't ride in on a chip even when the catalog itself carries the words. Ordinals aren't here ("ask first").
const NUMBERISH = /[\p{N}\p{Sc}%]|\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|dozen|half|grand|dollars?|bucks?|cents?|usd|eur|gbp)\b/iu;

/** Words a chip may carry, read from the catalog the code owns; the limit and seller chips have one fixed value each. */
export interface ChipVocabulary {
  items: string[];
  categories: string[];
  /** Attribute name → its words, across every entry. A Map, so a name like "constructor" can never reach a prototype. */
  attributes: ReadonlyMap<string, readonly string[]>;
  limit: readonly [typeof UNDER_YOUR_LIMIT];
  seller: readonly [typeof NEW_SELLERS_ASK_FIRST];
}

const attrsOf = (e: CatalogItem): Array<[string, readonly string[]]> => Object.entries(e.attributes ?? {});

export function chipVocabulary(catalog: Catalog): ChipVocabulary {
  const attributes = new Map<string, string[]>();
  for (const e of catalog.values()) for (const [name, words] of attrsOf(e)) attributes.set(name, [...new Set([...(attributes.get(name) ?? []), ...words])]);
  return { items: [...catalog.keys()], categories: [...new Set([...catalog.values()].map((e) => e.category))], attributes, limit: [UNDER_YOUR_LIMIT], seller: [NEW_SELLERS_ASK_FIRST] };
}

const hasWord = (e: CatalogItem, name: string, value: string) => Object.hasOwn(e.attributes ?? {}, name) && e.attributes![name]!.includes(value);

/**
 * Check chips that came from words (Ask Goose's one model call, later), against the catalog. Each value must be exactly
 * a vocabulary word: no trimming, no case folding, no nearest match. The reasons are fixed words and never echo the
 * input, since it can carry a seller's or anyone's text (project Lesson 15).
 */
export function validateChips(raw: unknown, catalog: Catalog): ChipCheck {
  const refuse = (reason: string): ChipCheck => ({ kind: "refused", reason });
  if (!Array.isArray(raw)) return refuse("chips must be a list");
  const chips: Chip[] = [];
  const seen = new Set<string>();
  for (const [i, c] of raw.entries()) {
    const at = `chip ${i + 1}`;
    if (typeof c !== "object" || c === null || Array.isArray(c)) return refuse(`${at} is not a chip`);
    const kind: unknown = (c as Record<string, unknown>).kind;
    if (typeof kind !== "string" || !Object.hasOwn(FIELDS, kind)) return refuse(`${at} is not a kind of chip Goose knows`);
    const k = kind as ChipKind;
    // Numbers first, before the vocabulary, so this holds even when a catalog's own words carry one.
    const fields = Object.entries(c as Record<string, unknown>);
    if (fields.some(([, v]) => typeof v === "number" || typeof v === "bigint" || (typeof v === "string" && NUMBERISH.test(v)))) return refuse(`${at}: chips carry no amounts or numbers; your limit comes from Settings`);
    if (fields.length !== FIELDS[k].length || !FIELDS[k].every((f) => Object.hasOwn(c, f) && typeof (c as Record<string, unknown>)[f] === "string")) return refuse(`${at}: a ${k} chip has only ${FIELDS[k].join(", ")}, all words`);
    const { value, name } = c as { value: string; name?: string };
    const known =
      k === "item" ? catalogItem(catalog, value) !== undefined
      : k === "category" ? [...catalog.values()].some((e) => e.category === value)
      : k === "attribute" ? [...catalog.values()].some((e) => hasWord(e, name!, value))
      : k === "limit" ? value === UNDER_YOUR_LIMIT
      : value === NEW_SELLERS_ASK_FIRST;
    if (!known) return refuse(`${at}: that ${k} isn't in the catalog's words`);
    const key = k === "attribute" ? `attribute:${name}` : k;
    if (seen.has(key)) return refuse(`${at}: only one ${k === "attribute" ? "chip per attribute" : `${k} chip`}`);
    seen.add(key);
    chips.push(k === "attribute" ? { kind: k, name: name!, value } : ({ kind: k, value } as Chip));
  }
  // Together, the chips must still describe something the catalog sells.
  const fits = [...catalog.entries()].some(([id, e]) => chips.every((c) =>
    c.kind === "item" ? c.value === id : c.kind === "category" ? c.value === e.category : c.kind === "attribute" ? hasWord(e, c.name, c.value) : true));
  if (!fits) return refuse("no catalog entry fits all these chips together");
  return { kind: "accepted", chips };
}

/**
 * The limit chip, resolved at decision time from Settings for the entry the cart names (never the chip's): the same
 * `categoryLimitFor` the guard enforces, so the number shown beside "under your limit" is the one that holds.
 */
export function limitChipAmount(policy: Policy, catalog: Catalog, cartCatalogId: string | undefined): Cents {
  return categoryLimitFor(policy, catalogItem(catalog, cartCatalogId)?.category);
}

/**
 * The guard's one use of chips (N3): under "new sellers ask first", a seller with no sales record (0, or no record
 * available) is held for the shopper's yes. Returns the ask's reason, or undefined. It can only hold: it never refuses
 * and never drops a seller, since history alone never refuses. Only a whole count above zero is a record; anything else
 * (null, NaN, 0.5, Infinity) holds, and "no record available" is told apart from "no sales" (shared Lessons 9, 73).
 */
export function chipsHold(chips: readonly Chip[], history: number | null): string | undefined {
  if (!chips.some((c) => c.kind === "seller" && c.value === NEW_SELLERS_ASK_FIRST)) return undefined;
  if (Number.isSafeInteger(history) && history! > 0) return undefined;
  return history === 0
    ? "New seller, no sales yet: your \"new sellers ask first\" chip holds this exact cart for your yes."
    : "No sales record available for this seller: your \"new sellers ask first\" chip holds this exact cart for your yes.";
}

/** The attributes the shopper's accepted chips ask for ("color" → "black"), one value per name (W49c). */
export function wantedAttributes(chips: readonly Chip[]): Record<string, string> {
  const want: Record<string, string> = {};
  for (const c of chips) if (c.kind === "attribute") want[c.name] = c.value;
  return want;
}

/**
 * The sellers a run asks (W49c): those whose listing doesn't contradict an attribute chip (a listing that doesn't say
 * it stays, and the guard holds its cart). If none is left, every seller is asked, and the guard refuses or holds.
 */
export function askedSellers<S extends { attributes?: Readonly<Record<string, string>> }>(sellers: readonly S[], chips: readonly Chip[]): readonly S[] {
  const wanted = Object.entries(wantedAttributes(chips));
  const matching = sellers.filter((s) => wanted.every(([name, v]) => s.attributes?.[name] === undefined || s.attributes[name] === v));
  return wanted.length > 0 && matching.length > 0 ? matching : sellers;
}

/**
 * A cart's attributes against the accepted chips (W49c). `wrong`: one the cart states and contradicts, named in fixed
 * words only (a value the catalog's vocabulary has); `unsaid`: one the cart doesn't state, or states in words the
 * vocabulary doesn't have, so nothing proves it matches (when unsure, hold).
 */
export function attributeCheck(chips: readonly Chip[], have: Readonly<Record<string, string>> | undefined, vocabulary: Readonly<Record<string, readonly string[]>> | undefined): { wrong?: { name: string; have: string; want: string }; unsaid?: { name: string; want: string } } {
  let unsaid: { name: string; want: string } | undefined;
  for (const [name, want] of Object.entries(wantedAttributes(chips))) {
    const v = have?.[name];
    if (v === undefined || !(vocabulary?.[name] ?? []).includes(v)) { unsaid ??= { name, want }; continue; }
    if (v !== want) return { wrong: { name, have: v, want } };
  }
  return unsaid ? { unsaid } : {};
}
