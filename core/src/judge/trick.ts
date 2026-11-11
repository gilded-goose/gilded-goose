// "Try to trick Goose" (the Desk's slice 4; Joshua, Fri Oct 30): you write a seller note, Goose gives its verdict, and the
// verdict lands in your session's ledger as rows labeled "a test of the guard", so it streams into Behind the scenes on
// its own. The round is the seller lab's own (`demoJudgeRound`): the same fence, Watcher, buyer and guard, the same caps on
// the server, and its own throwaway ledger and demo Policy, so nothing in it can read or change this shopper's limits,
// dial, week or memory. Only after it has decided are its rows about your offer copied into the session, as `attack`
// rows, which nothing that counts money or a record ever reads (`isShoppers`, N19).
//
// N10: nothing a visitor types is kept. The note's words stay in the round, which is dropped; the rows copied carry
// code's sentences and rule ids only, never `quoted` or `fenced`, and the buyer's own sentence (which an AI-read note
// can steer) is shown on the card, never written to the ledger.

import type { LedgerEvent, NewEvent, ShopperLedger } from "../ledger/events.ts";
import type { Hasher } from "../deps.ts";
import type { LlmPort } from "../buyer/port.ts";
import type { ReaderPort } from "../trust/reader.ts";
import { fromCents, type Cents, usd } from "../money.ts";
import { demoWant } from "../scenario.ts";
import { demoJudgeRound, JUDGE_SELLER, type AiState, type JudgeCard, type JudgeRequest } from "./judge.ts";

/** Every trick's run id starts with this, so a row's run says where it came from at a glance. */
export const TRICK_RUN = "trick-";

/** The actors whose rows about your offer reach the ledger: your offer itself, the Watcher on it, and the guard's verdict. */
const KEPT = new Set<LedgerEvent["actor"]>(["seller", "watcher", "guard"]);

/**
 * The lab's guard speaks to the lab's shopper ("over your max $60.00"), whose max and limits are the demo's, not this
 * shopper's. In her own ledger its sentence says so first, so "your" never reads as her own saved limits.
 */
export const trickGuardWhy = (why: string, max: Cents): string => `In this test (a ${usd(max)} max, not your own limits): ${why}`;

/**
 * The round's rows that land in the session: those about your offer, from code only, with the seller's own words
 * dropped, and the guard's sentence prefixed (`trickGuardWhy`). In the round's order, so the guard's verdict comes last. Pure.
 */
export function trickRows(events: readonly LedgerEvent[], max: Cents): NewEvent[] {
  return events
    .filter((e) => e.sellerId === JUDGE_SELLER.id && KEPT.has(e.actor))
    .map(({ v: _v, seq: _seq, runId: _run, source: _source, day: _day, quoted: _quoted, fenced: _fenced, ...e }) => (e.actor === "guard" ? { ...e, why: trickGuardWhy(e.why, max) } : e));
}

/**
 * A scammer AI round: the visitor wrote no note and set no price, so nothing may credit them with it. Code's sentences only;
 * "your max" and "your limits" stay, since the limit is still the visitor's to hold. Every string a round can show goes through
 * here, and `core/test/scammer.test.ts` sweeps the results, so a new sentence can't slip back to "your note".
 */
const AI_ROUND_WORDS: readonly (readonly [RegExp, string])[] = [
  [/Your shop \(you, the judge\)/g, "A made-up shop (the scammer AI)"],
  [/Your text/g, "The scammer AI's note"],
  [/Your note/g, "The note"],
  [/\byour note\b/g, "the note"],
  [/\byour offer\b/g, "the offer"],
  [/\byour (\$[\d.,]+ is refused)/g, "the $1"],
];
export function aiRoundWords<T>(x: T): T {
  return JSON.parse(JSON.stringify(x), (_k, v: unknown) => typeof v === "string" ? AI_ROUND_WORDS.reduce((s, [from, to]) => s.replace(from, to), v) : v) as T;
}

/** What the page gets back: the lab's card without its raw rows, and the rows as they were written into the session. */
export interface TrickResult {
  card: Omit<JudgeCard, "events">;
  /** The guard's verdict on your offer, as written into the session's ledger: the row the grid shows for it. */
  verdict: LedgerEvent;
  /** Every row this trick wrote, in order (the verdict last). */
  rows: LedgerEvent[];
  runId: string;
  /** The whole round's rows, for the attack tally only (`AttackTally.add`, as the judge box counts); never sent or kept. */
  round: readonly LedgerEvent[];
}

/**
 * One trick: the seller lab's round, then its rows about your offer written into `shopper` under `runId` (labeled
 * `attack`). The caller takes the caps first, as the judge box does. Throws if the round wrote no guard verdict on
 * your offer, which it always does (the probe, Lesson 30), so a trick can never land without its verdict.
 */
export async function trickGoose(o: {
  shopper: ShopperLedger; req: JudgeRequest; hash: Hasher; now: () => number; seed: number; runId: string;
  ai: LlmPort | null; reader?: ReaderPort | null; aiState: AiState; aiName: string;
  /** Who wrote the note, when it wasn't the visitor: the scammer AI's route only. */
  writer?: "scammer-ai";
}): Promise<TrickResult> {
  if (!o.runId.startsWith(TRICK_RUN)) throw new Error(`trick: a trick's run id starts with "${TRICK_RUN}"`);
  const { events, ...card } = await demoJudgeRound({ req: o.req, hash: o.hash, now: o.now, seed: o.seed, runId: o.runId, ai: o.ai, reader: o.reader ?? null, aiState: o.aiState, aiName: o.aiName, where: "server" });
  const kept = trickRows(events, demoWant().maxPrice);
  if (kept.at(-1)?.actor !== "guard") throw new Error("trick: the round wrote no guard verdict on your offer");
  const view = o.shopper.run(o.runId, "attack");
  const said = o.writer ? aiRoundWords : <T,>(x: T) => x;
  const rows = kept.map((e) => view.append(said(e)));
  return { card: said(card), verdict: rows.at(-1)!, rows, runId: o.runId, round: events };
}
