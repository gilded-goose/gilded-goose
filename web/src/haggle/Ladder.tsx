// The haggle's price ladder (Track H; Joshua, Fri 2:30 PM): AG Charts Community (MIT, Community modules only), its own
// lazy chunk, loaded only by "The haggle" (`?desk=haggle`), never by the first screen. Every number arrives from core's
// `ladderData` (the run's rows); this file only draws it in the Midnight tokens. Rounds on x, price on y: each seller's
// ask steps down (the seller Goose bought from solid, any other dotted), Goose's offer steps up, and they meet at the deal (the one gold point). The max is the dashed gold line;
// a seller the Watcher set aside is one crossed point. No tooltips: the conversation beside it and the figure's sentence
// carry every number, and the canvas is hidden from screen readers.

import { AgCharts } from "ag-charts-react";
import {
  CartesianChartModule, CategoryAxisModule, CrossLinesModule, LineSeriesModule, ModuleRegistry, NumberAxisModule,
  type AgCartesianChartOptions, type AgCartesianSeriesOptions,
} from "ag-charts-community";
import type { LadderData } from "@goose/core/haggle";
import { usdOf } from "@goose/core/money";

ModuleRegistry.registerModules([CartesianChartModule, LineSeriesModule, CategoryAxisModule, NumberAxisModule, CrossLinesModule]);

/** The Midnight tokens, read from the page's own CSS so a token changes in one place (a canvas can't read var()). */
function tokens() {
  const css = getComputedStyle(document.documentElement);
  const v = (n: string) => css.getPropertyValue(n).trim();
  return { ink: v("--lx-ink"), ink2: v("--lx-ink-2"), ink3: v("--lx-ink-3"), gold: v("--lx-gold"), mark: v("--lx-mark"), page: v("--lx-page"), edge: v("--lx-edge"), face: v("--lx-face") || "system-ui, sans-serif" };
}

/** The line colour of each part, by role: the deal's seller brightest of the sellers, Goose the brightest of all. */
export const ROLE = { goose: "ink", deal: "ink2", seller: "ink3" } as const;

type Row = { round: string; v: number | null };

function options(d: LadderData, narrow: boolean): AgCartesianChartOptions {
  const t = tokens();
  const cats = d.axis.map(String);
  const at = (pts: { round: number; dollars: number }[]): Row[] => cats.map((c) => ({ round: c, v: pts.find((p) => String(p.round) === c)?.dollars ?? null }));
  const text = { fontFamily: t.face, fontSize: 13, color: t.ink2 };
  const line = (id: string, name: string, pts: { round: number; dollars: number }[], stroke: string, width: number, size: number, dash: number[] = []): AgCartesianSeriesOptions => ({
    type: "line", id, yName: name, showInLegend: false, data: at(pts), xKey: "round", yKey: "v", connectMissingData: false,
    interpolation: { type: "step", position: "end" },
    stroke, strokeWidth: width, lineDash: dash, highlight: { enabled: false }, label: { enabled: false },
    marker: { enabled: true, shape: "circle", size, fill: stroke, stroke: t.page, strokeWidth: 2 },
  }) as AgCartesianSeriesOptions;
  const point = (id: string, name: string, p: { round: number; dollars: number; words: string }, shape: "circle" | "cross", fill: string, size: number, place: "top" | "bottom" | "right" | "left"): AgCartesianSeriesOptions => ({
    type: "line", id, yName: name, showInLegend: false, data: at([p]), xKey: "round", yKey: "v", strokeWidth: 0, highlight: { enabled: false },
    marker: { enabled: true, shape, size, fill, stroke: shape === "cross" ? fill : t.page, strokeWidth: shape === "cross" ? 0 : 2 },
    label: { enabled: true, placement: place, spacing: 10, fontFamily: t.face, fontSize: 13, fontWeight: 560, color: fill, formatter: () => p.words },
  }) as AgCartesianSeriesOptions;

  const series: AgCartesianSeriesOptions[] = [
    ...d.sellers.map((s) => line(`seller-${s.id}`, `${s.name} asks`, s.points, s.deal ? t[ROLE.deal] : t[ROLE.seller], s.deal ? 2 : 1.5, s.deal ? 9 : 7, s.deal ? [] : [2, 4])),
    line("goose", "Goose's offers", d.goose, t[ROLE.goose], 2.5, 9),
    ...d.aside.map((a, i) => point(`aside-${i}`, a.words, a, "cross", t.mark, 14, "right")),
    ...(d.deal ? [point("deal", d.deal.words, d.deal, "circle", t.gold, 16, "bottom")] : []),
  ];
  return {
    background: { visible: false }, padding: { top: 16, right: narrow ? 8 : 24, bottom: 4, left: 0 }, tooltip: { enabled: false }, legend: { enabled: false },
    axes: {
      x: { type: "category", position: "bottom", line: { enabled: false }, gridLine: { enabled: false }, label: { ...text, formatter: ({ value }: { value: string }) => `Round ${value}` }, title: { enabled: false }, paddingInner: 0, paddingOuter: 0.3 },
      y: {
        type: "number", position: "left", min: d.range.lo, max: d.range.hi, nice: false, interval: { step: 10 }, line: { enabled: false },
        gridLine: { enabled: true, style: [{ stroke: t.edge, lineDash: [] }] },
        label: { ...text, formatter: ({ value }: { value: number }) => `${usdOf(value)}` },
        crossLines: d.limit ? [{
          type: "line", value: d.limit.dollars, stroke: t.gold, strokeWidth: 1.5, lineDash: [6, 5],
          label: { enabled: true, text: d.limit.words, position: "inside-top-left", fontFamily: t.face, fontSize: 13, fontWeight: 560, color: t.gold, padding: 6 },
        }] : [],
      },
    },
    series,
  } as AgCartesianChartOptions;
}

export default function Ladder({ data, height, narrow }: { data: LadderData; height: number; narrow: boolean }) {
  return <AgCharts options={{ ...options(data, narrow), height }} style={{ height }} />;
}
