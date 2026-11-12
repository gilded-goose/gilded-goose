// The landing's first paint as HTML, for the build (web/prerender.ts; Track B session 8, Round 3's design judge fix 2).
// Never imported by the app: the page's own bundle doesn't carry react-dom/server. The ledger's pattern
// (ledger/first-paint.tsx): the same bar (SiteNav) and the same hero (story/index.tsx's Landing) the Desk renders, so the
// headline and the bar's words are on screen once main.css and the Desk's own sheets land, before main.js is even
// asked for; React draws the same markup over it when the Desk's chunk arrives (main.tsx renders only then).
//
// Only the words show (the bar and the headline): the line under the headline, the Ask box, the chips and the egg are
// drawn here for their boxes alone (prerender.ts hides them under `.dk[data-first]`), so the headline stands on the
// line the hero's grid gives it and the Desk's own copies come up as the opening has them come up. The Ask box is the
// Desk's markup without its handlers (the mic is HoldToTalk's one button and its two hidden lines). The egg is the Desk's
// own still, hidden while the opening may still play: Track F (the phone drill's largest paint was this egg, at 1.9 s,
// waiting on the Desk's code). When the Desk is late enough that the opening would be skipped anyway, prerender.ts's
// placing script shows it where it stands, so the egg is on screen with the words and not after the JS.
import { renderToStaticMarkup } from "react-dom/server";
import { SiteNav } from "../nav/SiteNav.tsx";
import { Landing } from "./story/index.tsx";
import { Greeting } from "../voice/Greeting.tsx";
import { ROOM_EYEBROW, ROOM_HEADS, ROOM_LEDE, WANTS_SUB } from "./room-heads.ts";
import { demoCatalogItems, demoPolicy } from "@goose/core";
import { SHELF_SAID, shelfFor } from "@goose/core/shelf";
import { WANTS_EMPTY } from "@goose/core/desk";
import { PINGS_HERE } from "@goose/core/watching-words";
import { DeskEmpty } from "./DeskState.tsx";
import { SetPrice } from "./SetPrice.tsx";
import { WANTS_HERO } from "./early-wants.ts";
import eggStill from "./egg.webp";

/** The Desk's hero examples (Desk.tsx `CHIPS`): only their boxes are drawn, so the words here are for the width. */
const CHIPS = ["A Marsh Lights ticket under $90", "A kettle under $60", "A used Fernway mixer"] as const;
const HIDDEN = { position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap" } as const;
const Use = ({ id }: { id: string }) => <svg aria-hidden="true"><use href={`#dk-${id}`} /></svg>;
const noop = () => {};

/** The cover for a room named in the address (prerender.ts): the head (the Challenge's with its lede and counter), in the room's own place. The bar is the landing's own copy, added when it's placed. */
export function deskRoomFirstHtml(room: keyof typeof ROOM_HEADS): string {
  return renderToStaticMarkup(
    // Never read and never tabbed to: the words are a picture of what's coming, and the real head takes focus when it lands.
    <div id="dk-room-first" aria-hidden="true" inert>
      <div className="dk" data-palette="v" data-f="rest" data-layer="shopper">
        <div className="dk-wrap"><div className="dk-app"><div className="dk-work">
          <section className="dk-pane" data-room-head={room}>
            {room === "challenge" && <p className="dk-eyebrow">{ROOM_EYEBROW}</p>}
            <p className="dk-pane-h">{ROOM_HEADS[room]}</p>
            {/* The Challenge's lede and its counter's two lines, empty: the head's early answer writes the server's words in
                (story/early-challenge.ts). They're the largest thing on its screen, so here they paint with the head, not
                2.9 s later, and the counter React draws in the same box when the cover lifts is no larger. */}
            {/* Your wants' line, and a new visitor's empty list as the pane draws it (Panes.tsx WantsPane), from the
                server's own shelf for no wants: hidden until the head's answers say the room draws exactly this
                (early-wants.ts), then it's on screen with the head and its closing line, the largest, isn't 2 s late. */}
            {room === "wants" && <WantsEmpty />}
            {room === "challenge" && <>
              <p className="ds-lede">{ROOM_LEDE}</p>
              <div className="ds-ch-count"><p className="ds-ch-line"><span /><span className="ds-ch-outcome" /></p><p className="ds-ch-second" /></div>
            </>}
          </section>
        </div></div></div>
      </div>
    </div>,
  );
}

/** A new visitor's Your wants below its head: the server's answer for no wants (main.ts /api/runs/shelf). */
function WantsEmpty() {
  const hero = shelfFor([], demoCatalogItems(), demoPolicy()).cards.find((c) => c.catalogId === WANTS_HERO);
  if (!hero) throw new Error("first-paint: the shelf has no " + WANTS_HERO + ", the empty Your wants' scene");
  return (
    <>
      <p className="dk-pane-sub">{WANTS_SUB}</p>
      <div className="dk-room-empty">
        <DeskEmpty title={WANTS_EMPTY.title} line={WANTS_EMPTY.line} action={WANTS_EMPTY.action} onAction={noop} />
        <div className="dk-scene dk-watch-first" data-id={hero.catalogId}><h2>{hero.title}</h2><SetPrice catalogId={hero.catalogId} priority="really" now={hero.max} ping /></div>
        <p className="dk-watch-said">{PINGS_HERE} {SHELF_SAID}</p>
      </div>
    </>
  );
}

export function deskFirstPaintHtml(): string {
  return renderToStaticMarkup(
    <div className="dk" data-palette="v" data-f="rest" data-layer="shopper" data-first="">
      <SiteNav here="shop" />
      <main id="main" className="dk-wrap">
        <Landing chips={CHIPS} onAsk={noop}
          sub={<p className="dk-sub">Goose shops for you. Nothing is paid until you tap.</p>}
          ask={<>
            <Greeting />
            <form className="dk-ask">
              <input aria-label="Ask for anything" placeholder="“A Gullwing Air seat”" autoComplete="off" tabIndex={-1} />
              <button type="button" className="dk-ic" tabIndex={-1}><Use id="mic" /></button>
              <span style={HIDDEN} />
              <span style={HIDDEN} />
              <button type="button" className="dk-go" tabIndex={-1}><Use id="arrow" /></button>
            </form>
          </>}
          egg={<div className="dk-egg"><div className="dk-egg-body"><img className="dk-egg-still" src={eggStill} alt="" width={600} height={720} /></div><div className="dk-egg-shadow" /></div>} />
      </main>
    </div>,
  );
}
