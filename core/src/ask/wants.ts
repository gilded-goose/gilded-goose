// The wants list (Nov 4–7, 021 §4; wednesday-restart §1, §9 A4, §11A): what the shopper is waiting for, each want a
// catalog entry, a max and a two-value priority, "really want" or "nice to have". Joshua's original priority score.
// - A want's max is the shopper's category limit or lower, never higher (`checkWant` refuses more; `wantMax` clamps a
//   want saved under a bigger limit to today's). Goose never raises a max: only Settings raises a limit.
// - The words set the priority only (`saveIntent`, a plain rule: no model reads it), never a price, a quantity or a buy.
//   A save says what it saved, in fixed words, and every want is on screen with one tap to remove it.
// - Seller text never writes one: the only writers are the shopper's own Ask words and the wallet's taps (DemoShoppers'
//   `setWant`/`removeWant`), and a want is rebuilt field by field from fixed values, so nothing a seller wrote is kept.
// - Waiting for a deal is all a want does here: nothing in it can start a run, bind a cart or pay.
// - A gift (Joshua, Nov 3, 4d) adds three fixed values: a priority 1 to 5, a "needed by" day and who it's for, picked from a
//   list. No name is ever typed, so no family member's name reaches Goose's server.

import type { Catalog } from "../trust/catalog.ts";
import type { Chip } from "../trust/chips.ts";
import { categoryLimitFor, type Policy } from "../trust/policy.ts";
import { fromCents, type Cents, usd, usdOf } from "../money.ts";
import { LIMITS_PLACE } from "./copy.ts";

export type Priority = "really" | "nice";
/** A Record, so a third priority can't be added without its words. */
export const PRIORITY_WORDS: Readonly<Record<Priority, string>> = { really: "Really want", nice: "Nice to have" };
const RANK: Readonly<Record<Priority, number>> = { really: 0, nice: 1 };

export type Rank = 1 | 2 | 3 | 4 | 5;
export const RANKS: readonly Rank[] = [5, 4, 3, 2, 1];
export const FOR_WHO = ["Me", "Mom", "Dad", "Partner", "Sister", "Brother", "Kid", "Grandparent", "Friend", "Coworker", "Someone else"] as const;
export type ForWho = (typeof FOR_WHO)[number];
/** Decided by default: 5 is the most wanted, and 4 or 5 reads as "really want". Flip if Joshua says: 1 is the top. */
const priorityOfRank = (r: Rank): Priority => (r >= 4 ? "really" : "nice");
/** A want's 1 to 5: its own, or what its two-value priority means when it was saved by words. */
export const rankOf = (w: { rank?: Rank; priority: Priority }): Rank => w.rank ?? (w.priority === "really" ? 4 : 2);

/** One saved want, every field a fixed value: an entry id the catalog has, a priority, whole cents, a catalog color, a clock time, a day, a pick from FOR_WHO. */
export interface SavedWant { catalogId: string; priority: Priority; max: Cents; color?: string; at: number; rank?: Rank; neededBy?: string; forWho?: ForWho }

/** What a body or a stored record may ask for: rebuilt from these keys only, each checked; anything else is dropped. */
export type WantCheck = { ok: true; want: SavedWant } | { ok: false; error: string };

export const WANT_NOT_IN_CATALOG = "That isn't in the catalog, so it can't be a want.";
export const WANT_BAD_PRIORITY = "A want is either “Really want” or “Nice to have”.";
export const WANT_BAD_MAX = "A want's max is a whole number of cents above zero.";
export const WANT_BAD_COLOR = "That color isn't one this item comes in.";
export const WANT_BAD_RANK = "A priority is a whole number from 1 to 5.";
export const WANT_BAD_DAY = "A “needed by” is a real day, today or later, within two years.";
export const WANT_BAD_WHO = "Pick who it's for from the list.";
export const wantOverLimit = (limit: Cents) => `A want's max can't be over your ${usd(limit)} limit. Only you can raise a limit, in ${LIMITS_PLACE}.`;

const catalogColors = (catalog: Catalog, id: string): readonly string[] => catalog.get(id)?.attributes?.color ?? [];

/**
 * One want, checked against the catalog and today's Policy: the entry must exist, the priority is one of two, the max
 * (when given) is whole cents above zero and at most the category's limit; left out, it is that limit. Over the limit is
 * refused, never clamped, so the shopper sees why. `at` is the caller's clock.
 */
