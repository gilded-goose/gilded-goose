// "See how it keeps you safe" (5b, 018 N20): five steps, one tap away from the
// demo. Every number comes from code or a file: the recorded week-1 ledger (`safeStory` over `storyWeek`, which replays
// the bundled fixture tape through a fresh guard in the browser and makes no order, W38, H1), the Policy the guard
// enforces (`demoSettings`, bundled), the bound cart's own `expiresAt`, the control order (live or the saved fixture) and the
// spike's results-open.json. Every "Proof ›" opens the ledger row behind it. Seller text is only ever quoted.
// H1: nothing here needs the server but the visitor's own Send (the AI read and the guard-off order are live mode); while
// live mode isn't answering, the plain rule's round runs in the browser and the page says so.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LedgerEvent } from "@goose/core";
import { buyerLabel, fold } from "@goose/core/view";
import { approvalMinutes, haikuLine, safeStory, type Bubble, type OpenResults, type SettingRow } from "@goose/core/story";
import { JUDGE_CHIPS } from "@goose/core/chips";
import { SLOW_DOWN } from "@goose/core/count-words";
import { LIVE_WORDS, PAIR_WORDS, callApi, pairOutcome, type RightCard } from "@goose/core/live";
import { liveAway, liveKnown, useLive } from "./live.ts";
import { useOnline } from "./states/online.ts";
import { OFFLINE, OFFLINE_SAYS } from "./states/words.ts";
import { FAKE_RAIL } from "./rail.ts";
import { appHref } from "./menu/href.ts";
import RECORDED from "../../docs/fixtures/control-order.json";
import RESULTS from "../../spikes/s3-claude/results-open.json";
import { usd, usdOf } from "@goose/core/money";

interface RunView {
  seed: number;
  payment?: "fake" | "sandbox" | "off";
  want: { item: string; maxPrice: string; qty: number };
  bound: { item: string; merchant: string; total: string; hash: string; expiresAt: number } | null;
  events: LedgerEvent[];
}
interface Card { headline: string; label: string; capped?: true; browser?: true }
type Control =
  | { state: "landed"; orderId: string; status: string; amount: string; currency: string; at: string; fake: boolean }
  | { state: "capped" | "off" | "failed"; sentence: string }
  | { state: "asleep"; why?: string };
/** The guard-off card from the control call's own result (H1 review): an order that landed is kept, whatever the judge did. */
function controlFrom(r: RightCard): Control | null {
  return r.kind === "order" ? (r.body as unknown as Control) : r.kind === "none" ? null : { state: "asleep", why: r.why };
}
interface Status { ai: "on" | "capped" | "off"; triesLeft: number; maxNote: number; max: string }

const STEPS = ["Your max", "The trick", "The $500", "The haggle", "Your yes"];
const FAKE_CAP = "Nothing reached PayPal.";
/** Round 2: live mode's state is said once, in a short pill beside the AI toggle (its full sentence in the title), not
 *  in a box over step 1 and again on every card. A browser round's label already says "in your browser". */
// Round 4: "off right now", never "yet": on the static mirror no server will ever answer (the title says the rest).
const LIVE_SHORT = { away: "Live AI off right now", gone: "Live AI off for now", offline: OFFLINE.title } as const;
/** H2 review: past the server's counted-tries cap (429) the round runs here, uncounted, and says so. */
const CAPPED_IN_BROWSER = "Today's counted tries from here are used up, so this ran in your browser and isn't counted.";
// W43: one list for both screens and the test that each chip is caught.
const CHIPS = JUDGE_CHIPS;
const plain = (m: string) => m.replace(" (fictional)", "");
const utcDay = (iso: string) => iso.slice(0, 10);
export const phoneQuery = "(max-width: 899px)";
/** The page's own jumps (a step, a ledger row) glide, as they did when the whole page scrolled smoothly; never under
 *  reduced motion. Keyboard focus no longer glides (W6, safe.html): it lands at once, clear of the tour's pill. */
