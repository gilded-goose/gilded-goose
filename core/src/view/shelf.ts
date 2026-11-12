// The Watch shelf (the Desk's slice 6; Joshua, Fri Oct 30): big cards for the concert ticket (the hero), the flight
// seat, the hotel night, the black jacket and the kettle, then anything else the shopper saved as a want. Each card says
// one short status line from Goose's real record: the same price watch the wants list runs (`watchPrice` on
// `offersFor`, the recorded fictional week on `BEAT_DAY`), against the shopper's own max and limits. The hero's intro is
// the ticket market's planted scam reseller, as the Watcher refused it. Pure: wants, catalog and Policy in, cards out.
// Every word is code's: the catalog's names, the Watcher's own reasons, cents from the record; never a seller's note.

import { fromCents, type Cents, usd } from "../money.ts";
import type { Catalog } from "../trust/catalog.ts";
import { categoryLimitFor, type Policy } from "../trust/policy.ts";
import { watchPrice, type WatchKind, type WatchedOffer } from "../trust/pricewatch.ts";
import { verdictOf } from "../trust/watch.ts";
import { DEMO_ENTRY, demoCatalog } from "../scenario.ts";
import { BEAT_DAY, offersFor, watchedWant } from "../ask/watching.ts";
import { LADDER_BEAT, marketName, refusedFor } from "../ask/ladder-words.ts";
import { ITEM_WORDS } from "../ask/shops.ts";
import { byPriority, type Priority, type SavedWant } from "../ask/wants.ts";

/** Which original drawing a card shows (inline SVG in the page; no photo, no brand). "asked" is a want's own card. */
export type ShelfArt = "ticket" | "flight" | "hotel" | "jacket" | "kettle" | "asked";

/** Joshua's five, in his order; the ticket is the hero. The black jacket is the Harbor jacket (the one with a look-alike). */
export const SHELF: readonly { catalogId: string; art: ShelfArt; color?: string }[] = [
  { catalogId: "marsh-lights-ticket", art: "ticket" },
  { catalogId: "gullwing-seat", art: "flight" },
  { catalogId: "mossbell-night", art: "hotel" },
  { catalogId: "harbor-jacket", art: "jacket", color: "black" },
  { catalogId: DEMO_ENTRY, art: "kettle" },
];
export const HERO_ID = "marsh-lights-ticket";

/** The shelf's honesty label, shown with it. */
export const SHELF_SAID = "Fictional sellers and recorded prices. Watching never buys: only your tap in PayPal pays.";
/**
 * Said with the hero's intro only, and about Joshua's five only: check-claims holds it to the record (each has exactly
 * one). Her own wants' cards may have none (a yellow Tidewater jacket's one listing is cleared), so it never names them.
 */
export const PLANTED_SAID = "Each of these five markets has one planted scam seller.";

export interface ShelfCard {
  catalogId: string;
  title: string;
  art: ShelfArt;
  hero: boolean;
  /** The shopper saved this as a want, so the card reads her max; otherwise the catalog's suggested max. */
  mine: boolean;
  kind: WatchKind;
  /** One short line from the record. */
  status: string;
  /** Goose set a seller aside here: the screen's gold "you're protected" moment. */
  protect: boolean;
  /** Where the prices came from, said on the card so a recorded price never reads as live. */
  when: string;
  /** The price `status` leads with, so a screen can set it large; null when the line leads with no price of hers. */
  price: Cents | null;
  /** `status` after that price ("at Lantern Hall Box Office (fictional), $6.00 under …"), or all of it. */
  after: string;
  /** Why Goose set a seller aside, in the ladder's one clause ("it asked for a gift card"); null when none was. */
  aside: string | null;
  /** Her price on this card (the catalog's suggestion until she saves one), never over her limit. */
  max: Cents;
  priority: Priority;
}

/** The hero's intro: the ticket market's planted scam reseller, in the Watcher's words. */
export interface ShelfIntro { catalogId: string; seller: string; total: Cents; line: string; planted: string }

export interface Shelf { intro: ShelfIntro | null; cards: ShelfCard[]; said: string }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const suggested = (id: string): Cents | undefined => demoCatalog().find((e) => e.id === id)?.want.maxPrice;
const refuses = (o: WatchedOffer) => o.flags !== null && verdictOf(o.flags) === "refuse";
const cheapest = (os: readonly WatchedOffer[]) => os.reduce<WatchedOffer | undefined>((a, o) => (a === undefined || o.total < a.total ? o : a), undefined);
/** The Watcher's own reasons for refusing, joined ("it asks to be paid by gift card"). */
const reasons = (o: WatchedOffer) => (o.flags ?? []).filter((f) => f.severity === "refuse").map((f) => f.said).join(" and ");

