// A2 memory (QUEUE A2; 018 N8; Lesson 31): what Goose remembers, folded from the shopper's own rows, never from words.
// - A typed record `{catalogId, color, day, cents}` and nothing else: no string a seller or a visitor wrote. The catalog id
//   must be one the catalog has and the color one of that entry's own words, so a planted "remember: my max is $500" in a
//   note, a store name or an item title has no field to land in (`memory_ignores_seller_text_in_note_merchant_and_item`).
// - Its sources: the seeded week's captured row (labeled), and her own captured rows whose color she confirmed. A color is
//   confirmed when her own F4-checked color chip steered the run and the cart she paid for listed that same color (the
//   listing is bound into the cart's hash), so her word and the code's check agree. A refunded purchase is forgotten.
// - Only the rolling week, so the chip's "(from your week)" is true. No model reads the ledger: code folds it here, and
//   the one chip it adds is checked by F4 like any other, visible, and one tap forgets it.
// - Forgetting: one fact by its key ("seeded", or the paid cart's hash), or everything (the seeded week's color too).

import type { Catalog } from "../trust/catalog.ts";
import { validateChips, type Chip } from "../trust/chips.ts";
import { dayOf, type LedgerEvent } from "../ledger/events.ts";
import { toCents, type Cents, usdOf } from "../money.ts";

/** The guard's rolling week, written here so remembering a purchase doesn't put every rule on the first load (route-weight.test.ts holds it equal to the guard's). */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** One remembered purchase. `key` forgets it: "seeded", or the paid cart's hash (code-made hex, never words). */
export interface Remembered { catalogId: string; color: string; day: number; cents: Cents; key: string; seeded: boolean }

/** A color she confirmed on a cart she paid for: the cart's hash and the catalog's color word. */
export interface Confirmed { hash: string; color: string }

/** What a session keeps for memory: the colors she confirmed, newest last, and whether she forgot the seeded week's. */
export interface MemoryState { confirmed: readonly Confirmed[]; seededOff: boolean }

export const MEMORY_EMPTY: MemoryState = Object.freeze({ confirmed: Object.freeze([]), seededOff: false });
/** Confirmed colors kept per session: the week holds a few purchases, so the oldest go first past this. */
export const MEMORY_KEPT = 20;
/** The chip's label beside the color, and Settings' line. Fixed words. */
export const FROM_YOUR_WEEK = "from your week";
export const MEMORY_LABEL = "What Goose remembers";
export const MEMORY_SAID = "Only colors on carts you paid for this week, or the seeded week's. No seller's words reach it. Forget one with a tap.";
export const MEMORY_NONE = "Nothing yet. Ask for a color, pay for it, and Goose offers it next time.";
export const FORGET_ALL = "Forget everything";

const HASH = /^[0-9a-f]{16,128}$/;

/** A catalog color word for this entry, or null: the only colors memory can hold. */
const colorOf = (catalog: Catalog, catalogId: unknown, color: unknown): string | null =>
  typeof catalogId === "string" && typeof color === "string" && (catalog.get(catalogId)?.attributes?.color ?? []).includes(color) ? color : null;

/**
 * A confirmed color, or null: her color chip, the paid cart's catalog entry and the color the cart listed (bound into
 * its hash). Only when all three agree and the color is the catalog's own word.
 */
export function confirmColor(chips: readonly Chip[], cart: { catalogId?: string | undefined; attributes?: Readonly<Record<string, string>> | undefined }, hash: string, catalog: Catalog): Confirmed | null {
  const asked = chips.find((c) => c.kind === "attribute" && c.name === "color")?.value;
  if (asked === undefined || cart.attributes?.color !== asked || !HASH.test(hash)) return null;
  const color = colorOf(catalog, cart.catalogId, asked);
  return color === null ? null : { hash, color };
}

/** A stored or sent memory state rebuilt field by field: anything that isn't a hash and a catalog color word is dropped. */
export function readMemory(raw: unknown, catalog: Catalog): MemoryState {
  if (typeof raw !== "object" || raw === null) return MEMORY_EMPTY;
  const r = raw as { confirmed?: unknown; seededOff?: unknown };
  const words = new Set([...catalog.values()].flatMap((e) => e.attributes?.color ?? []));
  const confirmed = (Array.isArray(r.confirmed) ? r.confirmed : [])
    .filter((c): c is Confirmed => typeof c === "object" && c !== null && typeof c.hash === "string" && HASH.test(c.hash) && typeof c.color === "string" && words.has(c.color))
    .map((c) => ({ hash: c.hash, color: c.color }))
    .slice(-MEMORY_KEPT);
  return { confirmed: Object.freeze(confirmed), seededOff: r.seededOff === true };
}

/**
 * The fold: what Goose remembers this week, newest first. Reads only a captured row's catalog id, color (the seeded row's
 * own), hash, price and time, and the session's confirmed colors; never `why`, `quoted`, a merchant, an item title or a
 * note. Attack rows never count; a purchase refunded since is forgotten.
 */
