// The back room's charts (Joshua, Fri Oct 30): the session's bars and the week's steps, drawn through the shared Goose
// chart (web/src/charts/Chart.tsx: AG Charts Community, the shared theme, its own lazy chunk, loaded only by Behind the
// scenes). Every number arrives from core's `ledgerCharts` and `weekStory`; this file only says how each is drawn, in
// the palette's tokens. No gradients, no glow, no animation, no tooltips: each bar and each marked day carries its own
// number, and the figure's sentence below it is the text alternative.

import type { ReactNode } from "react";
import type { AgCartesianChartOptions, AgCartesianSeriesOptions, AgChartOptions } from "ag-charts-community";
import Chart from "../charts/Chart.tsx";
import { chartText, type ChartPalette } from "../charts/theme.ts";
import { weekAxis } from "../charts/axis.ts";
import { usdOf } from "@goose/core/money";

export type Tone = "ink" | "ink-2" | "ink-3" | "gold" | "mark";
export type Place = "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
/** A marked day on a week line: its words drawn at the point, and a dot when `dot`. */
/** `spacing`: px between the point and its words (8 when left out); more lifts the words clear of a gridline above. */
export interface WeekMark { day: number; words: string; tone: Tone; dot: boolean; place: Place; spacing?: number }
export type Spec =
  // `max`: a scale shared with a neighbouring chart of the same unit, so a count of 1 is the same length in both.
  | { kind: "bars"; bars: { label: string; value: number; words: string; tone: Tone }[]; max?: number }
  // Parts of one whole: `center` is the whole, said in the hole with `words` under it.
  | { kind: "donut"; parts: { label: string; value: number; tone: Tone }[]; center: string; words: string }
  | { kind: "stacked"; rows: { label: string; refused: number; held: number }[]; max?: number }
  | { kind: "week"; narrow: boolean; days: string[]; limit: { dollars: number; words: string }; lines: { id: string; name: string; dollars: (number | null)[]; tone: Tone; width: number; dash: boolean; shape: "circle" | "cross"; marks: WeekMark[] }[] };

/** A tone's colour in the palette in force (theme.ts reads it from the page's tokens). */
const tone = (p: ChartPalette, t: Tone): string => (t === "ink-2" ? p.ink2 : t === "ink-3" ? p.ink3 : p[t]);

type Row = { day: string; v: number | null };

