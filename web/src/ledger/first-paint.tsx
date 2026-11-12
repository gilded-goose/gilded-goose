// Behind the scenes' first paint as HTML, for the build (web/prerender.ts; Track B, session 6, Round 0 finding 8). Never
// imported by the app: the page's own bundle doesn't carry react-dom/server. The same bar (BackRoomNav → SiteNav) and
// the same hero (Hero.tsx) the page renders, drawn "reading"; the page's stylesheets land as blocking links beside
// main.css, so a phone sees the bar, the h1 and the status line before main.js is even requested, and React draws the
// same markup over it when the chunk arrives. Track F: the board's first lines too (BoardFirst.tsx), the head's early answer
// writes the real words in them. The panel and the rows wait for the stream (SessionLedger.tsx's `ready`),
// as they do on the page, so the first paint never opens one way and then jumps.

import { appHref } from "../menu/href.ts";
import { renderToStaticMarkup } from "react-dom/server";
import { BackRoomNav } from "./BackRoom.tsx";
import { LedgerHero, statusWords } from "./Hero.tsx";
import { BoardFirst } from "../studio/BoardFirst.tsx";
import { BOARD_PAINT } from "../studio/early-board.ts";

export function ledgerFirstPaintHtml(): string {
  const status = { kind: "reading" as const };
  return renderToStaticMarkup(
    <div className="lx dk mn-lit" data-palette="midnight">
      <BackRoomNav here="ledger" proofHref={appHref("?desk=proof")} />
      <main id="main" className="lx-main">
        <section className="lx-sl" aria-labelledby="sl-h">
          <LedgerHero proofHref={appHref("?desk=proof")} status={status} said={statusWords(status, 0)} />
          <BoardFirst words={null} mark={BOARD_PAINT} />
        </section>
      </main>
    </div>,
  );
}
