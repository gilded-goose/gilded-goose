// The Desk as an app (Joshua, Oct 30): the rooms the menu opens (DK: no side rail). Each reads this browser's session from the server
// (no session is made by a read) and says only what the server's answer says: Your week is the recorded week's shelf
// (one scenario per tab), Your wants is the wants list, Settings is her limits. Watching never buys.
import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { lazyOr } from "../states/online.ts";
import type { GooseRead } from "@goose/core/read";
import { RATHER_WAIT, WANTS_EMPTY, troubleOf, watchWant, watchingLine, type Trouble } from "@goose/core/desk";
import type { Cents } from "@goose/core/money";
import { LIMITS_NAME } from "@goose/core/menu-hash";
import { BEST_TODAY, BUY_THERE, CHECKS_DAILY, NO_BEST, NO_READ, WATCH_KEEPS, OPEN_DEAL, PINGS_HERE, REAL_HEAD, WATCHING_HEAD, YOUR_PRICE } from "@goose/core/watching-words";
import type { WatchPing, WatchRow } from "@goose/core/watching-list";
import { usdWide, type RealRow } from "@goose/core/real-watch";
import { json, troubleFrom, troubleNote } from "./api.ts";
import { SetPrice } from "./SetPrice.tsx";
import { WANTS_HERO, dropEarlyGet, earlyGet } from "./early-wants.ts";
import { WANTS_SUB } from "./room-heads.ts";
// Track R's states kit, lazily: its chunk and stylesheet stay off the Desk's first paint (web/prerender.ts).
// A lost chunk draws nothing, never a blank Desk (Desk.tsx's `early`); the Desk fetches it once the page is idle.
function kit<P extends object>(pick: (m: typeof import("./DeskState.tsx")) => ComponentType<P>) {
  return lazy(() => import("./DeskState.tsx").then((m) => ({ default: pick(m) }), () => ({ default: (() => null) as ComponentType<P> })));
}
const Kit = { Empty: kit((m) => m.DeskEmpty), Loading: kit((m) => m.Loading), Trouble: kit((m) => m.TroubleState) };
const S = ({ children }: { children: ReactNode }) => <Suspense fallback={null}>{children}</Suspense>;
const Loading = (p: { on: boolean }) => <S><Kit.Loading {...p} /></S>;
const TroubleState = (p: { trouble: Trouble; onRetry: () => void }) => <S><Kit.Trouble {...p} /></S>;
const DeskEmpty = (p: { title: string; line: string; action: string; onAction: () => void }) => <S><Kit.Empty {...p} /></S>;
import { useName } from "../name.ts";
import { MUTE_KEY, isMuted, onMuted, setMuted } from "../speech.ts";
import { NameField } from "../voice/Greeting.tsx";
import "./watching.css";
import { usd, usdOf } from "@goose/core/money";

type Card = { catalogId: string; title: string; art: string; kind: string; status: string; protect: boolean; when: string; price: number | null; after: string; aside: string | null; max: Cents; mine: boolean; priority: "really" | "nice" };
type Shelf = { cards: Card[]; said: string };
type Want = { catalogId: string; item: string; label: string; max: string; line: string; warning?: string | null };
type Limit = { category: string; label: string; limit: string; own: boolean; locked: boolean; demo: boolean; choices: number[] };
type Wants = { wants: Want[]; limits: Limit[]; reads?: Record<string, GooseRead>; watching?: WatchRow[]; pings?: Record<string, WatchPing>; push?: boolean; real?: RealRow[]; error?: string };

/** The tab's name for each scenario, by the shelf's art. */
const TAB: Record<string, string> = { ticket: "Tickets", flight: "Flight", hotel: "Hotel", jacket: "Jacket", kettle: "Kettle" };
/** Scenarios with a recorded week the Desk can shop (server: recordedMarket); the rest can be watched. */
const SHOPPABLE = new Set(["marsh-lights-ticket", "gullwing-seat", "mossbell-night"]);
const plain = (s: string) => s.replace(/ \(fictional\)/g, "");

