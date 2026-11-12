// The demo with no server (H1, 018 N13): the static site, which never sleeps, is the whole recorded demo. A press of
// "Go find it" while live mode isn't answering runs here, in the browser: the same planner, engine, fence, Watcher and
// guard as the server, on the recorded weeks bundled into the page at build time (the fixture tapes; Claude Haiku's
// real moves, replayed by input hash, no AI call). Nothing here can make an order: no payment port exists in this
// file, so every cart it binds is a recorded cart with nothing to pay, and the screen says so. Pure: clock, hash and
// fresh numbers are handed in.

import { LOCAL_DONE } from "./local-done.ts";
import { ENTRY_CATEGORY, entryLimit } from "./entry-limit.ts";
export { ENTRY_CATEGORY, entryLimit };
import { DAY_MS, type Hasher } from "../deps.ts";
import { fromCents, type Cents } from "../money.ts";
import type { LedgerEvent } from "../ledger/events.ts";
import { APPROVAL_TTL_MS, worstCase } from "../trust/guard.ts";
import { marketSellers, steersMarket } from "../sellers/market.ts";
import { RecordedPort, type Tape } from "../buyer/recorded.ts";
import { RunLibrary, recordedLabel } from "../buyer/library.ts";
import { capWords, planRun, type RunBudgetHit } from "../buyer/plan.ts";
import { RuleBuyer } from "../buyer/rule.ts";
import { MOVE_TIMEOUT_MS, runHaggle } from "../haggle/engine.ts";
import { validateChips } from "../trust/chips.ts";
import { DEMO_ENTRY, DEMO_SHOPPER, demoCatalogItems, demoDeps, demoGuard, demoPolicy, demoShopper, demoWant, isDemoWeek } from "../scenario.ts";
import { settingsRows, type SettingRow } from "./story.ts";
import { runEntry } from "../ask/shops.ts";
import { BEAT_DAY } from "../ask/watching.ts";
import { POSTED_ROUNDS, movingItem, postedNote, postedSellers, postedWant } from "../sellers/posted.ts";

/** The Settings rows, as the server's /api/settings sends them: the Policy every run's guard holds. */
export function demoSettings(): SettingRow[] {
  return settingsRows(demoPolicy(), ENTRY_CATEGORY, APPROVAL_TTL_MS);
}

/** The bundled recorded weeks as a library, the way the server builds its own (only tapes on the given prompt play). */
export function bundledLibrary(tapes: Tape[], promptSha256: string): RunLibrary {
  for (const t of tapes) if (!isDemoWeek(t.meta.week)) throw new Error(`tape seed ${t.meta.seed}: unknown week ${String(t.meta.week)}`);
  return new RunLibrary(promptSha256, tapes);
}

/** What the screen knows the moment a browser run starts, shaped like the server's run view. */
export interface LocalHead {
  id: string;
  seed: number;
  week: number | null;
  buyer: string;
  note: string;
  replayable: boolean;
  worstCase: { cap: string; why: string };
  category: string | null;
  limit: string;
  want: { item: string; maxPrice: string; qty: number };
}

export interface LocalDone {
  outcome: "cart" | "walked" | "refused";
  bound: { item: string; merchant: string; total: string; currency: string; hash: string; expiresAt: number; orderId: null; spent: false } | null;
  events: LedgerEvent[];
}

export { LOCAL_DONE };

/** A moving item's run in the browser: the rule on its posted sellers, the Watcher-refused kept from the rule's choices. */
function postedLocalRun(o: Parameters<typeof localRun>[0], moving: NonNullable<ReturnType<typeof movingItem>>, chips: Parameters<typeof runHaggle>[0]["chips"]): { head: LocalHead; done: Promise<LocalDone> } {
  const seed = o.fresh();
  const id = `browser-${seed}-${o.now()}`;
  const deps = { ...demoDeps(seed, o.hash), clock: { now: o.now } };
  const ledger = demoShopper(o.now()).run(id, "live");
  if (o.onRow) ledger.on(o.onRow);
  const policy = demoPolicy();
  const want = postedWant(moving, policy, o.now() + 7 * DAY_MS);
  const guard = demoGuard(deps, ledger, policy);
  const buyer = new RuleBuyer();
  const category = demoCatalogItems().get(moving.id)?.category;
  const wc = worstCase(policy, want, category);
  ledger.append({ t: o.now(), shopperId: DEMO_SHOPPER, visibility: "owner", actor: "guard", action: "worst-case", layer: 2, verdict: "ok", price: fromCents(wc.cap), currency: "USD", why: wc.why, data: { buyer: buyer.name } });
  const head: LocalHead = {
    id, seed, week: null, buyer: "rule",
    note: `${capWords(o.notLive ?? "away", 0)}, so a plain rule is buying. ${postedNote(BEAT_DAY)} Run in your browser: no AI call, no order.`,
    replayable: false,
    worstCase: { cap: fromCents(wc.cap), why: wc.why },
    category: category ?? null, limit: fromCents(want.maxPrice),
    want: { item: want.item, maxPrice: fromCents(want.maxPrice), qty: want.qty },
  };
  const done = (async (): Promise<LocalDone> => {
    const result = await runHaggle({ want, sellers: postedSellers(moving, BEAT_DAY), buyer, guard, deps, ledger, shopperId: DEMO_SHOPPER, catalogId: moving.id, chips: chips ?? [], hideRefused: true, maxRounds: POSTED_ROUNDS });
    const b = result.outcome === "cart" ? result.decision.bound : null;
    ledger.append({ t: o.now(), shopperId: DEMO_SHOPPER, visibility: "owner", actor: "guard", action: "done", why: LOCAL_DONE });
    return {
      outcome: result.outcome,
      bound: b ? { item: b.cart.item, merchant: b.cart.merchant, total: fromCents(b.cart.price), currency: b.cart.currency, hash: b.hash, expiresAt: b.expiresAt, orderId: null, spent: false } : null,
      events: ledger.read(),
    };
  })();
  return { head, done };
}

