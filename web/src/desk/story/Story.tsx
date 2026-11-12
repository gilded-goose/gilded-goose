// The scroll story under the Desk's hero (Track S2; Joshua's Oct 30 mandate). Since Joshua's Thu Nov 5 6:20 PM ask it is
// numbered calm sections. Since his Fri Nov 6 9:35 AM decision 1a ("right under the ask, as the first thing after it. It's
// our best demo moment and a skimming judge must not miss it"), the order is: 01 try to trick it, 02 the promises, 03 a
// week with Goose, 04 Why now (the thesis), 05 what Goose keeps (with what it doesn't do), 06 for builders. The numbers are the page's own CSS counter
// (hero.css), so no number is typed and a moved section renumbers itself. The sections his list doesn't name stay, without
// a number, beside the one they belong to: Impact right after the Challenge (his Nov 4 order), the missing layer under
// Why now (its sources), and after 06 the recorded week's live moment, real prices, the three steps, the proof band and
// the close. One idea per screen. Each section is its own file; the names, prices and figures come from core
// (`@goose/core/scroll`: the recorded week, and the Proof panel's claims rows). Every feature is in the nav's
// "Everything Goose does": the landing doesn't list them a second time.
//
// Motion: each [data-sr] block is marked once, when it first scrolls into view (an IntersectionObserver); nothing loops.
// Two blocks move, once each (brand.md 10.7, cinematic): the difference's payoff line and the moment's ticket
// ([data-cine]) rise 32 px and fade in over --d-cine (900 ms) on --spring when their top crosses 70% of the screen, and
// the ticket's track draws when its rise ends. Reduced motion shows everything at once, still (here and in story.css).
import { useLayoutEffect, useRef } from "react";
import proof from "virtual:goose-proof";
import built from "virtual:goose-story";
import { storyBand } from "@goose/core/scroll";
import { Moment } from "./Moment.tsx";
import { Protects, Steps } from "./Steps.tsx";
import { Band } from "./Band.tsx";
import { Promises } from "./Promises.tsx";
import { Week } from "./Week.tsx";
import { Impact } from "./Impact.tsx";
import { MissingLayer } from "./MissingLayer.tsx";
import { TrickSlot } from "./TrickSlot.tsx";
import { Close } from "./Close.tsx";
import { ForBuilders, KeptNote, Thesis } from "./Calm.tsx";
import { RealMarket } from "./RealMarket.tsx";
import { still } from "./motion.ts";
import "./story.css";

// The recorded week as the build ran it (web/story-data.ts): run here, the Watcher's first, cold pass cost a phone 386 ms of
// one long task as this chunk loaded, inside the opening (Track P, Fri Nov 6).
const { story: STORY, week: WEEK } = built;
const BAND = storyBand(proof.groups);

export default function Story({ onAsk }: { onAsk: (words: string) => void }) {
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const blocks = [...el.querySelectorAll<HTMLElement>("[data-sr]")];
    const cine = [...el.querySelectorAll<HTMLElement>("[data-cine]")];
    const show = (b: Element) => b.classList.add("ds-in");
    // A cinematic block shown without its rise (in view at load, reduced motion, print) shows its track drawn with it.
    const reveal = (b: Element) => { show(b); const t = b.querySelector(".ds-track"); if (t) show(t); };
    // The ticket's track draws once the ticket has landed: on its own transitionend, or a cancelled rise (so the draw is
    // never lost), never on a timer (brand.md 10.7). Chrome under load can fire a stray transitionend at 0 s as the rise
    // starts (seen at 4x CPU) and then run the rise anyway: an end only counts with time elapsed, and either event is
    // checked a frame later (no transform transition still on the block).
    const landed = (e: TransitionEvent) => {
      const b = e.target as HTMLElement;
      if (!b.hasAttribute("data-cine") || e.propertyName !== "transform") return;
      if (e.type === "transitionend" && e.elapsedTime === 0) return;
      requestAnimationFrame(() => {
        if (b.getAnimations().some((a) => a instanceof CSSTransition && a.transitionProperty === "transform")) return;
        b.querySelector(".ds-track")?.classList.add("ds-in");
      });
    };
    // Already on screen or scrolled past (a reload halfway down): shown at once, never left hidden above the reader.
    if (still()) { blocks.forEach(show); cine.forEach(reveal); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } }), { rootMargin: "0px 0px -12% 0px" });
    blocks.forEach((b) => (b.getBoundingClientRect().top < innerHeight * 0.88 ? show(b) : io.observe(b)));
    // The cinematic pair: one observer, fired when a block's top crosses 70% of the screen's height. "In view at load"
    // is the page's own line (the blocks above use it: a top above 88% of the screen, or above the screen), or any word
    // of the block on screen at all (the DD's gate on b304f9c0): either one is final at once. A block whose edge alone
    // shows (at 1440x900 the natural-height hero leaves the ticket's top at 95%: its own padding, no words) waits and
    // rises on the first scroll. Measured as laid out, the hidden state's rise taken back out.
    const lift = (b: HTMLElement) => { const t = getComputedStyle(b).transform; return t === "none" ? 0 : new DOMMatrixReadOnly(t).m42; };
    const firstWord = (b: HTMLElement) => {
      const walk = document.createTreeWalker(b, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent!.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
      const range = document.createRange();
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        range.selectNodeContents(n);
        const r = range.getBoundingClientRect();
        if (r.height) return r.top;
      }
      return Infinity;
    };
    const inView = (b: HTMLElement) => b.getBoundingClientRect().top - lift(b) < innerHeight * 0.88 || firstWord(b) - lift(b) < innerHeight;
    const rise = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { show(e.target); rise.unobserve(e.target); } }), { rootMargin: "0px 0px -30% 0px" });
    cine.forEach((b) => (inView(b) ? reveal(b) : rise.observe(b)));
    el.addEventListener("transitionend", landed);
    el.addEventListener("transitioncancel", landed);
    // A print never waits for a scroll: every block final, nothing in flight, and it stays revealed after.
    const print = () => {
      io.disconnect(); rise.disconnect();
      blocks.forEach(show); cine.forEach(reveal);
      el.querySelectorAll(".ds-track").forEach((t) => t.classList.add("ds-shown"));
      el.querySelectorAll(".dk-steps-story > li").forEach((li) => li.classList.add("dk-on"));
      el.querySelector<HTMLElement>(".dk-story")?.style.setProperty("--p", "1");
      el.classList.add("ds-print");
    };
    const printed = () => el.classList.remove("ds-print");
    addEventListener("beforeprint", print);
    addEventListener("afterprint", printed);
    el.classList.add("ds-live");
    return () => {
      io.disconnect(); rise.disconnect();
      el.removeEventListener("transitionend", landed); el.removeEventListener("transitioncancel", landed);
      removeEventListener("beforeprint", print); removeEventListener("afterprint", printed);
    };
  }, []);

  return (
    <div className="ds" ref={root}>
      <TrickSlot />
      <Impact />
      <Promises onAsk={onAsk} />
      {/* The demo's moment and Channel3's real prices under it, right after the promises (Joshua, Fri Nov 6 1:10 PM: "C
          moves Channel3 up on the phone page"). They stay a pair: the real prices are there because the ticket is made up. */}
      <Moment story={STORY} />
      <RealMarket onAsk={onAsk} />
      <Week moments={WEEK} />
      <Thesis />
      <MissingLayer />
      <KeptNote />
      <ForBuilders />
      <Steps story={STORY} />
      <Protects />
      <Band band={BAND} />
      <Close />
    </div>
  );
}
