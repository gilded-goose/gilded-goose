// Three questions a judge asks, each answered from the session's own rows (Joshua, Fri Oct 30: "fewer, better charts").
// The numbers come from core's `ledgerCharts`, the same rows as the grid and its totals row; the bars are a lazy chunk of
// their own (AG Charts Community), so the figure, its question and its sentence render first and never shift. The
// sentence under each chart is its text alternative: the canvas itself is hidden from screen readers.
//
// Track D (Lead-9, Fri 3:25 PM): each chart is also its own self-contained component (`MoneyChart`, `SellersChart`,
// `ChecksChart`; plus `SpendLimits` in web/src/charts), data in as props and sized by its box, so an AG Studio widget can
// wrap any one unchanged. `Charts` lays them out for Behind the scenes.
//
// AS-15 (Joshua, Sat 3:30 AM: "show, don't explain"): each bar carries its own number, so a chart's sentence is its text
// alternative only (visually hidden, read in full by a screen reader); the notes that explain how a bar is counted sit
// under one "How these are counted" for the section. A chart with nothing to draw is not drawn: money and limits that
// haven't moved are one line ("Only your tap in PayPal pays…"), never an empty card.

import { Suspense } from "react";
import { lazyOr } from "../states/online.ts";
import { HowThisWorks } from "./How.tsx";
import type { LedgerCharts } from "@goose/core/session";
import type { Spec } from "./Bars.tsx";
import { SpendLimits } from "../charts/SpendLimits.tsx";
import type { SpendLimitsData } from "../charts/spend.ts";

const Bars = lazyOr(() => import("./Bars.tsx"));

function Figure({ id, question, summary, spec, height, empty, note }: { id: string; question: string; summary: string; spec: Spec; height: number; empty: boolean; note?: string | undefined }) {
  return (
    <figure className={`lx-chart${empty ? " lx-chart-empty" : ""}`} aria-labelledby={`${id}-q`}>
      <h3 id={`${id}-q`}>{question}</h3>
      {/* ag-disabled: inside an AG Studio card, Enter and the card's Tab wrap focus AG's first focusable, and AG's rule skips
          only [disabled], .ag-disabled and .ag-hidden, not inert. Without it AG picks the chart's inert proxy, the browser refuses,
          and the card can't be entered (Round 6). The class styles nothing here: AG's .ag-disabled rules reach only its own icons and fields. */}
      {!empty && (
        <div className="lx-chart-canvas ag-disabled" style={{ height }} aria-hidden="true" inert>
          <Suspense fallback={null}><Bars spec={spec} height={height} /></Suspense>
        </div>
      )}
      <figcaption className={empty ? undefined : "lx-sr"}>{summary}{note ? ` ${note}` : ""}</figcaption>
    </figure>
  );
}

const shown = (c: LedgerCharts) => c.rules.slice(0, 5);

const MONEY_NOTE = "The opening asks count only what you paid for.";
const OVERLAP_NOTE = "One seller can trip more than one check, so these add up to more than the sellers held or set aside.";

/** The checks' bars' scale. */
export const countScale = (c: LedgerCharts): number => Math.max(1, ...shown(c).map((r) => r.refused + r.held));

// Colours mean one thing on the whole page: set aside is the scam's red (as on the week's chart), held is the second
// ink, neutral totals the quietest; gold stays for the limit and the deal Goose brings.

export function MoneyChart({ c }: { c: LedgerCharts }) {
  return (
    <Figure
      id="lx-money" question="Where did your money go?" summary={c.summary.money} note={MONEY_NOTE} height={152} empty={!c.money.some((m) => m.cents > 0)}
      // Decided by default (Track D): "(practice)" on the paid bar's own label made AG Charts drop the other labels at
      // 390 px, so "practice" lives in the section's line above all the charts instead.
      spec={{ kind: "bars", bars: c.money.map((m) => ({ label: m.label, value: m.dollars, words: m.words, tone: m.key === "paid" ? "ink" : m.key === "kept" ? "ink-2" : "ink-3" })) }}
    />
  );
}

