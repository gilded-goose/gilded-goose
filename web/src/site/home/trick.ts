// Try to trick Goose (home part 6): the pure half. The counter is split from the server's own rows (`GET /api/challenge`),
// never typed and never filled in: any answer the rows can't account for is null, and the page says "Live count
// unavailable". A try's verdict is put in the stamp's four words from the round's own closed fields. The recorded scammer
// notes are the ones the server replays (`server/prompts/scam-replays.json`), word for word, for when the scammer AI is off.
// Loaded on demand by Trick.tsx (every use follows a server answer or a press), so its notes stay out of the first paint.
import { parseAttempt, type AttemptAnswer, type ThreatType } from "@goose/core/attempts";
import REPLAYS from "../../../../server/prompts/scam-replays.json";
import type { Verdict } from "../ui/stamp.ts";
import { attemptVerdict, foldTries, type TriesSplit } from "../tries-fold.ts";

export { attemptVerdict, type TriesSplit } from "../tries-fold.ts";

const isCount = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) >= 0;

/**
 * The counter's split, from a `GET /api/challenge` body. Only when every try is in the rows (not cut, as many rows as the
 * fold's `tried`) and the rows agree with the fold's own set-aside and paid counts; otherwise null.
 */
export function triesSplit(board: unknown): TriesSplit | null {
  if (typeof board !== "object" || board === null) return null;
  const { counts, attempts, cut } = board as Record<string, unknown>;
  if (typeof counts !== "object" || counts === null || !Array.isArray(attempts) || cut !== false) return null;
  const { tried, setAside, paid } = counts as Record<string, unknown>;
  if (!isCount(tried) || !isCount(setAside) || !isCount(paid) || attempts.length !== tried) return null;
  const rows = attempts.map(parseAttempt);
  if (rows.some((r) => !r)) return null;
  const split = foldTries(rows as AttemptAnswer[]);
  const watcherAside = attempts.filter((a) => (a as { verdict?: unknown }).verdict === "set-aside").length;
  return watcherAside === setAside && split.paid === paid ? split : null;
}

export interface LatestTry { at: number; type: ThreatType; verdict: Verdict | "paid" }

/** The newest `n` readable rows of a `GET /api/challenge` body: the minute, the kind of trick and the stamp. Nothing else. */
export function latestTries(board: unknown, n: number): LatestTry[] {
  const list = typeof board === "object" && board !== null ? (board as { attempts?: unknown }).attempts : null;
  if (!Array.isArray(list)) return [];
  return list.flatMap((raw) => {
    const row = parseAttempt(raw);
    return row ? [{ at: row.at, type: row.type, verdict: attemptVerdict(row) }] : [];
  }).slice(0, n);
}

const NOTES = REPLAYS.notes;

/** The i-th recorded scammer note (wrapping), word for word, and its asking price in dollars. */
export function scamReplay(i: number): { note: string; price: string } {
  const n = NOTES[((i % NOTES.length) + NOTES.length) % NOTES.length]!;
  return { note: n.note, price: (n.price / 100).toFixed(2) };
}

export const REPLAY_COUNT = NOTES.length;