/**
 * A scenario's line from the record: its price set large when it leads with one. A set-aside is the run's own
 * protection moment (shield, line, gold "still watching"), its first sentence and the rest split, never re-worded.
 */
function SceneLine({ card }: { card: Card }) {
  if (card.price !== null) return <p className="dk-scene-line"><span className="dk-scene-amt">{dollars(card.price)}</span> {plain(card.after)}</p>;
  if (!card.protect) return <p className="dk-scene-line">{plain(card.status)}</p>;
  const s = plain(card.status), cut = s.indexOf(". ") + 1;
  return (
    <div className="dk-protect dk-flat" role="status">
      <svg className="dk-protect-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.75 4.5 5.5v5.8c0 4.6 3.1 8.6 7.5 9.95 4.4-1.35 7.5-5.35 7.5-9.95V5.5L12 2.75Z" /><path d="m8.6 12.1 2.4 2.4 4.4-4.9" /></svg>
      <div>
        <p className="dk-protect-h">{cut > 0 ? s.slice(0, cut) : s}</p>
        {cut > 0 && <p className="dk-stay">{s.slice(cut + 1)}</p>}
        {card.aside && <p className="dk-scene-why">Why: {card.aside}.</p>}
      </div>
    </div>
  );
}
const dollars = usd;

/** A pane's read. `away`: why it came back empty (DK: offline, waking, a cap or the server's error, each its own state
 *  block); `again` asks once more. `early`: start from the head's answer for this read, if it asked (early-wants.ts),
 *  so the first draw is what the room's cover drew and the page asks once; a lost one asks here, for its state. */
function useGet<T>(path: string, early = false): [T | null | "away", (v: T) => void, Trouble, () => void] {
  const [head] = useState(() => (early ? earlyGet(path) : undefined));
  const [got, setGot] = useState<T | null | "away">(() => (head?.v as T | null | undefined) ?? null);
  const [away, setAway] = useState<Trouble>("away");
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (head && tries === 0) {
      dropEarlyGet(path);
      // In by now, perhaps after this render began: the same object it started from is no change.
      if (head.v) { setGot(head.v as T); return; }
      let gone = false;
      void head.p.then((v) => { if (!gone) { if (v) setGot(v as T); else setTries(1); } });
      return () => { gone = true; };
    }
    setGot(null);
    json<T>(path).then(({ status, data }) => {
      // A pane's GET answers 200 with its rows; a capped or failed read is a state, never rows read as empty.
      if (status >= 400) { setAway(troubleOf(status, true, navigator.onLine !== false)); setGot("away"); } else setGot(data);
    }, (e: unknown) => { setAway(troubleFrom(e)); setGot("away"); });
  }, [path, tries]);
  return [got, setGot, away, () => setTries((n) => n + 1)];
}

/** Your week: one tab per recorded scenario, its line from the record, and one action. */
export function WeekPane({ onAsk }: { onAsk: (words: string) => void }) {
  const [shelf, , shelfAway, again] = useGet<Shelf>("/api/runs/shelf");
  const [tab, setTab] = useState(0);
  if (shelf === null) return <section className="dk-pane" aria-busy="true"><h1 className="dk-pane-h" tabIndex={-1}>Your week</h1><Loading on /></section>;
  if (shelf === "away") return <section className="dk-pane"><h1 className="dk-pane-h" tabIndex={-1}>Your week</h1><TroubleState trouble={shelfAway} onRetry={again} /></section>;
  const card = shelf.cards[tab]!;
  const focusTab = (i: number) => { setTab(i); requestAnimationFrame(() => document.getElementById(`dk-tab-${i}`)?.focus()); };
  return (
    <section className="dk-pane" aria-labelledby="dk-week-h">
      <h1 id="dk-week-h" className="dk-pane-h" tabIndex={-1}>Your week</h1>
      <p className="dk-pane-sub">{shelf.said}</p>
      <div className="dk-tabs" role="tablist" aria-label="Scenarios" onKeyDown={(e) => {
        const n = shelf.cards.length;
        if (e.key === "ArrowRight") focusTab((tab + 1) % n); else if (e.key === "ArrowLeft") focusTab((tab + n - 1) % n);
      }}>
        {shelf.cards.map((c, i) => (
          <button key={c.catalogId} id={`dk-tab-${i}`} type="button" role="tab" aria-selected={i === tab} aria-controls="dk-scene" tabIndex={i === tab ? 0 : -1} onClick={() => setTab(i)}><span className="dk-tab-t" data-text={TAB[c.art] ?? c.title}>{TAB[c.art] ?? c.title}</span></button>
        ))}
      </div>
      <div id="dk-scene" className="dk-scene" role="tabpanel" aria-labelledby={`dk-tab-${tab}`} key={card.catalogId}>
        <div className="dk-k">{card.when}</div>
        <h2>{card.title}</h2>
        <SceneLine card={card} />
        {SHOPPABLE.has(card.catalogId)
          ? <button type="button" className="dk-approve" onClick={() => onAsk(card.title)}>Ask Goose for this</button>
          : <Watch catalogId={card.catalogId} primary />}
        <SetPrice catalogId={card.catalogId} priority={card.mine ? card.priority : "really"} now={card.max} />
      </div>
    </section>
  );
}

