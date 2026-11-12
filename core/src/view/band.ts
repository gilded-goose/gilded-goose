// The story's stats band, apart from scroll.ts (Track F): the Proof page draws this on its first screen, and scroll.ts's
// other sections run the Watcher when it loads, which put all of its rules on the Proof page. Pure over the Proof rows.
import type { ProofGroup, ProofItem } from "../proof.ts";

/** The band's rows, by claims id: the three sandbox money paths and the verified webhooks. The blind tests are `BLIND_ROWS`. */
export const BAND_IDS = { runs: ["sandbox-capture", "sandbox-authorize", "sandbox-void"], webhooks: "sandbox-webhooks" } as const;
/** What each sandbox path was, in the order of `BAND_IDS.runs`. */
const RUN_LABELS = ["Captured", "Held, then captured", "Held, then voided, nothing charged"] as const;

export const BAND_HEAD = "What we've checked so far.";
/** Over the table of blind tests. Both were measured before anything was changed for them (claims rows `blind-reader-on`, `fresh-code-through`). */
export const BAND_TESTS = "Two blind tests, one writer each, measured before any change. Code alone:";
/** Each set by its date, newest first; the columns of every row in `BLIND_ROWS`, in this order. */
export const BLIND_SETS = ["Nov 4 set", "Oct 28 set"] as const;
/** Joshua (Wed Nov 4): "each labeled with its set and date, never just the better one." So a row has a figure for both sets, like for like: these are all code alone, no AI. */
export const BLIND_ROWS = [
  { say: "Scam notes through", ids: ["fresh-code-through", "blind-code-through"] },
  { say: "Fair notes held for your tap", ids: ["fresh-fair-held", "blind-fair-code-held"] },
  { say: "Fair notes refused", ids: ["fresh-fair-refused", "blind-fair"] },
] as const;
/** The DD (seat 5, Wed Nov 4): "21 of 59" is a catch rate under "Goose can't be fooled into paying.", so what still stands is said right under the table. */
export const BAND_STILL = "Through the Watcher isn't paid: your limit and your tap still decide.";
/** The AI reader's lines, one per set, newest first. Lead-10's rule (Wed Nov 4): a scam figure never without the fair notes
 *  refused beside it, same size and same line, because with the reader on honest sellers pay for that catch. */
export const BLIND_READERS = [
  { set: "Nov 4 set", through: "fresh-reader-through", refused: "fresh-reader-fair-refused", held: "fresh-reader-fair-held" },
  { set: "Oct 28 set", through: "blind-reader-on", refused: "blind-fair", held: "blind-fair-reader-held" },
] as const;
/** Joshua (Wed Nov 4, 11:12): what's true of fair notes right now, not only on the recorded sets. The set is
 *  `core/test/fixtures/fair-still-refused.json`, and it holds before and after Track S's redo. Row `fair-still-refused` fails the
 *  day one of its notes stops refusing, or this count or the README, Devpost and FAQ copies differ. No rate: its 174 weren't kept. */
export const FAIR_STILL_NOTES = ["Scented with vanilla. Money-back guarantee.", "Buy from my shop here on the site."] as const;
export const FAIR_STILL = `Honest notes still get refused. A check we wrote after reading the code found 23 that say vanilla, “my shop” or “my store,” such as “${FAIR_STILL_NOTES[0]}” and “${FAIR_STILL_NOTES[1]}”`;
export const BAND_RUNS = "money paths on PayPal's sandbox, each after a buyer's tap.";
export const BAND_HOOKS = "webhooks for one run, each checked with PayPal before it wrote a ledger row. Sandbox only.";

/** The words of a set's AI-reader line, around its three figures. */
export const BAND_READER = { on: "AI reader on:", through: "scam notes through,", refused: "fair notes refused,", held: "held." } as const;
/** And what became of the notes code alone let through once the reader was on (Track D, Fri Oct 30: "0 of 60" alone hid
 *  them): each one was held for the shopper's tap, none cleared (`s2-band-held`, counted from the same recorded run). */
export const BAND_HELD = "Each code-alone miss was held instead.";
/** What a zero here is and isn't: Joshua's "It can miss a scam" stays beside it, and the new idea (row `c-innov-line`)
 *  is read here on the default path, not only under the toggle in Try to trick Goose. */
export const BAND_BOUND = "Not a rate: the AI reader can miss a scam, and can only make Goose more careful, never less.";
/** Proof's fold (round 6b, B2): the reader lines, BAND_HELD, BAND_BOUND and FAIR_STILL sit one tap under the table, so
 *  Proof's first screen fits its word line. Folding moves words and changes none; the landing's band doesn't fold. */
export const READER_FOLD = "What the AI reader changed";

export interface StoryBand {
  tests: {
    sets: readonly string[];
    rows: { say: string; cells: { id: string; figure: string }[] }[];
    readers: { set: string; through: { id: string; figure: string }; refused: { id: string; figure: string }; held: { id: string; figure: string } }[];
    /** Under the reader's lines. */
    after: readonly string[];
  };
  runs: { count: number; say: string; items: { id: string; label: string; figure: string }[] };
  webhooks: { id: string; figure: string; say: string };
}

/** "$50.13 captured" → "$50.13": the band's label says what happened. Throws if the row is worded another way. */
function captured(value: string): string {
  const m = /^(\$\d+\.\d\d) captured$/.exec(value);
  if (!m) throw new Error(`story band: "${value}" isn't "$N.NN captured"`);
  return m[1]!;
}

/** "2 webhooks" → "2": the band says the noun in its sentence. Throws if the row is worded another way. */
function countOf(value: string, noun: string): string {
  const m = new RegExp(`^(\\d+) ${noun}$`).exec(value);
  if (!m) throw new Error(`story band: "${value}" isn't "N ${noun}"`);
  return m[1]!;
}

/** The band from the Proof panel's groups (each figure a claims row's Value). Throws if a row it needs is missing. */
export function storyBand(groups: readonly ProofGroup[]): StoryBand {
  const items = new Map<string, ProofItem>(groups.flatMap((g) => g.items.map((i) => [i.id, i] as const)));
  const need = (id: string) => { const i = items.get(id); if (!i) throw new Error(`story band: no Proof row "${id}"`); return i; };
  const cell = (id: string) => ({ id, figure: need(id).figure });
  const runs = BAND_IDS.runs.map((id, k) => ({ id, label: RUN_LABELS[k]!, figure: captured(need(id).figure) }));
  return {
    tests: {
      sets: BLIND_SETS,
      rows: BLIND_ROWS.map((r) => ({ say: r.say, cells: r.ids.map(cell) })),
      readers: BLIND_READERS.map((r) => ({ set: r.set, through: cell(r.through), refused: cell(r.refused), held: cell(r.held) })),
      after: [BAND_HELD, BAND_BOUND],
    },
    runs: { count: runs.length, say: BAND_RUNS, items: runs },
    webhooks: { id: BAND_IDS.webhooks, figure: countOf(need(BAND_IDS.webhooks).figure, "webhooks"), say: BAND_HOOKS },
  };
}