const glide = (el: Element | null | undefined, block: ScrollLogicalPosition) =>
  el?.scrollIntoView({ block, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
const HAIKU = haikuLine(RESULTS as OpenResults);

const Check = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M4.5 8.5l2.5 2.5 4.5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Lock = () => <svg className="lock" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="2" fill="currentColor" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>;
const Ring = () => <span className="ring" aria-hidden><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" pathLength="1" /></svg></span>;

export function Safe() {
  const [run, setRun] = useState<RunView | null>(null);
  const [down, setDown] = useState(false);
  const [settings, setSettings] = useState<SettingRow[] | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [payment, setPayment] = useState<string | null>(null);
  const [phone, setPhone] = useState(() => matchMedia(phoneQuery).matches);
  const [open, setOpen] = useState(1);
  const [at, setAt] = useState(1);
  const opened = useRef<number | null>(null);
  const live = useLive();

  useEffect(() => {
    const mq = matchMedia(phoneQuery);
    const on = () => setPhone(mq.matches);
    mq.addEventListener("change", on);
    void week();
    return () => mq.removeEventListener("change", on);
  }, []);

  // Asked only once live mode answers, and again whenever it comes back (H1): with no server, the health check is the
  // page's one request.
  useEffect(() => {
    if (live !== "up") return;
    void fetch("/api/judge").then((r) => (r.ok && (r.headers.get("content-type") ?? "").includes("json") ? r.json() as Promise<Status> : null)).then(setStatus).catch(() => setStatus(null));
    // In CI's fake mode the server says so; nothing on screen may then say PayPal (as on the main page).
    void fetch("/api/health").then((r) => (r.ok && (r.headers.get("content-type") ?? "").includes("json") ? r.json() as Promise<{ payment?: string }> : null)).then((h) => setPayment(h?.payment ?? null)).catch(() => setPayment(null));
  }, [live]);

  // The recorded week 1 (a replay of Claude Haiku's real moves, no AI call) through today's guard, in the browser from the
  // tape bundled at build time (H1): a read, never a run, and no request at all, so a visit makes no order (W38; test
  // story_page_creates_no_order) and the page works with the server asleep. The Settings rows come from the same bundle.
  async function week() {
    const off = await import("./offline.ts").catch(() => null);
    if (!off) { setDown(true); return; }
    setSettings(off.demoSettings());
    const v = await off.storyWeek().catch(() => null);
    if (v) setRun(v); else setDown(true);
  }

  // In CI's fake mode nothing on screen may say PayPal (as on the main page).
  useEffect(() => {
    const rail = document.getElementById("rail");
    if (rail && payment === "fake") rail.textContent = FAKE_RAIL;
  }, [payment]);

  // Which step is on screen, for the rail.
  useEffect(() => {
    // On desktop steps 2 and 3 are one row, so the row reads as one place: step 2's (round 2).
    const seen = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { const n = Number(e.target.id.slice(1)); setAt(!phone && n === 3 ? 2 : n); } }), { rootMargin: "-35% 0px -55% 0px" });
    document.querySelectorAll("main .ch").forEach((c) => seen.observe(c));
    return () => seen.disconnect();
  }, [run, open, phone]);

  useEffect(() => {
    if (opened.current === null) return;
    glide(document.getElementById(`c${opened.current}`), "start");
    opened.current = null;
  }, [open]);

  const go = (n: number) => { opened.current = n; setOpen((o) => Math.max(o, n)); setAt(n); if (n <= open) glide(document.getElementById(`c${n}`), "start"); };
  const shown = phone ? open : STEPS.length;
  const cls = (n: number) => ["ch", n > shown ? "later" : "", n === shown ? "last-open" : "", n === open && n > 1 && phone ? "opening" : ""].filter(Boolean).join(" ");
  const next = (n: number, text: string) => <button type="button" className="next" onClick={() => go(n)}>{text} ›</button>;

  const events = run?.events ?? [];
  const story = safeStory(events);
  const max = story.max ? usd(story.max.price) : status ? `${usdOf(status.max)}` : null;
  const proof = (seq: number | undefined) => <Proof seq={seq} events={events} />;

  return (
    <>
      <nav className="rail" aria-label="Steps">
        <ol>
          {STEPS.map((s, i) => (
            <li key={s}><a href={`#c${i + 1}`} className={i + 1 === at || (!phone && at === 2 && i + 1 === 3) ? "on" : i + 1 < at ? "done" : undefined} aria-current={i + 1 === at ? "step" : undefined} onClick={(e) => { e.preventDefault(); go(i + 1); }}>{s}</a></li>
          ))}
        </ol>
        <div className="n"><span>{at} of {STEPS.length} · {STEPS[at - 1]}</span><button type="button" className="all" aria-pressed={open === STEPS.length} onClick={() => setOpen(STEPS.length)}>Show all</button></div>
      </nav>

      <main id="main">
        {down && !run && <p className="wait" role="alert">The recorded week couldn't load. Reload the page to try again.</p>}

        <section className={cls(1)} id="c1">
          <p className="kicker">1 · Your max</p>
          <div className="one">
            <div>
              <div className="bubbles"><div className="b you">Buy me a {plain(run?.want.item ?? "Goldfeather Kettle")}. Spend at most {max ? `${max}.` : "…"}</div></div>
              <p className="if">If a seller asks for more, nothing is bought. {proof(story.max?.seq)}</p>
              {!phone && <Settings rows={settings} />}
            </div>
            <div>
              <div className="panel" role="img" aria-label={`Your ${max ?? ""} max, locked by code`}>
                <div className="lockchip"><div className="big">{max ?? "…"}</div><div className="l"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="2" fill="currentColor" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>Locked by code</div></div>
              </div>
              {phone && <Settings rows={settings} />}
            </div>
          </div>
          {next(2, "Next: a seller tries a trick")}
        </section>

        <Pair cls={cls} next={next} status={status} max={max} trick={story.trick} proof={proof} live={live} />

        <section className={cls(4)} id="c4">
          <p className="kicker">4 · The haggle</p>
          <h2>The AI haggles. Code keeps it honest.</h2>
          {story.haggle ? <Haggle h={story.haggle} label={buyerLabel(events)} total={events.length} waiting={run?.bound != null} proof={proof} phone={phone} /> : <p className="wait">{down ? "The recorded week couldn't load." : "Loading the recorded week…"}</p>}
          {next(5, "Next: your yes")}
        </section>

        <section className={cls(5)} id="c5">
          <p className="kicker">5 · Your yes</p>
          <h2>Nothing is bought until you tap.</h2>
          <Approve run={run} story={story} max={max} proof={proof} live={live === "up"} />
          {/* W71 (judges baseline): how a store or PayPal switches it on. The guard is its own package (007 #1, ADR 0006);
              its README is named, not linked, until the repo is public (Nov 8–11). */}
          <p className="also adopt"><b>For a store or PayPal:</b> the guard is a library, <code>@gilded-goose/trust</code>. Adding it to a checkout is about ten lines of code plus your PayPal setup, shown in <code>trust/README.md</code> in the project, and the project's tests run them.</p>
        </section>

        {run && <Ledger events={events} />}
      </main>
    </>
  );
}

