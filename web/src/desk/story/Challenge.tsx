// The Challenge (Joshua's Tier 2a, Nov 3), the landing's centerpiece: anyone writes a note as a seller and watches what
// Goose does with it, live: the verdict, the rule behind it and, when the Watcher sets it aside, the glass case. Under it,
// the counter, read from the server's rows and worded by `challengeWords`: never typed here. Beside the note, the other way
// in, only when the server's switch says so (`SCAMMER_AI`, off by default): one button sends a scammer AI, whose words arrive
// here as a note like any other and are drawn the same way. Off, or with no server, nothing here mentions it.
//
// The note lives in this component's state and nowhere else: never in a URL, in storage or in a store. The server answers
// with closed-list fields for the record (`attempt`) and keeps nothing else, so leaving the page is the end of it.
// Everything a seller wrote is drawn as a React text node: no HTML, and a link is only ever words.
//
// The counter's request waits until the block is near the screen (since decision 1a, Fri Nov 6, it leads under the ask, so
// that is the first load: the walks' first-load pins count its words). With no server,
// the same round runs in the browser (`offline.ts`): the same fence, Watcher and guard, said as such and never counted.
import { useCallback, useEffect, useRef, useState } from "react";
import { CAUGHT_BY, CHALLENGE_CHIPS, IN_BROWSER_RUNS, chipLayerWords, layerSaid, type ReaderState } from "@goose/core/layers";
import { NO_ORDER } from "@goose/core/count-words";
import { COUNTED_WORDS, COUNT_AWAY, HOW_COUNTED, NETWORK_FULL, READS_CAPPED, RULE_WORDS, TRY_CAPPED, tryCappedKey, SCAM_AWAY, SCAM_CAN_ONLY, SCAM_WHO_PICKS, SCAM_COUNTED, SCAM_FRESH, SCAM_NONE, SCAM_PITCH, SCAM_REPLAY_WORDS, SLOW_DOWN, TYPE_WORDS, WHAT_KEPT, WHAT_KEPT_WITH_AI, WHAT_PAYS, challengeWords, notCountedWords, type AttemptAnswer, type ChallengeCounts, type ScamReplay } from "@goose/core/attempts";
import { LIVE_WORDS, callApi, judgeMode, leftOf } from "@goose/core/live";
import { quoteNote } from "@goose/core/fence";
import { appHref } from "../../menu/href.ts";
import { liveAway, liveKnown, useLive } from "../../live.ts";
import { OFFLINE, OFFLINE_SAYS } from "../../states/words.ts";
import Case from "../moment/Case.tsx";
import { CHALLENGE_ID, KEPT_ID, ChallengeLines, useKeepsFocus } from "./ChallengeStart.tsx";
import ChallengeFeed from "./ChallengeFeed.tsx";
import { readBoard } from "../../studio/board-read.ts";
import "./challenge.css";
import { usdOf } from "@goose/core/money";

/** Where the block is: the menu, the tour and the close link here. */
const FIRST_PRICE = "48.00";
/** Said before asking the server, so a slip costs no refused request. The server still checks, and has the last word. */
const PRICE_SHAPE = /^\d+(?:\.\d{1,2})?$/;
const PRICE_SLIP = "Type your price in dollars, like 48.00.";

interface Status { ai: "on" | "capped" | "off"; aiCap?: keyof typeof READS_CAPPED | null | undefined; networkFull?: boolean | undefined; triesLeft: number; maxNote: number; max: string; challenge: ChallengeCounts | null; scammer?: boolean | undefined }
interface Card { source: string; headline: string; notice: string | null; fence: string; proposal: string; guard: string; guardPick: string | null; why: string; reader?: "read" | "off" | "timeout" | "error" | "bad-answer"; readerSaid?: string | null; label: string }
type Where = "live" | "away" | "offline" | "capped";
interface Answer { note: string; price: string; card: Card; attempt: AttemptAnswer; counted: boolean; full: boolean; where: Where; capped?: keyof typeof TRY_CAPPED; ai?: { replay: ScamReplay | null; tried: AttemptAnswer["type"] } }