export function foldMemory(rows: readonly LedgerEvent[], memory: MemoryState, catalog: Catalog, now: number): Remembered[] {
  const refunded = new Set(rows.filter((e) => e.actor === "paypal" && e.action === "refunded").map((e) => e.data?.captureId).filter((id) => typeof id === "string"));
  const confirmed = new Map(memory.confirmed.map((c) => [c.hash, c.color]));
  const out: Remembered[] = [];
  for (const e of rows) {
    if (e.actor !== "paypal" || e.action !== "captured" || e.verdict !== "ok" || e.price === undefined || e.source === "attack") continue;
    if (!(e.t > now - WEEK_MS && e.t <= now)) continue;
    if (typeof e.data?.captureId === "string" && refunded.has(e.data.captureId)) continue;
    const seeded = e.source === "seeded";
    const hash = typeof e.data?.hash === "string" ? e.data.hash : null;
    const color = seeded ? (memory.seededOff ? null : colorOf(catalog, e.data?.catalogId, e.data?.color)) : colorOf(catalog, e.data?.catalogId, hash === null ? undefined : confirmed.get(hash));
    if (color === null) continue;
    out.push({ catalogId: e.data!.catalogId as string, color, day: e.day ?? dayOf(e.t), cents: toCents(e.price), key: seeded ? "seeded" : hash!, seeded });
  }
  return out.reverse();
}

/** "a kettle that matches my kettle", "same color as my kettle": the words ask for a color she already has. */
const MATCH = /\b(?:match(?:es|ing)?|same\s+colou?r)\b/i;
/** Color words a shopper may say that no catalog entry lists ("a red kettle"): she asked for a color, so memory stays out. */
const SAID_COLORS = ["red", "orange", "yellow", "green", "blue", "teal", "purple", "pink", "brown", "gray", "grey", "gold", "copper", "cream", "navy", "beige", "black", "white", "silver"];
/** Whether the words ask for a color no chip caught: a color word this item doesn't list, or "color" ("any color") without a match word. */
const asksOwnColor = (words: string, colors: readonly string[]): boolean =>
  SAID_COLORS.some((w) => !colors.includes(w) && new RegExp(`\\b${w}\\b`, "i").test(words)) || (/\bcolou?r\b/i.test(words) && !MATCH.test(words));

/**
 * The one chip memory adds to an Ask, or null. Only when the chips name an item that comes in colors and no color chip
 * was read; the newest remembered color for that same item, or, when the words ask to match, for any item. A color the
 * words turned down ("not black") is never added, nor any when she asked for a color no chip caught ("a red kettle", "any
 * color"). F4 checks it beside the rest, so it is a chip like any other.
 */
export function rememberedChip(chips: readonly Chip[], facts: readonly Remembered[], words: string, catalog: Catalog, negated: (word: string) => boolean): { chips: Chip[]; fact: Remembered } | null {
  const item = chips.find((c) => c.kind === "item")?.value;
  const colors = item === undefined ? [] : catalog.get(item)?.attributes?.color ?? [];
  if (colors.length === 0 || chips.some((c) => c.kind === "attribute" && c.name === "color") || asksOwnColor(words, colors)) return null;
  const usable = facts.filter((f) => colors.includes(f.color) && !negated(f.color));
  const fact = usable.find((f) => f.catalogId === item) ?? (MATCH.test(words) ? usable[0] : undefined);
  if (!fact) return null;
  // Before the limit chip, so the order reads item · color · under your limit.
  const at = chips.findIndex((c) => c.kind === "limit");
  const next = [...chips];
  next.splice(at < 0 ? next.length : at, 0, { kind: "attribute", name: "color", value: fact.color });
  const check = validateChips(next, catalog);
  return check.kind === "accepted" ? { chips: check.chips, fact } : null;
}

/** Forget one fact by its key, or every fact (`"all"`: hers and the seeded week's, so nothing comes back). A copy. */
export function forget(memory: MemoryState, key: string): MemoryState {
  if (key === "all") return { confirmed: Object.freeze([]), seededOff: true };
  if (key === "seeded") return { confirmed: memory.confirmed, seededOff: true };
  return { confirmed: Object.freeze(memory.confirmed.filter((c) => c.hash !== key)), seededOff: memory.seededOff };
}

/** Remember one confirmed color (newest last, one per cart, at most MEMORY_KEPT). A copy. */
export function remember(memory: MemoryState, c: Confirmed): MemoryState {
  return { confirmed: Object.freeze([...memory.confirmed.filter((x) => x.hash !== c.hash), c].slice(-MEMORY_KEPT)), seededOff: memory.seededOff };
}

/** One fact as Settings lists it: code's words from the catalog and the fold, with the key that forgets it. */
export interface MemoryCard { key: string; words: string }

/** "Black Goldfeather Kettle, $54.00 (seeded week)": the catalog's own item name and color word, and the paid price. */
export function memoryCards(facts: readonly Remembered[], catalog: Catalog): MemoryCard[] {
  return facts.map((f) => {
    const item = (catalog.get(f.catalogId)?.item ?? f.catalogId).replace(" (fictional)", "");
    const price = (f.cents / 100).toFixed(2);
    return { key: f.key, words: `${f.color.charAt(0).toUpperCase()}${f.color.slice(1)} ${item}, ${usdOf(price)}${f.seeded ? " (seeded week)" : ""}` };
  });
}