/**
 * One press, in the browser. An asked-for market number replays its recording; a fresh press replays the next recorded
 * week in turn; a max no recording was made at runs the plain rule on a fresh market and says why (planRun, as on the
 * server, with "Live mode isn't answering" as the reason). Rows reach `onRow` as they are written, like the server's SSE.
 */
export function localRun(o: {
  library: RunLibrary; asked: number | null; maxPrice: Cents; hash: Hasher; now: () => number; fresh: () => number;
  /** Wait each recorded move's recorded time (the real pace); off in tests. */
  pace: boolean;
  /** The chips the page read from the shopper's words (W49c), checked against the catalog again here; refused = none. */
  chips?: unknown;
  onRow?: (e: LedgerEvent) => void;
  /** Why this runs here and not on the server: live mode isn't answering ("away", the default), she is offline ("offline", R-13), or the server's run budget is used up (H2). */
  notLive?: "away" | "offline" | RunBudgetHit;
}): { head: LocalHead; done: Promise<LocalDone> } {
  const checked = o.chips === undefined ? null : validateChips(o.chips, demoCatalogItems());
  const chips = checked?.kind === "accepted" ? checked.chips : [];
  // §15B part 2: the ticket, the hotel night or the flight seat runs here too, as on the server: its posted sellers on
  // the wants card's day, the plain rule buying (no recording is of a posted market). The bundle's Policy is the demo's,
  // so with no events or travel limit of its own every honest total is over the $60.00 it falls back to, and it says so.
  const moving = movingItem(runEntry(chips));
  if (moving) return postedLocalRun(o, moving, chips);
  const plan = planRun({ asked: o.asked, maxPrice: o.maxPrice, live: false, notLive: o.notLive ?? "away", library: o.library, dayLimit: 0, take: () => null, fresh: o.fresh, steers: steersMarket(chips, demoWant().item) });
  if (plan.kind === "live") throw new Error("a browser run is never live");
  const seed = plan.market.seed;
  const replay = plan.kind === "replay";
  const id = `browser-${seed}-${o.now()}`;
  const deps = { ...demoDeps(seed, o.hash), clock: { now: o.now } };
  // Made the run's way (W40): the shopper's ledger starts with the seeded week, so the run's own rows count from 1.
  const ledger = demoShopper(o.now()).run(id, replay ? "recorded" : "live");
  if (o.onRow) ledger.on(o.onRow);
  const policy = demoPolicy();
  const want = demoWant({ deadline: o.now() + 7 * DAY_MS, maxPrice: o.maxPrice });
  const guard = demoGuard(deps, ledger, policy);
  const buyer = replay ? new RecordedPort(plan.recorded.tape, o.hash, { pace: o.pace }) : new RuleBuyer();
  const wc = worstCase(policy, want, ENTRY_CATEGORY);
  ledger.append({ t: o.now(), shopperId: DEMO_SHOPPER, visibility: "owner", actor: "guard", action: "worst-case", layer: 2, verdict: "ok", price: fromCents(wc.cap), currency: "USD", why: wc.why, data: { buyer: buyer.name } });

  const head: LocalHead = {
    id, seed, week: isDemoWeek(seed) ? seed : null,
    buyer: replay ? recordedLabel(plan.recorded) : "rule",
    note: `${plan.note} ${replay ? "Replayed in your browser: no AI call, no order." : "Run in your browser: no AI call, no order."}`,
    replayable: replay,
    worstCase: { cap: fromCents(wc.cap), why: wc.why },
    ...entryLimit(policy),
    want: { item: want.item, maxPrice: fromCents(want.maxPrice), qty: want.qty },
  };

  const done = (async (): Promise<LocalDone> => {
    // The server's replay budget: a recorded move waits its recorded time, under the live 1.5 s, plus a second of slack.
    const llmTimeoutMs = replay ? MOVE_TIMEOUT_MS + 1000 : MOVE_TIMEOUT_MS;
    const result = await runHaggle({ want, sellers: marketSellers(plan.market, want.item), buyer, guard, deps, ledger, shopperId: DEMO_SHOPPER, catalogId: DEMO_ENTRY, llmTimeoutMs, chips });
    const b = result.outcome === "cart" ? result.decision.bound : null;
    ledger.append({ t: o.now(), shopperId: DEMO_SHOPPER, visibility: "owner", actor: "guard", action: "done", why: LOCAL_DONE });
    return {
      outcome: result.outcome,
      bound: b ? { item: b.cart.item, merchant: b.cart.merchant, total: fromCents(b.cart.price), currency: b.cart.currency, hash: b.hash, expiresAt: b.expiresAt, orderId: null, spent: false } : null,
      events: ledger.read(),
    };
  })();
  return { head, done };
}
