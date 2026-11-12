// The press release's three steps (docs/launch/press-release.md, "How it works"; row `s2-story-steps`), then the
// difference. Every step is something the server or the guard really does. A hairline draws itself down the steps as
// you read; the protection step (02, Goose checks every seller) has the gold mark, and under it the recorded week shows
// that step happening (`scrollStory`): the cheapest seller asked for a gift card and was set aside before any order
// existed. Gold means protected, and only the protection line is gold. Step 02 says "the scam", never "any way to pay
// outside PayPal": a seller who wants cash in person is held for your yes, not set aside (`NEVER_REFUSE`).
import { appHref } from "../../menu/href.ts";
import { useEffect, useRef } from "react";
import { SCAM_HEAD, protectLine, type ScrollStory } from "@goose/core/scroll";
import { SUPPORT_PROTECT } from "@goose/core/promises";
import { still } from "./motion.ts";

export const STEPS: readonly (readonly [string, string])[] = [
  ["Ask", "Say what you want, or tap an example."],
  ["Goose checks every seller", "It reads each seller's words as data, never as orders, and sets the scam aside."],
  ["You tap", "You approve the exact cart in PayPal. Code checks it again before any money moves."],
];
/** The protection step's place in STEPS: its mark is gold, and the recorded week's catch sits under it. */
const GUARD = 1;

/** Step 02 in the recorded week: the sellers on the beat day, cheapest first, and the one gold line. */
function Caught({ story }: { story: ScrollStory }) {
  const { scam, limit } = story;
  return (
    <div className="ds-caught" aria-labelledby="ds-caught-h" role="group">
      <p className="dk-eyebrow ds-eyebrow">Recorded week, day {story.day}</p>
      <p id="ds-caught-h" className="ds-caught-h">{SCAM_HEAD}</p>
      <blockquote className="ds-note">
        <p>“{scam.note}”</p>
      </blockquote>
      <ul className="ds-sellers" aria-label={`Fictional sellers on simulated day ${story.day}, cheapest first`}>
        {story.sellers.map((s) => (
          <li key={s.id} className={s.verdict === "refuse" ? "ds-aside" : s.overLimit ? "ds-over" : "ds-ok"}>
            <span className="ds-who">
              <span className="ds-name">{s.name}</span>
              <span className="ds-why">
                {s.verdict === "refuse" ? `Set aside: ${s.why}` : s.verdict === "hold" ? `Waits for your yes: ${s.why}` : s.overLimit ? `Over your ${limit.words} ${limit.label}` : `Under your ${limit.words} ${limit.label}`}
              </span>
            </span>
            {s.verdict === "refuse"
              ? <s className="ds-price ds-num" aria-label={`${s.words}, not offered`}>{s.words}</s>
              : <span className="ds-price ds-num">{s.words}</span>}
          </li>
        ))}
      </ul>
      <p className="ds-protect" role="note">
        <span className="ds-protect-rule" aria-hidden="true" />
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.75 4.5 5.5v5.8c0 4.6 3.1 8.6 7.5 9.95 4.4-1.35 7.5-5.35 7.5-9.95V5.5L12 2.75Z" /><path d="m8.6 12.1 2.4 2.4 4.4-4.9" /></svg>
        <span>{protectLine(scam.name)}</span>
      </p>
    </div>
  );
}

export function Steps({ story }: { story: ScrollStory }) {
  const ref = useRef<HTMLElement>(null);
  // The trace: one passive scroll listener, written straight to a style in a frame (no re-render). Reduced motion: whole.
  useEffect(() => {
    const st = ref.current;
    if (!st) return;
    const steps = [...st.querySelectorAll<HTMLElement>(".dk-steps-story > li")];
    if (still()) { st.style.setProperty("--p", "1"); steps.forEach((li) => li.classList.add("dk-on")); return; }
    let raf = 0, most = 0;
    const paint = () => {
      raf = 0;
      const list = st.querySelector<HTMLElement>(".dk-steps-story")!;
      const r = list.getBoundingClientRect(), line = innerHeight * 0.62;
      // One way, like every reveal on the page: the trace only grows, and a lit step stays lit when you scroll back up.
      most = Math.max(most, Math.max(0, Math.min(1, (line - r.top) / r.height)));
      st.style.setProperty("--p", most.toFixed(3));
      // A step lights when its own top reaches the reading line, so a tall step (the second) doesn't hold the next back.
      steps.forEach((li) => { if (li.getBoundingClientRect().top < line) li.classList.add("dk-on"); });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(paint); };
    addEventListener("scroll", onScroll, { passive: true });
    paint();
    return () => { removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);

  return (
    <section className="ds-sec dk-story" aria-labelledby="dk-story-h" data-sr data-story="ds-steps" ref={ref}>
      <div className="dk-story-head">
        {/* "How it works" names only the ?desk=how page (Track C, one name, one page); this section says what it is. */}
        <p className="dk-eyebrow ds-eyebrow">In three steps</p>
        <h2 id="dk-story-h" className="ds-h2 dk-story-h"><span className="ds-mask"><span>What happens</span></span> <span className="ds-mask"><span style={{ "--i": 1 } as React.CSSProperties}>after you ask.</span></span></h2>
      </div>
      <div className="dk-story-body">
        <ol className="dk-steps-story">
          <span className="dk-trace" aria-hidden="true"><span /></span>
          {STEPS.map(([t, d], i) => (
            <li key={t} className={i === GUARD ? "dk-guard" : undefined}>
              <span className="dk-n">{String(i + 1).padStart(2, "0")}</span>
              <h3>{t}</h3>
              <p>{d}</p>
              {i === GUARD && <Caught story={story} />}
            </li>
          ))}
        </ol>
        {/* Under step 03, the hand-off to the page with the five parts and their files (Track C). A real link, 44 px tall. */}
        <p className="ds-steps-more"><a className="ds-textlink" href={appHref("?desk=how")}><span className="ds-u">How it works</span> <span aria-hidden="true">›</span></a></p>
      </div>
    </section>
  );
}

/** The difference, said once (brand.md 10.7, cinematic 1), in Joshua's supporting line (Nov 3): the setup, then the payoff
 *  as the biggest type on the site after the hero, which rises in once (`data-cine`, Story.tsx's reveal). The payoff's
 *  class comes first: it names the payoff's motion in `scripts/motion.ts`'s DRAWS ("ds-payoff opacity", "ds-payoff
 *  transform"). Row `p-support-line` holds PayPal's own words for what PayPal protects. */
export function Protects() {
  return (
    <section className="ds-sec dk-diff" data-sr data-story="ds-protects" aria-label="What Goose protects">
      <p className="ds-setup">{SUPPORT_PROTECT[0]}</p>
      <p className="ds-payoff" data-cine>{SUPPORT_PROTECT[1]}</p>
    </section>
  );
}