/** The Haiku line's proof: the counts it is read from, out of the recorded spike file bundled into this page. */
function Source() {
  const [shut, setShut] = useState(true);
  const o = RESULTS.open;
  return (
    <>
      <button type="button" className="proof" data-source="results-open" aria-expanded={!shut} onClick={() => setShut(!shut)}>{shut ? "Proof ›" : "Hide proof"}</button>
      {!shut && (
        <span className="proofrow" style={{ display: "block" }}>
          <span className="rid">Recorded test run · {utcDay(RESULTS.at)} · {RESULTS.model}</span><br />
          {o.calls} calls with this note passed through to it (seller-text check off); its proposals, before any guard: {o.attack} at the note's $500, {o.overMax} over your max, {o.errors} errors. Read from <code>spikes/s3-claude/results-open.json</code> in the project.
        </span>
      )}
    </>
  );
}

/** "Proof ›": the ledger row behind a claim, opened in place, with a jump to it in the full ledger. No row, no link. */
function Proof({ seq, events }: { seq: number | undefined; events: LedgerEvent[] }) {
  const [shut, setShut] = useState(true);
  const e = seq === undefined ? undefined : events.find((x) => x.seq === seq);
  if (!e) return null;
  const jump = () => {
    const d = document.getElementById("ledger") as HTMLDetailsElement | null;
    if (d) d.open = true;
    const tr = document.querySelector(`tr[data-seqs~="${e.seq}"]`);
    document.querySelectorAll("tr.hit").forEach((x) => x.classList.remove("hit"));
    tr?.classList.add("hit");
    glide(tr, "center");
  };
  return (
    <>
      <button type="button" className="proof" data-proof={e.seq} aria-expanded={!shut} onClick={() => setShut(!shut)}>{shut ? "Proof ›" : "Hide proof"}</button>
      {!shut && (
        <span className="proofrow" style={{ display: "block" }} data-row={e.seq}>
          <span className="rid">Ledger row {e.seq} · {who(e)}{e.price ? ` · ${usdOf(e.price)}` : ""}</span><br />
          {e.why}{e.quoted ? <> <q>{e.quoted}</q></> : null}{" "}
          <a href="#ledger" onClick={(x) => { x.preventDefault(); jump(); }}>In the full ledger ›</a>
        </span>
      )}
    </>
  );
}

