// The landing board's replay: the recorded Marsh Lights ticket week, read in the browser by the same code the server
// uses. Prices are the recorded curves (`@goose/core/moving`), verdicts are the Watcher's own (`@goose/core/watch`), and
// the limit is the demo's $90 Events limit. Nothing here is a live price; the page says it's a recorded fictional week.
import { usdOf } from "@goose/core/money";
import { MOVING_ITEMS, priceOn } from "@goose/core/moving";
import { verdictOf, watch } from "@goose/core/watch";
import type { Market, Result } from "./market.ts";

export const REPLAY_LIMIT = 9000;
const DAY = 5;
const ITEM = "marsh-lights-ticket";

const usd = (c: number) => (c / 100).toFixed(2);

export function replayMarket(): Market | null {
  const item = MOVING_ITEMS.find((i) => i.id === ITEM);
  if (!item) return null;
  const results: Result[] = [];
  for (const s of item.sellers) {
    const p = priceOn(s.curve, DAY - 1);
    if (!p) continue;
    const flags = watch({ quoted: s.note, merchant: s.name, history: s.history });
    const verdict = verdictOf(flags);
    results.push({
      id: `rm-${s.sellerId}`, merchant: s.name, item: item.item, price: usd(p.total), currency: "USD", history: s.history,
      quoted: s.note, watcher: verdict, said: (flags ?? []).map((f) => f.said),
      ...(verdict !== "refuse" && p.total > REPLAY_LIMIT ? { over: `Over your ${usdOf(usd(REPLAY_LIMIT))} limit` } : {}),
    });
  }
  return {
    kind: "market", marketId: `replay-${ITEM}`, item: item.item, claim: "A recorded fictional week.", madeBy: "the recorded week",
    readerSays: "", limitWhy: "", cap: usd(REPLAY_LIMIT), heldBy: "", results, recorded: { catalogId: ITEM, day: DAY },
  };
}