/** The week: one step line per seller (a price holds until the day it changes), the limit as a dashed gold line. */
function week(spec: Extract<Spec, { kind: "week" }>, t: ChartPalette): AgCartesianChartOptions {
  const all = spec.lines.flatMap((l) => l.dollars.filter((d): d is number => d !== null)).concat(spec.limit.dollars);
  // The value axis frames the week's own range (charts/axis.ts; Week.tsx says in words when it doesn't start at $0).
  // Both ends sit on the $20 step, so the top tick is the same at every width (the Design Director saw $120 at 1440 and
  // $130 at 390 when the top wasn't on a step).
  const { lo, hi, step: STEP } = weekAxis(all);
  // The lines carry no labels of their own; each marked day is a one-point series drawn on top, so each mark gets its own
  // placement and colour (a line series has one label placement for all its points).
  const lines: AgCartesianSeriesOptions[] = spec.lines.map((l) => ({
    type: "line", showInLegend: false, id: l.id, data: spec.days.map((day, i): Row => ({ day, v: l.dollars[i] ?? null })), xKey: "day", yKey: "v", yName: l.name,
    interpolation: { type: "step", position: "end" }, marker: { enabled: false }, label: { enabled: false },
    stroke: tone(t, l.tone), strokeWidth: l.width, lineDash: l.dash ? [5, 4] : [], highlight: { enabled: false },
  }) as AgCartesianSeriesOptions);
  const marks: AgCartesianSeriesOptions[] = spec.lines.flatMap((l) => l.marks.map((m, k) => ({
    type: "line", showInLegend: false, yName: `${l.name} ${m.words}`, id: `${l.id}-mark-${k}`, data: spec.days.map((day, i): Row => ({ day, v: i === m.day ? l.dollars[i] ?? null : null })), xKey: "day", yKey: "v",
    strokeWidth: 0, highlight: { enabled: false },
    marker: m.dot
      // The deal's gold dot sits a few dollars under the gold dashed limit, so a wider ring in the page's colour keeps the
      // two golds apart (Track L's nit).
      ? { enabled: true, shape: l.shape, size: l.shape === "cross" ? 14 : 12, fill: tone(t, m.tone), stroke: t.page, strokeWidth: l.shape === "cross" ? 0 : 3 }
      : { enabled: false },
    label: { enabled: true, placement: m.place, spacing: m.spacing ?? 8, fontFamily: t.face, fontSize: 13, fontWeight: 500, color: tone(t, m.tone), formatter: () => m.words },
  }) as AgCartesianSeriesOptions));
  const series = [...lines, ...marks];
  const text = chartText(t, spec.narrow);
  return {
    background: { visible: false }, padding: { top: 12, right: 16, bottom: 4, left: 0 }, tooltip: { enabled: false },
    legend: { enabled: false },
    axes: {
      x: { type: "category", position: "bottom", line: { enabled: false }, gridLine: { enabled: false }, label: { ...text, rotation: 0, avoidCollisions: false, ...(spec.narrow ? { formatter: ({ value }: { value: string }) => (value === spec.days[0] ? value : value.replace("Day ", "")) } : {}) }, paddingInner: 0, paddingOuter: 0.1 },
      y: {
        type: "number", position: "left", min: lo, max: hi, nice: false, interval: { step: STEP }, line: { enabled: false },
        gridLine: { enabled: true, style: [{ stroke: t.edge, lineDash: [] }] },
        label: { ...text, formatter: ({ value }) => `${usdOf(value)}` },
        crossLines: [{
          type: "line", value: spec.limit.dollars, stroke: t.gold, strokeWidth: 1.5, lineDash: [6, 5],
          label: { enabled: true, text: spec.limit.words, position: "inside-bottom-left", fontFamily: t.face, fontSize: 13, fontWeight: 500, color: t.gold, padding: 6 },
        }],
      },
    },
    series,
  } as AgCartesianChartOptions;
}

/** Parts of one whole. Red stays an outline, as on the bars: a set-aside slice is a red ring around nothing. */
function donut(spec: Extract<Spec, { kind: "donut" }>, t: ChartPalette): AgChartOptions {
  const parts = spec.parts.filter((x) => x.value > 0);
  const text = chartText(t);
  return {
    background: { visible: false }, padding: { top: 0, right: 8, bottom: 0, left: 0 }, tooltip: { enabled: false },
    legend: { enabled: true, position: "right", item: { label: { ...text, fontSize: 13, formatter: ({ value, itemId }: { value: string; itemId: number }) => `${value}: ${parts[itemId]?.value ?? ""}` }, marker: { size: 8, shape: "square" } }, toggleSeries: false },
    data: parts,
    series: [{
      type: "donut", angleKey: "value", legendItemKey: "label", innerRadiusRatio: 0.7, cornerRadius: 2, calloutLabel: { enabled: false }, sectorLabel: { enabled: false }, highlight: { enabled: false },
      innerLabels: [{ text: spec.center, fontFamily: t.face, fontSize: 22, fontWeight: 500, color: t.ink }, { text: spec.words, fontFamily: t.face, fontSize: 13, color: t.ink2, spacing: 2 }],
      // Set aside is an outline, as on the week's chart; said per slice so the legend draws the same mark (a styled slice's legend mark is blank).
      fills: parts.map((x) => (x.tone === "mark" ? "rgba(0, 0, 0, 0)" : tone(t, x.tone))), strokes: parts.map((x) => (x.tone === "mark" ? t.mark : t.page)), strokeWidth: 1.5,
    }],
  } as AgChartOptions;
}

