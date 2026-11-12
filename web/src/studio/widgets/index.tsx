// The dashboard's widgets (Track AS, slice 2): six custom AG Studio widgets, each a thin wrapper around a component
// another track already ships, unchanged: D's Week and SpendLimits, H's Ladder, L's LedgerTable (AG Grid Community
// inside a custom widget; no Enterprise licence needed for it), plus two lists read straight from the ledger rows (what
// the Watcher set aside, what PayPal confirmed). Every widget renders its question as a heading, its chart or list, and
// a text alternative, so a screen reader and a judge read the same thing. Nothing here can pay, approve, change a limit
// or write the ledger: the widgets only read `StudioData`.
//
// Studio's canvas is 24 tracks wide and `ROW` px tall per track (theme.ts leaves Studio's 16). Two page states: the
// desktop's two columns, and the phone's one column (every widget 24 tracks wide), picked at mount by the page.

import { appHref } from "../../menu/href.ts";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import type { AgReportState, AgWidgetParams } from "ag-studio";
import type { AgWidgetDefinition } from "ag-studio-react";
import proof from "virtual:goose-proof";
import { runFigure, sandboxIds, webhookEvents } from "@goose/core/proof";
import { ladderData, ladderSummary, roundsReady } from "@goose/core/haggle";
import { watchRuleWords, type LedgerRow } from "@goose/core/session";

/** The rule that set a seller aside, in words (the side sheet's reading of a Watcher row's rule codes). */
const ruleWords = (r: LedgerRow) => (r.rule ? (r.actor === "watcher" ? r.rule.split(", ").map(watchRuleWords).map((w, i) => (i ? `${w.charAt(0).toLowerCase()}${w.slice(1)}` : w)).join(", ") : r.rule) : "");
import { Week } from "../../ledger/Week.tsx";
import { HowThisWorks } from "../../ledger/How.tsx";
import { SpendLimits } from "../../charts/SpendLimits.tsx";
import Ladder from "../../haggle/Ladder.tsx";
import { LedgerTable } from "../../ledger/LedgerTable.tsx";
import { Cards } from "../../ledger/Cards.tsx";
import { Amount, PayPalMark } from "../../ledger/marks.tsx";
import { didWords } from "../../ledger/rows.ts";
import { NARROW_PX, useWidth } from "../../charts/size.ts";
import { auditList, findRows, isVisitHead, rulesOf } from "../audit.ts";
import { APPEND_ONLY, FIND_RULE, FIND_ROWS, findWordsOf, setAsideCount } from "../words.ts";
import { useStudioData } from "../data.ts";
import { paypalCount, paypalCountWords } from "../paypal-words.ts";
import { fitColumn, fitRows, layoutFor, shellFit, tracksIn, withThreat } from "../layout.ts";
import { THREAT_WIDGETS, threatPivots } from "./threat.tsx";
import type { Source } from "../threat-model.ts";

/** A row's full story opens in the page's side sheet (L's RowSheet); the widget only asks. */
export const OpenRowContext = createContext<(r: LedgerRow) => void>(() => {});

/** Studio shows a widget once it says it is displayed; every Goose widget is, as soon as it mounts. */
function useDisplayed(widgetApi: AgWidgetParams["widgetApi"]) {
  useEffect(() => { widgetApi.setDisplayState("displayed"); }, [widgetApi]);
}

/**
 * One card's inner frame: padding on the 8 px grid, the content scrolls inside its card when a visitor shrinks it. It
 * carries Studio's widget id, so an ask for a view that is already on the page can scroll to this card and light it
 * (Studio.tsx `showExisting`) instead of adding a copy.
 */
function Card({ children, className = "", id, data = {} }: { children: ReactNode; className?: string; id: string; data?: Record<string, string> }) {
  const attrs = Object.fromEntries(Object.entries(data).map(([k, v]) => [`data-${k}`, v]));
  return <div className={`st-card ${className}`.trim()} data-widget-id={id} {...attrs}>{children}</div>;
}

