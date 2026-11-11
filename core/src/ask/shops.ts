// What a run shops (§15B): the kettle's market, and since part 2 the moving items (a ticket, a hotel night, a flight
// seat) at their posted totals (core/src/sellers/posted.ts). A run asked for an entry no run shops, or for a category
// with more than one such entry and no item named ("any travel deals?"), isn't started: it would have to guess, so the
// shopper hears why in fixed words. Light on purpose (no catalog, no sellers): the page checks it before a run, and the
// server checks it again.

/** The one catalog entry a run shops by default, with no item chip. Equal to `DEMO_ENTRY`; core/test/catalog.test.ts holds them together. */
export const RUN_ENTRY = "kettle";

/** The category of that entry. Equal to `DEMO_CATEGORY`; the same test holds them together. */
export const RUN_CATEGORY = "kitchen";

/**
 * Every entry a run shops, its category, and its name as Goose says it. The ids, items and categories equal the catalog's
 * (`DEMO_ENTRY`, `MOVING_ITEMS`); core/test/posted.test.ts holds them together.
 */
export const RUN_ENTRIES: Readonly<Record<string, { category: string; said: string }>> = {
  kettle: { category: "kitchen", said: "kettle" },
  "marsh-lights-ticket": { category: "events", said: "Marsh Lights ticket" },
  "mossbell-night": { category: "travel", said: "night at Mossbell Inn" },
  "gullwing-seat": { category: "travel", said: "Gullwing Air seat" },
};

/**
 * The entries the "I saw it for $X" ladder answers for: the kettle (its market) and the jackets (their listings, with
 * layer 5's look-alike). Light, so the page knows before the ladder's code loads; core/test/jacket.test.ts holds it to
 * the ladder's own entries.
 */
export const LADDER_IDS: readonly string[] = ["kettle", "harbor-jacket", "tidewater-jacket"];

/** Each catalog entry as a chip shows it, never its id. core/test/jacket.test.ts holds it to every catalog entry. */
export const ITEM_WORDS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(Object.entries(RUN_ENTRIES).map(([id, e]) => [id, e.said])),
  "harbor-jacket": "Harbor jacket", "tidewater-jacket": "Tidewater jacket",
};

const inCategory = (category: string) => Object.keys(RUN_ENTRIES).filter((id) => RUN_ENTRIES[id]!.category === category);

/** Whether a run shops this catalog entry. */
export const runsShop = (catalogId: string): boolean => Object.hasOwn(RUN_ENTRIES, catalogId);
/** Whether a category alone names one entry a run shops ("events" is the ticket; "travel" is two, so it names none). */
export const runsShopCategory = (category: string): boolean => inCategory(category).length === 1;

export const NOT_SHOPPED_YET = "Goose's runs don't shop for that yet, so no run started and nothing was bought. Say “I really want” it and Goose watches its price on Your wants.";
/** A category with more than one entry a run shops, and no item named. */
export const SAY_WHICH = "That's more than one thing Goose shops for, so no run started and nothing was bought. Say which one by name.";

const fields = (c: unknown) => (typeof c === "object" && c !== null ? (c as { kind?: unknown; value?: unknown }) : {});

/** The words when the chips name an entry or a category a run doesn't shop, else null. Anything that isn't a chip is ignored here (F4 checks it). */
export function notShoppedYet(chips: readonly unknown[] | undefined): string | null {
  const all = (chips ?? []).map(fields);
  const items = all.filter((c) => c.kind === "item");
  if (items.some((c) => !(typeof c.value === "string" && runsShop(c.value)))) return NOT_SHOPPED_YET;
  if (items.length > 0) return null;
  const off = all.find((c) => c.kind === "category" && !(typeof c.value === "string" && runsShopCategory(c.value)));
  return off === undefined ? null : typeof off.value === "string" && inCategory(off.value).length > 1 ? SAY_WHICH : NOT_SHOPPED_YET;
}

/** The entry a run shops for chips `notShoppedYet` passed: the item chip's, else the one entry its category names, else the kettle. */
export function runEntry(chips: readonly unknown[] | undefined): string {
  const all = (chips ?? []).map(fields);
  const item = all.find((c) => c.kind === "item" && typeof c.value === "string" && runsShop(c.value))?.value as string | undefined;
  if (item) return item;
  const category = all.find((c) => c.kind === "category" && typeof c.value === "string" && runsShopCategory(c.value))?.value as string | undefined;
  return category ? inCategory(category)[0]! : RUN_ENTRY;
}
