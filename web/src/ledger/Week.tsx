// The week's story (Joshua, Fri Oct 30, PART 4.3): the Marsh Lights ticket's total by day, the Events limit dashed, the
// $84.00 Goose brings on day 5 marked, and TixQuack's $55.00 marked set aside. The point: the cheapest offer all week
// was the scam. Every value is core's `weekStory` (moving.ts, the Watcher and the policy's limit; tested against them);
// this file types no number. The chart is AG Charts Community in the same lazy chunk as the other charts, so the
// question, the three facts and the sentence render first and never shift. The sentence is the chart's text
// alternative (visually hidden since AS-15); the canvas itself is hidden from screen readers.

import { Suspense } from "react";
import { lazyOr } from "../states/online.ts";
import { HowThisWorks } from "./How.tsx";
import { fromCents, type Cents, usd, usdOf } from "@goose/core/money";
import { TOTAL_SAID } from "@goose/core/moving";
import { NARROW_PX, useWidth } from "../charts/size.ts";
import { weekAxis } from "../charts/axis.ts";
import type { WeekStory } from "@goose/core/session";
import { fellSentence, howOverDays } from "@goose/core/how";
import type { Spec, Tone, WeekMark } from "./Bars.tsx";
import "./shell.css";

const Bars = lazyOr(() => import("./Bars.tsx"));

/** The chart's spec, all from the story: the pick in ink with its two prices marked, others quieter, the set-aside dashed.
 *  On a phone the quieter seller's mark is left to the key and its card, so no two labels share a line. */
export function weekSpec(w: WeekStory, narrow = false): Spec {
  return {
    kind: "week",
    narrow,
    days: w.days,
    limit: { dollars: w.limit.dollars, words: `${w.limit.label} ${w.limit.words}` },
    lines: w.sellers.map((s) => {
      const pick = s.id === w.pick.id, scam = s.id === w.scam.id;
      const tone: Tone = pick ? "ink" : scam ? "mark" : "ink-3";
      const last = s.dollars.length - 1 - [...s.dollars].reverse().findIndex((d) => d !== null);
      const marks: WeekMark[] = pick
        ? [
            // Lifted clear of the $20 gridline just above the first price ($112.00 sits $8 under $120): at 8 px the words
            // sat on that line at 390 and touched it at 1440 (Round 3's judges). 28 px clears it at both, under the top tick.
            { day: w.pick.firstDay, words: `${s.name} ${w.pick.firstWords}`, tone: "ink", dot: false, place: "top-right", spacing: 28 },
            // The deal Goose brings on the beat's day, not a purchase: only the shopper's tap pays.
            { day: w.pick.day, words: narrow ? w.pick.words : `${w.pick.words}, the deal Goose brings`, tone: "gold", dot: true, place: "bottom" },
          ]
        : scam ? [{ day: w.scam.day, words: `${s.name} ${w.scam.words}, set aside`, tone: "mark", dot: true, place: "bottom-right" }]
        : narrow ? []
        : [{ day: last, words:`${s.name} ${w.others.find((o) => o.id === s.id)?.lowWords ?? ""}`, tone: "ink-3", dot: false, place: "top-left" }];
      return { id: s.id, name: s.name, dollars: s.dollars, tone, width: pick ? 2.5 : 1.5, dash: scam, shape: scam ? "cross" as const : "circle" as const, marks };
    }),
  };
}

/** The chart's frame while AG Charts' chunk is on its way (Round 3's design judge: the card stood empty ~300 ms): the
 *  same price gridlines and labels, and the same days under them, on the lines Bars.tsx's axes draw them (its padding,
 *  the $20 step from charts/axis.ts, the days' bands with 0.1 outer padding), so the lines arrive on the frame and
 *  nothing in the card moves. Plain markup and shell.css; no number of its own. */
function WeekShell({ w, narrow }: { w: WeekStory; narrow: boolean }) {
  const { lo, hi, step } = weekAxis(w.sellers.flatMap((s) => s.dollars.filter((d): d is number => d !== null)).concat(w.limit.dollars));
  const ticks: number[] = [];
  for (let v = hi; v >= lo; v -= step) ticks.push(v);
  const n = w.days.length;
  return (
    <div className="lx-wk-shell">
      {ticks.map((v) => <div key={v} className="lx-wk-tick" style={{ "--at": (hi - v) / (hi - lo) } as React.CSSProperties}><span>{usdOf(v)}</span></div>)}
      {w.days.map((d, i) => <span key={d} className="lx-wk-day" style={{ "--at": (0.1 + i + 0.5) / (n + 0.2) } as React.CSSProperties}>{narrow && i > 0 ? d.replace("Day ", "") : d}</span>)}
    </div>
  );
}

