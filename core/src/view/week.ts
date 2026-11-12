// The recorded week "See how it keeps you safe" reads (W38): a fixture tape replayed through a fresh guard into a
// throwaway ledger. No payment port is taken, so no order can exist: the page reads a run without starting one.
// The cart is still bound by the guard (hash and expiry), so the approve card's claims are the guard's own.

import { DAY_MS, type Hasher } from "../deps.ts";
import { fromCents } from "../money.ts";
import type { LedgerEvent } from "../ledger/events.ts";
import { worstCase } from "../trust/guard.ts";
import type { BoundCart } from "../trust/cart.ts";
import { marketSellers } from "../sellers/market.ts";
import { RecordedPort, type Tape } from "../buyer/recorded.ts";
import { tapeMarket } from "../buyer/plan.ts";
import { runHaggle } from "../haggle/engine.ts";
import { DEMO_ENTRY, DEMO_SHOPPER, demoDeps, demoGuard, demoPolicy, demoShopper, demoWant } from "../scenario.ts";

export interface RecordedWeek {
  seed: number;
  want: { item: string; maxPrice: string; qty: number };
  bound: { item: string; merchant: string; total: string; hash: string; expiresAt: number } | null;
  events: LedgerEvent[];
}

export async function recordedWeek(tape: Tape, hash: Hasher, now: () => number, category?: string): Promise<RecordedWeek> {
  const deps = { ...demoDeps(tape.meta.seed, hash), clock: { now } };
  // W40: numbered like a run, made the run's way. A run writes through its shopper's ledger, which starts with the
  // seeded week (seq 0), so the run's own rows count from 1; a bare ledger counted from 0, and the story's Proof rows
  // disagreed with the run they explain. The same maker here, never a "+1" in a view. Its seeded row stays out of
  // `events` (a run reads back only its own rows) and never counts toward the week (N19).
  const ledger = demoShopper(now()).run("story", "recorded");
  const policy = demoPolicy();
  const want = demoWant({ deadline: now() + 7 * DAY_MS });
  const guard = demoGuard(deps, ledger, policy);
  const buyer = new RecordedPort(tape, hash, { pace: false });
  const wc = worstCase(policy, want, category);
  ledger.append({ t: now(), shopperId: DEMO_SHOPPER, visibility: "owner", actor: "guard", action: "worst-case", layer: 2, verdict: "ok", price: fromCents(wc.cap), currency: "USD", why: wc.why, data: { buyer: buyer.name } });
  const result = await runHaggle({ want, sellers: marketSellers(tapeMarket(tape), want.item), buyer, guard, deps, ledger, shopperId: DEMO_SHOPPER, catalogId: DEMO_ENTRY });
  const b: BoundCart | null = result.outcome === "cart" ? result.decision.bound : null;
  return {
    seed: tape.meta.seed,
    want: { item: want.item, maxPrice: fromCents(want.maxPrice), qty: want.qty },
    bound: b ? { item: b.cart.item, merchant: b.cart.merchant, total: fromCents(b.cart.price), hash: b.hash, expiresAt: b.expiresAt } : null,
    events: ledger.read(),
  };
}
