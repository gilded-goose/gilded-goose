// "Every decision": the decision ledger, the product's spine on screen (Track C, docs/guild/022-ag-grid-ledger.md).
// Loaded after the first rows arrive (its own chunk; ADR 0007). Rows are `gridRows` (the fold's rows, core/src/view/grid.ts):
// filter chips by layer and by who, quick search, the rule column, the refusal red. A row click jumps to that moment:
// the lanes above (App) and the moment panel here redraw the ledger as it stood at that row. 768 px and wider get the
// AG Grid Community table (another chunk); narrower screens get cards. `?ledger=full` opens it full screen for the film,
// on any build (W74), and `&row=N` opens on that row's moment (`ledgerRowHref`).

import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { lazyOr } from "./states/online.ts";
import { createPortal } from "react-dom";
import eggStill from "./desk/egg.webp"; // the Desk Egg's still, the same mark the shared nav uses
import type { LedgerEvent } from "@goose/core";
import type { StopSaid } from "@goose/core/return";
import {
  ACTOR_CHIPS, LAYER_CHIPS, chipCounts, gridRows, momentAt, passesChips, passesSearch, type ActorGroup, type Chips, type GridRow, type LayerKey, type Moment,
} from "@goose/core/grid";
import { HEAD, dealLane, usd } from "./ledger-words.ts";
import "./run-ledger.css";
import "./ledger.css";
import { usdOf } from "@goose/core/money";

const LedgerGrid = lazyOr(() => import("./LedgerGrid.tsx"));
const WIDE = "(min-width: 768px)";
const nobreak = (s: string) => s.replace(/(\d{4})-(\d{2})-(\d{2})/g, "$1‑$2‑$3");

