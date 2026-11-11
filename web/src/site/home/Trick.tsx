// Home part 6: Try to trick Goose (spec §6.1 part 6). A visitor writes a seller's note and a price; Test it runs the same
// round the server runs for every seller (`POST /api/runs/trick`, server/src/main.ts), and the answer is struck on the
// stone in the stamp's words. Send in a scammer AI calls `POST /api/runs/scammer` when the server has it switched on;
// otherwise it plays a note the scammer AI wrote earlier (`server/prompts/scam-replays.json`), labelled as recorded, and
// tests it here in the browser with the same code, uncounted. With no server, Test it runs that browser round too, and
// says so. The counter and the latest tries are read from `GET /api/challenge`; a count the rows can't account for reads
// "Live count unavailable", and a zero-paid line is never drawn. A visitor's words live in this component's state only.
import { usdOf } from "@goose/core/money";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  COUNTED_WORDS, RULE_WORDS, SCAM_CAN_ONLY, SCAM_COUNTED, SCAM_FRESH, SCAM_PITCH, SCAM_REPLAY_WORDS, SLOW_DOWN, TRY_CAPPED, TYPE_WORDS,
  notCountedWords, tryCappedKey, type AttemptAnswer, type ScamReplay,
} from "@goose/core/attempts";
import { CHALLENGE_CHIPS, IN_BROWSER_RUNS, agoWords } from "@goose/core/layers";
import { Stamp } from "../ui/Stamp.tsx";
import { Provenance } from "../ui/Provenance.tsx";
import { Button } from "../ui/Button.tsx";
import { stampWords, type Verdict } from "../ui/stamp.ts";
import { getJson, postJson } from "../live/api.ts";
import { useServer } from "../live/useServer.ts";
import type { LatestTry, TriesSplit } from "./trick.ts";
import "./trick.css";

// The replays and the split load with the first answer or press, not with the page.
const loadTrick = () => import("./trick.ts");
const loadBrowserRound = () => import("../../offline.ts").then((m) => m.challengeInBrowser).catch(() => null);

const FIRST_PRICE = "48.00";
const PRICE_SHAPE = /^\d+(?:\.\d{1,2})?$/;
const PRICE_SLIP = "Type the price in dollars, like 48.00.";
const FEED_ROWS = 5;
const POLL_MS = 15_000;

/** `GET /api/runs/trick`: who reads a note on this server, and whether the scammer AI is switched on. */
interface Status { ai: "on" | "capped" | "off"; triesLeft: number; maxNote: number; max: string; scammer?: boolean }
/** The round's card (`JudgeCard` without its rows), as the route and the browser round both send it. */
interface Card { source: string; headline: string; notice: string | null; fence: string; proposal: string; guard: string; guardPick: string | null; why: string; readerSaid?: string | null; label: string }
interface Reply extends Card { attempt: AttemptAnswer; counted?: boolean; countFull?: boolean; note?: string; price?: string; replay?: ScamReplay | null; error?: string; cap?: string; minute?: boolean }

type Where = "live" | "browser";
type Writer = { kind: "you" } | { kind: "scammer-live"; replay: ScamReplay | null } | { kind: "scammer-recorded"; why: "off" | "away" };
interface Result { n: number; note: string; price: string; verdict: Verdict | "paid"; attempt: AttemptAnswer; card: Card; where: Where; writer: Writer; countLine: string | null }

const MEANS: readonly { v: Verdict; means: string }[] = [
  { v: "clear", means: "No rule stopped it. Nothing is bought without your tap." },
  { v: "held", means: "Goose asks you first, with the reason." },
  { v: "aside", means: "Refused, with the reason." },
  { v: "over", means: "More than your limit. No note can move it." },
];

const usd = (d: string) => usdOf(Number(d).toFixed(2));

function reasonOf(r: Result, max: string): string {
  if (r.verdict === "over") return `${usd(r.price)} is over your ${usd(max)} limit, and no note can move it.`;
  return RULE_WORDS[r.attempt.rule];
}