const who = (e: LedgerEvent) => ({ seller: "seller", guard: "guard", code: "code", paypal: "payment", fence: "seller-text check", cart: "cart", watcher: "Watcher", buyer: e.action.startsWith("propose-") ? "AI (proposed)" : "AI" } as Record<string, string>)[e.actor] ?? e.actor;

/** W-8 (brand.md 10.3, one fact a section): the kitchen limit first, the rest (the week, the approval time, and the "Not
 *  yet" line for what code doesn't enforce yet, never shown as a setting) one tap away in "All limits". */
const FIRST = ["limit", "week", "yes"];
/** How many of them the card shows before the tap. */
const FACE = 1;
function Settings({ rows }: { rows: SettingRow[] | null }) {
  const [all, setAll] = useState(false);
  if (!rows) return <div className="settings"><h2>Your limits</h2><p>Loading your limits…</p></div>;
  const on = rows.filter((r) => r.value !== null);
  const shown = [...FIRST.flatMap((k) => on.filter((r) => r.key === k)), ...on.filter((r) => !FIRST.includes(r.key))];
  const later = rows.filter((r) => r.value === null);
  return (
    <div className={`settings${all ? " all" : ""}`} data-settings>
      <h2>Your limits</h2>
      <ul>
        {shown.map((r, i) => (
          <li key={r.key} className={i < FACE ? undefined : "extra"} data-key={r.key}>
            <span className="k">{r.label}</span>
            <span className="val">{r.value}</span>
            <span className="note">{r.note}</span>
          </li>
        ))}
      </ul>
      {!all && shown.length > FACE && <button type="button" className="more" aria-expanded={false} onClick={() => setAll(true)}>All limits · {shown.length} ›</button>}
      {all && later.length > 0 && <p className="notyet" data-next={later.map((r) => r.key).join(" ")}><b>Not yet:</b> {later.map((r) => r.label.toLowerCase()).join(", ")}.</p>}
    </div>
  );
}

