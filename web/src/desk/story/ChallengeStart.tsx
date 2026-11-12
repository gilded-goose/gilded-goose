// The Challenge's opening lines, on their own so they can ship with the first screen (Joshua, Wed Nov 4, 3d: on a phone
// the start of the Challenge shows without scrolling). The first paint, the wait for the story's chunk, the wait for the
// Challenge's own chunk and the finished Challenge all draw these same words in the same boxes, so none of them jumps.
import { useLayoutEffect, useRef, type RefObject } from "react";

export const CHALLENGE_ID = "challenge";
/** The "What counts, what's kept" fold's own address (Joshua 6:20 PM: the landing's What Goose keeps links to it); opens on arrival. */
export const KEPT_ID = "kept";
export const CH_EYEBROW = "The challenge";
export const CH_HEAD = "Try to trick Goose.";
export const CH_LEDE = "You're the seller. Write anything.";

/** The three lines. `Challenge.tsx` draws them above its counter; `ChallengeStart` draws them alone. */
export function ChallengeLines() {
  return (
    <>
      <p className="dk-eyebrow ds-eyebrow ds-n">{CH_EYEBROW}</p>
      <h2 id="ds-ch-h" className="ds-h2"><span className="ds-mask"><span>{CH_HEAD}</span></span></h2>
      <p className="ds-lede">{CH_LEDE}</p>
    </>
  );
}

// The focus goes with the heading (round 6b's a11y seat, B1). A cold #challenge lands on the first paint's heading (Desk's
// landing focuses it, and the hash is gone by then), and the story's or the Challenge's chunk then replaces that section,
// so focus fell to the page: 30 of 30 cold loads on Option B's tree, both engines. Each version of the section says, as it
// leaves, whether it held focus, and the next one takes it, only while nothing else has it. Layout effects: the leaving
// section's cleanup runs while its nodes are still in the page, and the new one's mount runs in the same commit.
let handed = false;
export function useKeepsFocus(section: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const now = document.activeElement;
    const h = section.current?.querySelector<HTMLElement>("#ds-ch-h");
    if (handed && h && (!now || now === document.body)) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
    handed = false;
    return () => { handed = !!section.current && section.current.contains(document.activeElement); };
  }, [section]);
}

/** The Challenge before its code is here: the same section and column, with only the lines in it. A screen tall, as the
 *  Challenge is, so the section under it stays off the first screen and doesn't jump away when the Challenge lands. */
export function ChallengeStart() {
  const section = useRef<HTMLElement>(null);
  useKeepsFocus(section);
  return (
    <section ref={section} className="ds-sec ds-ch" id={CHALLENGE_ID} aria-labelledby="ds-ch-h" data-story="ds-challenge" style={{ minHeight: "100vh" }}>
      <div className="ds-ch-side"><div className="ds-ch-copy" data-sr><ChallengeLines /></div></div>
    </section>
  );
}
