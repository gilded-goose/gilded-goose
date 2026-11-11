// "The haggle" (Track H; Joshua, Fri Oct 30 2:30 PM, item 2): `?desk=haggle`, its own chunk, in the back room's Midnight
// with Behind the scenes and Proof. Left, the price ladder (AG Charts, a lazy chunk of its own); right, the same rounds as
// a quiet conversation. Everything on it is core's `haggleModel` over a run's ledger rows: this file types no number.
// The page leads with the haggle (Track H2; Joshua, Fri 3:40 PM): a short title, then the ladder and round by round on
// the first screen at 1440 and 390. The deal card sits under the ladder, beside the rounds, on a wide screen; on a
// narrow one it comes after the rounds, with the two buttons right under it.
//
// Where the rows come from, in order:
// - `?run=<id>`: that run's rows from the server, streamed as they are written (`/api/runs/:id/events`); rounds are
//   revealed one at a time as they arrive (only the pacing is staged).
// - "Run a live haggle": a new run on the server (`POST /api/runs`, the classic page's own route and caps; no PayPal
//   order is made until someone presses Approve), then the same stream.
// - Otherwise, or when the run's rows carry no rounds (the Desk's market compares listed prices), recorded week 1,
//   replayed in this browser through the same engine and guard, labeled "Recorded demo week, no money moved".
// The recorded week arrives settled (Round 2 data review, Track D): the whole ladder with its gold deal point and
// "Deal $47.73" on the first draw, so nobody who scrolls past in the first seconds reads a three-round chart beside
// a caption that says round 4. Its replay is a choice ("Watch it play"); a run's stream keeps its staged pacing, since
// its rounds really arrive one by one. Reduced motion shows the finished haggle at once and offers no replay.
// The replay redraws the ladder only (DD, CD-2; system.md §7): round by round and the deal card stay laid out, the
// rounds the ladder hasn't reached sit at ink-3 and come to ink as their round draws (colour only), so nothing on the
// page moves or goes away while it plays.
// Seller notes are the rows' quotes, shown as text inside quotation
// marks (React escapes them; nothing is rendered as HTML), and none of them ever reached the AI.

import { appHref } from "./menu/href.ts";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { LedgerEvent } from "@goose/core";
import { GOT } from "@goose/core/how";
import { NO_ROUNDS, NOTE_FENCED, haggleModel, ladderData, ladderSummary, moveWords, roundsReady, sourceLine, type GooseMove, type HaggleModel } from "@goose/core/haggle";
import { BackRoomNav } from "./ledger/BackRoom.tsx";
import { useOnline, lazyOr } from "./states/online.ts";
import { OFFLINE } from "./states/words.ts";
import "./haggle.css";
import { usd } from "@goose/core/money";

const Ladder = lazyOr(() => import("./haggle/Ladder.tsx"));

/** One round revealed every ROUND_MS while a haggle plays; the values are the rows', only the pacing is staged. */
const ROUND_MS = 1200;
// A failed stream or start says only what was seen (no guessed cause), and what the page shows now.
const RUN_UNREACHED = "Couldn't reach that run, so this is the recorded demo week.";
const NO_START = "The server didn't start a run. Nothing changed on this page.";
/** The press failed while she was offline: the request never reached a server, so the server isn't named. */
const NO_START_OFFLINE = `${OFFLINE.title} Nothing changed on this page.`;
/** A run whose first row hasn't come in this long is treated as unreachable (a stream can hang without failing). */
const FIRST_ROW_MS = 15_000;

const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const money = usd;

type Source = { kind: "week"; why: string | null } | { kind: "run"; id: string };

