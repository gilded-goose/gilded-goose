// The Live Threat Board's first lines (Track F), one component for the build's first paint (ledger/first-paint.tsx) and for
// the room ThreatSlot holds until the board's chunk lands, so the counter stands in one place from the first paint to the
// board. The same markup and classes ThreatCounter draws: its sheet is threat-first.css, which lands with the page.
// Before an answer it says "Reading the record…" and nothing else: no count and no promise until the record has been read.

import { appHref } from "../menu/href.ts";
import { BOARD_EYEBROW, BOARD_LOADING, BOARD_UNAVAILABLE, TRICK_HREF, TRY_LINK } from "./board-first-words.ts";
import "../ledger/shell.css"; // with the board's first lines (threat-first.css)

/** What the server says the counter says (`/api/challenge`'s `words`). */
export interface FirstWords { tries: string; outcome: string | null; second: string; alarm: boolean }

/** The counter's lines alone: the ledger's room wraps them in the board's card, Studio's shell in the counter's frame (Shell.tsx).
 *  `failed`: the board itself can't come (its chunk failed), so with no words the line names that, never "Reading" for good. */
export function BoardCounter({ words, failed = false }: { words: FirstWords | null; failed?: boolean }) {
  return (
    <div className="tb-counter">
      <p className="dk-eyebrow tb-eye"><i className="tb-live" aria-hidden="true" />{BOARD_EYEBROW}</p>
      <h2 id="tb-h" className={words?.alarm ? "tb-line alarm" : "tb-line"}><span>{words ? `${words.tries}${words.outcome ? " " : ""}` : failed ? BOARD_UNAVAILABLE : BOARD_LOADING}</span><span className="tb-line-end">{words?.outcome ?? ""}</span></h2>
      <p className="tb-second">{words?.second ?? ""}</p>
      <p className="tb-try"><a href={appHref(TRICK_HREF)}>{TRY_LINK}</a></p>
    </div>
  );
}

export function BoardFirst({ words, mark, failed = false }: { words: FirstWords | null; mark: string; failed?: boolean }) {
  return (
    <div className="tb-room">
      <section className="tb" aria-labelledby="tb-h" data-board={mark}>
        <div className="tb-card dk-glass">
          <BoardCounter words={words} failed={failed} />
        </div>
      </section>
    </div>
  );
}
