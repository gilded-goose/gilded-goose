// The one reading of the public record, and a verdict's short words, on their own so the Challenge's feed can read the same
// answer as the threat board without carrying the board's model in its chunk (9 KB the feed never runs).
import { parseAttempt, type Attempt, type AttemptVerdict, type ChallengeCounts } from "./threat-shape.ts";

export const VERDICT_WORDS: Record<AttemptVerdict, string> = { paid: "Paid", "set-aside": "Set aside", refused: "Refused", held: "Held for your tap" };

/** The one reading of `GET /api/challenge`: only the four closed fields come through, and a broken answer is "unavailable". */
export function readBoard(body: unknown): { rows: Attempt[]; counts: ChallengeCounts; cut: boolean } | null {
  if (typeof body !== "object" || body === null) return null;
  const { counts, attempts, cut } = body as Record<string, unknown>;
  if (counts === null || typeof counts !== "object" || !Array.isArray(attempts)) return null;
  // The fold's fields are all there, and numbers and only numbers.
  const fold = counts as Record<string, unknown>;
  if (!["tried", "setAside", "paid", "byPerson", "byAi"].every((k) => k in fold) || !Object.values(fold).every((x) => Number.isSafeInteger(x) && (x as number) >= 0)) return null;
  const rows = attempts.flatMap((a) => { const r = parseAttempt(a); return r ? [r] : []; });
  return { rows, counts: fold as unknown as ChallengeCounts, cut: cut === true };
}
