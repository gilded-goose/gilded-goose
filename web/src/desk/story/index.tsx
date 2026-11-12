// The landing (Track S2): the hero, then the scroll story under it. Desk.tsx renders only <Landing>, handing it the
// pieces that belong to the app (the Ask box, the egg, the chips' ask and the menu's actions), so the landing's own
// words, order and styles live here in story/ and nowhere else.
//
// The hero is on the first screen, so it ships with the Desk. Everything under it is the story's own chunk, fetched
// only after the page has loaded and painted, so the first screen's bytes and timing don't move. Until it arrives, section
// 01's opening lines (the challenge leads, right under the ask, since Joshua's Fri Nov 6 9:35 AM decision 1a; on a phone
// they are on the first screen) and a screen-tall holder keep its place, so nothing under it (or in view) shifts when it lands.
import { Suspense, type ReactNode } from "react";
import { lazyOr } from "../../states/online.ts";
import { Kept } from "../../kept.ts";
import { PROMISES, curly } from "@goose/core/promises";
import { ChallengeStart } from "./ChallengeStart.tsx";
import { appHref } from "../../menu/href.ts";
import "./hero.css";

/** Resolves after the window's load event and two frames: the first screen is painted by then. Arriving for the
 *  challenge, the story is what she came for, and there is no hero's paint to protect (prerender.ts's room cover). */
function afterFirstPaint(): Promise<void> {
  return new Promise((done) => {
    if (location.hash === "#challenge" || location.hash === "#kept") { done(); return; }
    const go = () => requestAnimationFrame(() => requestAnimationFrame(() => done()));
    if (document.readyState === "complete") go();
    else addEventListener("load", go, { once: true });
  });
}

const Story = lazyOr(() => afterFirstPaint().then(() => import("./Story.tsx")));

export function Landing({ ask, egg, sub, chips, onAsk }: {
  /** Track V's greeting and the Ask box (the app's: it stays the same box once she has asked), built in Desk.tsx. */
  ask: ReactNode;
  /** The hero's egg (Track B's), already wrapped in its own Suspense. */
  egg: ReactNode;
  /** The hero's line, built in Desk.tsx. */
  sub: ReactNode;
  /** The hero's examples, each asking Goose at a tap. They live in Desk.tsx, where Track C's claims rows read them. */
  chips: readonly string[];
  onAsk: (words: string) => void;
}) {
  return (
    <>
      <section className="dk-hero dk-in" data-story="dk-hero">
        <div className="dk-hero-copy" data-depth="0.04">
          {/* The three promises lead (Joshua, Nov 3): his sentences, one line each. What Goose is comes right under, in {sub}. */}
          <h1 aria-label={PROMISES.map((p) => p.head).join(" ")}>
            {PROMISES.map((p, i) => <span key={p.id} className="dk-mask" aria-hidden="true"><span style={{ "--i": i } as React.CSSProperties}>{curly(p.head)}</span></span>)}
          </h1>
          {sub}
          {/* One click to Studio (Joshua, Nov 5). Here, so the first paint and the page draw the same. A build with no good licence has none of it;
              past the licence's day the head's clock leaves `data-st` off (prerender-routes.ts) and only this stylesheet changes, so nothing redraws. */}
          {__STUDIO_UNTIL__ > 0 && <p className="dk-see"><a href={appHref("?desk=studio")}>See it live in AG Studio <span className="dk-arr" aria-hidden="true">›</span></a></p>}
          {ask}
          {/* S1-11 (DD at POL-3): "Try" is its own column at >=721, so a second row of chips hangs from the first chip's left
              edge, not under "Try". At <=720 the row is display: contents and the chips wrap to the gutter as before. */}
          <div className="dk-chips"><span className="dk-try">Try</span><span className="dk-chip-row">{chips.map((c) => <button key={c} type="button" onClick={() => onAsk(c)}>{c.split(/(\$\d+)/).map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}</button>)}</span></div>
        </div>
        <div className="dk-hero-egg" data-depth="0.12">{egg}</div>
      </section>
      {/* A throw in the story costs the story: the hero and the Ask box above it stay. */}
      <Suspense fallback={<div className="ds"><ChallengeStart /></div>}>
        <Kept or={<div className="ds"><ChallengeStart /></div>}><Story onAsk={onAsk} /></Kept>
      </Suspense>
    </>
  );
}
