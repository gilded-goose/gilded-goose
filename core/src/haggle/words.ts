// The haggle's numbers and fallback words, apart from engine.ts (Track F): the haggle page's first render needs these,
// and engine.ts brings the Watcher and the buyer with it.

/** A haggle move's budget (PROFILE, S3): past it, the rule engine moves and says so. */
export const MOVE_TIMEOUT_MS = 1500;
/** Rounds in a haggle unless the caller sets its own (`maxRounds`): the kettle's runs and recordings use this one. */
export const HAGGLE_ROUNDS = 5;
/** The rule ids on the guard's row when code adjusts the AI's move (`data.rule`). */
export const PATIENCE_RULE = "patience";
export const OVER_ASK_RULE = "over-ask";

/** Why a move fell back to the rule engine. A fixed category, never the provider's error text (that reaches the browser over SSE). */
export type FallbackReason = "timeout" | "bad-move" | "error" | "tape-miss" | "recorded-fallback";

/** The one plain sentence the shopper reads when a rule made the move instead of the AI. A recorded fallback says what happened in the recording. */
export function fallbackLabel(reason: FallbackReason, timeoutMs: number, recorded?: "timeout" | "error"): string {
  switch (reason) {
    case "timeout": return `The AI didn't answer within ${timeoutMs / 1000} s, so a plain rule made this move.`;
    case "bad-move": return "The AI's answer was unusable, so a plain rule made this move.";
    case "error": return "The AI call failed, so a plain rule made this move.";
    // A replay made no AI call, so it never says one failed (shared Lesson 53).
    case "tape-miss": return "The recording has no move for this point, so a plain rule made this move.";
    case "recorded-fallback": return recorded === "error"
      ? "In the recorded run the AI call failed, so a plain rule made this move."
      : "In the recorded run the AI gave no move here in time, so a plain rule made this move.";
  }
}
