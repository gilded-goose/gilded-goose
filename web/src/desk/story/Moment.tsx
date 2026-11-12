// Section 1, the live moment (Joshua, Nov 5: "Missed the drop? Set your price."; it was "Day 5. The Marsh Lights ticket fell to $84.00."). The ticket, its seller, the
// prices by day and the limit are the recorded week's (`scrollStory`). Its Approve is a practice tap: it changes this
// card's own state and nothing else. No request, no PayPal, no money; the line under it says so before and after.
// After the tap the button shows how a real run ends ("In a real run: Paid · PayPal sandbox": no tick, since nothing
// was paid here), tagged Replay, and links to the real
// sandbox payment's own claims row in Proof. Decided by default (039-landing-story.md).
import { appHref } from "../../menu/href.ts";
import { useEffect, useRef, useState } from "react";
import { MISSED_DROP, PING_NEVER_BUYS, PRACTICE_DONE, PRACTICE_TAP, pingWords, type ScrollStory } from "@goose/core/scroll";
import { anchorOf } from "@goose/core/proof";
import { SET_YOUR_PRICE } from "@goose/core/watching-words";
import { focusAsk, shortUsd } from "./motion.ts";

/** The week's track: Lantern Hall's total by day as a step line, the limit as a dashed hairline, the beat day marked. */
function Track({ story }: { story: ScrollStory }) {
  const { byDay } = story.deal;
  const n = byDay.length;
  const known = byDay.filter((c): c is number => c !== null);
  const lo = Math.min(...known, story.limit.cents) - 1000, hi = Math.max(...known, story.limit.cents) + 600;
  const y = (c: number) => ((hi - c) / (hi - lo)) * 100;
  // One step per day: flat across the day's column, then down or up at the next column's edge.
  const pts = byDay.flatMap((c, d) => (c === null ? [] : [`${(d / n) * 100},${y(c).toFixed(2)}`, `${((d + 1) / n) * 100},${y(c).toFixed(2)}`]));
  const beat = story.day - 1;
  // The line draws when the ticket's own reveal ends (Story.tsx adds .ds-in to this figure on the ticket's transitionend,
  // brand.md 10.7: never a timer). The beat's dot waits for the line to reach it, then takes its own --d-3 fade with no
  // CSS delay. It shows (.ds-shown) when the draw ends, or at once when there is no draw: this effect runs after
  // Story.tsx's layout effect, so a track already shown, or a page with no .ds-live (reduced motion), is known here.
  // Only a draw counts (.ds-in set). classList, not state: Story.tsx adds .ds-in by hand, and a React className would
  // wipe it.
  const line = useRef<SVGPolylineElement>(null);
  useEffect(() => {
    const l = line.current, fig = l?.closest("figure");
    if (!l || !fig) return;
    if (fig.classList.contains("ds-in") || !fig.closest(".ds-live")) { fig.classList.add("ds-shown"); return; }
    // elapsedTime > 0: a stray 0 s transitionend (Chrome under load, as the draw starts) must not show the dot early.
    const done = (e: TransitionEvent) => { if (e.propertyName === "clip-path" && e.elapsedTime > 0 && fig.classList.contains("ds-in")) fig.classList.add("ds-shown"); };
    l.addEventListener("transitionend", done);
    return () => l.removeEventListener("transitionend", done);
  }, []);
  return (
    <figure className="ds-track">
      <div className="ds-track-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line className="ds-track-limit" x1="0" x2="100" y1={y(story.limit.cents)} y2={y(story.limit.cents)} vectorEffect="non-scaling-stroke" />
          <polyline ref={line} className="ds-track-line" points={pts.join(" ")} pathLength={1} vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="ds-track-lim" style={{ top: `${y(story.limit.cents)}%` }}>Your {story.limit.words} {story.limit.label}</span>
        <span className="ds-track-dot" style={{ left: `${((beat + 0.5) / n) * 100}%`, top: `${y(byDay[beat]!)}%` }} aria-hidden="true" />
      </div>
      <ol className="ds-track-days" aria-label={`${story.deal.name}'s total by simulated day`}>
        {byDay.map((c, d) => (
          <li key={d} className={d === beat ? "ds-now" : undefined}>
            <span className="ds-d">Day {d + 1}</span>
            <span className="ds-p">{c === null ? "Not listed" : shortUsd(c)}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

/** The ticket's item with the show's name held on one line: at 28 px the line breaks once, and it breaks before the
 *  name ("A ticket to / The Marsh Lights, Saturday"), never inside it. Any other item keeps its own words as they are. */
function Item({ item, title }: { item: string; title: string }) {
  const name = title.replace(/ ticket$/, ""), at = name === title ? -1 : item.indexOf(name);
  if (at < 0) return <>{item}</>;
  return <>{item.slice(0, at)}<span className="ds-nowrap">{name}</span>{item.slice(at + name.length)}</>;
}

export function Moment({ story }: { story: ScrollStory }) {
  const [tapped, setTapped] = useState(false);
  const { deal } = story;
  return (
    <section className="ds-sec ds-moment" aria-labelledby="ds-moment-h" data-story="ds-moment">
      <div className="ds-moment-copy" data-sr>
        <p className="ds-kicker">A replay of a recorded practice week. The sellers and days are simulated.</p>
        <h2 id="ds-moment-h" className="ds-h2 ds-moment-h">
          <span className="ds-mask"><span>{MISSED_DROP[0]}</span></span>
          <span className="ds-mask"><span style={{ "--i": 1 } as React.CSSProperties}>{MISSED_DROP[1]}</span></span>
        </h2>
        <p className="ds-lede">
          {pingWords(story)} {PING_NEVER_BUYS}
        </p>
        <a className="ds-textlink" href={appHref("?desk=1#wants")}><span className="ds-u">{SET_YOUR_PRICE}</span> <span aria-hidden="true">›</span></a>
      </div>

      {/* The ticket, a size up so the price is the picture, rises in once (brand.md 10.7: `data-cine`, Story.tsx). Its class
          comes first: it names the ticket's motion in scripts/motion.ts's DRAWS. */}
      <article className="ds-ticket" data-cine aria-labelledby="ds-ticket-h">
        <header className="ds-ticket-top">
          <span>Ticket · fictional sellers</span>
          <span>Simulated day {story.day}</span>
        </header>
        <h3 id="ds-ticket-h" className="ds-ticket-item"><Item item={story.item} title={story.title} /></h3>
        <p className="ds-ticket-seller">{deal.name}</p>
        <p className="ds-ticket-price">
          <span className="ds-now-price ds-num">{deal.words}</span>
          <s className="ds-num" aria-label={`was ${deal.firstWords} on day ${deal.firstDay}`}>{deal.firstWords}</s>
        </p>
        <p className="ds-small">{story.totalSaid}</p>
        <Track story={story} />
        <div className="ds-ticket-act">
          {/* The button is a flex row, so its parts need a real space between them (`{" "}`: flex drops a space-only run
              from the layout, so nothing moves) or its name would read "Approve $84.00Replay". The visible words are the
              name, in order (WCAG 2.5.3 Label in Name; Round 2 a11y fix 4): no aria-label, and the practice line under
              it is the description. */}
          <button type="button" className={`ds-approve${tapped ? " ds-done" : ""}`} aria-disabled={tapped || undefined} aria-describedby="ds-tapline" onClick={() => setTapped(true)}>
            {tapped
              ? <><span className="ds-tag">Replay</span>{" "}In a real run: <span className="ds-nowrap">Paid · PayPal sandbox</span></>
              : <><svg aria-hidden="true"><use href="#dk-lock" /></svg>Approve <span className="ds-num">{deal.words}</span>{" "}<span className="ds-tag ds-tag-quiet">Replay</span></>}
          </button>
          <p id="ds-tapline" className="ds-tapline" aria-live="polite">{tapped ? PRACTICE_DONE : PRACTICE_TAP}</p>
          {tapped && (
            <div className="ds-after">
              <button type="button" className="ds-textlink" onClick={focusAsk}><span className="ds-u">Try it in the Ask box</span> <span aria-hidden="true">›</span></button>
              <a className="ds-textlink" href={appHref(`?desk=proof#${anchorOf("sandbox-capture")}`)}><span className="ds-u">A real sandbox payment, in Proof</span> <span aria-hidden="true">›</span></a>
            </div>
          )}
        </div>
      </article>
    </section>
  );
}