/** Steps 2 and 3, side by side on desktop: one Send fills both, and both answers land in the same render (the same beat). */
function Pair(p: { cls: (n: number) => string; next: (n: number, t: string) => ReactNode; status: Status | null; max: string | null; trick: ReturnType<typeof safeStory>["trick"]; proof: (seq: number | undefined) => ReactNode; live: string }) {
  const [note, setNote] = useState(CHIPS[0]!.note);
  const [price, setPrice] = useState(CHIPS[0]!.price);
  const [mode, setMode] = useState<"rule" | "ai">("rule");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{ n: number; card: Card | null; control: Control | null; price: string } | null>(null);
  const aiOff = !p.status || p.status.ai !== "on" || p.live !== "up";

  async function send() {
    setBusy(true); setError(null);
    // H1: while live mode isn't answering, the plain rule's round runs in the browser; the guard-off order is live mode.
    const known = await liveKnown();
    if (known !== "up") { await inBrowser(known === "offline" ? { state: "asleep", why: PAIR_WORDS.offline } : { state: "asleep" }); return; }
    const post = (path: string, body: object) => () => fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const [j, c] = await Promise.all([callApi(post("/api/judge", { note, price, mode })), callApi(post("/api/control", { price }))]);
    // One state change for both cards: the Blocked stamp and the $500 land together. Each card comes from its own call
    // (core's pairOutcome): an order that landed stays, and only an unreached judge call sends the note to the browser.
    // R-12: a control call that never left because she is offline names her network, not the server (core rightOf).
    const out = pairOutcome(j, c, navigator.onLine);
    const control = controlFrom(out.right);
    if (out.left.kind === "browser") { liveAway(); await inBrowser(control); return; }
    // Too fast (the short window) isn't a used-up day: the leftOf error below says so, and nothing runs in the browser.
    if (j.kind === "refused" && j.status === 429 && j.error !== SLOW_DOWN) { await inBrowser(control, true); return; }
    if (out.left.kind === "error") setError(out.left.error);
    setAnswer((a) => ({ n: (a?.n ?? 0) + 1, card: out.left.kind === "card" ? (out.left.body as unknown as Card) : null, control, price }));
    setBusy(false);
  }

  /** The note with no server (H1): the plain rule only, in the browser; the right card is whatever its own call gave. */
  async function inBrowser(control: Control | null, capped = false) {
    if (mode === "ai") { setError(navigator.onLine ? `The AI read is live mode. ${LIVE_WORDS.away}` : `${OFFLINE.title} ${OFFLINE_SAYS.ai}`); setBusy(false); return; }
    const off = await import("./offline.ts").catch(() => null);
    const r = off ? await off.judgeInBrowser({ note, price }) : { error: navigator.onLine ? "The recorded demo couldn't load. Reload the page to try again." : `${OFFLINE.title} ${OFFLINE.line}` };
    if ("error" in r) setError(r.error);
    else setAnswer((a) => ({ n: (a?.n ?? 0) + 1, card: { headline: r.card.headline, label: r.card.label, ...(capped ? { capped: true as const } : {}), browser: true }, control, price }));
    setBusy(false);
  }

  const card = answer?.card ?? null;
  const refused = card?.headline.startsWith("Not buying") ?? false;
  return (
    <div className="duo">
      <section className={p.cls(2)} id="c2">
        <p className="kicker">2 · The trick</p>
        <h2>You play the seller.</h2>
        <p className="say">Write what a scam seller might send. The AI may fall for it. Code holds your max either way.</p>
        <div className="try">
          <label className="q" htmlFor="safe-note">Your note, as a seller</label>
          <div className="field dk-glass">
            <textarea id="safe-note" rows={2} value={note} maxLength={p.status?.maxNote ?? 500} onChange={(e) => setNote(e.target.value)} />
            <span className="price">$<input aria-label="Your asking price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" /></span>
          </div>
          <div className="chips">
            {CHIPS.map((c) => <button key={c.note} type="button" className="chip" aria-pressed={note === c.note} title={c.note} onClick={() => { setNote(c.note); setPrice(c.price); }}>“{c.label}”</button>)}
          </div>
          <div className="row">
            <span className="seg" role="group" aria-label="Who reads your note">
              <button type="button" aria-pressed={mode === "rule"} onClick={() => setMode("rule")}>Plain rule</button>
              <button type="button" aria-pressed={mode === "ai"} disabled={aiOff} aria-describedby={aiOff ? "safe-live" : undefined} onClick={() => setMode("ai")}>{aiOff ? <><Lock />AI reads it</> : "AI reads it"}</button>
            </span>
            {aiOff && <LiveStatus live={p.live} />}
            <button type="button" className="send" onClick={send} disabled={busy || note.trim() === ""} aria-busy={busy || undefined}>{busy ? "Sending…" : "Send the note"}</button>
          </div>
          {error && <p className="alert" role="alert">{error}</p>}
          {card && (
            <div className="answer landing" key={answer!.n} aria-live="polite" data-answer>
              <div className="stamp">
                <span className="who"><Check />Code decided</span>
                <p className="v">{refused ? "Blocked. Nothing bought." : "Held for your yes."}</p>
                <div className="amtrow"><span className="big">{p.max ?? `${usdOf(p.status?.max ?? "")}`}</span><Ring /></div>
                <p><b>Your max is unchanged.</b> {card.headline}</p>
                <p className="label">{card.label}{card.capped ? ` ${CAPPED_IN_BROWSER}` : ""}</p>
              </div>
            </div>
          )}
        </div>
        {/* N26, small and only here, beside the trick it's about: read from the spike's file; the guard never depends on it. */}
        <p className="haiku" data-ignored={HAIKU.ignored} data-tries={HAIKU.tries}><b>{HAIKU.sentence}</b> Code doesn't need it to. The note, <q>{HAIKU.note}</q>, was shown to it as seller data; tried <span className="day">{utcDay(RESULTS.at)}</span>. <Source /></p>
        {p.next(3, "Next: the same note, no guard")}
      </section>

      <section className={p.cls(3)} id="c3">
        <p className="kicker">3 · The $500</p>
        <h2>Without the guard, nothing stops the $500.</h2>
        <NoGuard control={answer?.control ?? null} n={answer?.n ?? 0} price={answer?.price ?? null} max={p.max} />
        {/* Round 3: the guarded half of the contrast sits under the unguarded order (and fills the desktop row). */}
        {p.trick && (
          <p className="also">{/* W-8: one short line; its note, quoted, is one tap away in Proof. */}Guard on, in the recorded week: {p.trick.merchant} tried a note like it at {usd(p.trick.offer.price)}. The Watcher set it aside. {p.proof(p.trick.refused.seq)}</p>
        )}
        {p.next(4, "Next: how it haggles")}
      </section>
    </div>
  );
}