function useWide(): boolean {
  const [wide, setWide] = useState(() => matchMedia(WIDE).matches);
  useEffect(() => { const m = matchMedia(WIDE); const f = () => setWide(m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  return wide;
}

/** A refusal, stamped on the receipt as on the wallet's card; the byline names who refused it (the Watcher or code). */
export function RefusedStamp({ r }: { r: GridRow }) {
  const by = r.actor === "watcher" ? "by the Watcher" : r.actor === "code" ? "by code" : null;
  return <span className="lg-did refused lg-stamp"><b>{r.did}</b>{by && <small>{by}</small>}</span>;
}

/** The "why" of a row, with the seller's quoted words and the labels that say where a row came from. Shared by the grid and the cards. */
export function WhyCell({ r, clamp }: { r: GridRow; clamp?: boolean }) {
  return (
    <span className={clamp ? `lg-why clamp${r.tone === "scam" || r.tone === "refused" ? " long" : ""}` : "lg-why"} title={clamp ? [r.why, r.quoted ? `“${r.quoted}”` : ""].filter(Boolean).join(" ") : undefined}>
      {r.why}
      {r.quoted ? <> <q>{r.quoted}</q> <span className="tag">never shown to the agent</span></> : null}
      {r.fenced ? <> <span className="tag">name withheld</span> <q>{r.fenced}</q></> : null}
      {r.refusedAt !== null ? <> <span className="tag red">set aside by the Watcher, row {r.refusedAt}</span></> : null}
      {r.label ? <> <span className="tag">{nobreak(r.label)}</span></> : null}
      {r.eventId ? <> <span className="tag">PayPal event {r.eventId}</span></> : null}
      {r.tone === "unmatched" ? <> <span className="tag red">unmatched: no cart in this ledger</span></> : null}
      {r.tone === "differs" ? <> <span className="tag red">PayPal's report differs from this ledger</span></> : null}
      {r.count > 1 ? <> <span className="tag">×{r.count}, also rows {r.also.join(", ")}</span></> : null}
    </span>
  );
}

export interface LedgerProps {
  events: LedgerEvent[];
  /** The picked row, or null to follow the newest. */
  at: number | null;
  onPick: (seq: number | null) => void;
  /** `?ledger=open` (ADR 0007): the inline ledger starts open at any width (desktop opens it anyway). */
  open?: boolean;
  full: boolean;
  onFull: (open: boolean) => void;
  /** The run line ("market #1 · buyer: recorded · …"), shown in the full-screen header. */
  sub: string;
  busy: boolean;
  onGo: () => void;
  /** Under the inline ledger (the dial preview). */
  children?: ReactNode;
  /** This run, for its week's stop (the server's words): under it, the "asked" moment never says it waits for a yes. The run, not
   *  its stop, so the eager route pays one short prop and the reading happens in this lazy chunk (classic's keyed room, Nov 5). */
  run?: { stop?: StopSaid | null | undefined } | null | undefined;
}

export default function Ledger({ events, at, onPick, open, full, onFull, sub, busy, onGo, children, run }: LedgerProps) {
  const wide = useWide();
  const rows = useMemo(() => gridRows(events), [events]);
  const [layers, setLayers] = useState<Set<LayerKey>>(new Set());
  const [actors, setActors] = useState<Set<ActorGroup>>(new Set());
  const [search, setSearch] = useState("");
  const chips: Chips = useMemo(() => ({ layers, actors }), [layers, actors]);
  const shown = rows.filter((r) => passesChips(r, chips) && passesSearch(r, search));

  // Full screen is a modal dialog: focus moves to its title (read first, no ring; Tab reaches Close and the rest),
  // everything else on the page is inert (keyboard and screen readers stay inside), Escape closes it, the page under it
  // doesn't scroll, and focus returns to "Full screen ›".
  const spine = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const fullBtn = useRef<HTMLButtonElement>(null);
  const wasFull = useRef(full);
  useEffect(() => {
    if (!full) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onFull(false); };
    addEventListener("keydown", k);
    document.documentElement.classList.add("spine-open");
    const behind = [...document.body.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el !== spine.current && !el.inert);
    for (const el of behind) el.inert = true;
    title.current?.focus();
    return () => { removeEventListener("keydown", k); document.documentElement.classList.remove("spine-open"); for (const el of behind) el.inert = false; };
  }, [full, onFull]);
  // Back from full screen, focus returns to "Full screen ›". On a phone it sits in a closed <details>, so open it first.
  useEffect(() => {
    if (wasFull.current && !full) { const d = fullBtn.current?.closest("details"); if (d) d.open = true; fullBtn.current?.focus(); }
    wasFull.current = full;
  }, [full]);

  const sellers = new Set(events.filter((e) => e.actor === "seller" && e.sellerId).map((e) => e.sellerId)).size;
  const rounds = Math.max(0, ...events.map((e) => e.round ?? 0));
  const refused = rows.filter((r) => r.tone === "refused").length;
  const folded = rows.reduce((n, r) => n + r.count, 0) - rows.length;
  const head = `${events.length} decisions · ${sellers} sellers, ${rounds} rounds`; // the count wording the toolbar and Behind the scenes share

  // Full screen on a phone: the moment sits above the cards, so a tap scrolls back up to it.
  const pick = (seq: number | null) => {
    onPick(seq);
    if (full && !wide && seq !== null) document.querySelector(".spine")?.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  const tools = <Toolbar rows={rows} layers={layers} actors={actors} setLayers={setLayers} setActors={setActors} search={search} setSearch={setSearch} shown={shown} one={full && wide} />;
  // On a phone the twelve chips would fill a screen before the first row, so they wait behind one tap (open while in use).
  const filtering = layers.size > 0 || actors.size > 0 || search !== "";
  const toolbar = wide ? tools : (
    <details className="lg-filters" open={filtering || undefined}>
      <summary>Filter and search {filtering ? <span>{shown.length} of {rows.length} rows</span> : null}</summary>
      {tools}
    </details>
  );
  const table = rows.length === 0 ? <p className="lg-empty">Press <b>Go find it</b>: every move, offer and check lands here as it happens.</p>
    : shown.length === 0 ? <p className="lg-empty">No row matches. <button type="button" className="linkish" onClick={() => { setLayers(new Set()); setActors(new Set()); setSearch(""); }}>Show every row</button></p>
    : wide ? <Suspense fallback={<p className="lg-empty">Loading the grid…</p>}><LedgerGrid rows={rows} chips={chips} search={search} at={at} onPick={onPick} full={full} busy={busy} /></Suspense>
    : <Cards rows={shown} at={at} onPick={pick} />;
  // Design B, slice 3: on the page the ledger is a printed receipt on the desk (torn edges, its own paper).
  // Its head is the store and the run line; its foot is the tally, every figure counted from the rows above.
  const receipt = (
    <div className="lg-receipt"><div className="lg-paper">
      <header className="lg-rhead">
        <p className="lg-store"><img className="lg-mark" src={eggStill} alt="" width={18} height={22} />Gilded Goose</p>
        {sub ? <p className="lg-run">{nobreak(sub)}</p> : null}
      </header>
      {table}
      {rows.length > 0 ? (
        <footer className="lg-rfoot">
          <p>Written as it happened, never edited.</p>
          <dl className="lg-tally">
            <div><dt>Decisions</dt><dd>{events.length}</dd></div>
            <div><dt>Repeats folded</dt><dd>{folded}</dd></div>
            <div><dt>Sellers</dt><dd>{sellers}</dd></div>
            <div><dt>Rounds</dt><dd>{rounds}</dd></div>
            <div className="refused"><dt>Refused</dt><dd>{refused}</dd></div>
          </dl>
        </footer>
      ) : null}
    </div></div>
  );

  if (full) {
    // Desk-J3: the portal leaves the page's `.dk.cv` velvet wrapper (App.tsx), so the full screen carries it itself.
    return createPortal(
      <div className="spine dk cv lx-every" data-palette="midnight" ref={spine} role="dialog" aria-modal="true" aria-labelledby="spine-title">
        <header className="spine-head">
          <div>
            <h2 id="spine-title" ref={title} tabIndex={-1}>Every decision <small>{refused > 0 ? <b className="refused">{refused} refused</b> : null}{refused > 0 ? " · " : ""}{head}</small></h2>
            <p className="muted small">{sub ? nobreak(sub) : "Each row is one decision, written as it happened, never edited: the AI proposes, code decides."}</p>
          </div>
          <div className="spine-actions">
            <button className="btn" onClick={onGo} disabled={busy} aria-busy={busy || undefined}>{busy ? "Haggling…" : "Go find it"}</button>
            <button type="button" className="spine-close" onClick={() => onFull(false)} aria-label="Close full screen">Close</button>
          </div>
        </header>
        {toolbar}
        <div className="spine-body">
          <div className="spine-table">{table}</div>
          <MomentPanel events={events} at={at} onPick={pick} said={run?.stop} compact={!wide && at === null} refused={refused} hidden={at !== null && !shown.some((r) => r.seq === at || r.also.includes(at))} />
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <details className="ledger" open={wide || open || undefined}>
      <summary><b>Every decision <span aria-hidden>›</span></b><span>{head}</span></summary>
      <div className="lg-bar">
        <p className="muted small">Each row is one decision, written as it happened and never edited. {wide ? "Click" : "Tap"} a row to see that moment above.</p>
        {/* W74: a phone gets full screen too (cards, with the moment above them), not only the inline list. */}
        <button type="button" className="linkish" ref={fullBtn} onClick={() => onFull(true)}>Full screen ›</button>
      </div>
      {toolbar}
      {receipt}
      {children}
    </details>
  );
}

function Toolbar(p: { rows: GridRow[]; shown: GridRow[]; layers: Set<LayerKey>; actors: Set<ActorGroup>; setLayers: (s: Set<LayerKey>) => void; setActors: (s: Set<ActorGroup>) => void; search: string; setSearch: (s: string) => void; one?: boolean }) {
  const counts = chipCounts(p.rows);
  const flip = <T,>(s: Set<T>, k: T) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; };
  const decisions = p.shown.reduce((n, r) => n + r.count, 0);
  const all = p.rows.reduce((n, r) => n + r.count, 0);
  // One count wording on every back-room surface: "N decisions", and the rows they fold into when repeats fold.
  const count = p.shown.length === p.rows.length
    ? `${all} decisions${all > p.rows.length ? ` in ${p.rows.length} rows (${all - p.rows.length} repeats folded)` : ""}`
    : `${decisions} of ${all} decisions, in ${p.shown.length} rows`;
  const search = <label className="lg-search"><input type="search" aria-label="Search the ledger" placeholder="Search: SYSTEM, over-ask, $47.73…" value={p.search} onChange={(e) => p.setSearch(e.target.value)} /></label>;
  const layerChips = (
    <div className="lg-chips" role="group" aria-label="Filter by safety check">
      <span className="lg-k">Safety check</span>
      {LAYER_CHIPS.map((c) => <button type="button" key={c.key} className="lg-chip" aria-pressed={p.layers.has(c.key)} disabled={counts.layers[c.key] === 0} onClick={() => p.setLayers(flip(p.layers, c.key))}>{c.label} <small>{counts.layers[c.key]}</small></button>)}
    </div>
  );
  const actorChips = (rest?: ReactNode) => (
    <div className="lg-chips" role="group" aria-label="Filter by who">
      <span className="lg-k">Who</span>
      {ACTOR_CHIPS.map((c) => <button type="button" key={c.key} className="lg-chip" aria-pressed={p.actors.has(c.key)} disabled={counts.actors[c.key] === 0} onClick={() => p.setActors(flip(p.actors, c.key))}>{c.label} <small>{counts.actors[c.key]}</small></button>)}
      {rest}
    </div>
  );
  // Track L (Joshua, Fri Oct 30: "one filter row; the rest in a Filter menu"): full screen on a wide screen keeps search
  // and the count in one row and folds the twelve chips into a Filter disclosure; its button says how many are on.
  if (p.one) {
    const on = p.layers.size + p.actors.size;
    return (
      <div className="lg-tools lg-one">
        <div className="lg-one-row">
          {search}
          <details className="lg-more" onKeyDown={(e) => { if (e.key === "Escape" && e.currentTarget.open) { e.stopPropagation(); e.currentTarget.open = false; e.currentTarget.querySelector("summary")?.focus(); } }}>
            <summary>Filter{on > 0 ? <span className="lg-on"> · {on} on</span> : null}</summary>
            <div className="lg-more-in">{layerChips}{actorChips()}</div>
          </details>
          <p className="lg-count muted small" aria-live="polite">{count}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="lg-tools">
      {layerChips}
      {actorChips(search)}
      <p className="lg-count muted small" aria-live="polite">{count}</p>
    </div>
  );
}

/** Under 768 px: one card per row, the same rows, chips and search as the grid. Tapping a card jumps to its moment. */
function Cards({ rows, at, onPick }: { rows: GridRow[]; at: number | null; onPick: (seq: number) => void }) {
  return (
    <table className="ltable"><tbody>
      {rows.map((r) => (
        <tr key={r.seq} className={`${r.tone}${at === r.seq ? " picked" : ""}`} onClick={() => onPick(r.seq)} data-seq={r.seq} data-ledger-seq={r.seq} data-also={r.also.join(" ")}>
          <td className="seq"><button type="button" className="lg-pick" aria-pressed={at === r.seq} aria-label={`Show the moment at row ${r.seq}`} onClick={(e) => { e.stopPropagation(); onPick(r.seq); }}>{r.seq}</button></td>
          <td className="who">{r.who}<span className="lg-did"> · {r.did}</span></td>
          <td className="amt">{r.verdict === "refused" ? <span aria-hidden><RefusedStamp r={r} /></span> : null}{r.price ?? ""}</td>
          <td className="why">
            <span className="lg-tags"><span className={`tag layer l${r.layer}`}>{r.layerLabel}</span>{r.rule ? <code className="rule">{r.rule}</code> : null}</span>
            <WhyCell r={r} />
          </td>
        </tr>
      ))}
    </tbody></table>
  );
}

const OK = new Set<Moment["phase"]>(["deal", "asked", "approved", "ordered", "paid"]);


/** The moment a row click jumps to: the ledger as it stood at that row, drawn from `momentAt` (laneModel of the rows up to it). */
function MomentPanel({ events, at, onPick, hidden, compact, refused = 0, said }: { events: LedgerEvent[]; at: number | null; onPick: (seq: number | null) => void; hidden?: boolean; compact?: boolean; refused?: number; said?: StopSaid | null | undefined }) {
  const last = events.at(-1);
  const m = last ? momentAt(events, at ?? last.seq) : null;
  if (!m) return <aside className="moment"><p className="lg-empty">The moment you click shows here.</p></aside>;
  const i = events.findIndex((e) => e.seq === m.seq);
  const prev = events[i - 1]?.seq;
  const next = events[i + 1]?.seq;
  const max = m.model.edge?.price ?? null;
  const r = gridRows(m.events).find((g) => g.seq === m.seq || g.also.includes(m.seq));
  if (compact) {
    return (
      <aside className="moment compact" aria-label="The moment" data-moment={m.seq}>
        <p className="moment-k">Now · row {m.seq} of {last!.seq}</p>
        <h3 className={m.phase === "refused" ? "refused" : OK.has(m.phase) ? "ok" : undefined}>{HEAD[m.phase](m, said)}</h3>
        <p>{refused > 0 ? <b className="refused">{refused} refused · </b> : null}Tap a card to see that moment.</p>
      </aside>
    );
  }
  return (
    <aside className="moment" aria-label="The moment" data-moment={m.seq}>
      <p className="moment-k">{at === null ? "Now" : "Picked"} · row {m.seq} of {last!.seq}{hidden ? " · hidden by your filter" : ""}</p>
      <h3 className={m.phase === "refused" ? "refused" : OK.has(m.phase) ? "ok" : undefined}>{HEAD[m.phase](m, said)}</h3>
      <div className={`moment-row ${m.row.verdict ?? ""}`} data-seq={m.seq}>
        <b>{r?.who ?? m.row.actor}</b> {r?.did ?? m.row.action}{m.row.price ? ` · ${usdOf(m.row.price)}` : ""}
        <p>{m.row.why}</p>
        {m.row.quoted ? <p><q>{m.row.quoted}</q> <span className="tag">never shown to the agent</span></p> : null}
      </div>
      {max !== null && <p className="moment-cap" data-seq={m.model.edge!.seq}>The most any cart can cost: <b>{usd(max)}</b> · set by code</p>}
      <ul className="moment-lanes">
        {m.model.lanes.map((l) => {
          const mark = l.marks.at(-1)!;
          const deal = m.model.deal?.sellerId === l.id;
          const state = l.flag ? "set aside by the Watcher" : deal ? dealLane(m.phase, said) : l.kind === "agent" ? `round ${mark.round}` : max !== null && mark.price > max ? "over your max" : `round ${mark.round}`;
          return (
            <li key={l.id} className={l.flag ? "refused" : deal ? "deal" : l.kind} data-seq={l.flag?.seq ?? mark.seq}>
              <span>{l.name}</span><b data-seq={mark.seq}>{usd(deal ? m.model.deal!.price : mark.price)}</b><small>{state}</small>
            </li>
          );
        })}
      </ul>
      <div className="moment-nav">
        {prev !== undefined && <button type="button" className="lg-chip" onClick={() => onPick(prev)}>‹ Row {prev}</button>}
        {next !== undefined && <button type="button" className="lg-chip" onClick={() => onPick(next)}>Row {next} ›</button>}
        {at !== null && <button type="button" className="lg-chip now" onClick={() => onPick(null)}>Back to now</button>}
      </div>
    </aside>
  );
}
