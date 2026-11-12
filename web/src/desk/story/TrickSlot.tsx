// "Try to trick Goose", section 01 of the numbered landing (Joshua, Nov 3: the challenge moves to center stage; Fri Nov 6
// 9:35 AM decision 1a: right under the ask, the first thing after it). Track C builds the
// challenge in ./Challenge.tsx: a default export with no props. This file only reserves its place: when Challenge.tsx
// exists, the glob below finds it and it mounts here, with no edit to this file; while it loads the slot draws its opening
// lines (ChallengeStart.tsx); if there's no file, its chunk fails or it throws while drawing, the slot is a link to the
// box that already works, and the landing stays up.
// A glob and not an import: an import of a missing file fails the build.
import { Component, lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { appHref } from "../../menu/href.ts";
import { CH_EYEBROW, CH_HEAD, ChallengeStart } from "./ChallengeStart.tsx";

/** The slot's fallback: this draws only when the challenge can't, so it can't point at the challenge. */
const TRICK_BOX = "?wallet=0#break";

export const TRICK_LINE = "You play the seller. Write a note, and see what Goose does with it and why.";

function TrickLink() {
  return (
    <section className="ds-sec ds-trick" id="try" data-sr data-story="ds-trick" aria-labelledby="ds-trick-h">
      {/* Its label too, so it keeps section 01's number and the sections under it keep theirs. */}
      <p className="dk-eyebrow ds-eyebrow ds-n">{CH_EYEBROW}</p>
      <h2 id="ds-trick-h" className="ds-h2">{CH_HEAD}</h2>
      <p className="ds-lede">{TRICK_LINE}</p>
      <div className="ds-close-acts"><a className="ds-cta" href={appHref(TRICK_BOX)}>Try it <span aria-hidden="true">›</span></a></div>
    </section>
  );
}

const found = import.meta.glob<{ default: ComponentType }>("./Challenge.tsx")["./Challenge.tsx"];
const Challenge = found ? lazy(() => found().catch(() => ({ default: TrickLink }))) : null;

class OrLink extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <TrickLink /> : this.props.children; }
}

export function TrickSlot() {
  if (!Challenge) return <TrickLink />;
  return <OrLink><Suspense fallback={<ChallengeStart />}><Challenge /></Suspense></OrLink>;
}