/** The sellers the Watcher refused in one shelf market, from the record, cheapest first. */
export function plantedIn(catalogId: string, day: number = BEAT_DAY): WatchedOffer[] {
  const s = SHELF.find((x) => x.catalogId === catalogId);
  const want: SavedWant = { catalogId, priority: "nice", max: suggested(catalogId) ?? 0, ...(s?.color ? { color: s.color } : {}), at: 0 };
  return offersFor(want, day).filter(refuses).sort((a, b) => a.total - b.total);
}

/** The hero's intro, or null if the record has no refused seller for the ticket (then the screen shows none). */
export function shelfIntro(day: number = BEAT_DAY): ShelfIntro | null {
  const o = plantedIn(HERO_ID, day)[0];
  if (!o) return null;
  return { catalogId: HERO_ID, seller: o.name, total: o.total, line: `${o.name} offered the ticket for ${usd(o.total)}, but ${reasons(o)}. Goose set it aside.`, planted: PLANTED_SAID };
}

/** Where a want's prices came from, said so a recorded price never reads as live. */
export const whenFor = (catalogId: string, day: number): string => (catalogId === DEMO_ENTRY ? `${cap(marketName(LADDER_BEAT.seed))}, opening asks` : `Simulated day ${day + 1}, totals with fees and taxes`);

function card(w: SavedWant, art: ShelfArt, hero: boolean, mine: boolean, catalog: Catalog, policy: Policy, day: number): ShelfCard | null {
  const e = catalog.get(w.catalogId);
  const ww = watchedWant(w, catalog, policy);
  if (!e || !ww) return null;
  const offers = offersFor(w, day);
  const p = watchPrice(ww, offers, policy);
  const limit = categoryLimitFor(policy, e.category);
  // Whose max this is, said plainly: the limit when it binds, her saved max, or the catalog's suggestion.
  // A category she set no limit for is held to her strictest one (`categoryLimitFor`), and the line says so.
  const lim = Object.hasOwn(policy.categoryLimit, e.category) ? `your ${usd(p.max)} ${e.category} limit` : `your strictest limit (${usd(p.max)})`;
  const whose = w.max > limit ? lim : mine ? `your ${usd(p.max)} max` : `the suggested ${usd(p.max)} max`;
  const o = p.offer;
  const set = cheapest(offers.filter((x) => refuses(x) && x.total <= p.max));
  let status: string;
  if (p.kind === "under" && o) status = `${usd(o.total)} at ${o.name}, ${o.total === p.max ? "right at" : `${usd(p.max - o.total)} under`} ${whose}.`;
  else if (p.kind === "held" && o) status = `${usd(o.total)} at ${o.name}, under ${whose}. It waits for your yes.`;
  else if (p.kind === "close" && o) status = `${usd(o.total)} at ${o.name}, ${usd(o.total - p.max)} over ${whose}. Still watching.`;
  else if (p.kind === "refused" && set) status = `Goose set aside ${set.name} at ${usd(set.total)}. Still watching for ${usd(p.max)} or less.`;
  else {
    const low = cheapest(offers.filter((x) => x.flags !== null && verdictOf(x.flags) === "clear"));
    status = low ? `Not set aside, lowest: ${usd(low.total)} at ${low.name}. Watching for ${usd(p.max)} or less.` : `Watching for ${usd(p.max)} or less.`;
  }
  const price = o && p.kind !== "refused" && status.startsWith(`${usd(o.total)} `) ? o.total : null;
  const words = ITEM_WORDS[w.catalogId] ?? e.item;
  return {
    catalogId: w.catalogId, title: cap(w.color ? `${w.color} ${words}` : words), art, hero, mine, kind: p.kind, status,
    protect: p.kind === "refused", when: whenFor(w.catalogId, day), max: p.max, priority: w.priority,
    price, after: price === null ? status : status.slice(usd(price).length + 1), aside: p.kind === "refused" && set ? refusedFor(set.flags!) : null,
  };
}

/**
 * The shelf for one shopper: Joshua's five (her own want for an item replaces the shelf's default, color and all), then
 * her other wants, "really want" first. No session: the demo's Policy and no wants.
 */
export function shelfFor(wants: readonly SavedWant[], catalog: Catalog, policy: Policy, day: number = BEAT_DAY): Shelf {
  const fixed = SHELF.flatMap((s) => {
    const own = wants.find((w) => w.catalogId === s.catalogId);
    const w: SavedWant = own ?? { catalogId: s.catalogId, priority: "nice", max: suggested(s.catalogId) ?? 0, ...(s.color ? { color: s.color } : {}), at: 0 };
    const c = card(w, s.art, s.catalogId === HERO_ID, own !== undefined, catalog, policy, day);
    return c ? [c] : [];
  });
  const asked = byPriority(wants.filter((w) => !SHELF.some((s) => s.catalogId === w.catalogId)))
    .flatMap((w) => { const c = card(w, "asked", false, true, catalog, policy, day); return c ? [c] : []; });
  return { intro: shelfIntro(day), cards: [...fixed, ...asked], said: SHELF_SAID };
}