function options(spec: Spec, t: ChartPalette): AgChartOptions {
  if (spec.kind === "week") return week(spec, t);
  if (spec.kind === "donut") return donut(spec, t);
  // Category labels sit left-aligned in their column, so a label that runs to two lines reads like text, not a ragged
  // right edge (Desk-B-4's audit).
  const text = chartText(t);
  // The value axis is never drawn: each bar says its own number. `max` leaves room past the longest bar for it.
  const axes = (max: number): NonNullable<AgCartesianChartOptions["axes"]> => ({
    x: { type: "category", position: "left", line: { enabled: false }, gridLine: { enabled: false }, label: { ...text, textAlign: "left" }, paddingInner: 0.36, paddingOuter: 0.12 },
    y: { type: "number", position: "bottom", line: { enabled: false }, gridLine: { enabled: false }, label: { enabled: false }, nice: false, min: 0, max },
  });
  const base: AgCartesianChartOptions = { background: { visible: false }, padding: { top: 4, right: 8, bottom: 4, left: 0 }, tooltip: { enabled: false } };
  if (spec.kind === "bars") {
    const max = spec.max ?? Math.max(1, ...spec.bars.map((b) => b.value));
    return {
      ...base,
      axes: axes(max * 1.32),
      legend: { enabled: false },
      data: spec.bars,
      series: [{
        type: "bar", direction: "horizontal", xKey: "label", yKey: "value", cornerRadius: 4, strokeWidth: 0,
        // Red is never a fill (the design system): a set-aside bar is a red outline; ink tones fill.
        itemStyler: ({ datum }) => {
          const k = (datum as { tone: Tone }).tone;
          return k === "mark" ? { fill: t.mark, fillOpacity: 0, stroke: t.mark, strokeWidth: 1.5 } : { fill: tone(t, k) };
        },
        label: { enabled: true, placement: "outside-end", fontFamily: t.face, fontSize: 14, fontWeight: 500, color: t.ink, formatter: ({ datum }) => (datum as { words: string }).words },
        highlight: { enabled: false },
      }],
    };
  }
  const max = spec.max ?? Math.max(1, ...spec.rows.map((r) => r.refused + r.held));
  // A key entry only for a part the chart draws: no "Held" swatch over bars with nothing held.
  const drawn = { refused: spec.rows.some((r) => r.refused > 0), held: spec.rows.some((r) => r.held > 0) };
  // Set aside is the scam's red, as on the week's chart; held is the second ink. Gold stays for the limit and the deal.
  return {
    ...base,
    axes: axes(max * 1.32),
    legend: { enabled: true, position: "bottom", item: { label: { ...text, fontSize: 13 }, marker: { size: 8, shape: "square" } }, toggleSeries: false },
    data: spec.rows,
    series: [
      { type: "bar", direction: "horizontal", xKey: "label", yKey: "refused", yName: "Set aside", showInLegend: drawn.refused, stacked: true, fill: t.mark, fillOpacity: 0, stroke: t.mark, strokeWidth: 1.5, cornerRadius: 3, highlight: { enabled: false },
        label: { enabled: true, placement: "inside-center", fontFamily: t.face, fontSize: 13, fontWeight: 500, color: t.ink, formatter: ({ value }) => (value ? String(value) : "") } },
      { type: "bar", direction: "horizontal", xKey: "label", yKey: "held", yName: "Held for your yes", showInLegend: drawn.held, stacked: true, fill: t.ink2, strokeWidth: 0, cornerRadius: 3, highlight: { enabled: false },
        label: { enabled: true, placement: "inside-center", fontFamily: t.face, fontSize: 13, fontWeight: 500, color: t.page, formatter: ({ value }) => (value ? String(value) : "") } },
    ],
  };
}

export default function Bars({ spec, height, waiting }: { spec: Spec; height: number; waiting?: ReactNode }) {
  return <Chart build={(p) => options(spec, p)} height={height} narrow={spec.kind === "week" && spec.narrow} waiting={waiting} />;
}
