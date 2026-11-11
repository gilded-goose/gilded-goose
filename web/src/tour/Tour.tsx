// The judge tour (`?desk=tour`; Joshua, Fri Oct 30, item 1; Nov 3: the promises lead it). Its own chunk.
// Twelve stops, each the proof of one promise (core/src/view/tour.ts), each with one live button that opens the real feature in this tab,
// ticked as it's pressed. The ticks live in this browser only (localStorage, read defensively), and come back when the
// visitor returns with Back (pageshow) or from another tab (storage). A stop that isn't built end to end says so, with
// no button. Every menu item that isn't a stop is linked under the list (TOUR_ALSO), so the tour reaches everything.
//
// S1-4 (Round 1's cold consumer test: at 390 the tour was a 3,000 px list of 11 cards and 12 buttons): a stepper first,
// one stop on screen with its one filled button and Back / Next to move between stops; the whole list folds behind
// "All N stops". Coming back from a stop, the stepper shows the next one not yet seen. Nothing runs until a tap.
//
// S1-6 (Round 2): a stop's button marks this tab as on the tour (./follow.ts), so the page it opens draws the tour's
// small stepper under its bar (TourPill.tsx): "01 of N", Back, Next and the way back come along. On a wide screen the
// list sits beside the stepper (the right 40% was empty), each row moving the stepper to its stop; on a phone it stays
// folded under it.

import { useEffect, useRef, useState } from "react";
import { TOUR, TOUR_ALSO, TOUR_BUILDING, TOUR_GROUPS, TOUR_NOT_COUNTED, TOUR_SUB, TOUR_TITLE, parseTicks, tourEyebrow, tourNext, tourProgress } from "@goose/core/tour";
import { curly, promiseOf } from "@goose/core/promises";
import { SiteNav } from "../nav/SiteNav.tsx";
import { follow, readTicksRaw, writeTicks } from "./follow.ts";
import { appHref } from "../menu/href.ts";
import "./tour.css";

const readTicks = (): string[] => parseTicks(readTicksRaw());
/** The stepper's stop: the first one not yet seen (its place in the list), or the first once every stop is seen. */
const firstUnseen = (seen: readonly string[]): number => { const ahead = tourNext(seen); return ahead ? ahead.n - 1 : 0; };

