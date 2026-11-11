// The promises' opening lines (Joshua, Thu Nov 5 6:20 PM: numbered calm sections). They led the landing until his Fri Nov 6
// 9:35 AM decision 1a put the challenge right under the ask, so the first paint now draws ChallengeStart.tsx and these are
// section 02's. The lede over the three fears ("Would you let AI shop for you?…") opened the page; with the challenge
// opening it, it went, to make room for the challenge's words on the first load (the live pins only tighten).
export const PROMISES_ID = "ds-promises-h";
export const PROMISES_LABEL = "The promises";
export const PROMISES_HEAD = "Three promises, exactly as far as the code goes.";

/** The label (its number is the page's own counter, hero.css) and the headline. */
export function PromisesLines() {
  return (
    <>
      <p className="dk-eyebrow ds-eyebrow ds-n">{PROMISES_LABEL}</p>
      <h2 id={PROMISES_ID} className="ds-h2">{PROMISES_HEAD}</h2>
    </>
  );
}
