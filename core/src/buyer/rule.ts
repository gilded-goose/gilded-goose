// The rule-engine buyer: deterministic, instant, and the labeled fallback when
// the LLM times out. It also stands in until Claude is plugged in (S3).

import { roundCents, fromCents, usd } from "../money.ts";
import type { BuyerInput, BuyerMove, LlmPort } from "./port.ts";

/** Before the last round, nothing above this share of the max is accepted or bid (Joshua, 2026-10-23; engine `discipline`). */
export const PATIENCE = 0.9;

export class RuleBuyer implements LlmPort {
  readonly name = "rule";

  async decide(input: BuyerInput): Promise<BuyerMove> {
    return ruleMove(input);
  }
}

export function ruleMove(input: BuyerInput): BuyerMove {
  const { want, round, maxRounds } = input;
  const affordable = input.offers.filter((o) => o.price <= want.maxPrice && o.shape === "one-off");
  if (affordable.length === 0) {
    return round >= maxRounds
      ? { type: "walk", why: `No one-off offer at or under ${usd(want.maxPrice)} after ${round} round${round === 1 ? "" : "s"}.` }
      : { type: "counter", sellerId: input.offers[0]?.sellerId ?? "", price: roundCents(want.maxPrice * 0.7), why: `Nothing under my max yet; opening at 70% of ${usd(want.maxPrice)}.` };
  }
  // Only sellers with a record: this buyer is also every timeout's fallback, so it never takes an offer over the max or from a
  // shop with no record (a fair offer under the max from a shop with a record is a right answer, and the guard still asks).
  const pool = affordable.filter((o) => (o.history ?? 0) > 0);
  if (pool.length === 0) {
    return round >= maxRounds
      ? { type: "walk", why: `The only offers under ${usd(want.maxPrice)} come from sellers with no sales history; not buying.` }
      : { type: "counter", sellerId: input.offers.find((o) => (o.history ?? 0) > 0)?.sellerId ?? input.offers[0]?.sellerId ?? "", price: roundCents(want.maxPrice * 0.7), why: `No seller with a record is under my max yet; holding at 70% of ${usd(want.maxPrice)}.` };
  }
  const best = pool.reduce((a, b) => (b.price < a.price ? b : a));
  const lastBid = [...input.history].reverse().find((m) => m.type === "counter");
  const bid = lastBid && lastBid.type === "counter" ? lastBid.price : roundCents(want.maxPrice * 0.7);

  // The engine's patience line until the last round: one constant, so the fallback and the engine's discipline agree.
  const line = roundCents(want.maxPrice * PATIENCE);
  if ((best.price <= bid && best.price <= line) || round >= maxRounds) {
    // The shopper sees seller names on the row, never ids like "pondside" (M1 critique, note 7).
    return { type: "accept", sellerId: best.sellerId, price: best.price, why: `${usd(best.price)} is the best one-off offer under my max from a seller with a sales record${round >= maxRounds ? ", and this is the last round" : ""}.` };
  }
  const next = Math.min(line, roundCents(bid + (best.price - bid) / 3));
  return { type: "counter", sellerId: best.sellerId, price: next, why: next === line && best.price > line
    ? `Holding at ${usd(line)}, 90% of my max, until the last round; the best ask is ${usd(best.price)}.`
    : `Raising a third of the gap toward the best ask, ${usd(best.price)}, staying under ${usd(want.maxPrice)}.` };
}
