// Its own small module so the wallet can read its limit without local.ts and everything under it (gate seat 6, Nov 4).
import { fromCents } from "../money.ts";
import { categoryLimitFor, type Policy } from "../trust/policy.ts";
import { DEMO_ENTRY, demoCatalogItems, demoPolicy } from "../scenario.ts";

/** The category every demo cart names (N9): the catalog entry's, never the want's. */
export const ENTRY_CATEGORY: string | undefined = demoCatalogItems().get(DEMO_ENTRY)?.category;

/** The limit the guard holds this Policy's carts to (N18), as the server's /api/limit says it. */
export function entryLimit(policy: Policy = demoPolicy()): { category: string | null; limit: string } {
  return { category: ENTRY_CATEGORY ?? null, limit: fromCents(categoryLimitFor(policy, ENTRY_CATEGORY)) };
}
