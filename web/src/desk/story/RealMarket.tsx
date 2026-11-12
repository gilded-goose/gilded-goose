// Real prices on the landing (Joshua, Nov 5: visible on the landing's demo path, not just somewhere on the site). The demo's
// ticket is fictional, so real stores can't price it: this section, under the demo's moment, shows the recording for an item
// they do sell, with a flag in it. Reference prices only: RealPrices.tsx says so, with the date, and holds no button.
// Below the first screen and lazy twice over: this file ships with the story chunk, and the panel's own chunk and its one GET
// wait until the section is near the window. With no answer (the Pages mirror has no server), nothing is drawn here at all.
import { Suspense, useEffect, useRef, useState } from "react";
import { Kept } from "../../kept.ts";
import { lazyOr } from "../../states/online.ts";

const RealPrices = lazyOr(() => import("../RealPrices.tsx"));

/** The ask whose recording holds references and a flag (core/test/channel3.test.ts pins that the file still does). */
export const REAL_ASK = "A backpack";
/** Its one tap: that ask, as a visitor's own run, which is the only thing here that writes anything (claims row c3-landing-try). */
export const REAL_TRY = "Ask Goose for a backpack";

export function RealMarket({ onAsk }: { onAsk: (words: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const io = new IntersectionObserver((seen) => { if (seen.some((s) => s.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div className="ds-sec ds-real" ref={root}>
      {near && <Kept><Suspense fallback={null}><RealPrices words={REAL_ASK} landing /></Suspense></Kept>}
      <button type="button" className="ds-promise-try ds-real-try" onClick={() => onAsk(REAL_ASK)}>{REAL_TRY}</button>
    </div>
  );
}