/** The window's width, kept current: under 768 is a phone; 1080 and under stacks the ladder over the rounds (haggle.css). */
function useWidth() {
  const [width, setWidth] = useState(() => innerWidth);
  useEffect(() => {
    const on = () => setWidth(innerWidth);
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  return width;
}

export default function Haggle() {
  const q = new URLSearchParams(location.search);
  const asked = q.get("run");
  const [source, setSource] = useState<Source>(asked && /^[0-9a-f]{12}$/.test(asked) ? { kind: "run", id: asked } : { kind: "week", why: q.get("from") === "desk" ? NO_ROUNDS : null });
  const [rows, setRows] = useState<LedgerEvent[]>([]);
  const [done, setDone] = useState(false);
  const [shown, setShown] = useState(0);
  const [starting, setStarting] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [played, setPlayed] = useState(false); // the ladder has played through once (for this source)
  const [replay, setReplay] = useState(false); // the shopper chose to watch the recorded rounds play
  const [lost, setLost] = useState(false); // the recorded week didn't load (brand.md §10.9's error state)
  const online = useOnline();
  // brand.md §10.9: a wait under 400 ms draws nothing, so a quick load never flashes a placeholder line.
  const [late, setLate] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLate(true), 400); return () => clearTimeout(t); }, []);
  const width = useWidth();
  const narrow = width < 768, stacked = width <= 1080;
  // The ladder's height: 220 on a phone, 300 stacked; 248 beside the rounds, so at 1440×900 the deal card's last line
  // ends above the window's bottom 96 px, the tour pill's band (DD, S1-9 stop 4; CD-3): no text under the pill at landing.
  // The box's own height is the same three numbers in haggle.css, not an inline style here: this page's first paint is drawn
  // at phone width, and hydrating never corrects an attribute, so the box stayed 220 under a 248 chart (Round 5, B2).
  const tall = narrow ? 220 : stacked ? 300 : 248;

  // The rows: the recorded week in this browser, or a run's stream from the server.
  useEffect(() => {
    let gone = false;
    setRows([]); setDone(false); setShown(0); setPlayed(false); setReplay(false); setLost(false);
    if (source.kind === "week") {
      void import("./offline.ts").then((off) => off.storyWeek()).then((w) => { if (!gone) { setRows(w.events); setDone(true); } }, () => { if (!gone) setLost(true); });
      return () => { gone = true; };
    }
    const s = new EventSource(`/api/runs/${source.id}/events`);
    let seen = 0;
    s.addEventListener("ledger", (m) => {
      seen++;
      const e = JSON.parse((m as MessageEvent).data) as LedgerEvent;
      setRows((prev) => (prev.some((p) => p.seq === e.seq) ? prev : [...prev, e]));
    });
    s.addEventListener("state", () => { setDone(true); s.close(); });
    // A dropped stream reconnects by itself (the server replays every row; seq dedupes). Refused, or no first row in
    // FIRST_ROW_MS: show the recorded week and say only that the run wasn't reached.
    const unreached = () => { if (!gone && seen === 0) { s.close(); setSource({ kind: "week", why: RUN_UNREACHED }); } };
    const wait = setTimeout(unreached, FIRST_ROW_MS);
    s.onerror = () => { if (s.readyState === EventSource.CLOSED) unreached(); };
    return () => { gone = true; clearTimeout(wait); s.close(); };
  }, [source]);

  const model = useMemo(() => haggleModel(rows), [rows]);
  const ready = roundsReady(model);

  // A finished run whose rows carry no rounds had no haggle: say so and show the recorded week instead.
  useEffect(() => {
    if (source.kind === "run" && done && model.rounds.length === 0) setSource({ kind: "week", why: NO_ROUNDS });
  }, [source, done, model.rounds.length]);

  // The recorded week is settled unless she asked to watch it play: every round at once, the deal drawn first.
  const settled = source.kind === "week" && !replay;
  // Staged pacing: the next round shows ROUND_MS after the last one, once its rows are in. Settled or reduced motion:
  // all at once.
  useEffect(() => {
    if (shown >= ready) return;
    if (still() || settled) { setShown(ready); return; }
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 300 : ROUND_MS);
    return () => clearTimeout(t);
  }, [shown, ready, settled]);

  // Settled is drawn whole on the very render its rows land, not one frame later when the effect catches up.
  const at = settled ? ready : shown;
  const playing = at < ready || (source.kind === "run" && !done);
  const finished = !playing && model.rounds.length > 0;
  const data = useMemo(() => ladderData(model, at), [model, at]);
  // A replay of the recorded week redraws the ladder only; the page around it stays as it was (CD-2).
  const replaying = source.kind === "week" && replay && model.rounds.length > 0;
  // A run that streamed in, or a replay she chose, has played through once; the recorded week's first draw hasn't.
  useEffect(() => { if (finished && (replay || source.kind === "run")) { setPlayed(true); setReplay(false); } }, [finished, replay, source.kind]);

  async function live() {
    setStarting(true); setSaid(null);
    try {
      const r = await fetch("/api/runs", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pace: true }) });
      const body = (await r.json().catch(() => ({}))) as { runId?: string; error?: string };
      if (r.ok && body.runId) {
        history.replaceState(null, "", `?desk=haggle&run=${body.runId}`);
        setSource({ kind: "run", id: body.runId });
      } else setSaid(body.error ? `${body.error} Nothing changed on this page.` : NO_START);
    } catch { setSaid(navigator.onLine ? NO_START : NO_START_OFFLINE); } // R-11: the cause the code saw when it failed
    setStarting(false);
  }

  // While a replay plays every round stays in its place; the ones the ladder hasn't reached yet are only dimmed.
  const rounds = replaying ? model.rounds : model.rounds.filter((r) => r.round <= at);
  const line = rows.length > 0 ? sourceLine(model, rows, source.kind === "week") : !late || lost ? "" : source.kind === "week" ? "Loading the recorded demo week…" : "Waiting for the run's first rows…";

  // SW (surface-words.md): the haggle's one line. The ladder shows the steps; the ledger link is on the deal card.
  const how = <p className="hg-how">The AI proposes, plain code decides.</p>;
  // The actions sit under the lede at every width (Round 4 design judge, fix 4: where the eye goes after the heading;
  // the h1 alone, never a pill jammed beside it), left-aligned with it. Both are the hairline pill: a replay of what is
  // on screen is never the primary (DD, CD-1; system.md §5). The row's geometry is fixed from the first frame (CD-3: the
  // arrival shift was this row growing): the replay pill's place is held from the first paint, hidden (no disabled pill
  // before there is anything to watch, and nothing to focus or hear) until the ladder is whole; then "Watch it play" on
  // the settled recorded week, "Watch it again" after a play-through. Both labels share one cell, so the pill is as wide
  // as its longer label from the start and "Watch it again" takes its place without moving its neighbour. Reduced
  // motion has no replay to offer, and holds no place for one (known at the first render).
  const offered = finished || played || replay;
  const watch = still()
    ? null
    : <button type="button" className="hg-btn" data-off={!offered || undefined} aria-hidden={!offered || undefined} tabIndex={offered ? undefined : -1} disabled={!offered || playing || rows.length === 0} onClick={() => { setReplay(true); setShown(0); }}>
        <span className="hg-lbl"><span data-on={!played || undefined}>Watch it play</span><span data-on={played || undefined}>Watch it again</span></span>
      </button>;
  const run = <button type="button" className="hg-btn" disabled={starting || (source.kind === "run" && !done)} onClick={() => void live()}>{starting ? "Starting a run…" : "Run a live haggle"}</button>;
  const acts = <div className="hg-acts">{watch}{run}</div>;
  const hold = (words: string) => <p className="hg-hold">{late ? words : ""}</p>;
  const end = finished || replaying ? <End m={model} week={source.kind === "week"} /> : null;

  return (
    // The back room's palette (Track B's Midnight, like .lx and .pf): its glass on the nav and the egg's one still light.
    <div className="hg dk mn-lit" data-palette="midnight">
      <BackRoomNav here="haggle" />
      <main id="main" className="hg-wrap">
        <section className="hg-intro" aria-labelledby="hg-h">
          {/* One nav layer (Round 4 design judge, fix 4): the way back to Goose is the bar's own "Shopper" view, so the
              page carries no second back link or eyebrow under it. */}
          <div className="hg-title">
            <h1 id="hg-h">The haggle</h1>
            {how}
            {acts}
            <p className="hg-source" role="status">{line && <><i aria-hidden="true" />{line}</>}</p>
            {source.kind === "week" && source.why && <p className="hg-why-week">{source.why}</p>}
            {said && <p className="hg-said" role="alert">{said}</p>}
            {/* brand.md §10.9's Error: what happened, its real cause, one action that fetches the week again. */}
            {lost && (
              <div className="hg-state" role="alert">
                <p className="hg-state-t">The recorded week didn't load.</p>
                {/* R-11, offline wins: a reload can't work offline, so while offline the cause is hers and there is no button. */}
                <p className="hg-state-l">{online ? "Its file didn't arrive. Nothing changed on this page." : `${OFFLINE.title} ${OFFLINE.line}`}</p>
                {/* A reload, not a re-run: a failed chunk import stays failed until the page loads again (main.tsx does the same). */}
                {online && <button type="button" className="hg-btn" onClick={() => location.reload()}>Try again</button>}
              </div>
            )}
          </div>
        </section>

        <div className="hg-grid">
          <div className="hg-side">
            <figure className="hg-chart" aria-labelledby="hg-chart-h">
              <h2 id="hg-chart-h">The price ladder</h2>
              {/* Only the lines are keyed: the deal, your max and the set-aside seller are labelled on the ladder itself. */}
              <ul className="hg-key" aria-hidden="true">
                <li><span className="hg-sw hg-sw-goose" />Goose's offers</li>
                {model.sellers.map((s) => <li key={s.id}><span className={`hg-sw ${s.deal ? "hg-sw-deal" : "hg-sw-seller"}`} />{s.name} asks</li>)}
              </ul>
              {/* Held at its final height from the first paint (Round 0 design judge): one still line while the rows and
                  the chart's chunk load, the same with reduced motion, so nothing jumps when the ladder draws. */}
              {/* inert as well as aria-hidden (Round 0 axe, aria-hidden-focus): AG Charts puts a focusable proxy in the
                  canvas, and a hidden thing must not take focus; the figcaption is the chart's text, the rounds its numbers. */}
              <div className="hg-canvas" aria-hidden="true" inert>
                {rows.length > 0
                  ? <Suspense fallback={hold("Drawing the ladder…")}><Ladder data={data} height={tall} narrow={narrow} /></Suspense>
                  : hold(source.kind === "week" ? "Loading the recorded week…" : "Waiting for the run's first rows…")}
              </div>
              <figcaption>{at > 0 ? ladderSummary(model, at) : "The ladder fills in as each round arrives."}</figcaption>
            </figure>
            {!stacked && end}
          </div>

          <section className="hg-talk" aria-labelledby="hg-talk-h">
            <h2 id="hg-talk-h">Round by round</h2>
            <ol className="hg-rounds" aria-live="polite">
              {rounds.map((r) => (
                <li key={r.round} className={`hg-round${replaying && r.round > at ? " hg-yet" : ""}`}>
                  {/* SW (surface-words.md, 120 words at 1440): each round shows its one fact, Goose's move (and who was set
                      aside); the asks, the sellers' quoted notes and code's reasons are one tap away. */}
                  <details>
                  <summary>
                    <h3>Round {r.round}</h3>
                    {r.move && <span className="hg-sum">{moveWords(r.move)}</span>}
                    {r.aside.map((a) => <span key={a.seq} className="hg-tag">{a.name} set aside</span>)}
                  </summary>
                  <div className="hg-open">
                  {r.asks.map((a) => (
                    <div key={a.seq} className={`hg-msg hg-seller${a.sellerId === model.deal?.sellerId ? " hg-is-deal" : ""}`}>
                      <p className="hg-who">{a.seller} asks <b>{money(a.price)}</b></p>
                      {a.quoted && <blockquote className="hg-note">“{a.quoted}”</blockquote>}
                    </div>
                  ))}
                  {r.aside.map((a) => (
                    <div key={a.seq} className="hg-msg hg-aside">
                      <p className="hg-who">{a.name} asks <s>{money(a.price)}</s> <span className="hg-tag">Set aside</span></p>
                      {a.quoted && <blockquote className="hg-note">“{a.quoted}”</blockquote>}
                      <p className="hg-reason">{a.refused.why} {NOTE_FENCED}</p>
                    </div>
                  ))}
                  {r.move && <Move m={r.move} />}
                  </div>
                  </details>
                </li>
              ))}
            </ol>
            {playing && !replaying && rows.length > 0 && <p className="hg-next" aria-hidden="true">Round {at + 1} on its way…</p>}
            {stacked && end}
          </section>
        </div>
      </main>
      <footer className="hg-wrap hg-foot"><p>Fictional sellers. PayPal sandbox. Practice only: no real money.</p></footer>
    </div>
  );
}