export default function Tour() {
  const [seen, setSeen] = useState<string[]>(readTicks);
  const [at, setAt] = useState(() => firstUnseen(readTicks()));
  const headRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    document.title = "Judge tour · Gilded Goose";
    // Back from a stop restores this page from the cache: read the ticks again, and step on to the next stop not seen.
    // Another tab's ticks arrive too (the stepper stays where this visitor put it).
    const back = () => { const t = readTicks(); setSeen(t); setAt(firstUnseen(t)); };
    const other = () => setSeen(readTicks());
    addEventListener("pageshow", back);
    addEventListener("storage", other);
    return () => { removeEventListener("pageshow", back); removeEventListener("storage", other); };
  }, []);
  // Back and Next move focus to the stop's name, so a screen reader hears where the stepper went.
  useEffect(() => { if (moved.current) headRef.current?.focus(); moved.current = false; }, [at]);

  /** A stop's button: ticks it, and marks this tab as on the tour at that stop, so its page draws the stepper. */
  const tick = (id: string) => { const next = [...new Set([...readTicks(), id])]; writeTicks(next); setSeen(next); follow(TOUR.findIndex((s) => s.id === id)); };
  /** The side list's rows (a wide screen): the stepper moves to the stop, focus with it. */
  const pick = (i: number) => { moved.current = true; setAt(i); };
  const reset = () => { writeTicks([]); setSeen([]); setAt(0); requestAnimationFrame(() => document.querySelector<HTMLElement>(".tr-next-go")?.focus()); };
  const step = (by: number) => { moved.current = true; setAt((i) => Math.min(TOUR.length - 1, Math.max(0, i + by))); };
  const ahead = tourNext(seen);
  const next = ahead?.stop.id ?? null;
  const stop = TOUR[at]!;
  const shown = { n: at + 1, done: seen.includes(stop.id) };

  return (
    <div className="dk tr" data-palette="v">
      <SiteNav here="tour" />

      <main id="main" className="tr-wrap tr-main">
        <p className="tr-eyebrow">{tourEyebrow()}</p>
        <h1>{TOUR_TITLE}</h1>
        <p className="tr-sub">{TOUR_SUB}</p>
        <p className="tr-note">{TOUR_NOT_COUNTED}</p>

        <div className="tr-cols">
        <div className="tr-col">
        {/* The stepper: one stop, its one filled button (opens it and ticks it), Back and Next between stops. */}
        <div className="tr-case">
          <section className={`tr-stage${shown.done ? " tr-done" : ""}`} aria-labelledby="tr-stage-h">
            <p className="tr-count"><span className="tr-n">{String(shown.n).padStart(2, "0")}</span> of {TOUR.length}{shown.done && <span className="tr-seen"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7" /></svg>Seen</span>}</p>
            <p className="tr-proves">{curly(promiseOf(stop.promise).head)}</p>
            <h2 id="tr-stage-h" ref={headRef} tabIndex={-1}>{stop.name}</h2>
            <p className="tr-line">{stop.line}</p>
            {stop.href
              ? <a className="tr-go tr-primary tr-next-go" href={appHref(stop.href)} onClick={() => tick(stop.id)}>{stop.go}<span className="dk-sr">: {stop.name}</span> <span aria-hidden="true">›</span></a>
              : <p className="tr-building">{TOUR_BUILDING}</p>}
            {stop.chip && <p className="tr-chip"><span>Or try</span> <a href={appHref(stop.chip.href)} onClick={() => tick(stop.id)}>{stop.chip.words}</a></p>}
            <div className="tr-steps">
              <button type="button" className="tr-step" onClick={() => step(-1)} disabled={at === 0}><span aria-hidden="true">‹</span> Back</button>
              <p className="tr-progress" role="status">{seen.length > 0 && <>{tourProgress(seen.length)}</>}</p>
              <button type="button" className="tr-step" onClick={() => step(1)} disabled={at === TOUR.length - 1}>Next <span aria-hidden="true">›</span></button>
            </div>
          </section>
        </div>
        {seen.length > 0 && <button type="button" className="tr-reset" onClick={reset}>Start the ticks over</button>}
        </div>

        {/* A wide screen: every stop beside the stepper, one row each; a row moves the stepper to its stop. */}
        <nav className="tr-side" aria-labelledby="tr-side-h">
          <h2 id="tr-side-h" className="dk-eyebrow">All {TOUR.length} stops</h2>
          {TOUR_GROUPS.map(({ promise, stops }) => (
            <section key={promise.id} aria-label={promise.head}>
              <h3 className="tr-side-promise">{curly(promise.head)}</h3>
              <ol role="list">
                {stops.map(({ stop: s, at: i }) => (
                  <li key={s.id}>
                    <button type="button" aria-current={i === at ? "step" : undefined} className={seen.includes(s.id) ? "tr-done" : undefined} onClick={() => pick(i)}>
                      <span className="tr-n" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                      <span className="tr-side-name">{s.name}</span>
                      {seen.includes(s.id) && <span className="tr-seen"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7" /></svg><span className="dk-sr">Seen</span></span>}
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </nav>
        </div>

        {/* Every stop at once, folded: a judge who wants the whole list opens it. */}
        <details className="tr-all">
          <summary><span>All {TOUR.length} stops</span><i aria-hidden="true" /></summary>
          {TOUR_GROUPS.map(({ promise, stops }) => (
            <section key={promise.id} aria-label={promise.head}>
              <h3 className="tr-all-promise">{curly(promise.head)}</h3>
              <ol className="tr-list" role="list">
                {stops.map(({ stop: s, at: i }) => {
                  const done = seen.includes(s.id);
                  return (
                    <li key={s.id} className={`tr-stop${done ? " tr-done" : ""}${s.id === next ? " tr-next" : ""}`}>
                      <span className="tr-n" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                      <div className="tr-body">
                        <h4>{s.name}</h4>
                        <p>{s.line}</p>
                        {!s.href && <p className="tr-building">{TOUR_BUILDING}</p>}
                      </div>
                      <div className="tr-act">
                        {s.href && (
                          <a className="tr-go" href={appHref(s.href)} onClick={() => { tick(s.id); setAt(i); }}>
                            {s.go}<span className="dk-sr">: {s.name}</span> <span aria-hidden="true">›</span>
                          </a>
                        )}
                        {done && (
                          <span className="tr-seen">
                            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7" /></svg>Seen
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </details>

        <section className="tr-also" aria-labelledby="tr-also-h">
          <h2 id="tr-also-h">Also on the menu</h2>
          <ul>
            {TOUR_ALSO.map((i) => (
              <li key={i.id}><a href={appHref(i.href)}>{i.name} <span aria-hidden="true">›</span></a><span>{i.line}</span></li>
            ))}
          </ul>
        </section>
      </main>
      <footer className="tr-wrap tr-foot"><p>Fictional sellers. Practice only: no real money.</p></footer>
    </div>
  );
}