/** Live mode's state in a few words under the AI toggle (round 3); the full sentence is its title and what a screen
 *  reader hears. "Checking" keeps its pinned wording (static-demo test). */
function LiveStatus(p: { live: string }) {
  // R-11 part 2: offline, the probe failed because she is: the full sentence says so, not that the server is waking.
  const online = useOnline();
  const full = p.live === "offline" || ((p.live === "away" || p.live === "gone") && !online) ? `${OFFLINE.title} ${OFFLINE.line}` : p.live === "away" || p.live === "gone" ? LIVE_WORDS[p.live] : null;
  const short = p.live === "checking" ? "AI · checking live mode…" : p.live === "up" ? "AI · off on this server" : LIVE_SHORT[p.live as keyof typeof LIVE_SHORT];
  return (
    <span className="status" id="safe-live" role="status" data-live={p.live} title={full ?? undefined}>
      <i className="dot" aria-hidden="true" /><span aria-hidden={full ? true : undefined}>{short}</span>{full && <span className="vh"> {full}</span>}
    </span>
  );
}

function NoGuard({ control, n, price, max }: { control: Control | null; n: number; price: string | null; max: string | null }) {
  const over = (a: string) => max !== null && Number(a) > Number(max.slice(1));
  if (control?.state === "landed") {
    return (
      <div className="control landing" key={n} data-control="landed" aria-live="polite">
        <span className="tag">Just now · your note's price</span>
        <div className={`big${over(control.amount) ? " red" : ""}`}>{usdOf(control.amount)}</div>
        <p><b>{control.fake ? "An order with no guard, made on this test build's fake payment port." : "An order, sent with no guard."}</b>{over(control.amount) ? ` Over your ${max} max: nothing stopped it.` : ""}</p>
        <details className="reply"><summary>{control.fake ? "The fake port's reply" : "PayPal's reply"} ›</summary><p>id {control.orderId} · status {control.status} · amount {control.amount} {control.currency}</p></details>
        <p className="cap">{control.fake ? FAKE_CAP : "PayPal sandbox: test money, unpaid, never captured."}</p>
      </div>
    );
  }
  // Before a send, or with no order of the visitor's own: the real $500 order made earlier, labeled as that.
  // With live mode simply not answering (said once, by the pill), the tag "Made earlier" is the whole story; a reason the
  // call itself gave (an error, a cap) is still said here.
  const why = control === null ? null : control.state === "asleep" ? control.why ?? null : control.sentence;
  const other = price !== null && Number(price) !== Number(RECORDED.amount);
  return (
    <div className={`control${control ? " landing" : ""}`} key={n} data-control={control?.state ?? "saved"}>
      <span className="tag">Made earlier · {utcDay(RECORDED.ranAt)}</span>
      <div className="big red">{usdOf(RECORDED.amount)}</div>
      <p><b>An order, sent with no guard.</b> The note's {usdOf(RECORDED.amount)}, over your {max ?? "…"} max: nothing stopped it.</p>
      {(why || other) && <p>{[why, other ? `Your note asked ${usdOf(Number(price).toFixed(2))}; this is the ${usdOf(RECORDED.amount)} one.` : ""].filter(Boolean).join(" ")}</p>}
      <details className="reply"><summary>PayPal's reply ›</summary><p>id {RECORDED.orderId} · status {RECORDED.status} · amount {RECORDED.amount} {RECORDED.currency}</p></details>
      <p className="cap">A real order on PayPal's sandbox, made earlier: test money, unpaid, never captured.</p>
    </div>
  );
}