export function Trick() {
  const server = useServer();
  const root = useRef<HTMLElement>(null);
  const answer = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState("");
  const [price, setPrice] = useState(FIRST_PRICE);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<"test" | "scammer" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [split, setSplit] = useState<TriesSplit | null | "reading">("reading");
  const [rows, setRows] = useState<LatestTry[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [near, setNear] = useState(false);
  const replayAt = useRef(Math.floor(Math.random() * 1000));
  const seq = useRef(0);

  const max = status?.max ?? "60.00";
  const scammerLive = server === "live" && status?.scammer === true;

  // Asked only once the section is close, so the page's first load is the hero's.
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver !== "function") { setNear(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near || server !== "live") return;
    let gone = false;
    void getJson<Status>("/api/runs/trick").then((s) => { if (!gone) setStatus(s !== "away" && typeof s.max === "string" ? s : null); });
    return () => { gone = true; };
  }, [near, server]);

  const readBoard = useCallback(async () => {
    const [board, trick] = await Promise.all([getJson<unknown>("/api/challenge"), loadTrick()]);
    if (board === "away") { setSplit(null); return; }
    setSplit(trick.triesSplit(board));
    setRows(trick.latestTries(board, FEED_ROWS));
    setNow(Date.now());
  }, []);

  useEffect(() => {
    if (!near) return;
    if (server === "away") { setSplit(null); return; }
    if (server !== "live") return;
    void readBoard();
    const t = setInterval(() => { if (document.visibilityState === "visible") void readBoard(); }, POLL_MS);
    return () => clearInterval(t);
  }, [near, server, readBoard]);

  // A new answer is brought into view and given focus, so a phone shows it and a screen reader reads it.
  useEffect(() => {
    if (!result) return;
    const el = answer.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const box = el.getBoundingClientRect();
    if (box.top >= 0 && box.bottom <= (visualViewport?.height ?? innerHeight)) return;
    el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }, [result]);

  async function show(o: Omit<Result, "n" | "verdict">) {
    const { attemptVerdict } = await loadTrick();
    seq.current += 1;
    setError(null);
    setResult({ ...o, n: seq.current, verdict: attemptVerdict(o.attempt) });
  }

  function failed(why: string) {
    setResult(null);
    setError(why);
  }

  /** The same round, in this browser: the same fence, Watcher and guard, no AI reader, never counted. */
  async function inBrowser(asked: { note: string; price: string }, writer: Writer, countLine: string | null) {
    const round = await loadBrowserRound();
    const r = round ? await round(asked) : { error: "The in-browser round couldn't load. Reload the page to try again." };
    if ("error" in r) { failed(r.error); return; }
    await show({ ...asked, attempt: r.attempt, card: r.card as Card, where: "browser", writer, countLine });
  }

  async function testIt(e: React.FormEvent) {
    e.preventDefault();
    if (busy || note.trim() === "") return;
    const dollars = price.trim().replace(/^\$/, "");
    if (!PRICE_SHAPE.test(dollars) || Number(dollars) <= 0) { failed(PRICE_SLIP); return; }
    const asked = { note, price: dollars };
    setBusy("test");
    try {
      if (server === "away") { await inBrowser(asked, { kind: "you" }, `Server away: this ran in your browser, ${IN_BROWSER_RUNS}. It isn't counted.`); return; }
      const mode = status?.ai === "on" && status.triesLeft > 0 ? "ai" : "rule";
      const r = await postJson<Reply>("/api/runs/trick", { ...asked, mode });
      if (r === "away") { await inBrowser(asked, { kind: "you" }, `Server away: this ran in your browser, ${IN_BROWSER_RUNS}. It isn't counted.`); return; }
      if (!r.attempt) {
        if (r.error === SLOW_DOWN || typeof r.cap !== "string") { failed(r.error ?? "Goose couldn't judge that just now. Nothing was placed."); return; }
        await inBrowser(asked, { kind: "you" }, TRY_CAPPED[tryCappedKey(r)]);
        return;
      }
      await show({ ...asked, attempt: r.attempt, card: r, where: "live", writer: { kind: "you" }, countLine: r.counted ? COUNTED_WORDS : notCountedWords(note, r.countFull === true) });
      void readBoard();
    } finally {
      setBusy(null);
    }
  }

  async function sendScammer() {
    if (busy) return;
    setBusy("scammer");
    try {
      if (scammerLive) {
        const r = await postJson<Reply>("/api/runs/scammer", {});
        if (r !== "away" && r.attempt && typeof r.note === "string") {
          const replay = r.replay ?? null;
          await show({ note: r.note, price: r.price ?? FIRST_PRICE, attempt: r.attempt, card: r, where: "live", writer: { kind: "scammer-live", replay }, countLine: replay ? null : (r.counted ? SCAM_COUNTED : null) });
          void readBoard();
          return;
        }
        if (r !== "away" && typeof r.error === "string") { failed(r.error); return; }
      }
      const { scamReplay } = await loadTrick();
      const asked = scamReplay(replayAt.current++);
      await inBrowser(asked, { kind: "scammer-recorded", why: server === "live" ? "off" : "away" }, `Ran in your browser, ${IN_BROWSER_RUNS}. A recorded note isn't counted.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section id="trick" className="sx" aria-labelledby="trick-title" ref={root}>
      <div className="wrap">
        <header className="trk-head">
          <h2 id="trick-title" className="sx-h">Try to <span className="sx-n">trick</span> Goose</h2>
          <p className="sx-lede">Write a seller’s note and a price. Goose tests your words with the same code it runs on every seller, and stamps the answer. Nothing here places an order.</p>
        </header>

        <div className="trk-grid">
          <div className="trk-work">
            <form className="trk-form" onSubmit={(e) => void testIt(e)}>
              <label className="trk-label" htmlFor="trk-note">A seller’s note</label>
              <textarea
                id="trk-note" className="trk-note" rows={4} dir="auto" value={note} maxLength={status?.maxNote ?? 500}
                onChange={(e) => setNote(e.target.value)} placeholder="Say anything a seller might…" autoComplete="off" spellCheck={false}
              />
              <div className="trk-row">
                <div className="trk-price">
                  <label className="trk-label" htmlFor="trk-price">Asking price</label>
                  <span className="trk-money"><span aria-hidden="true">$</span><input id="trk-price" className="figure" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" autoComplete="off" /></span>
                </div>
                <Button type="submit" tone="ink" disabled={note.trim() === "" || busy !== null} aria-busy={busy === "test" || undefined}>
                  {busy === "test" ? "Testing…" : "Test it"}
                </Button>
              </div>
              <div className="trk-chips" role="group" aria-label="Ready-made notes, not counted">
                <span className="trk-chips-h">Or one of ours, not counted:</span>
                {CHALLENGE_CHIPS.map((c) => (
                  <button key={c.note} type="button" className="trk-chip" aria-pressed={note === c.note} title={c.note} onClick={() => { setNote(c.note); setPrice(c.price); }}>
                    “{c.label}”
                  </button>
                ))}
              </div>
              {error ? <p className="trk-error" role="alert">{error}</p> : null}
              {server === "away" && !error ? <p className="trk-away" role="status">Server away: a note runs in your browser, {IN_BROWSER_RUNS}, and isn’t counted.</p> : null}
            </form>

            <div className="trk-ai">
              <div className="trk-ai-copy">
                <p className="trk-ai-h">Send in a scammer AI</p>
                <p className="trk-ai-p">
                  {scammerLive ? `${SCAM_PITCH} ${SCAM_CAN_ONLY}` : "The scammer AI isn’t on here, so this plays a note it wrote earlier, word for word, and tests it the same way."}
                </p>
              </div>
              <Button tone="line" onClick={() => void sendScammer()} disabled={busy !== null} aria-busy={busy === "scammer" || undefined}>
                {busy === "scammer" ? (scammerLive ? "The scammer AI is writing…" : "Testing…") : scammerLive ? "Send in a scammer AI" : "Play a recorded scammer note"}
              </Button>
            </div>
          </div>

          <div className="trk-side">
            <div className="trk-stone stone sx-pond" aria-live="polite">
              {/* The goose guards the pond: it looks at each note, and turns away from one it sets aside. */}
              {result ? <Answer key={result.n} r={result} max={max} box={answer} /> : <Empty />}
            </div>
            <Counter split={split} away={server === "away"} />
            <Feed rows={rows} now={now} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Empty() {
  return (
    <div className="trk-empty">
      <p className="trk-empty-h">Your note is tested here. It gets one of four stamps:</p>
      <ul className="trk-means" role="list">
        {MEANS.map((m) => (
          <li key={m.v}><Stamp verdict={m.v} struck={false} /><span>{m.means}</span></li>
        ))}
      </ul>
    </div>
  );
}

function writerLine(w: Writer): { tag: "live" | "recorded" | null; line: string | null } {
  if (w.kind === "scammer-live") return { tag: w.replay ? "recorded" : "live", line: w.replay ? SCAM_REPLAY_WORDS[w.replay] : SCAM_FRESH };
  // Its label, "Recorded scammer note", already says recorded; a tag beside it would say it twice.
  if (w.kind === "scammer-recorded") return { tag: null, line: "Written by the scammer AI earlier, word for word." };
  return { tag: null, line: null };
}

/** Said when a scammer AI's note wasn't set aside: the miss is shown, with what still held (row t3-scam-missed). */
const MISSED = "Not set aside: the Watcher misses some. Your limit and your tap still hold.";

function Answer({ r, max, box }: { r: Result; max: string; box: React.RefObject<HTMLDivElement | null> }) {
  const who = writerLine(r.writer);
  const tag = who.tag ?? (r.where === "live" ? "live" : null);
  return (
    <div className="trk-answer" data-verdict={r.verdict} ref={box} tabIndex={-1} role="group" aria-labelledby="trk-answer-h">
      <div className="trk-answer-tags">
        {tag ? <Provenance kind={tag} /> : null}
        <span className="trk-by">{r.writer.kind === "scammer-recorded" ? "Recorded scammer note" : r.writer.kind === "scammer-live" ? "Scammer AI’s note" : "Your note"}</span>
        <span className="trk-asked figure">asking {usd(r.price)}</span>
      </div>
      <blockquote className="trk-quote sx-note" dir="auto">{r.note}</blockquote>
      <h3 id="trk-answer-h" className="vh">Goose’s answer: {r.verdict === "paid" ? "It got through" : stampWords(r.verdict)}</h3>
      {r.verdict === "paid" ? (
        <p className="trk-paid">It got through. That should be impossible, so it’s a bug, and it’s on the record.</p>
      ) : (
        <div className="trk-verdict"><Stamp verdict={r.verdict} reason={reasonOf(r, max)} /></div>
      )}
      {r.verdict !== "paid" ? <p className="trk-held">Nothing was bought. Your {usd(max)} limit didn’t move.</p> : null}
      {r.writer.kind !== "you" && (r.verdict === "clear" || r.verdict === "held") ? <p className="trk-missed">{MISSED}</p> : null}
      {r.attempt.type !== "none" ? <p className="trk-kind"><span>Kind of trick</span> {TYPE_WORDS[r.attempt.type]}</p> : null}
      {who.line ? <p className="trk-small">{who.line}</p> : null}
      {r.countLine ? <p className="trk-small">{r.countLine}</p> : null}
      <details className="trk-how">
        <summary>How code decided</summary>
        <dl>
          <div><dt>Fence</dt><dd>{r.card.fence}</dd></div>
          <div><dt>Buyer</dt><dd>{r.card.proposal}</dd></div>
          <div><dt>Guard</dt><dd>{r.card.guard}</dd></div>
          {r.card.guardPick ? <div><dt>Its pick</dt><dd>{r.card.guardPick}</dd></div> : null}
          {r.card.readerSaid ? <div><dt>Reader</dt><dd>{r.card.readerSaid}</dd></div> : null}
          {r.card.why ? <div><dt>{r.card.source === "ai" ? "AI said" : "Rule"}</dt><dd dir="auto">{r.card.why}</dd></div> : null}
        </dl>
      </details>
    </div>
  );
}

function Counter({ split, away }: { split: TriesSplit | null | "reading"; away: boolean }) {
  if (split === "reading" && !away) return <div className="trk-count" data-count="reading"><p className="trk-count-h">Tries so far</p><p className="trk-count-line">Reading the live count…</p></div>;
  if (split === null || split === "reading") {
    return (
      <div className="trk-count" data-count="unavailable">
        <p className="trk-count-h">Tries so far</p>
        <p className="trk-count-none">Live count unavailable</p>
      </div>
    );
  }
  const parts: Array<[Verdict, number]> = [["aside", split.aside], ["held", split.held], ["over", split.over], ["clear", split.cleared]];
  return (
    <div className="trk-count" data-count="live">
      <p className="trk-count-h">Tries so far <Provenance kind="live" /></p>
      <ul className="trk-split" role="list">
        {parts.map(([v, n]) => (
          <li key={v} data-verdict={v}><span className="trk-split-n figure">{n.toLocaleString("en-US")}</span><span className="trk-split-w">{stampWords(v)}</span></li>
        ))}
      </ul>
      {split.paid > 0 ? <p className="trk-paid">{split.paid.toLocaleString("en-US")} got Goose to pay. That should be impossible, so {split.paid === 1 ? "it is a bug" : "they are bugs"}, and on the record.</p> : null}
    </div>
  );
}

function Feed({ rows, now }: { rows: LatestTry[]; now: number }) {
  if (rows.length === 0) return null;
  return (
    <div className="trk-feed">
      <p className="trk-count-h">Latest tries</p>
      <ol className="trk-tries">
        {rows.map((row, i) => (
          <li key={`${row.at}-${i}`}>
            {row.verdict === "paid" ? <span className="trk-paid-tag">Got through</span> : <Stamp verdict={row.verdict} />}
            <span className="trk-try-kind">{TYPE_WORDS[row.type]}</span>
            <span className="trk-try-when">{agoWords(row.at, now)}</span>
          </li>
        ))}
      </ol>
      <p className="trk-small trk-feed-note">The verdict, the kind of trick and the time. Never anyone’s words.</p>
    </div>
  );
}
