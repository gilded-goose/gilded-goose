// The counter's sentences, on their own so a page that only draws the count doesn't load the Challenge's whole vocabulary:
// a bundler keeps a module's used exports together, so while these sat in attempts.ts, mounting the Challenge put 4.6 KB
// of its words on the classic page (the ratchet caught it, Track P, Nov 4). No imports, on purpose.

/** The counter, always a fold of the rows. */
export interface ChallengeCounts { tried: number; setAside: number; paid: number; byPerson: number; byAi: number }

export const SLOW_DOWN = "One at a time. Give it a moment, then try again.";
export const COUNT_AWAY = "The count of tries shows when live mode answers.";
/** Always beside the count (writer, Round 5, Nov 4): "none got it to pay" would otherwise hide that a round can't move money. */
export const NO_ORDER = "This challenge places no order; it shows what code decides.";

const n = (x: number) => x.toLocaleString("en-US");

/**
 * Who the rows say tried, only where the code knows. `source: "person"` means "not the scammer AI", and one `curl` counts as
 * one, so no line credits a person (red team, Round 5, Nov 4). The scammer AI is named only once it has a row and its
 * switch is on (the default is off: the real model declined to write notes, Nov 4).
 */
function byWhom(c: ChallengeCounts, scammerOn: boolean): string | null {
  if (!scammerOn || c.byAi === 0) return null;
  return c.byAi === c.tried ? "by a scammer AI" : `${n(c.byAi)} by a scammer AI`;
}

/**
 * The counter's two lines (Joshua, Nov 3), from the fold alone. It says "tries", not "people": the code counts tries, and
 * a line about people would claim beyond it. Zero says zero, one is said as one, and the moment `paid` is above zero the
 * first line says that instead, in the same breath, with nothing to change on the page. The second line is never missing,
 * and until something pays it always ends on what holds whatever the Watcher did (Joshua: "Never hide the second line").
 */
export function challengeWords(c: ChallengeCounts, scammerOn = false): { line: string; tries: string; outcome: string | null; second: string; alarm: boolean } {
  const stillSafe = "nothing could get past your limit and your tap.";
  if (c.tried === 0) return { line: "No tries yet.", tries: "No tries yet.", outcome: null, second: "Whatever the Watcher misses, nothing can get past your limit and your tap.", alarm: false };
  const who = byWhom(c, scammerOn);
  const tries = `${n(c.tried)} ${c.tried === 1 ? "try" : "tries"} to trick Goose${who ? `, ${who}` : ""}.`;
  if (c.paid > 0) {
    return {
      line: `${tries} ${n(c.paid)} got it to pay.`,
      tries,
      outcome: `${n(c.paid)} got it to pay.`,
      second: `The Watcher set aside ${n(c.setAside)}. Getting it to pay should be impossible, so ${c.paid === 1 ? "that one is a bug" : "those are bugs"}, and on the record.`,
      alarm: true,
    };
  }
  if (c.tried === 1) {
    return {
      line: `${tries} It didn't get Goose to pay.`,
      tries,
      outcome: "It didn't get Goose to pay.",
      second: c.setAside === 1 ? `The Watcher set it aside, and even if it hadn't, ${stillSafe}` : `The Watcher found nothing to set aside, and even so, ${stillSafe}`,
      alarm: false,
    };
  }
  const first = { line: `${tries} None got it to pay.`, tries, outcome: "None got it to pay." };
  if (c.setAside === c.tried) return { ...first, second: `The Watcher set aside all ${n(c.tried)} of them, and even if it hadn't, ${stillSafe}`, alarm: false };
  if (c.setAside === 0) return { ...first, second: `The Watcher found nothing to set aside, and even so, ${stillSafe}`, alarm: false };
  return { ...first, second: `The Watcher set aside ${n(c.setAside)} of them; for the rest it found nothing to set aside, and even so, ${stillSafe}`, alarm: false };
}
