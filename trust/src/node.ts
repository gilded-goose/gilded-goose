// @gilded-goose/trust/node: the guard with Node's defaults, so a merchant's server needs one call. sha256 and the RNG
// come from node:crypto, the clock is the wall clock, and the ledger lives in memory. Each one can still be injected,
// so a seeded replay decides the same way (`Deps`), and a real store can take the ledger's place.
import { createHash, randomInt } from "node:crypto";
import type { Catalog } from "./catalog.ts";
import type { Deps } from "./deps.ts";
import { MemoryLedger, type LedgerStore } from "./events.ts";
import { Guard } from "./guard.ts";
import type { Cents } from "./money.ts";
import type { DialSetting, Policy } from "./policy.ts";

export interface GuardOptions {
  shopperId: string;
  /** The hard ceiling per purchase, whatever the agent's want says. */
  perPurchaseCap: Cents;
  /** The most in any rolling 7 days. Default: the per-purchase cap, so an agent can't fill a week with carts. */
  weeklyLimit?: Cents;
  /** The most one cart may cost per catalog category. Default: none, so the per-purchase cap is every category's. */
  categoryLimit?: Record<string, Cents>;
  /** Per category: may the agent buy on its own within the limit? Default: every category asks the shopper first. */
  dial?: Record<string, DialSetting>;
  catalog?: Catalog;
  deps?: Partial<Deps>;
  /** Default: in memory, so a restart forgets the week's spend and which carts were paid. Pass a real store to keep them. */
  ledger?: LedgerStore;
}

/** `randomInt` takes at most 2^48 - 1; the RNG is that many even steps across [0, 1). */
const RNG_STEPS = 2 ** 48 - 1;

/** The Node defaults: sha256, a crypto RNG and the wall clock. Pass any one in to replace it. */
export function nodeDeps(over: Partial<Deps> = {}): Deps {
  return {
    clock: over.clock ?? { now: () => Date.now() },
    rng: over.rng ?? { next: () => randomInt(RNG_STEPS) / RNG_STEPS },
    hash: over.hash ?? ((s) => createHash("sha256").update(s).digest("hex")),
  };
}

/** A guard for one shopper: `decide(want, cart, chips, evidence)` (evidence: the seller's note and sales, for the Watcher), then `place(bound, port, returnUrl)`, then `settle(bound, orderId, port)`. */
export function createGuard(o: GuardOptions): Guard {
  const policy: Policy = {
    shopperId: o.shopperId, perPurchaseCap: o.perPurchaseCap, weeklyLimit: o.weeklyLimit ?? o.perPurchaseCap,
    categoryLimit: { ...o.categoryLimit }, dial: { ...o.dial }, recordSince: {}, oneOffOnly: true,
  };
  return new Guard(nodeDeps(o.deps), o.ledger ?? new MemoryLedger(), policy, o.catalog);
}