export function checkWant(raw: unknown, catalog: Catalog, policy: Policy, at: number): WantCheck {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const id = r.catalogId;
  const entry = typeof id === "string" ? catalog.get(id) : undefined;
  if (typeof id !== "string" || !entry) return { ok: false, error: WANT_NOT_IN_CATALOG };
  if (r.rank !== undefined && !RANKS.includes(r.rank as Rank)) return { ok: false, error: WANT_BAD_RANK };
  const rank = r.rank as Rank | undefined;
  const priority = rank !== undefined ? priorityOfRank(rank) : r.priority;
  if (priority !== "really" && priority !== "nice") return { ok: false, error: WANT_BAD_PRIORITY };
  if (r.neededBy !== undefined && !isNeededBy(r.neededBy, at)) return { ok: false, error: WANT_BAD_DAY };
  if (r.forWho !== undefined && !FOR_WHO.includes(r.forWho as ForWho)) return { ok: false, error: WANT_BAD_WHO };
  const limit = categoryLimitFor(policy, entry.category);
  const max = r.max === undefined ? limit : r.max;
  if (typeof max !== "number" || !Number.isSafeInteger(max) || max <= 0) return { ok: false, error: WANT_BAD_MAX };
  if (!(max <= limit)) return { ok: false, error: wantOverLimit(limit) };
  if (r.color !== undefined && (typeof r.color !== "string" || !catalogColors(catalog, id).includes(r.color))) return { ok: false, error: WANT_BAD_COLOR };
  return { ok: true, want: { catalogId: id, priority, max, ...(r.color !== undefined ? { color: r.color } : {}), at, ...(rank !== undefined ? { rank } : {}), ...(r.neededBy !== undefined ? { neededBy: r.neededBy as string } : {}), ...(r.forWho !== undefined ? { forWho: r.forWho as ForWho } : {}) } };
}

const DAY_MS = 86_400_000;
/** A real calendar day as YYYY-MM-DD, not before `at`'s own UTC day and at most two years on. */
function isNeededBy(v: unknown, at: number): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== v) return false;
  return t >= Math.floor(at / DAY_MS) * DAY_MS && t <= at + 731 * DAY_MS;
}

/** The max Goose waits for today: the want's own, never above the category's limit as it is now (a limit lowered since). */
export function wantMax(w: SavedWant, catalog: Catalog, policy: Policy): Cents {
  return Math.min(w.max, categoryLimitFor(policy, catalog.get(w.catalogId)?.category));
}

/** "Really want" first, then "nice to have"; inside each, the newest saved first. A copy; the input is untouched. */
export function byPriority<T extends { priority: Priority; at: number }>(wants: readonly T[]): T[] {
  return [...wants].sort((a, b) => RANK[a.priority] - RANK[b.priority] || b.at - a.at);
}

/**
 * Waiting deals in the order the shopper's wants rank them (`want_priority_orders_the_waiting_deals`): a deal for a
 * "really want" first, then a "nice to have", then one no want names; inside a rank, the order they came in. For the
 * price watch (§15A: "really want" first) to show them by.
 */