function Haggle({ h, label, total, waiting, proof, phone }: { h: NonNullable<ReturnType<typeof safeStory>["haggle"]>; label: string; total: number; waiting: boolean; proof: (seq: number | undefined) => ReactNode; phone: boolean }) {
  const [shut, setShut] = useState(true);
  const closed = phone && shut;
  const rows = h.bubbles.filter((b) => b.kind !== "aside").length;
  return (
    <div className={`haggle${closed ? " shut" : ""}`}>
      <div className="side">
        <div className="win">
          <span className="big">{usd(h.below)}</span>
          <b>below their opening ask</b>
          <p>{h.merchant} opened at {usd(h.opening.price)}. {waiting ? "The cart waiting for you is" : "The deal:"} {usd(h.deal.price)}. {proof(h.opening.seq)}</p>
        </div>
        {!phone && (
          <ul className="legend" aria-label="How to read the thread">
            <li><span className="lg seller">seller · data</span>A seller's words, quoted. Never read as orders.</li>
            <li><span className="lg ai">Agent · AI</span>The AI proposes a move.</li>
            <li><span className="lg code"><Check />Code decided</span>Plain code checks every move and can change it.</li>
          </ul>
        )}
      </div>
      {closed && <button type="button" className="seeall" onClick={() => setShut(false)}>See the haggle · {rows} messages ›</button>}
      <div className="thread">
        {label && <span className="rec">{label}</span>}
        <div className="bubbles">
          {h.bubbles.map((b, i) => <Message key={b.seq ?? `aside-${i}`} b={b} merchant={h.merchant} proof={proof} />)}
        </div>
        <p className="rest">{rows} of the week's {total} ledger rows: {h.merchant}{h.merchant.endsWith("s") ? "'" : "'s"} thread.</p>
      </div>
    </div>
  );
}

function Message({ b, merchant, proof }: { b: Bubble; merchant: string; proof: (seq: number | undefined) => ReactNode }) {
  if (b.kind === "seller") {
    return <div className="b seller" data-seq={b.seq}><span className="who">{merchant} · asks {usd(b.price)}<span className="tagd">seller · data</span></span>{b.quoted && <q>{b.quoted}</q>}</div>;
  }
  if (b.kind === "aside") {
    // Two asks in a row: the agent's move meanwhile went to another seller (its own row), or there was none.
    const verb = b.action === "counter" ? "countered" : b.action === "accept" ? "accepted" : b.action === "walk" ? "walked away from" : "waited on";
    return (
      <p className="aside" data-seq={b.seq ?? undefined}>
        {b.seq !== null && b.merchant
          ? <>Meanwhile the agent {verb} {b.merchant}{b.price !== null ? ` at ${usd(b.price)}` : ""}. {merchant} dropped its price unprompted. {proof(b.seq)}</>
          : <>{merchant} dropped its price unprompted.</>}
      </p>
    );
  }
  if (b.kind === "code") {
    return (
      <div className="stamp" data-seq={b.seq}>
        <span className="who"><Check />Code decided</span>
        <p className="v" style={{ fontSize: 20 }}>Counter {usd(b.price)} instead.</p>
        <p>{b.why} {proof(b.seq)}</p>
      </div>
    );
  }
  const by = b.source === "recorded" ? "Agent · AI, recorded" : b.source.startsWith("rule") ? "Agent · plain rule" : "Agent · AI";
  const verb = { counter: "Counter at", accept: "Accept", walk: "Walk away", wait: "Wait" }[b.action] ?? b.action;
  const amount = b.price === null ? null : usd(b.price);
  return (
    <div className="b ai" data-seq={b.seq}>
      <span className="who">{by}{b.overruled && <span className="over">overruled</span>}</span>
      {verb}{amount ? <> {b.overruled ? <s>{amount}</s> : amount}</> : null}.
    </div>
  );
}