/** Goose's side of a round, opened: why (code's numbers), and who moved when it wasn't the AI. What it did is the
 *  round's summary line (moveWords), so it isn't said twice. */
function Move({ m }: { m: GooseMove }) {
  const reason = "reason" in m ? m.reason : "";
  if (!reason && !m.fallback) return null;
  return (
    <div className={`hg-msg hg-goose${m.kind === "take" ? " hg-took" : ""}`}>
      {reason && <p className="hg-reason">{m.kind === "take" ? `It's ${reason}.` : m.kind === "offer" ? `That's ${reason}.` : reason}</p>}
      {m.fallback && <p className="hg-reason">{m.fallback}</p>}
    </div>
  );
}

/** How it ended, from the model: the deal the guard bound, a walk, or a refusal. */
function End({ m, week }: { m: HaggleModel; week: boolean }) {
  if (m.deal) {
    return (
      <div className="hg-end">
        <div className="hg-end-top">
          <p className="hg-end-k">The deal</p>
          <p className="hg-end-big">{money(m.deal.price)}</p>
        </div>
        {/* The verb is core's (how-got.ts): a Goose counter-offer reached this seller before the take, or none did. */}
        <p>{m.deal.how
          ? `${GOT[m.deal.how].lead} ${money(m.deal.below)} below ${m.deal.seller}${m.deal.seller.endsWith("s") ? "'" : "'s"} first ask of ${money(m.deal.firstAsk)}, in round ${m.deal.round}.`
          : `From ${m.deal.seller} in round ${m.deal.round}, at its first ask.`}</p>
        <p className="hg-reason">{week ? "A recording, so nothing can be paid." : "The guard bound this exact cart. Nothing is paid without your tap in PayPal."} <a className="hg-link" href={appHref("?desk=ledger")}>See it behind the scenes <span aria-hidden="true">›</span></a></p>
      </div>
    );
  }
  return (
    <div className="hg-end">
      <p className="hg-end-k">No deal</p>
      <p>{m.ended === "refused" ? "The guard refused the cart. Nothing was bought." : "No seller Goose kept met its offer. Nothing was bought."}</p>
    </div>
  );
}