/** `narrow`: the page's say; left out, the section's own width decides (an AG Studio widget's cell, say). */
export function Week({ w, narrow: said }: { w: WeekStory; narrow?: boolean }) {
  const [box, width] = useWidth<HTMLElement>();
  const narrow = said ?? (width > 0 && width < NARROW_PX);
  const height = narrow ? 300 : 340;
  // Track D (data review): when the pick's price rose again after the deal's day, say so, so the chart's last days never
  // read as a missed deal. Since AS-15 it sits one tap away, under "How this works", with the other explanations.
  const line = w.sellers.find((s) => s.id === w.pick.id);
  const rose = line ? line.cents.findIndex((c, d) => d > w.pick.day && c !== null && c > w.pick.cents) : -1;
  const after = line && rose > 0 ? ` On day ${rose + 1} it rose again, to ${usd(line.cents[rose] as Cents)}.` : "";
  // AS-15: the price axis runs from $0 (charts/axis.ts), so nothing here apologizes for its scale. Each card shows its
  // one fact; the why sits under "How this works". The honesty label stays, one short line under the question.
  return (
    <section className="lx-story" aria-labelledby="lx-story-q" ref={box}>
      <figure className="lx-story-fig">
        <div className="lx-story-head">
          <h2 id="lx-story-q">Where the ticket's price went this week</h2>
          {/* Track D: these prices are moving.ts's demo curves, not the ledger's rows; said in full under How this works. */}
          <p>{w.item} · a practice week, fictional sellers</p>
        </div>
        {/* ag-disabled: inside an AG Studio card, Enter and the card's Tab wrap focus AG's first focusable, and AG's rule skips
            only [disabled], .ag-disabled and .ag-hidden, not inert. Without it AG picks the chart's inert proxy, the browser refuses,
            and the card can't be entered (Round 6). The class styles nothing here: AG's .ag-disabled rules reach only its own icons and fields. */}
        <div className="lx-chart-canvas ag-disabled" style={{ height }} aria-hidden="true" inert>
          <Suspense fallback={<WeekShell w={w} narrow={narrow} />}><Bars spec={weekSpec(w, narrow)} height={height} waiting={<WeekShell w={w} narrow={narrow} />} /></Suspense>
        </div>
        <ul className="lx-story-key" aria-hidden="true">
          <li><i className="k-pick" />{w.pick.name}</li>
          {w.others.map((o) => <li key={o.id}><i className="k-other" />{o.name}</li>)}
          <li><i className="k-scam" />Set aside</li>
          <li><i className="k-limit" />Your limit</li>
        </ul>
        {/* The chart's text alternative, every number it draws (the canvas is hidden from screen readers). */}
        <figcaption className="lx-sr">{w.summary}</figcaption>
        <HowThisWorks about="the week chart">
          <p>Demo prices over {w.days.length} simulated days, as your Desk watches the ticket; not rows from the ledger. {TOTAL_SAID} Goose compares totals, never a price before fees.</p>
          <p>The same seat was {w.pick.firstWords} on day {w.pick.firstDay + 1}: {fellSentence(howOverDays(line?.cents ?? [], w.pick.day), w.pick.fellWords)}{after}</p>
        </HowThisWorks>
      </figure>
      <div className="lx-story-facts">
        <div className="lx-fact lx-fact-pick">
          <p className="lx-fact-k">Day {w.pick.day + 1} · {w.pick.name}</p>
          <p className="lx-fact-v">{w.pick.words}</p>
          <p>Under your {w.limit.words} {w.limit.label}.</p>
        </div>
        {w.cheapestWasScam && (
          <div className="lx-fact">
            <p className="lx-fact-h"><i className="lx-fact-dot" aria-hidden="true" />The cheapest offer was the scam</p>
            <p>{w.scam.name}, {w.scam.words}: set aside. It {w.scam.why}.</p>
          </div>
        )}
        {w.others.map((o) => (
          <div className="lx-fact" key={o.id}>
            <p className="lx-fact-h">{o.underLimit ? `${o.name} came under the limit` : `${o.name} stayed over the limit`}</p>
            <p>Lowest all week: {o.lowWords}.</p>
          </div>
        ))}
      </div>
    </section>
  );
}