export function SellersChart({ c }: { c: LedgerCharts }) {
  // Every seller checked ended one of three ways, so this is parts of a whole: a donut with the whole in its hole (item 3,
  // Joshua's Nov 4 AG Grid message: where they read better than bars). "Checked" is the whole, not a fourth group.
  const count = (k: string) => c.sellers.find((s) => s.key === k)?.count ?? 0;
  const label = (k: string) => c.sellers.find((s) => s.key === k)?.label ?? k;
  const cleared = Math.max(0, count("checked") - count("held") - count("skipped"));
  const note = cleared > 0 ? `The other ${cleared} cleared.` : undefined;
  return (
    <Figure
      id="lx-sellers" question="How did Goose treat the sellers it checked?" summary={c.summary.sellers} note={note} height={152} empty={!c.sellers.some((s) => s.count > 0)}
      spec={{ kind: "donut", center: String(count("checked")), words: "checked", parts: [{ label: "Cleared", value: cleared, tone: "ink-3" }, { label: label("held"), value: count("held"), tone: "ink-2" }, { label: label("skipped"), value: count("skipped"), tone: "mark" }] }}
    />
  );
}

export function ChecksChart({ c, max = countScale(c) }: { c: LedgerCharts; max?: number }) {
  const rules = shown(c);
  // One seller can trip several checks, so the checks' bars can add up to more than the sellers held or set aside; the
  // caption says so whenever they do, so nobody reads two bars as two sellers.
  const flagged = c.sellers.filter((s) => s.key !== "checked").reduce((t, s) => t + s.count, 0);
  const fired = c.rules.reduce((t, r) => t + r.refused + r.held, 0);
  const overlap = fired > flagged ? OVERLAP_NOTE : undefined;
  return (
    <Figure
      id="lx-rules" question="Which of Goose's checks fired?" summary={c.summary.rules} note={overlap} height={Math.max(152, 40 + rules.length * 36)} empty={rules.length === 0}
      spec={{ kind: "stacked", max, rows: rules.map((r) => ({ label: r.label, refused: r.refused, held: r.held })) }}
    />
  );
}

/** `spend`: `spendLimits(events)` (web/src/charts/spend.ts); when passed, spending against limits draws under the three. */
export function Charts({ c, spend }: { c: LedgerCharts; spend?: SpendLimitsData }) {
  const moved = c.money.some((m) => m.cents > 0);
  const checked = c.sellers.some((s) => s.count > 0);
  const limits = !!spend && (spend.categories.length > 0 || (spend.week?.cents ?? 0) > 0);
  // Track D: an empty session never shows three empty charts (Joshua: "never a wall of zeros"); the week's story above
  // carries the page until the first run, and this one line says what will appear.
  if (!moved && !checked && shown(c).length === 0) {
    return (
      <section className="lx-charts lx-charts-none" aria-labelledby="lx-charts-h">
        <h2 className="lx-sec-h" id="lx-charts-h">This session, charted</h2>
        <p className="lx-sec-sub">Your first ask charts here: every seller Goose checks and each check that fires.</p>
      </section>
    );
  }
  const max = countScale(c);
  const flagged = c.sellers.filter((s) => s.key !== "checked").reduce((t, s) => t + s.count, 0);
  const overlap = c.rules.reduce((t, r) => t + r.refused + r.held, 0) > flagged;
  return (
    <section className={`lx-charts${moved ? "" : " lx-charts-two"}`} aria-labelledby="lx-charts-h">
      <h2 className="lx-sec-h" id="lx-charts-h">This session, charted</h2>
      {/* AS-15: nothing paid is one line with the one fact that matters, not an empty money card and an empty limits card. */}
      <p className="lx-sec-sub">{moved ? "From your session's own rows." : "Only your tap in PayPal pays; once it does, it charts here."}</p>
      {moved && <MoneyChart c={c} />}
      <SellersChart c={c} />
      <ChecksChart c={c} max={max} />
      {spend && limits && <SpendLimits s={spend} />}
      <div className="lx-charts-how">
        <HowThisWorks label="How these are counted">
          <p>Every chart is counted from your session's own rows, the same ones as the ledger and its totals. {MONEY_NOTE}{overlap ? ` ${OVERLAP_NOTE}` : ""}</p>
        </HowThisWorks>
      </div>
    </section>
  );
}