const IN_BROWSER: Record<Exclude<Where, "live">, string> = {
  away: `Live mode isn't answering, so this round ran in your browser, ${IN_BROWSER_RUNS}. It isn't counted.`,
  offline: `${OFFLINE.title} ${OFFLINE_SAYS.round}`,
  capped: TRY_CAPPED.minute,
};

const TITLE = { "set-aside": "Set aside.", refused: "Refused.", held: "Held for your tap.", paid: "It got through." } as const;

export default function Challenge() {
  const root = useRef<HTMLElement>(null);
  const result = useRef<HTMLDivElement>(null);
  const fold = useRef<HTMLDetailsElement>(null);
  const noteBox = useRef<HTMLTextAreaElement>(null);
  const [note, setNote] = useState("");
  const [price, setPrice] = useState(FIRST_PRICE);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  // A #challenge arrival's early answer (early-challenge.ts): the cover drew its counts, so the counter starts from them and
  // draws the same words in the same box when the cover lifts. Until this browser's own read is in; never while away.
  const [early, setEarly] = useState<ChallengeCounts | null>(() => readBoard(window.__chal?.v)?.counts ?? null);
  const [down, setDown] = useState(false);
  const [near, setNear] = useState(false);
  // Each answer's case is its own, so a second set-aside rises again.
  const [nth, setNth] = useState(0);
  // Bumped by a round the server answered, so the feed reads the record again at once.
  const [tried, setTried] = useState(0);
  const live = useLive();

  // Opened on its own link (the menu, the tour): this block arrives after the page does, so the browser's jump missed it.
  // Its heading keeps the focus the first paint's had (useKeepsFocus, ChallengeStart.tsx: a cold #challenge lost it).
  useKeepsFocus(root);
  useEffect(() => {
    if (location.hash === `#${CHALLENGE_ID}`) root.current?.scrollIntoView();
    const el = root.current;
    if (!el || typeof IntersectionObserver !== "function") { setNear(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // #kept (the landing's What Goose keeps links here): the fold opens and comes into view, on arrival and on a later tap.
  useEffect(() => {
    const open = () => { if (location.hash !== `#${KEPT_ID}` || !fold.current) return; fold.current.open = true; fold.current.scrollIntoView({ block: "start" }); };
    open();
    addEventListener("hashchange", open);
    return () => removeEventListener("hashchange", open);
  }, []);

  // The early answer, if it was still on its way when the block came.
  useEffect(() => {
    let gone = false;
    void window.__chal?.p?.then((j) => { if (!gone) setEarly((e) => e ?? readBoard(j)?.counts ?? null); });
    return () => { gone = true; };
  }, []);

  // The counter, once the block is close and whenever live mode comes back. A read: no session, no cookie.
  useEffect(() => {
    if (!near || live !== "up") return;
    let gone = false;
    void fetch("/api/runs/trick").then((r) => (r.ok ? (r.json() as Promise<Status>) : null)).then((s) => { if (!gone) { setStatus(s); setDown(s === null); } }).catch(() => { if (!gone) setDown(true); });
    return () => { gone = true; };
  }, [near, live]);

  const mode = judgeMode(status?.ai ?? null, status?.triesLeft ?? 0, live, down);
  const away = live === "away" || live === "gone" || live === "offline" || down;
  const max = status?.max ?? "60.00";
  const noteMax = status?.maxNote ?? 500;
  const scammerOn = status?.scammer === true;
  // What a chip may promise of the AI reader. While the server hasn't said, it isn't promising anything new.
  const reader: ReaderState = away ? "away" : status === null || mode === "ai" ? "on" : "rested";

  function show(a: Omit<Answer, "note" | "price">, asked: { note: string; price: string }) {
    setAnswer({ ...a, ...asked });
    setNth((n) => n + 1);
    if (a.where === "live") setTried((n) => n + 1);
  }

  // The answer lands below the fold on most screens (Joshua, Nov 4): bring it up, unless all of it is already in view. Focus moves
  // to it too, so a screen reader reads the verdict, and it moves first with no jump, so the scroll here is the only one. An
  // effect on the answer's own count, never a frame from `show`: a reply arrives outside any event, and a frame can fire before
  // React has drawn the verdict.
  useEffect(() => {
    if (nth === 0) return;
    const r = result.current?.querySelector<HTMLElement>(".ds-ch-verdict");
    if (!r) return;
    r.focus({ preventScroll: true });
    const box = r.getBoundingClientRect();
    if (box.top >= parseFloat(getComputedStyle(r).scrollMarginTop) && box.bottom <= (visualViewport?.height ?? innerHeight)) return;
    r.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }, [nth]);

  // The error sits above the scammer button, so a press near the top of a phone's screen would fail with nothing to see (the
  // verdict it clears is gone too). Bring it into view, unless it's already there. The alert role reads it out either way.
  useEffect(() => {
    if (!error) return;
    const e = root.current?.querySelector<HTMLElement>(".ds-ch-error");
    if (!e) return;
    const box = e.getBoundingClientRect();
    if (box.top >= parseFloat(getComputedStyle(e).scrollMarginTop) && box.bottom <= (visualViewport?.height ?? innerHeight)) return;
    e.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  }, [error]);

  // The feed's read of the record, so the counter moves with a class's tries, not only on this browser's own (Joshua, Nov 4, 8:57:
  // "update live"). Never down: a read that left before this browser's own try landed would take its number back for ten seconds.
  const heard = useCallback((challenge: ChallengeCounts) => {
    setStatus((s) => (s && (!s.challenge || challenge.tried >= s.challenge.tried) ? { ...s, challenge } : s));
  }, []);

  // Back to the box with the last note selected, so typing replaces it and a small change is one tap away.
  function tryAgain(e: React.MouseEvent) {
    e.preventDefault();
    const box = noteBox.current;
    if (!box) return;
    box.scrollIntoView({ block: "center" });
    box.focus({ preventScroll: true });
    box.select();
  }

  // A press that failed leaves no earlier verdict under its error, where it would read as this press's result (red team, B1).
  // Cleared on failure, not at the press's start, so a good run doesn't make the page jump.
  function failed(why: string) {
    setAnswer(null);
    setError(why);
  }

  async function inBrowser(asked: { note: string; price: string }, where: Exclude<Where, "live">, capped?: keyof typeof TRY_CAPPED) {
    const off = await import("../../offline.ts").catch(() => null);
    const r = off ? await off.challengeInBrowser(asked) : { error: navigator.onLine ? "The recorded demo couldn't load. Reload the page to try again." : `${OFFLINE.title} ${OFFLINE.line}` };
    if ("error" in r) { failed(r.error); return; }
    show({ card: r.card as Card, attempt: r.attempt, counted: false, full: false, where, ...(capped ? { capped } : {}) }, asked);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy || aiBusy || note.trim() === "") return;
    const dollars = price.trim().replace(/^\$/, "");
    if (!PRICE_SHAPE.test(dollars) || Number(dollars) <= 0) { failed(PRICE_SLIP); return; }
    setBusy(true); setError(null);
    if (matchMedia("(pointer: coarse)").matches && document.activeElement instanceof HTMLElement) document.activeElement.blur(); // the keyboard would cover the answer
    const asked = { note, price: dollars };
    try {
      const known = await liveKnown();
      if (known !== "up") { await inBrowser(asked, known === "offline" ? "offline" : "away"); return; }
      const reply = await callApi(() => fetch("/api/runs/trick", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...asked, mode }) }));
      if (reply.kind === "refused" && reply.error === SLOW_DOWN) { failed(SLOW_DOWN); return; }
      if (reply.kind === "refused" && reply.status === 429) { await inBrowser(asked, "capped", tryCappedKey(reply)); return; }
      const left = leftOf(reply);
      if (left.kind === "error") { failed(left.error); return; }
      if (left.kind === "browser") { liveAway(); setDown(true); await inBrowser(asked, navigator.onLine ? "away" : "offline"); return; }
      const body = left.body as unknown as Status & Card & { attempt: AttemptAnswer; counted: boolean; countFull: boolean };
      setDown(false);
      setStatus({ ai: body.ai, aiCap: body.aiCap, networkFull: body.networkFull, triesLeft: body.triesLeft, maxNote: body.maxNote, max: body.max, challenge: body.challenge, scammer: body.scammer });
      show({ card: body, attempt: body.attempt, counted: body.counted, full: body.countFull, where: "live" }, asked);
    } finally {
      setBusy(false);
    }
  }

  async function sendScammer() {
    if (busy || aiBusy) return;
    setAiBusy(true); setError(null);
    try {
      if (await liveKnown() !== "up") { failed(SCAM_AWAY); return; }
      const reply = await callApi(() => fetch("/api/runs/scammer", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
      if (reply.kind === "refused") { failed((reply.status === 429 ? reply.error : null) ?? SCAM_NONE.off); return; }
      const left = leftOf(reply);
      if (left.kind === "error") { failed(left.error); return; }
      if (left.kind === "browser") { liveAway(); setDown(true); failed(SCAM_AWAY); return; }
      const body = left.body as unknown as Status & Card & { attempt: AttemptAnswer; counted: boolean; countFull: boolean; note?: string; price?: string; replay: ScamReplay | null; tried: AttemptAnswer["type"]; unavailable?: boolean };
      setDown(false);
      setStatus({ ai: body.ai, aiCap: body.aiCap, networkFull: body.networkFull, triesLeft: body.triesLeft, maxNote: body.maxNote, max: body.max, challenge: body.challenge, scammer: body.scammer });
      if (body.unavailable || body.note === undefined) { failed(SCAM_NONE[body.replay ?? "off"]); return; }
      show({ card: body, attempt: body.attempt, counted: body.counted, full: body.countFull, where: "live", ai: { replay: body.replay, tried: body.tried } }, { note: body.note, price: body.price ?? FIRST_PRICE });
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <section className="ds-sec ds-ch" id={CHALLENGE_ID} ref={root} aria-labelledby="ds-ch-h" data-story="ds-challenge">
      <div className="ds-ch-side">
        <div className="ds-ch-copy" data-sr>
          <ChallengeLines />
        </div>
        {/* Its own block, so on a phone the note and Send come right under "Write anything" and the tally after them (the
            DD on Option B, Fri Nov 6: a first screen with the counter and no field read as an empty state). challenge.css. */}
        <div className="ds-ch-tally" data-sr>
          <Counter counts={status?.challenge ?? (away ? null : early)} known={status !== null} away={away} full={status?.networkFull === true} />
          <p className="ds-small ds-ch-noorder">{NO_ORDER}</p>
        </div>
        <ChallengeFeed live={live === "up" && !down} fresh={tried} onCounts={heard} />
      </div>

      <div className="ds-ch-work">
        <form className="ds-ch-form" onSubmit={send} data-sr>
          <label className="ds-ch-label" htmlFor="ds-ch-note">Your note</label>
          <textarea id="ds-ch-note" ref={noteBox} className="ds-ch-note" rows={3} dir="auto" value={note} maxLength={noteMax} onChange={(e) => setNote(e.target.value)} placeholder="Say anything a seller might…" autoComplete="off" />
          {note.length >= noteMax && <p className="ds-small ds-ch-cut" role="status">Notes stop at {noteMax} characters.</p>}
          <div className="ds-ch-row">
            <div className="ds-ch-price">
              <label className="ds-ch-label" htmlFor="ds-ch-price">Your price</label>
              <span className="ds-ch-money"><span aria-hidden="true">$</span><input id="ds-ch-price" className="ds-num" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" autoComplete="off" /></span>
            </div>
            <button type="submit" className="ds-cta ds-ch-send" disabled={note.trim() === "" || aiBusy} aria-busy={busy || undefined} data-busy={busy || undefined}>{busy ? "Goose is reading…" : "Send to Goose"}</button>
          </div>
          <div className="ds-ch-chips" role="group" aria-label="Ready-made notes">
            <span className="ds-small" aria-hidden="true">Or ours, not counted:</span>
            {CHALLENGE_CHIPS.map((c) => (
              <button key={c.note} type="button" className="ds-ch-chip" data-layer={c.layer} aria-pressed={note === c.note} title={c.note} onClick={() => { setNote(c.note); setPrice(c.price); }}>“{c.label}” <span className="ds-ch-chip-layer">{chipLayerWords(c.layer, reader)}</span></button>
            ))}
          </div>
          {error && <p className="ds-ch-error" role="alert">{error}</p>}
          {!away && !error && status?.aiCap && <p className="ds-small ds-ch-away" role="status">{READS_CAPPED[status.aiCap]}</p>}
          {away && !error && <p className="ds-small ds-ch-away" role="status">{live === "offline" ? `${OFFLINE.title} ${OFFLINE.line}` : live === "gone" ? LIVE_WORDS.gone : `Live mode isn't answering yet, so a note runs in your browser, ${IN_BROWSER_RUNS}.`}</p>}
        </form>

        {scammerOn && <div className="ds-ch-ai">
          <div>
            <p className="ds-ch-ai-h">Think we wrote the scammer? Let an AI try.</p>
            <p className="ds-small ds-ch-ai-p">{SCAM_PITCH}</p>
          </div>
          <button type="button" className="ds-ch-ai-go" onClick={() => void sendScammer()} disabled={busy} aria-busy={aiBusy || undefined} data-busy={aiBusy || undefined}>{aiBusy ? "The scammer AI is writing…" : "Send in a scammer AI"}</button>
        </div>}

        <div className="ds-ch-result" ref={result} data-verdict={answer?.attempt.verdict}>
          {answer && <Verdict key={nth} a={answer} max={max} again={tryAgain} />}
        </div>

        <details className="ds-ch-fold" id={KEPT_ID} ref={fold}>
          <summary>What counts, what's kept <span aria-hidden="true">›</span></summary>
          <p>{WHAT_PAYS}</p>
          <p>{HOW_COUNTED}</p>
          <p>{scammerOn ? WHAT_KEPT_WITH_AI : WHAT_KEPT}</p>
          {scammerOn && <p>{SCAM_CAN_ONLY}</p>}
          {scammerOn && <p>{SCAM_WHO_PICKS}</p>}
        </details>
      </div>
    </section>
  );
}

function Counter({ counts, known, away, full }: { counts: ChallengeCounts | null; known: boolean; away: boolean; full: boolean }) {
  // Until the count is read, the lines it will take (the count, then two of what holds), blank: since the challenge leads
  // the page (Option B) the section under it is on screen, and a one-line wait jumped it 68 px when the count came
  // (challenge-landing step 4, Nov 6).
  if (!counts) return known || away ? <p className="ds-small ds-ch-count" data-tried="unknown">{COUNT_AWAY}</p> : <div className="ds-ch-count" aria-hidden="true"><p className="ds-ch-line">&nbsp;</p><p className="ds-ch-second">&nbsp;<br />&nbsp;</p></div>;
  const words = challengeWords(counts, counts.byAi > 0); // by the rows, not the switch: AI tries stay named after a flip back off, as on the board
  return (
    <div className="ds-ch-count" data-tried={counts.tried} data-alarm={words.alarm || undefined}>
      <p className="ds-ch-line">{words.tries}{words.outcome && <> <span className="ds-ch-outcome">{words.outcome}</span></>}</p>
      <p className="ds-ch-second">{words.second}</p>
      {full && <p className="ds-small ds-ch-full">{NETWORK_FULL}</p>}
    </div>
  );
}

function Verdict({ a, max, again }: { a: Answer; max: string; again: (e: React.MouseEvent) => void }) {
  const { verdict, rule, type } = a.attempt;
  const shownType = a.ai && verdict !== "set-aside" ? a.ai.tried : type;
  const quoted = quoteNote(a.note);
  const caught = layerSaid({ verdict, rule, price: a.price, max, reader: a.card.reader, live: a.where === "live", example: CHALLENGE_CHIPS.find((c) => c.note === a.note)?.layer ?? null });
  return (
    <div className="ds-ch-verdict" tabIndex={-1} role="group" aria-labelledby="ds-ch-title" aria-describedby="ds-ch-say">
      {a.ai && <p className="ds-ch-who">{a.ai.replay ? SCAM_REPLAY_WORDS[a.ai.replay] : SCAM_FRESH}</p>}
      <p id="ds-ch-title" className="ds-ch-title" data-paid={verdict === "paid" || undefined}>{TITLE[verdict]}</p>
      <p id="ds-ch-say" className="ds-ch-say">{verdict === "paid" ? "That should be impossible, so it's a bug, and it's on the record." : verdict === "set-aside" ? `Nothing bought. Your ${usdOf(max)} limit didn't move.` : a.card.headline}</p>
      <dl className="ds-ch-facts">
        {caught && <div data-caught><dt>{CAUGHT_BY}</dt><dd>{caught}</dd></div>}
        <div><dt>The rule</dt><dd>{RULE_WORDS[rule]}</dd></div>
        {shownType !== "none" && <div><dt>{verdict === "set-aside" ? "Kind of trick" : a.ai ? "The scammer AI tried" : "Looks like"}</dt><dd>{TYPE_WORDS[shownType]}</dd></div>}
      </dl>
      {(verdict === "set-aside" || a.ai) && <div dir="auto" className="ds-ch-case"><Case quoted={quoted} /></div>}
      {a.card.notice && <p className="ds-small">{a.card.notice}</p>}
      {!a.ai?.replay && <p className="ds-small ds-ch-counted">{a.where === "live" ? (a.counted ? (a.ai ? SCAM_COUNTED : COUNTED_WORDS) : notCountedWords(a.note, a.full)) : a.capped ? TRY_CAPPED[a.capped] : IN_BROWSER[a.where]}</p>}
      <details className="ds-ch-how">
        <summary>How code decided <span aria-hidden="true">›</span></summary>
        <dl>
          <div><dt>Fence</dt><dd>{a.card.fence}</dd></div>
          <div><dt>Buyer</dt><dd>{a.card.proposal}</dd></div>
          <div><dt>Guard</dt><dd>{a.card.guard}</dd></div>
          {a.card.guardPick && <div><dt>Its pick</dt><dd>{a.card.guardPick}</dd></div>}
          {a.card.readerSaid && <div><dt>Reader</dt><dd>{a.card.readerSaid}</dd></div>}
          {a.card.why && <div><dt>{a.card.source === "ai" ? "AI said" : "Rule"}</dt><dd dir="auto">{a.card.source === "ai" ? <q>{a.card.why}</q> : a.card.why}</dd></div>}
        </dl>
        <p className="ds-small">{a.card.label.replace(/Claude Haiku [\d.]+/g, "an AI model")}</p>
      </details>
      <p className="ds-ch-next">
        <a className="ds-textlink" href="#ds-ch-note" onClick={again}><span className="ds-u">Try another note</span> <span aria-hidden="true">›</span></a>
        {a.where === "live" && <a className="ds-textlink" href={appHref("?desk=ledger&tried=1")}><span className="ds-u">See it behind the scenes</span> <span aria-hidden="true">›</span></a>}
      </p>
    </div>
  );
}
