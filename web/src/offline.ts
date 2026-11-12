// The recorded demo, in the browser (H1, 018 N13). Loaded on demand (its own chunk, so the first screen stays light):
// the three recorded weeks are bundled here at build time from docs/fixtures, and the same core planner, engine, fence,
// Watcher and guard the server runs replay them, so the static site is the whole demo even with no server. A tape holds
// only the buyer's recorded moves, the market's week and the ledger the replay must equal: no key, no PayPal or
// Anthropic code (scripts/check-bundle.sh checks the build, and that these tapes are in it). Nothing here has a payment
// port or an AI port: a cart bound here has no order, and the screen says so.

import type { LedgerEvent, RunBudgetHit, Tape } from "@goose/core";
import { sha256Hex } from "@goose/core/sha256";
import { bundledLibrary, demoSettings, entryLimit, localRun, ENTRY_CATEGORY } from "@goose/core/local";
import { recordedWeek } from "@goose/core/week";
import type { JudgeCard } from "@goose/core/judge";
import type { AttemptAnswer } from "@goose/core/attempts";
import { toCents } from "@goose/core/money";
import { OFFLINE } from "./states/words.ts";
import WEEK1 from "../../docs/fixtures/tape-seed-1.json";
import WEEK2 from "../../docs/fixtures/tape-seed-2.json";
import WEEK3 from "../../docs/fixtures/tape-seed-3.json";

const TAPES = [WEEK1, WEEK2, WEEK3] as unknown as Tape[];
// Only tapes recorded on the honest prompt play; core/test/static-demo.test.ts checks all three are, against the server's prompt file.
const LIBRARY = bundledLibrary(TAPES, TAPES[0]!.meta.promptSha256);

export { demoSettings, entryLimit };

/** One press of "Go find it" while live mode isn't answering or she is offline (R-13: `notLive` "offline"), or once the server's run budget is used up (H2). `asked` is a `?seed=N` market number. */
export function startRun(o: { asked: number | null; maxPrice: string; onRow: (e: LedgerEvent) => void; notLive?: "offline" | RunBudgetHit; chips?: unknown }) {
  let maxPrice: number;
  try { maxPrice = toCents(o.maxPrice.trim()); } catch { return { error: "Type your max as dollars, like 60.00." } as const; }
  return localRun({
    library: LIBRARY, asked: o.asked, maxPrice, hash: sha256Hex, now: () => Date.now(),
    // A fresh market number never reuses a fixture week's (1–3; project Lesson 18), as on the server.
    fresh: () => 10 + Math.floor(Math.random() * 999_999_990),
    pace: true, onRow: o.onRow, ...(o.notLive ? { notLive: o.notLive } : {}), ...(o.chips === undefined ? {} : { chips: o.chips }),
  });
}

/** "See how it keeps you safe": recorded week 1 through a fresh guard, as GET /api/story computes it. */
export function storyWeek() {
  return recordedWeek(TAPES.find((t) => t.meta.seed === 1)!, sha256Hex, () => Date.now(), ENTRY_CATEGORY);
}

// Track F: the round's code (and the Watcher under it) comes down on a try, not with the page. A chunk that can't load
// says so in the same words as offline.ts itself not loading, rather than rejecting into a stuck button.
const loadJudge = () => import("@goose/core/judge").catch(() => null);
const lost = () => ({ error: navigator.onLine ? "The recorded demo couldn't load. Reload the page to try again." : `${OFFLINE.title} ${OFFLINE.line}` });

/** The judge box's plain-rule round, in the browser: the same checks and the same one judge factory as the server. */
export async function judgeInBrowser(body: { note: string; price: string }): Promise<{ card: Omit<JudgeCard, "events"> } | { error: string }> {
  const judge = await loadJudge();
  if (!judge) return lost();
  const { demoJudgeRound, parseJudgeRequest } = judge;
  const parsed = parseJudgeRequest({ ...body, mode: "rule" });
  if (!parsed.ok) return { error: parsed.error };
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
  const card = await demoJudgeRound({ req: parsed.value, hash: sha256Hex, now: () => Date.now(), seed, runId: `browser-${seed}`, ai: null, aiState: "off", aiName: "", where: "browser" });
  // The ledger stays here, as on the server (Lesson 17): the card already says everything.
  const { events: _events, ...shown } = card;
  return { card: shown };
}

/** The Challenge's round, in the browser: the same round, plus the verdict and rule it would store. Never stored or counted. */
export async function challengeInBrowser(body: { note: string; price: string }): Promise<{ card: Omit<JudgeCard, "events">; attempt: AttemptAnswer } | { error: string }> {
  const [judge, challenge] = await Promise.all([loadJudge(), import("@goose/core/challenge").catch(() => null)]);
  if (!judge || !challenge) return lost();
  const { demoJudgeRound, parseJudgeRequest } = judge;
  const parsed = parseJudgeRequest({ ...body, mode: "rule" });
  if (!parsed.ok) return { error: parsed.error };
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
  const card = await demoJudgeRound({ req: parsed.value, hash: sha256Hex, now: () => Date.now(), seed, runId: `browser-${seed}`, ai: null, aiState: "off", aiName: "", where: "browser" });
  const { events, ...shown } = card;
  return { card: shown, attempt: challenge.answerOf(events, parsed.value.note, parsed.value.price) };
}