// 1. The week: D's chart, unchanged (its own question, key and sentence).
function WeekWidget({ widgetApi, widgetId }: AgWidgetParams) {
  useDisplayed(widgetApi);
  const { story } = useStudioData();
  return <Card id={widgetId} className="st-week"><Week w={story} /></Card>;
}

// 2. The haggle's price ladder: H's chart over the recorded week's rows, with its key and summary sentence.
function LadderWidget({ widgetApi, widgetId }: AgWidgetParams) {
  useDisplayed(widgetApi);
  const { haggle } = useStudioData();
  const [box, width] = useWidth<HTMLDivElement>();
  const narrow = width > 0 && width < NARROW_PX;
  const upTo = roundsReady(haggle);
  // At a phone's width the set-aside point's label ran past the card's edge ("QuickQuack Deals $20.30: set asid", Round 4
  // judges): there it takes two lines, the seller and price, then "set aside", so no word is cut (dd/system.md §8).
  const data = useMemo(() => {
    const d = ladderData(haggle, upTo);
    return narrow ? { ...d, aside: d.aside.map((a) => ({ ...a, words: a.words.replace(/:\s*set aside$/, ":\nset aside") })) } : d;
  }, [haggle, upTo, narrow]);
  const height = narrow ? 280 : 320;
  // Every new try re-renders this card, and a chart handed new options redraws even when nothing changed. With AG's Enterprise charts
  // on, each of those also warns in the console, once per line. A chart whose data didn't change has no reason to be told again.
  const ladder = useMemo(() => <Ladder data={data} height={height} narrow={narrow} />, [data, height, narrow]);
  return (
    <Card id={widgetId} className="st-ladder">
      <figure className="st-fig" aria-labelledby="st-ladder-q" ref={box}>
        <div className="st-fig-head">
          <h2 id="st-ladder-q">How did the haggle go, round by round?</h2>
          <p>A recorded practice haggle: asks step down, offers step up.</p>
        </div>
        <ul className="st-key" aria-hidden="true">
          <li><span className="st-sw st-sw-goose" />Goose's offers</li>
          {haggle.sellers.map((s) => <li key={s.id}><span className={`st-sw ${s.deal ? "st-sw-deal" : "st-sw-seller"}`} />{s.name} asks</li>)}
          {haggle.deal && <li><span className="st-dot" />The deal</li>}
          {haggle.aside.length > 0 && <li><span className="st-x">×</span>Set aside</li>}
          {haggle.limit && <li><span className="st-sw st-sw-limit" />Your max</li>}
        </ul>
        {/* Not aria-hidden (Round 2's a11y review): AG Charts' canvas is focusable and describes itself; the figure's
            caption below says the same in words. An aria-hidden subtree with a tab stop inside it was axe's serious hit. */}
        <div className="st-canvas" style={{ height }}>
          {haggle.rounds.length > 0 && ladder}
        </div>
        {/* AS-15: every price is on the chart, so its sentence is the text alternative only (visually hidden). */}
        <figcaption className="lx-sr">{upTo > 0 ? ladderSummary(haggle, upTo) : "The recorded haggle draws here as its rows arrive."}</figcaption>
        <HowThisWorks about="the haggle chart"><p>Each seller's ask steps down, Goose's offer steps up, and they meet at the deal. Every number is a row in the ledger.</p></HowThisWorks>
      </figure>
    </Card>
  );
}