/** "Keep watching": saves a "really want"; the price watch then reads it. The saved line is the want card's max. */
/** `max`: what she is held to when her own cap holds the ask (S1-11, after H-6: "under 80 dollars" saves the want at
 *  $80.00, not the category's limit); left out, the server keeps the want at the limit. */
export function Watch({ catalogId, offer, primary, max }: { catalogId: string; offer?: boolean; primary?: boolean; max?: Cents | undefined }) {
  const [st, setSt] = useState<{ kind: "idle" | "busy" } | { kind: "saved" | "error"; line: string }>({ kind: "idle" });
  async function keep() {
    setSt({ kind: "busy" });
    try {
      const r = await json<{ error?: string; wants?: { catalogId: string; max: string }[] }>("/api/runs/wants", watchWant(catalogId, max));
      const want = r.data.wants?.find((w) => w.catalogId === catalogId);
      setSt(r.data.error || !want ? { kind: "error", line: r.data.error ?? "That didn't save. Nothing changed." } : { kind: "saved", line: watchingLine(want.max) });
    } catch (e) { setSt({ kind: "error", line: troubleNote(e) }); }
  }
  return (
    <aside className={`dk-wait${st.kind === "saved" ? " dk-saved" : ""}`} aria-label={offer ? "Rather wait?" : "Keep watching"}>
      {/* One slot: the saved (or failed) line takes the place of the offer, so the card keeps its height. Under the deal
          card the offer is the question alone (the DD's 1440 budget: the button says what it does). */}
      <p role="status">{st.kind === "saved" || st.kind === "error" ? st.line : offer ? <b>Rather wait?</b> : RATHER_WAIT}</p>
      <button type="button" className={primary ? "dk-approve" : "dk-pill"} disabled={st.kind === "busy" || st.kind === "saved"} onClick={() => void keep()}>
        {st.kind === "saved" ? <><svg className="dk-tick" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 4 4 8-9" /></svg>Watching</> : st.kind === "busy" ? "Saving…" : "Keep watching"}
      </button>
    </aside>
  );
}

/**
 * "Set your price" (Joshua, Nov 5, 3a): her number on a want, saved by this tap only. The server's `checkWant` holds it to
 * her limit and says so, and what it answers replaces the list. It starts no run and binds no cart: a want only waits.
 */
/** Goose's Read: its own chunk, fetched only once a want is on screen. */
const Read = lazyOr(() => import("../list/Read.tsx"));
// The ping, replayed after Set your price (Joshua, Nov 5 6:40 PM): its own chunk, fetched only when one plays.
const PingReplay = lazyOr(() => import("./PingReplay.tsx"));
// The ping with the tab closed (Level 2): its own chunk, fetched only when the server's switch is on.
const PushRow = lazyOr(() => import("./PushRow.tsx"));

/** Your wants: what Goose is watching for her, each with the price watch's own line. */
export function WantsPane({ onWeek, onAsk, onDeal }: { onWeek: () => void; onAsk: () => void; onDeal: (words: string) => void }) {
  const [got, setGot, away, again] = useGet<Wants>("/api/runs/wants", true);
  // Each want's line is the week's own line for it (the shelf carries all her wants), the same words Your week shows.
  const [shelf] = useGet<Shelf>("/api/runs/shelf", true);
  const sceneOf = (id: string) => (shelf && shelf !== "away" ? shelf.cards.find((c) => c.catalogId === id) : undefined);
  const hero = sceneOf(WANTS_HERO);
  // THE PING (b), Track F: her first real watch starts the real watcher (its own chunk, real-watcher.ts), which pings a
  // read made during this visit at or under her price, once, and a tap brings her back to that row. A new watch checks at
  // once (the server reads a watch that has never been read), so a price already under hers pings within seconds.
  const realKeys = got !== null && got !== "away" ? (got.real ?? []).map((r) => `${r.productId}@${r.domain}:${r.target}`).join(" ") : "";
  useEffect(() => { if (realKeys) void import("./real-watcher.ts").then((m) => m.watchReal(), () => {}); }, [realKeys]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Which row's ping plays: set by her own Set your price on that row, never on load; n restarts it on each press.
  const [play, setPlay] = useState<{ id: string; n: number } | null>(null);
  const saved = (id: string) => (w: Wants) => { setGot(w); setPlay((p) => ({ id, n: (p?.n ?? 0) + 1 })); };
  async function stop(catalogId: string) {
    setBusy(true); setNote(null);
    try { const r = await json<Wants>("/api/runs/wants/remove", { catalogId }); if (r.data.error) setNote(r.data.error); else setGot(r.data); }
    catch (e) { setNote(troubleNote(e)); }
    setBusy(false);
  }
  async function stopReal(productId: string, domain: string) {
    setBusy(true); setNote(null);
    try { const r = await json<Wants>("/api/runs/wants/real/remove", { productId, domain }); if (r.data.error) setNote(r.data.error); else setGot(r.data); }
    catch (e) { setNote(troubleNote(e)); }
    setBusy(false);
  }
  return (
    <section className="dk-pane" aria-labelledby="dk-wants-h" aria-busy={got === null || undefined}>
      <h1 id="dk-wants-h" className="dk-pane-h" tabIndex={-1}>Your wants</h1>
      <p className="dk-pane-sub">{WANTS_SUB}</p>
      {got === null && <Loading on />}
      {got === "away" && <TroubleState trouble={away} onRetry={again} />}
      {note && <p className="dk-pane-sub" role="alert">{note}</p>}
      {got !== null && got !== "away" && (got.wants.length === 0 ? (
        <>
          <DeskEmpty title={WANTS_EMPTY.title} line={WANTS_EMPTY.line} action={WANTS_EMPTY.action} onAction={onAsk} />
          {hero && <div className="dk-scene dk-watch-first"><h2>{hero.title}</h2><SetPrice catalogId={hero.catalogId} priority="really" now={hero.max} onSaved={saved(hero.catalogId)} ping /></div>}
        </>
      ) : (
        <>
          <p id="dk-watching-h" className="dk-watching-h">{WATCHING_HEAD}</p>
          <ul className="dk-cards" aria-labelledby="dk-watching-h">
            {(got.watching ?? []).map((r) => {
              const scene = sceneOf(r.catalogId);
              const ping = play?.id === r.catalogId ? got.pings?.[r.catalogId] : undefined;
              return (
                <li key={r.catalogId} className={`dk-scene${r.pinged ? " dk-pinged" : ""}`}>
                  <div className="dk-row-top"><h2>{plain(r.item)}</h2><span className="dk-tag">{got.wants.find((w) => w.catalogId === r.catalogId)?.label}</span></div>
                  <div className="dk-k">{r.when}</div>
                  <dl className="dk-watch">
                    <div><dt>{YOUR_PRICE}</dt><dd>{dollars(r.target)}</dd></div>
                    <div><dt>{BEST_TODAY}</dt><dd>{r.best ? <><b>{dollars(r.best.total)}</b> at {r.best.at}</> : NO_BEST}</dd></div>
                    <div><dt>Status</dt><dd role="status">{ping ? <Suspense key={play!.n} fallback={r.status}><PingReplay ping={ping} tag={r.catalogId} onOpen={() => { if (r.ask) onDeal(r.ask); }} /></Suspense> : r.status}</dd></div>
                  </dl>
                  {r.heads && <p className="dk-watch-heads">{r.heads}</p>}
                  {scene?.protect && <SceneLine card={scene} />}
                  {/* A ping never sits next to an urge to buy: the Read's BUY NOW only falls on a pinged row (watching-list.test). */}
                  {!r.pinged && got.reads?.[r.catalogId] && <Suspense fallback={null}><Read read={got.reads[r.catalogId]!} /></Suspense>}
                  <div className="dk-watch-acts">
                    {r.ask && <button type="button" className="dk-approve dk-watch-open" onClick={() => onDeal(r.ask!)}>{OPEN_DEAL}</button>}
                    <SetPrice catalogId={r.catalogId} priority={r.priority} now={r.target} onSaved={saved(r.catalogId)} quiet ping />
                    <button type="button" className="dk-pill" disabled={busy} onClick={() => void stop(r.catalogId)}>Stop watching</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ))}
      {got !== null && got !== "away" && got.wants.length > 0 && (
        <p className="dk-rows-end">Goose is watching {got.wants.length === 1 ? "1 item" : `${got.wants.length} items`}. <button type="button" className="dk-why-btn" onClick={onWeek}>Find more in your week</button></p>
      )}
      {got !== null && got !== "away" && got.push && got.wants.length > 0 && <Suspense fallback={null}><PushRow /></Suspense>}
      {got !== null && got !== "away" && <p className="dk-watch-said">{PINGS_HERE}{shelf && shelf !== "away" ? ` ${shelf.said}` : ""}</p>}
      {/* Real prices after the demo week's footer, so its "Fictional sellers and recorded prices" never reads as covering them. */}
      {got !== null && got !== "away" && (got.real?.length ?? 0) > 0 && (
        <>
          <p id="dk-real-h" className="dk-watching-h">{REAL_HEAD}</p>
          <ul className="dk-cards" aria-labelledby="dk-real-h">
            {got.real!.map((r) => (
              <li key={`${r.productId} ${r.domain}`} className={`dk-scene${r.pinged ? " dk-pinged" : ""}`} data-real={`${r.productId}@${r.domain}`} tabIndex={-1}>
                <div className="dk-row-top"><h2>{plain(r.item)}</h2></div>
                <div className="dk-k">{r.when}</div>
                <dl className="dk-watch">
                  <div><dt>{YOUR_PRICE}</dt><dd>{usdWide(r.target)}</dd></div>
                  <div><dt>{BEST_TODAY}</dt><dd>{r.best ? <><b>{usdWide(r.best.total)}</b> at {r.best.at}</> : NO_READ}</dd></div>
                  <div><dt>Status</dt><dd role="status">{r.status}</dd></div>
                </dl>
                <p className="dk-watch-heads">{CHECKS_DAILY} {BUY_THERE}</p>
                <div className="dk-watch-acts">
                  <SetPrice real={{ productId: r.productId, domain: r.domain, name: r.item }} now={r.target} onSaved={setGot} quiet ping />
                  <button type="button" className="dk-pill" disabled={busy} onClick={() => void stopReal(r.productId, r.domain)}>Stop watching</button>
                </div>
              </li>
            ))}
          </ul>
          <p className="dk-watch-said">{WATCH_KEEPS}</p>
        </>
      )}
    </section>
  );
}

/** Settings: her limits. Each holds every cart in its category, in code; a demo-locked one says so. */
export function SettingsPane() {
  const [got, setGot, away, again] = useGet<Wants>("/api/runs/wants");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  async function set(category: string, limit: number) {
    setBusy(true); setNote(null);
    try { const r = await json<Wants>("/api/runs/limit", { category, limit }); if (r.data.error) setNote(r.data.error); else setGot(r.data); }
    catch (e) { setNote(troubleNote(e)); }
    setBusy(false);
  }
  return (
    <section className="dk-pane" aria-labelledby="dk-set-h" aria-busy={got === null || undefined}>
      {/* S1-6: the menu's name for this pane, word for word (Round 2's consumer: "Limits in code" opened "Settings"). */}
      <h1 id="dk-set-h" className="dk-pane-h" tabIndex={-1}>{LIMITS_NAME}</h1>
      <p className="dk-pane-sub">Goose holds every cart in this browser to these limits. A seller's words can't change them, and neither can the words of an ask.</p>
      {got === null && <Loading on />}
      {got === "away" && <TroubleState trouble={away} onRetry={again} />}
      {note && <p className="dk-pane-sub" role="alert">{note}</p>}
      {got !== null && got !== "away" && (
        <ul className="dk-rows">
          {got.limits.map((l) => (
            <li key={l.category} className="dk-limit">
              {/* Fixed or hers to change: the tag says which, so a row without a control never looks broken. */}
              <div className="dk-row-top"><h2>{l.label}</h2><span className="dk-tag">{l.locked || l.choices.length === 0 ? "Fixed for this demo" : l.own ? "Set by you" : "Yours to change"}</span></div>
              {l.locked || l.choices.length === 0
                ? <p><span className="dk-val"><span className="dk-amt">{usdOf(l.limit)}</span> per cart</span></p>
                : <p className="dk-pick">
                    {/* The select is the value: it shows her limit and changes it, so the row says the amount once. */}
                    <select aria-label={`${l.label} limit, per cart`} value={Math.round(Number(l.limit) * 100)} disabled={busy} onChange={(e) => void set(l.category, Number(e.target.value))}>
                      {[...l.choices].reverse().map((c) => <option key={c} value={c}>{dollars(c)}</option>)}
                    </select> per cart
                  </p>}
            </li>
          ))}
        </ul>
      )}
      {/* After the answer, so the limits landing above never push these down (Round 5: most of #settings' shift at 390). */}
      {got !== null && <VoiceRows />}
    </section>
  );
}

/** Whether Goose is muted, in step with the captions' Mute, the greeting's and other tabs (Track V's `speech.ts`). */
function useMuted(): boolean {
  const [muted, set] = useState(isMuted);
  useEffect(() => {
    const now = () => set(isMuted());
    const store = (e: StorageEvent) => { if (e.key === MUTE_KEY || e.key === null) now(); };
    const stop = onMuted(now);
    addEventListener("storage", store);
    return () => { stop(); removeEventListener("storage", store); };
  }, []);
  return muted;
}

/**
 * Goose's voice and her name, in Limits in code (Track V's ask; DK: both left the hero, Joshua Sat Oct 31 3:30 AM, and
 * live here, two taps from it: the menu, then this row). Mute is remembered in this browser and shared with the
 * captions'; the name Goose calls her is kept in this browser only. Neither touches a limit or a payment.
 */
function VoiceRows() {
  const muted = useMuted();
  const name = useName();
  return (
    <ul className="dk-rows dk-voice" aria-label="Goose's voice">
      <li className="dk-limit">
        <div className="dk-row-top"><h2>Goose's voice</h2><span className="dk-tag">{muted ? "Muted in this browser" : "Speaks its lines aloud, with captions"}</span></div>
        <p><button type="button" className="dk-why-btn" onClick={() => setMuted(!muted)}>{muted ? "Unmute Goose" : "Mute Goose"}</button></p>
      </li>
      <li className="dk-limit dk-name-row">
        <div className="dk-row-top"><h2>Your name</h2><span className="dk-tag">{name ? `Goose calls you ${name}. Kept in this browser only.` : "Not kept. Or say “call me Sam” to Goose."}</span></div>
        <div className="dk-name-act"><NameField kept={name} /></div>
      </li>
    </ul>
  );
}
