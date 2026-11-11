// The catalog the code owns (N9, ADR 0012). A cart names its entry by id, and
// the dial reads the category from that entry, never from the want or a chip:
// words can't move a Laptop into the kitchen. An id is only a pointer, so the
// guard also checks the cart's item against the entry it names.

export interface CatalogItem {
  /** The one item this entry sells, as a seller's offer names it (compared as words: `sameItem`). */
  item: string;
  category: string;
  /** Words a chip may use to narrow this entry, by attribute name (color → ["black"]). None = no attribute chips. */
  attributes?: Readonly<Record<string, readonly string[]>>;
}

/** Entry id → what it is. A Map, so an id like "constructor" can never reach an object's prototype. */
export type Catalog = ReadonlyMap<string, CatalogItem>;

/** The entry a cart names, or undefined when it names none or one the catalog doesn't have. */
export function catalogItem(catalog: Catalog, id: string | undefined): CatalogItem | undefined {
  return id === undefined ? undefined : catalog.get(id);
}