// 3. What the Watcher set aside, and why: the ledger's skipped-seller rows, each with the seller's own note quoted as data.
function BlockedWidget({ widgetApi, widgetId }: AgWidgetParams) {
  useDisplayed(widgetApi);
  const { rows } = useStudioData();
  const open = useContext(OpenRowContext);
  const skipped = rows.filter((r) => r.kind === "skipped");
  const noteFor = (skip: LedgerRow) => {
    const target = skip.who.split(" → ")[1];
    return target ? rows.find((r) => r.part === skip.part && r.actor === "seller" && r.who === target && r.quoted && r.seq < skip.seq) : undefined;
  };
  // AS-15 (the DD's first-screen budget, 120 at 1440): the count alone, since each seller below carries its own "demo
  // week" or "this session"; and one reason per seller: the rule that decided it, in the code's own words, or, with no
  // rule, its why (less the "Watcher set <name> aside:" its name already says). Every word is in the row's sheet.
  const count = setAsideCount(skipped.map((r) => r.who.split(" → ")[1] ?? r.who));
  const why = (r: LedgerRow) => { const w = r.why.replace(/^Watcher set .+? aside: /, ""); return w.charAt(0).toUpperCase() + w.slice(1); };
  return (
    <Card id={widgetId} className="st-blocked">
      <section className="st-fig" aria-labelledby="st-blocked-q">
        <div className="st-fig-head">
          <h2 id="st-blocked-q">What did the Watcher set aside, and why?</h2>
          <p>Set aside before the AI ever sees it.</p>
        </div>
        <p className="st-count" data-skipped={skipped.length}>{count}.</p>
        {skipped.length === 0 ? (
          <p className="st-none">Every seller in these rows cleared the Watcher.</p>
        ) : (
          <ol className="st-list">
            {skipped.map((r) => {
              const note = noteFor(r);
              return (
                <li key={r.id}>
                  <button type="button" className="st-row" onClick={() => open(r)}>
                    <span className="st-row-who"><i className="st-row-dot" aria-hidden="true" />{r.who.split(" → ")[1] ?? r.who}<span className="st-row-part">{r.part === "week" ? "demo week" : "this session"}</span></span>
                    {(note?.quoted ?? r.quoted) && <q className="st-row-note">{note?.quoted ?? r.quoted}</q>}
                    {r.rule ? <span className="st-row-rule">{ruleWords(r)}</span> : <span className="st-row-why">{why(r)}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </Card>
  );
}

// 4. Spending against limits: D's widget, unchanged, over the same events and the server's fold.
function SpendWidget({ widgetApi, widgetId }: AgWidgetParams) {
  useDisplayed(widgetApi);
  const { spend } = useStudioData();
  // Before any payment the card is two sentences; studio.css lets it end there (data-empty) instead of filling its frame.
  const empty = spend.categories.length === 0 && (spend.week?.cents ?? 0) === 0;
  return <Card id={widgetId} className="st-spend" data={{ empty: empty ? "1" : "0" }}><SpendLimits s={spend} /></Card>;
}

// 5. What PayPal confirmed (session 6, the PayPal judge's note): first the real runs on PayPal's sandbox from Proof's own
// rows (docs/claims.md's `sandbox-*` rows, the same figures and PayPal ids the Proof panel shows, each a link to its
// proof), then every row PayPal wrote in these ledger rows, the signed webhooks marked (the server checked each
// signature with PayPal). The demo week's one PayPal row is a simulated seed and says so, in the count too (slice 7).
/**
 * A Proof money row's words after its figure. The void run's figure already says what happened (`runFigure`; Round 4
 * data, F9: "$0.00 captured" read as if something had been captured), so "after a void" isn't said again.
 */
const proofWords = (claim: string) => {
  const words = claim.replace(/:.*$/, "").replace(/\.\s*$/, "");
  return /^after a void$/i.test(words.trim()) ? "" : ` ${words}`;
};
const MONEY = proof.groups.find((g) => g.key === "money")?.items ?? [];
function PayPalWidget({ widgetApi, widgetId }: AgWidgetParams) {
  useDisplayed(widgetApi);
  const { rows } = useStudioData();
  const open = useContext(OpenRowContext);
  const paypal = rows.filter((r) => r.actor === "paypal");
  // Slice 7 (Round 2's data review): the seed is named as practice, never counted as a row from PayPal (paypal-words.ts).
  const n = paypalCount(rows);
  const count = paypalCountWords(n);
  return (
    <Card id={widgetId} className="st-paypal">
      <section className="st-fig" aria-labelledby="st-paypal-q">
        <div className="st-fig-head">
          <h2 id="st-paypal-q">What did PayPal confirm?</h2>
          <p>Real sandbox runs, each started by a shopper's tap; Goose only records what PayPal said.</p>
        </div>
        {MONEY.length > 0 && (
          <ol className="st-list st-list-tight st-proof" aria-label="Real sandbox runs, from Proof">
            {MONEY.map((m) => {
              const ids = sandboxIds(m.claim);
              const hooks = webhookEvents(m.claim);
              return (
                <li key={m.id}>
                  <a className="st-row st-row-line st-proof-row" href={appHref(`?desk=proof#${m.anchor}`)}>
                    <span className="st-row-did"><b className="st-proof-fig">{runFigure(m)}</b>{proofWords(m.claim)}</span>
                    <span className="st-row-part">{ids.date ?? hooks.run ?? ""}{ids.capture || ids.authorization ? ` · ${ids.capture ? "capture" : "authorization"} ${(ids.capture ?? ids.authorization)!.slice(-6)}` : hooks.events.length ? ` · ${hooks.events.length} signed` : ""} · Proof ›</span>
                  </a>
                </li>
              );
            })}
          </ol>
        )}
        <p className="st-count" data-paypal={n.real} data-signed={n.signed} data-seed={n.seed}>{count}</p>
        {paypal.length > 0 && (
          <ol className="st-list st-list-tight">
            {paypal.map((r) => (
              <li key={r.id}>
                <button type="button" className="st-row st-row-line" onClick={() => open(r)}>
                  <span className="st-row-did">{didWords(r)}</span>
                  <Amount r={r} />
                  <PayPalMark r={r} />
                  <span className="st-row-part">{r.part === "week" ? "demo week" : r.sourceWords ?? "this session"}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </Card>
  );
}

// 6. Every row: L's AG Grid ledger table, unchanged, inside the dashboard (as Joshua asked); in a narrow card, L's
// phone cards instead, as the ledger page does. The side sheet is the page's.
function EveryRowWidget({ widgetApi, widgetId }: AgWidgetParams) {
  useDisplayed(widgetApi);
  const { rows, hasSession } = useStudioData();
  const open = useContext(OpenRowContext);
  const [box, width] = useWidth<HTMLDivElement>();
  const narrow = width > 0 && width < NARROW_PX;
  const fresh = useMemo(() => new Set<string>(), []);
  // Find, and the visits someone closed. Everything is open to start with: nothing here is hidden until someone asks.
  const [words, setWords] = useState("");
  const [rule, setRule] = useState<string | null>(null);
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());
  const rules = useMemo(() => rulesOf(rows), [rows]);
  const found = useMemo(() => findRows(rows, words, rule), [rows, words, rule]);
  const finding = rule !== null || words.trim() !== "";
  const list = useMemo(() => auditList(rows, closed, words, rule), [rows, closed, words, rule]);
  const onOpen = useCallback((r: LedgerRow) => {
    if (!isVisitHead(r)) { open(r); return; }
    if (finding) return; // Under a Find every visit stays open: what's found is all on show.
    const k = r.visit.key;
    setClosed((c) => { const n = new Set(c); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }, [open, finding]);
  return (
    <Card id={widgetId} className="st-every">
      <div className="st-fig-head" ref={box}>
        <h2 id="st-every-q">Every row, as Goose's code wrote it</h2>
        <p>{rows.length} rows. {narrow ? "Tap a row" : <>Click a row<span className="lx-sr">, or press Enter on it,</span></>} for its full story. <span data-append-only>{APPEND_ONLY}</span></p>
      </div>
      <div className="st-find" role="search">
        <input type="search" aria-label={FIND_ROWS} placeholder={FIND_ROWS} value={words} maxLength={120} autoComplete="off" onChange={(e) => setWords(e.target.value)} />
        <select aria-label={FIND_RULE} value={rule ?? ""} onChange={(e) => setRule(e.target.value || null)}>
          <option value="">{FIND_RULE}</option>
          {rules.map((r) => <option key={r.rule} value={r.rule}>{r.words} ({r.count})</option>)}
        </select>
        <p aria-live="polite" data-found={finding ? found.length : ""}>{finding ? findWordsOf(found.length, rows.length) : ""}</p>
      </div>
      {narrow ? (
        <div className="st-cards">
          <Cards session={found.filter((r) => r.part === "session")} week={found.filter((r) => r.part === "week")} fresh={fresh} totals={null} onOpen={open} />
        </div>
      ) : (
        <div className="lx-grid st-grid">
          {/* Not measured yet is neither wide nor narrow: on a phone, taking it for wide starts a grid's chunk for a card that reads as a list. */}
          {width === 0 ? null : <LedgerTable
            rows={list}
            timed={hasSession}
            onOpen={onOpen}
            labelledBy="st-every-q"
            isFullWidthRow={fullWidthHead}
            fullWidthCellRenderer={VisitHeadRow}
            getRowHeight={headHeight}
          />}
        </div>
      )}
    </Card>
  );
}

/** A visit's head: its name, its count, its PayPal rows. A row of the table's own, so arrows and Enter reach it like any other. */
function VisitHeadRow({ data }: { data?: LedgerRow }) {
  if (!isVisitHead(data)) return null;
  const v = data.visit;
  return (
    <div className="st-visit" role="gridcell" data-visit={v.key} data-open={v.open ? "1" : "0"}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d={v.open ? "M4 6l4 4 4-4" : "M6 4l4 4-4 4"} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <b>{v.words}</b>
      <span>{v.shown} {v.shown === 1 ? "row" : "rows"}{v.paypal > 0 ? ` · ${v.paypal} from PayPal` : ""}</span>
    </div>
  );
}
const fullWidthHead = (p: { rowNode: { data?: LedgerRow | undefined } }) => isVisitHead(p.rowNode.data);
const headHeight = (p: { data?: LedgerRow | undefined }) => (isVisitHead(p.data) ? 44 : undefined);

/**
 * The icon Studio's Compose panel shows for a Goose widget (session 5; slice 2's follow-up): one line drawing each, in
 * `currentColor` so it takes the panel's ink from the theme, never a colour of its own (dd/system.md: blue and teal
 * appear nowhere; gold is protection and the deal only).
 */
const icon = (paths: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICONS = {
  week: icon('<path d="M3 17h5v-4h5V9h5V5h3"/>'),
  blocked: icon('<circle cx="12" cy="12" r="8"/><path d="M6.5 6.5l11 11"/>'),
  ladder: icon('<path d="M8 3v18M16 3v18M8 8h8M8 13h8M8 18h8"/>'),
  spend: icon('<rect x="5" y="10" width="14" height="9" rx="1"/><path d="M3 6h3M9 6h6M18 6h3"/>'),
  paypal: icon('<circle cx="12" cy="12" r="8"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>'),
  every: icon('<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 10h18M9 10v9M15 10v9"/>'),
};

const widget = (id: string, label: string, comp: (p: AgWidgetParams) => ReactNode, icon: string, defaultSize: { width: number; height: number }, minSize: { width: number; height: number }, description: string): AgWidgetDefinition<never> => ({
  id, label, comp, icon, defaultSize, minSize,
  form: (p: { createDefaults: (x: object) => unknown }) => p.createDefaults({}),
  ai: { description },
} as unknown as AgWidgetDefinition<never>);

/** The registry: ids a saved view refers to, so they never change. */
export const gooseWidgets = [
  widget("goose-week", "The week's story", WeekWidget, ICONS.week, { width: 14, height: 36 }, { width: 8, height: 24 }, "Where the ticket's price went over the recorded demo week: each fictional seller's total by day, the limit dashed, the deal Goose brings marked in gold, the set-aside scam crossed."),
  widget("goose-blocked", "Set aside by the Watcher", BlockedWidget, ICONS.blocked, { width: 10, height: 30 }, { width: 6, height: 16 }, "Every seller the Watcher set aside in the ledger rows, with the seller's own note quoted as data and the rule that decided it."),
  widget("goose-ladder", "The haggle's price ladder", LadderWidget, ICONS.ladder, { width: 14, height: 36 }, { width: 8, height: 22 }, "The recorded haggle round by round: each seller's ask stepping down, Goose's offer stepping up, the deal as one gold point, the max dashed."),
  widget("goose-spend", "Spending against limits", SpendWidget, ICONS.spend, { width: 10, height: 21 }, { width: 6, height: 12 }, "Each paid cart against its category's per-cart limit, and this week's total against the weekly limit, on one dollar scale."),
  widget("goose-paypal", "What PayPal confirmed", PayPalWidget, ICONS.paypal, { width: 10, height: 20 }, { width: 6, height: 10 }, "Every ledger row PayPal wrote in the sandbox (orders, holds, captures, refunds, webhooks), the webhooks PayPal signed marked."),
  widget("goose-every", "Every row (the ledger table)", EveryRowWidget, ICONS.every, { width: 24, height: 40 }, { width: 12, height: 20 }, "The whole ledger as an AG Grid table: time, who, what, did, amount, why and where each row came from."),
];

/** The id of the widget of `type` on the selected page, or null: an ask for a view already on the page shows it instead of adding a copy. */
export function widgetOfType(state: AgReportState, type: string): string | null {
  const page = state.pages.find((p) => p.id === state.selectedPageId) ?? state.pages[0];
  for (const [id, w] of Object.entries(page?.widgets ?? {})) if ((w as { type?: string } | undefined)?.type === type) return id;
  return null;
}

export const WIDGET_MENU = { label: "Goose", widgetIds: gooseWidgets.map((w) => w.id) };

const typed = (type: string) => ({ type }) as never;

/** Studio's canvas track height (theme.ts keeps Studio's 16 px), so the page can size the canvas to its widgets. */
export { TRACK_PX } from "../layout.ts";
export function initialView(phone: boolean, hasSession = false, source: Source = "demo"): AgReportState {
  const widgets = { week: typed("goose-week"), blocked: typed("goose-blocked"), ladder: typed("goose-ladder"), spend: typed("goose-spend"), paypal: typed("goose-paypal"), every: typed("goose-every"), ...THREAT_WIDGETS, ...threatPivots(source, phone) } as never;
  // The geometry lives in layout.ts (slice 9), so the shell drawn before this chunk arrives frames the same places.
  // And the board's frames open where the shell fitted them, so nothing moves when the dashboard takes its place.
  const placed = withThreat(layoutFor(phone, hasSession), phone);
  const widgetLayout = (shellFit.need && (phone ? fitColumn(placed, shellFit.need) : fitRows(placed, shellFit.need, 1))) || placed;
  return {
    selectedPageId: "behind",
    // View mode: the filters strip starts closed (on a phone it would cover the dashboard). Edit mode opens AG's Compose,
    // Data and Filters panels; collapsing two of them from this state has no effect in 3.0.0 (a follow-up in 044).
    panels: { filters: { collapsed: true }, data: { collapsed: true } },
    pages: [{ id: "behind", widgets, widgetLayout }],
  } as AgReportState;
}

/** How many tracks tall a page's layout is: the canvas needs at least that, so the page scrolls, not the canvas. */
export function tracksOf(state: AgReportState): number {
  return tracksIn(state.pages?.[0]?.widgetLayout ?? {});
}
