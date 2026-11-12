// The judge box (M2 step 2, ADR 0009) laid out as v3 (step 4): the judge plays a seller, a note and an asking price,
// and one press fills two cards built the same way. Left, guard on: one buyer move and the guard's verdict. Right,
// guard off (a control): the same price sent straight to PayPal's sandbox with no guard, as an agent that believed the
// note would. Every line on the left is written by code except the buyer's own sentence, which comes last: in AI mode
// the note can steer it, so it never sits above the guard (011 §3). The card names what read the text (Lesson 24).
// Nothing is kept: the cards live in this component's state only.

import { useEffect, useState } from "react";
import { JUDGE_CHIPS } from "@goose/core/chips";
import { COUNT_AWAY, SLOW_DOWN, challengeWords, type ChallengeCounts } from "@goose/core/count-words";
import { LIVE_WORDS, PAIR_WORDS, callApi, judgeMode, leftOf, rightOf, type RightCard } from "@goose/core/live";
import { liveAway, liveKnown, useLive } from "./live.ts";
import { useOnline } from "./states/online.ts";
import { OFFLINE, OFFLINE_SAYS } from "./states/words.ts";
import RECORDED from "../../docs/fixtures/control-order.json";
import { FAKE_RAIL } from "./rail.ts";
import { usdOf } from "@goose/core/money";

type Mode = "rule" | "ai";
interface Status { ai: "on" | "capped" | "off"; triesLeft: number; maxNote: number; max: string; history: { rule: number; ai: number }; challenge?: ChallengeCounts | null }
interface Card {
  source: "ai" | "rule" | "rule-capped" | "rule-off" | "rule-fallback";
  headline: string;
  notice: string | null;
  fence: string;
  proposal: string;
  guard: string;
  guardPick: string | null;
  label: string;
  why: string;
  tookYours: boolean;
  /** W41 part 3: whether the AI reader read your words, or why not; null when the round didn't ask the AI. */
  readerSaid?: string | null;
  reader?: string;
  ai: Status["ai"];
  triesLeft: number;
  challenge?: ChallengeCounts | null;
  /** H1: the plain-rule round ran in the browser: live mode wasn't answering, or the counted tries from here are used up. */
  browser?: "away" | "capped" | "offline";
}
interface Recorded { orderId: string; status: string; amount: string; currency: string; ranAt: string }
interface ControlStatus { on: boolean; fake: boolean; left: number; recorded: Recorded }
type Control =
  | { state: "landed"; orderId: string; status: string; amount: string; currency: string; at: string; left: number; fake: boolean }
  | { state: "capped" | "off" | "failed"; sentence: string; recorded: Recorded; left: number }
  | { state: "pending" }
  | { state: "asleep"; why?: string };

/** The right card from the control call's own result (H1 review): an order that landed is kept, whatever the judge did. */
function controlFrom(r: RightCard): Control | null {
  return r.kind === "order" ? (r.body as unknown as Control) : r.kind === "none" ? null : { state: "asleep", why: r.why };
}

// Each chip shows a short quote and fills in the whole note, so the chips wrap on a phone instead of running off it.
// W43: one list for both screens and the test that each chip is caught.
const CHIPS = JUDGE_CHIPS;
const WHY_SHOWN = 80;
/** H1: the right card while live mode isn't answering: the saved order, said as that. */
const AWAY_ORDER = PAIR_WORDS.away;
const IN_BROWSER = { away: "Live mode isn't answering, so this round ran in your browser.", offline: `${OFFLINE.title} ${OFFLINE_SAYS.round}`, capped: "Today's counted tries from here are used up, so this round ran in your browser and isn't counted." } as const;

/** The first ~80 characters, cut at a space so a price like $58.00 is never split. */
function clip(s: string): string {
  if (s.length <= WHY_SHOWN) return s;
  const cut = s.lastIndexOf(" ", WHY_SHOWN);
  return `${s.slice(0, cut > 0 ? cut : WHY_SHOWN).replace(/[\s,;:.]+$/, "")}…`;
}

const utc = (iso: string) => `${iso.slice(0, 16).replace("T", " ")} UTC`;
const over = (price: string, max: string) => Number(price) > Number(max);