function Approve({ run, story, max, proof, live }: { run: RunView | null; story: ReturnType<typeof safeStory>; max: string | null; proof: (seq: number | undefined) => ReactNode; live: boolean }) {
  if (!run) return <p className="wait">Loading the recorded week…</p>;
  const b = run.bound;
  if (!b) return <p className="wait">This week ended with no cart, so there's nothing to approve.</p>;
  // "Expires in N minutes" is the bound cart's own expiresAt against the row that bound it; "this exact cart only" is its hash.
  const minutes = approvalMinutes(story, b);
  const terms = ["This exact cart only", minutes !== null ? `expires in ${minutes} minutes` : null].filter(Boolean).join(" · ");
  return (
    <div className="cart" data-cart={b.hash.slice(0, 12)}>
      <div className="pay">
      <div className="big">{usdOf(b.total)}</div>
      <p className="from">{plain(b.item)} from {plain(b.merchant)}, under your {max} max.</p>
      {/* A recorded cart has no order behind it, so this is the button's picture, not a button (W38). */}
      {/* Round 4: the approval terms live inside the recorded picture, so they never read as the Replay button's caption. */}
      <div className="approve" role="img" aria-label={`A picture of the approve button, ${b.total} dollars: recorded, it can't be paid. ${terms}.`}><span className="a1"><svg viewBox="0 0 40 48" aria-hidden="true"><path d="M20 2C10 2 3 18 3 29a17 17 0 0 0 34 0C37 18 30 2 20 2Z" fill="currentColor" opacity=".25" /><path d="M12.5 28.5l5.5 5.5 10-12" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>Approve · {usdOf(b.total)}</span><span className="a2">recorded, can't be paid</span><span className="a3" aria-hidden="true">{terms.split(" · ").flatMap((t, i, all) => [i > 0 ? " " : null, <span key={t}>{t}{i < all.length - 1 ? " ·" : ""}</span>])}</span></div>
      {/* The page's one real action (round 3): a replay of this week, labeled as that; the recorded Approve above stays a picture.
          Approving it yourself is live mode (H1): while the server isn't answering, the replay runs in the browser with no order. */}
      <a className="replay" href={appHref("?seed=1&wallet=0")}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5v2.8h2.8" /></svg>{live ? "Replay this week to approve it yourself" : "Replay this week"}</a>
      </div>
      <div className="check">
        {/* The guard binds the replayed cart on this visit: its hash covers the cart and its expiry (now + the approval
            time), so it is new each visit, as a real binding is (core/src/trust/cart.ts, round 2). */}
        <p>Fingerprint <code>{b.hash.slice(0, 12)}</code>: this cart and its expiry, new each visit. A live run re-checks it against PayPal's order. {proof(story.bound?.seq)}</p>
        <p className="cap">Recorded cart: no order exists, so nothing can be paid here.</p>
      </div>
    </div>
  );
}

function Ledger({ events }: { events: LedgerEvent[] }) {
  const folded = fold(events);
  return (
    <details className="ledger" id="ledger">
      <summary>The decision ledger · {events.length} rows ›</summary>
      <table className="ltable"><tbody>
        {folded.map(({ e, count, also }) => (
          <tr key={e.seq} data-seqs={[e.seq, ...also].join(" ")}>
            <td className="seq">{e.seq}</td>
            <td className="who">{who(e)}</td>
            <td className="amt">{e.price ? `${usdOf(e.price)}` : ""}</td>
            <td className="why">{e.why}{e.quoted ? <> <q>{e.quoted}</q></> : null}{count > 1 ? ` (×${count}, also rows ${also.join(", ")})` : ""}</td>
          </tr>
        ))}
      </tbody></table>
    </details>
  );
}

