// The Live Threat Board's one seam to the Challenge's record (Track T; Joshua's Tier 2b). Track C owns the stored shape
// (`core/src/judge/attempts.ts`); everything on the board reads these names. Pure: the vite plugin, the page and the tests all load it.

export { ATTEMPT_RULES, ATTEMPT_SOURCES as TRY_SOURCES, ATTEMPT_VERDICTS, PAY_BREACHES, RULE_WORDS, THREAT_TYPES, TYPE_WORDS, challengeWords, countsOf, parseAttempt } from "@goose/core/attempts";
export type { Attempt, AttemptRule, AttemptSource as TrySource, AttemptVerdict, ChallengeCounts, ThreatType } from "@goose/core/attempts";