export function JudgeBox() {
  const [status, setStatus] = useState<Status | null>(null);
  const [ctl, setCtl] = useState<ControlStatus | null>(null);
  const [down, setDown] = useState(false);
  // The first attack is already typed in, so the first thing a visitor can do is press Send (guild-visual, 2026-10-23).
  const [note, setNote] = useState(CHIPS[0]!.note);
  const [price, setPrice] = useState("500.00");
  const [mode, setMode] = useState<Mode>("rule");
  // W66: until the visitor picks a mode, it follows the server (live AI within its caps, else the plain rule).
  const [picked, setPicked] = useState(false);
  const pick = (m: Mode) => { setPicked(true); setMode(m); };
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const [sent, setSent] = useState<{ note: string; price: string } | null>(null);
  const [control, setControl] = useState<Control | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [whole, setWhole] = useState(false);
  // Counts the guard's answers, so the check redraws on each one (step 5 motion), not only on the first.
  const [answers, setAnswers] = useState(0);
  const live = useLive();
  const online = useOnline();

  // Asked only once live mode answers, and again whenever it comes back (H1): with no server, the health check is the
  // page's one request.
  useEffect(() => {
    if (live !== "up") return;
    void fetch("/api/judge").then((r) => (r.ok ? r.json() as Promise<Status> : null)).then((st) => { setStatus(st); setDown(st === null); }).catch(() => setDown(true));
    void fetch("/api/control").then((r) => (r.ok ? r.json() as Promise<ControlStatus> : null)).then(setCtl).catch(() => setCtl(null));
  }, [live]);

  async function send() {
    setBusy(true); setError(null); setWhole(false); setControl({ state: "pending" });
    // On a phone the two cards sit below the fold once the keyboard closes: bring them up, so the answer is seen.
    const pair = document.querySelector(".pair");
    if (pair && pair.getBoundingClientRect().top > innerHeight - 160) pair.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    const asked = { note, price };
    // H1: while live mode isn't answering, the plain rule's round runs in the browser (the same fence, Watcher and guard).
    // R-12: offline, the cause is her network (live mode "offline"), on both cards, never the server.
    const known = await liveKnown();
    if (known !== "up") { setControl(known === "offline" ? { state: "asleep", why: PAIR_WORDS.offline } : { state: "asleep" }); await inBrowser(asked, known === "offline" ? "offline" : "away"); return; }
    const post = (path: string, body: object) => () => fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    // Both cards get the same note and price at the same moment; neither waits on the other. Each card is decided by its
    // own call only (core's leftOf/rightOf): a refused price (400) leaves the right card empty and is said once, above.
    const right = callApi(post("/api/control", { price })).then((c) => {
      // R-12: a call that never left because she is offline names her network, not the server.
      setControl(controlFrom(rightOf(c, navigator.onLine)));
      if (c.kind === "ok" && typeof c.body.left === "number") { const left = c.body.left; setCtl((s) => (s ? { ...s, left } : s)); }
    });
    try {
      const reply = await callApi(post("/api/judge", { note, price, mode }));
      // Too fast (the short window): it isn't a used-up day, so nothing runs in the browser. It just waits.
      if (reply.kind === "refused" && reply.error === SLOW_DOWN) { setError(SLOW_DOWN); return; }
      // H2 review: past the counted-tries cap the server refuses the round (429); the plain rule runs here instead, uncounted.
      if (reply.kind === "refused" && reply.status === 429) { await right; await inBrowser(asked, "capped"); return; }
      const left = leftOf(reply);
      if (left.kind === "error") { setError(left.error); return; }
      if (left.kind === "browser") {
        // Only a judge call that never reached a server means live mode is away; the right card keeps its own result.
        liveAway(); setDown(true);
        await right;
        await inBrowser(asked, navigator.onLine ? "away" : "offline");
        return;
      }
      const body = left.body as unknown as Card;
      setCard(body); setSent(asked); setDown(false); setAnswers((n) => n + 1);
      setStatus((s) => (s ? { ...s, ai: body.ai, triesLeft: body.triesLeft, ...(body.challenge === undefined ? {} : { challenge: body.challenge }) } : s));
    } finally {
      await right;
      setBusy(false);
    }
  }

  /** The judge box's left card with no server (H1): the plain rule only; the AI read is live mode. Never touches the right card. */
  async function inBrowser(asked: { note: string; price: string }, why: "away" | "capped" | "offline" = "away") {
    if (mode === "ai") { setError(why === "offline" ? `${OFFLINE.title} ${OFFLINE_SAYS.ai}` : `The AI read is live mode. ${LIVE_WORDS.away}`); setBusy(false); return; }
    const off = await import("./offline.ts").catch(() => null);
    const r = off ? await off.judgeInBrowser(asked) : { error: navigator.onLine ? "The recorded demo couldn't load. Reload the page to try again." : `${OFFLINE.title} ${OFFLINE.line}` };
    if ("error" in r) setError(r.error);
    else { setCard({ ...r.card, ai: "off", triesLeft: 0, browser: why }); setSent(asked); setAnswers((n) => n + 1); }
    setBusy(false);
  }

  const away = live === "away" || live === "gone" || live === "offline";
  useEffect(() => { if (!picked) setMode(judgeMode(status?.ai ?? null, status?.triesLeft ?? 0, live, down)); }, [picked, status, live, down]);
  const aiOff = status?.ai === "off" || down || away;
  const aiNote = !status ? "" : aiOff ? "off on this server" : status.ai === "capped" ? "today's cap reached" : `${status.triesLeft} ${status.triesLeft === 1 ? "try" : "tries"} left today`;
  const long = card !== null && card.why.length > WHY_SHOWN;
  const max = status?.max ?? "60.00";
  const help = mode === "ai" && status?.ai === "on" ? `Your shop has ${status.history.ai} sales on record, like the others.`
    : mode === "ai" && status?.ai === "capped" ? "AI cap reached today: the plain rule reads this."
    : "Your test shop is new: no sales on record yet.";

  return (
    // Design B, slice 4: the seller lab is a desk of its own. Your note is a slip on it, the two answers are receipts.
    <section className="lab" aria-label="The seller lab">
      {/* SW (surface-words.md): the page's title says "You’re the seller", so the note's label is for screen readers. */}
      <label htmlFor="judge-note" className="sr-only">Your note, as the seller</label>
      <div className="ask" id="break">
        <div className="field dk-glass">
          <textarea id="judge-note" className="note" rows={2} value={note} maxLength={status?.maxNote ?? 500} onChange={(e) => setNote(e.target.value)} placeholder="Say anything a seller might…" />
          <span className="price">$<input aria-label="Your asking price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" /></span>
        </div>
        <div className="chips">
          {CHIPS.map((c) => (
            <button key={c.note} type="button" className="chip" aria-pressed={note === c.note} title={c.note} onClick={() => { setNote(c.note); setPrice(c.price); }}>“{c.label}”</button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Who reads your note">
          <button type="button" aria-pressed={mode === "rule"} onClick={() => pick("rule")}>Plain rule<small>no AI</small></button>
          <button type="button" aria-pressed={mode === "ai"} disabled={aiOff} onClick={() => pick("ai")} aria-describedby="judge-careful">AI reads your note<small>{live === "offline" ? "you're offline" : away || down ? (live === "gone" ? "live mode off for now" : "live mode not answering yet") : aiNote || "…"}</small></button>
        </div>
        {/* The new idea, under the AI toggle (Track C; claims row c-innov-line): the reader can only add caution. */}
        <p className="careful" id="judge-careful">The AI can only make Goose more careful, never less.</p>
        <div className="ask-foot">
          {/* SW: the max is on the guarded card below; the sales record matters only to the AI's read. */}
          {mode === "ai" && <p>{help}</p>}
          <button className="send" onClick={send} disabled={busy || note.trim() === ""} aria-busy={busy || undefined}>{busy ? (mode === "ai" ? "The AI is reading…" : "Running…") : "Send to Goose"}</button>
        </div>
        {/* R-11 part 2: offline, the probe failed because she is, so the server's waking isn't named and Reload isn't offered. */}
        {away && !error && <p className="notice asked" role="status" data-live={online ? live : "offline"}>{online && live !== "offline" ? LIVE_WORDS[live] : `${OFFLINE.title} ${OFFLINE.line}`}</p>}
        {error && <p className="notice refused" role="alert">{error}</p>}
      </div>

      {/* SW: said once there is a pair to compare; before a send the two cards' own heads name them. */}
      {(control?.state === "landed" || control?.state === "pending") && <p className="same">Same note, same price: with the guard, and with no guard straight to PayPal.</p>}
      <div className="pair">
        <GuardOn answer={answers} card={card} sent={sent} max={max} whole={whole} setWhole={setWhole} long={long} />
        <GuardOff control={control} ctl={ctl} max={max} sentPrice={sent?.price ?? (control?.state === "pending" ? price : null)} />
      </div>
      <Tally count={status?.challenge ?? null} away={away || down} />
    </section>
  );
}

/**
 * The Challenge's counter, the same one the landing shows (`challengeWords`): the server's rows folded, never typed, and
 * under its caps, so the number is bounded too. A round run in this browser while live mode is away isn't counted, so with
 * no server the line says where the count lives instead of showing a number.
 */
function Tally({ count, away }: { count: ChallengeCounts | null; away: boolean }) {
  // The server's answer comes after the first paint, and the Ask section sits right under here: this holds the line's room, so it doesn't jump.
  const room = <p className="tally" />;
  if (!count) return away ? <p className="tally muted" data-tally="away">{COUNT_AWAY}</p> : room;
  if (count.tried === 0) return room; // SW: a count of zero says nothing the Send button doesn't; the line arrives with the first try
  const words = challengeWords(count, count.byAi > 0);
  return <p className="tally" data-tally={count.tried}><b className={words.alarm ? "refused" : undefined}>{words.line}</b>{words.second ? ` ${words.second}` : ""}</p>;
}

function GuardOn(p: { answer: number; card: Card | null; sent: { note: string; price: string } | null; max: string; whole: boolean; setWhole: (b: boolean) => void; long: boolean }) {
  const { card, sent, max } = p;
  if (!card || !sent) {
    return (
      <div className="card" data-card="guard-on">
        <div className="who">guard on</div>
        <div className="item">Goldfeather Kettle</div>
        <div className="sub">Goose's max</div>
        <div className="amt">{usdOf(max)} <span className="ring" aria-hidden><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" pathLength="1" /></svg></span></div>
        <div className="state"><b className="ok">Locked</b> by code.</div>
      </div>
    );
  }
  const refused = card.headline.startsWith("Not buying");
  return (
    <div className="card" data-card="guard-on" aria-live="polite">
      <div className="who">guard on · {card.source === "ai" ? "the AI read your note" : card.source === "rule-fallback" ? (card.reader === "read" ? "the AI buyer didn't answer; the AI reader read your note" : "the AI didn't answer, so the plain rule moved") : "plain rule, no AI"}</div>
      <div className="item">Goldfeather Kettle</div>
      <div className="sub">Goose's max</div>
      <div className="verdict" data-refused={refused || undefined}>{refused ? "Blocked. Nothing bought." : "Held for your yes."}</div>
      <div className="amt">{usdOf(max)} <span className="ring" aria-hidden><svg key={p.answer} className="draw" viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" pathLength="1" /></svg></span></div>
      <div className="state"><b>Max unchanged.</b> {card.headline}</div>
      {card.notice && <p className="asked small">{card.notice}</p>}
      {/* H1: said where a phone shows it too (the label line is hidden on a phone). */}
      {card.browser && <p className="asked small" data-browser={card.browser}>{IN_BROWSER[card.browser]}</p>}
      <details className="how"><summary>How code decided ›</summary>
      <div className="rows">
        <div><span className="k">you</span><span>asked <b>{usdOf(sent.price)}</b>: <q>{sent.note}</q></span></div>
        <div><span className="k">fence</span><span>{card.fence}</span></div>
        <div><span className="k">buyer</span><span><b>{card.proposal}</b></span></div>
        <div><span className="k">guard</span><span className={card.guard.includes("refused") ? "refused" : "asked"}><b>{card.guard}</b></span></div>
        {card.guardPick && <div><span className="k">its pick</span><span className="asked">{card.guardPick}</span></div>}
        {card.readerSaid && <div data-row="reader"><span className="k">reader</span><span>{card.readerSaid}</span></div>}
        {card.why && (
          <div><span className="k">{card.source === "ai" ? "AI said" : "rule"}</span><span>
            {card.source === "ai" ? <q>{p.long && !p.whole ? clip(card.why) : card.why}</q> : <span>{p.long && !p.whole ? clip(card.why) : card.why}</span>}
            {p.long && <button type="button" className="linkish" onClick={() => p.setWhole(!p.whole)}>{p.whole ? "less" : "more"}</button>}
          </span></div>
        )}
      </div>
      </details>
      <p className="muted small">{card.label.replace(/Claude Haiku [\d.]+/g, "an AI model")}</p>
    </div>
  );
}

function GuardOff(p: { control: Control | null; ctl: ControlStatus | null; max: string; sentPrice: string | null }) {
  const { control, ctl, max } = p;
  // Never empty (Joshua, 2026-10-23): whenever the visitor has no order of their own here (before a send, out of
  // orders, PayPal off, server asleep) the card shows the real $500 order we made earlier, labeled as that.
  if (!control) {
    const why = !ctl ? null
      : !ctl.on ? "PayPal isn't connected on this server, so this is the one we made earlier."
      // `left` is the smallest of three caps (this browser's, this network's, everyone's), so it never says whose.
      : ctl.left === 0 ? "No unguarded orders left today, so this is the one we made earlier."
      : `Send yours to make your own (${ctl.left} left today).`;
    return <Saved state="empty" sentence={why ?? ""} max={max} sentPrice={null} />;
  }
  if (control.state === "pending") {
    return <div className="card empty" data-card="guard-off" data-state="pending"><div className="who">guard off (control)</div><div>Sending {usdOf(p.sentPrice)} straight to PayPal…</div></div>;
  }
  if (control.state === "asleep") return <Saved state="asleep" sentence={control.why ?? AWAY_ORDER} max={max} sentPrice={null} />;
  if (control.state === "landed") {
    return (
      <div className="card" data-card="guard-off" data-state="landed" aria-live="polite">
        <Head />
        <div className={`amt ${over(control.amount, max) ? "red" : ""}`}>{usdOf(control.amount)}</div>
        <div className="state"><b>Order created</b> · {control.fake ? FAKE_RAIL : "PayPal sandbox"} · unpaid, never captured{over(control.amount, max) ? ` · over your ${usdOf(max)} max` : ""}</div>
        <details className="reply"><summary>{control.fake ? "The fake port's reply" : "PayPal's reply"} ›</summary><p>id {control.orderId} · status {control.status} · amount {control.amount} {control.currency} · created {utc(control.at)}</p></details>
        <p className="small muted">{control.left} left today.</p>
      </div>
    );
  }
  return <Saved state={control.state} sentence={control.sentence} max={max} sentPrice={p.sentPrice} />;
}

const Head = (p: { earlier?: boolean }) => (
  <>
    <div className="who">guard off (control){p.earlier ? " · an earlier run" : ""}</div>
    <div className="item">Goldfeather Kettle</div>
    <div className="sub">sent straight to PayPal</div>
  </>
);

/** The order made earlier by `trust/examples/control-no-guard.ts`, from the static fixture so it shows even with the server asleep. */
function Saved(p: { state: string; sentence: string; max: string; sentPrice: string | null }) {
  const r = RECORDED;
  // When the judge's price isn't the saved order's, the card says so first and its amount steps down a size, so the
  // two cards don't read as one story with mismatched numbers.
  const other = p.sentPrice !== null && Number(p.sentPrice) !== Number(r.amount);
  return (
    <div className="card" data-card="guard-off" data-state={p.state} aria-live="polite">
      <Head earlier={other} />
      <div className="earlier"><span className="tag">made earlier<span className="t"> · {r.ranAt.slice(0, 10)}</span></span></div>
      <div className={`amt ${over(r.amount, p.max) ? "red" : ""}${other ? " step" : ""}`}>{usdOf(r.amount)}</div>
      <div className="state"><b>Order created</b> · PayPal sandbox · unpaid, never captured</div>
      {/* One amber line, not two: why it's the saved order, and that it isn't the judge's price. */}
      {/* Before the server says why, the same line's room, so the card doesn't grow when it does. */}
      <p className="asked small">{[p.sentence, other ? `Your note asked ${usdOf(Number(p.sentPrice).toFixed(2))}; this was the ${usdOf(r.amount)} attack, sent with no guard.` : ""].filter(Boolean).join(" ") || "\u00a0"}</p>
      {/* "Same note, same price" holds only if the card says when it isn't: the saved order has its own price. */}
      <details className="reply"><summary>PayPal's reply ›</summary><p>id {r.orderId} · status {r.status} · amount {r.amount} {r.currency}</p></details>
    </div>
  );
}
