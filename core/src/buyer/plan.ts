// Who buys on one press (Joshua, 2026-10-23: live by default within a daily cap, a recorded run when
// it's hit). Pure: the server hands in the caps' answer, the library and a fresh number, and gets back
// which buyer runs, on which market, and the sentence the screen shows when it isn't live (shared Lesson 8).

import { fromCents, type Cents, usd } from "../money.ts";
import type { CapHit } from "../judge/caps.ts";
import { marketFor, weekMarket } from "../scenario.ts";
import type { Market } from "../sellers/market.ts";
import type { RunLibrary } from "./library.ts";
import type { Tape } from "./recorded.ts";

export type RunPlan =
  | { kind: "replay"; recorded: { tape: Tape; n: number; m: number }; market: Market; note: string }
  | { kind: "live"; market: Market; note: null }
  | { kind: "rule"; market: Market; note: string };

export interface PlanRequest {
  /** The market number asked for (`?seed=N`), or null for a fresh one. */
  asked: number | null;
  maxPrice: Cents;
  /** False when there is no key or BUYER=rule. */
  live: boolean;
  /** Takes one live run from the caps, or says which cap is hit. Called only when a live run would start. */
  take: () => CapHit | null;
  library: RunLibrary;
  /** A fresh market number (never 1–3: those are the fixture weeks, project Lesson 18). */
  fresh: () => number;
  /** The day's live limit, for the sentence. */
  dayLimit: number;
  /** Why `live` is false, for the sentence: the server has no key or BUYER=rule ("off", the default), the page runs in
   *  the browser because live mode isn't answering ("away", H1) or because she is offline ("offline", R-13: her network,
   *  never the server), or the server's run budget for this browser, network or
   *  day is used up (H2, `RunBudgetHit`), so the page replays in the browser instead. */
  notLive?: "off" | "away" | "offline" | RunBudgetHit;
  /** True when the shopper's chips change which of this market's sellers are asked (W49c, `steersMarket`). */
  steers?: (market: Market) => boolean;
}

/** The server's one run budget (H2, 018 N11): every kind of run counts, a replay or the rule as much as a live one. */
export type RunBudgetHit = `runs-${CapHit}`;

/** Why a run isn't live, in words the screen shows. */
export function capWords(why: CapHit | "off" | "away" | "offline" | RunBudgetHit, dayLimit: number): string {
  switch (why) {
    case "runs-token": return "This browser has used its runs on the server for today";
    case "runs-ip": return "This network has used its runs on the server for today";
    case "runs-global": return "Today's runs on the server are used up";
    case "token": return "You've used this browser's 10 live AI runs for today";
    case "ip": return "This network has used its live AI runs for today";
    case "global": return `Today's live AI cap (${dayLimit.toLocaleString("en-US")} runs) is reached`;
    case "off": return "Live AI is off on this server";
    case "away": return "Live mode isn't answering";
    // R-13: the run note reads "You're offline, so this is a recorded run." (built like PAIR_WORDS.offline).
    case "offline": return "You're offline";
  }
}

/** A tape's market: its own generated one, or its fixture week's. */
export function tapeMarket(t: Tape): Market {
  if (t.meta.market) return t.meta.market;
  if (t.meta.week === 1 || t.meta.week === 2 || t.meta.week === 3) return weekMarket(t.meta.week);
  throw new Error(`tape seed ${t.meta.seed}: no market and no known week; it can't be replayed`);
}

/**
 * An asked-for number replays its recording if there is one. Otherwise live when allowed and under the caps;
 * else the next recorded run in turn (a fresh press); else the plain rule, which says why.
 */
export function planRun(r: PlanRequest): RunPlan {
  // W49c: a chip that changes which sellers are asked changes every move the recording answered, so it can't replay:
  // the plain rule buys on the recording's market instead, and the sentence says why (never "a recorded run").
  const replay = (rec: { tape: Tape; n: number; m: number }, note: string, steered: string): RunPlan => {
    const market = tapeMarket(rec.tape);
    return r.steers?.(market) ? { kind: "rule", market, note: steered } : { kind: "replay", recorded: rec, market, note };
  };
  const STEERED = "your color chip changes which sellers are asked, so no recording fits and a plain rule is buying.";
  if (r.asked !== null) {
    const rec = r.library.bySeed(r.asked, r.maxPrice);
    if (rec) return replay(rec, `Replay of market #${r.asked}.`, `Market #${r.asked} was recorded, but ${STEERED}`);
  }
  const why: CapHit | "off" | "away" | "offline" | RunBudgetHit | null = r.live ? r.take() : (r.notLive ?? "off");
  const number = r.asked ?? r.fresh();
  if (why === null) return { kind: "live", market: marketFor(number), note: null };
  if (r.asked === null) {
    const rec = r.library.next(r.maxPrice);
    if (rec) return replay(rec, `${capWords(why, r.dayLimit)}, so this is a recorded run.`, `${capWords(why, r.dayLimit)}, and ${STEERED}`);
  }
  const none = r.asked !== null ? `market #${r.asked} has no recording at ${usd(r.maxPrice)}` : `no recorded AI run at ${usd(r.maxPrice)}`;
  return { kind: "rule", market: marketFor(number), note: `${capWords(why, r.dayLimit)} and ${none}, so a plain rule is buying.` };
}