export function dealsByWant<D extends { catalogId: string }>(deals: readonly D[], wants: readonly SavedWant[]): D[] {
  const rank = (d: D) => { const w = wants.find((x) => x.catalogId === d.catalogId); return w ? RANK[w.priority] : 2; };
  return deals.map((d, i) => ({ d, i, r: rank(d) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.d);
}

/** One want as the wallet shows it: every word is code's (the catalog's item name, fixed labels, cents from the record). */
/** `line` says the max; on the wallet, the price watch's line replaces it when the watch has one (`watchedCards`). */
export interface WantCard { catalogId: string; item: string; priority: Priority; label: string; max: string; limit: string; line: string }

export const wantLine = (max: string, limit: string) => (max === limit ? `Your max: ${usdOf(max)}, your limit.` : `Your max: ${usdOf(max)}, under your ${usdOf(limit)} limit.`);

export function wantCards(wants: readonly SavedWant[], catalog: Catalog, policy: Policy): WantCard[] {
  return byPriority(wants).flatMap((w) => {
    const e = catalog.get(w.catalogId);
    if (!e) return [];
    const max = fromCents(wantMax(w, catalog, policy));
    const item = w.color ? `${w.color} ${e.item}` : e.item;
    return [{ catalogId: w.catalogId, item: item.charAt(0).toUpperCase() + item.slice(1), priority: w.priority, label: PRIORITY_WORDS[w.priority], max, limit: fromCents(categoryLimitFor(policy, e.category)), line: wantLine(max, fromCents(categoryLimitFor(policy, e.category))) }];
  });
}

// ---------- the save intent: the shopper's words → a priority, or nothing (transient; the words are never kept) ----------

const fold = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[’‘]/g, "'");
const NEGATORS = /\b(?:not|no|never|don't|dont|do not|doesn't|didn't|won't|wouldn't|no longer|nor)\b/;

// "really want", said many ways (§8.2's stranger wording): really (really) want/need/love/like, must-have, dying for,
// top or high priority, want it so bad.
const REALLY = [
  /\breally(?:,?\s+really)*\s+(?:want|need|love|like)\b/,
  /\bmust[\s-]?have\b/,
  /\bdying\s+(?:for|to\s+get)\b/,
  /\b(?:top|high|highest|first)\s+priority\b/,
  /\bwant\s+(?:it|this|that|one|them)\s+(?:so\s+)?bad(?:ly)?\b/,
  /\bneed\s+(?:it|this|that|one)\s+(?:so\s+)?bad(?:ly)?\b/,
];
// "nice to have", or a plain save: I like this, save it, add it to my wants, keep an eye on it, no rush, someday.
const NICE = [
  /\bnice\s+to\s+have\b/,
  /\bwould\s+be\s+nice\b/,
  /\blow\s+priority\b/,
  /\bno\s+rush\b/,
  /\bsome\s?day\b/,
  // "I like this (kettle)", never "I like a good deal": only a pointing word saves.
  /\bi\s+(?:really\s+)?(?:like|love)\s+(?:it|this|that|these|those)\b/,
  /\bi'?d\s+like\s+(?:it|this|that|one)\s+(?:someday|eventually|one\s+day)\b/,
  /\b(?:save|add|put|keep)\s+(?:it|this|that|one|them|the\s+\p{L}+)?\s*(?:to|on|in)\s+(?:my\s+)?(?:wants?|wish\s?list|wants?\s+list|list)\b/u,
  /\bsave\s+(?:it|this|that|one|them)\b/,
  /\bkeep\s+an\s+eye\s+(?:on|out)\b/,
];

/** True when a negator sits in the same clause just before the match ("I don't really want it", "not a must-have"). */
function negated(clause: string, at: number): boolean {
  const before = clause.slice(0, at).split(/\s+/).filter(Boolean).slice(-3).join(" ");
  return NEGATORS.test(before);
}

function said(words: string, patterns: readonly RegExp[]): boolean {
  for (const clause of fold(words).split(/[,.;:!?\n]+|\bbut\b/)) {
    for (const p of patterns) {
      const m = new RegExp(p.source, p.flags.includes("g") ? p.flags : `${p.flags}g`);
      for (const hit of clause.matchAll(m)) if (!negated(clause, hit.index)) return true;
    }
  }
  return false;
}

/**
 * The save intent: "really" when the words say they really want it, "nice" when they say to save it (or like it) without
 * that, else null (an ordinary Ask). Negated in its clause, it doesn't count. A priority is all it ever returns: the
 * words' price, quantity and "buy it now" are read by nothing here.
 */
export function saveIntent(words: string): Priority | null {
  if (said(words, REALLY)) return "really";
  if (said(words, NICE)) return "nice";
  return null;
}

/** What an Ask that asked to save says back, in fixed words. */
export type WantReply = { saved: true; catalogId: string; priority: Priority; words: string } | { saved: false; words: string };
export const WANT_WHICH = "Say which item to save, like “I really want the kettle”. Nothing was saved.";
export const WANT_NEEDS_SERVER = "Saving a want needs Goose's server, and it isn't answering here. Nothing was saved.";
/** R-13: the same ask while she is offline: her network is the cause the code saw, never the server. */
export const WANT_OFFLINE = "You're offline, so this want wasn't saved. Ask again once you're back.";
export const WANT_NO_SPEND = "Saving never buys: only your tap in PayPal pays.";
export const wantSavedWords = (item: string, priority: Priority) => `Saved to your wants: ${item}, ${PRIORITY_WORDS[priority].toLowerCase()}. ${WANT_NO_SPEND}`;

/** The item an Ask names: its chips' item, else (an "it") the item the session's last chips named. */
export function wantItem(chips: readonly Chip[], last: readonly Chip[]): string | null {
  return chips.find((c) => c.kind === "item")?.value ?? last.find((c) => c.kind === "item")?.value ?? null;
}

/** Where this server keeps wants (the Turso store, retrying a write, unreachable, or this process only), said plainly. */
export type WantsKept = "turso" | "retrying" | "unreachable" | "memory";
export const WANTS_KEPT: Readonly<Record<WantsKept, string>> = {
  turso: "Kept for this browser on Goose's server; a week with no change clears them.",
  retrying: "Goose's server is retrying a save, so a restart right now could lose your newest change.",
  unreachable: "Goose's store isn't reachable, so your wants are kept only until the server restarts.",
  memory: "This server keeps your wants in memory only, so a restart clears them.",
};
export const WANT_CAPPED = "Today's asks from here are used up on Goose's server, so nothing was saved.";
