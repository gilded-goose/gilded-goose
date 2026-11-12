// The one look every Goose chart shares (Track D, Fri Oct 30; Joshua's mandate, category 8: "every chart answers one
// question at a glance, honestly scaled and labeled"). Midnight on the back room, Velvet on the Desk, the same rules:
// the egg's gold is the one highlight, the scam's red is only ever a small marker, everything else is ink at three
// strengths. Quiet axes (no axis lines, faint gridlines on the value axis only), no tooltips, no legend toggles, no
// animation: a chart that moved on every streamed row would be motion with no meaning, and reduced motion is then met by
// construction.
//
// A canvas can't read CSS variables, so `chartPalette` reads them from the page once, at draw time: the colours stay in
// the token files (web/src/desk/tokens.css, web/src/ledger/midnight.css), never copied here. A page that has both a
// light and a dark palette gets the right one because the tokens it reads are the ones in force on that element.
// Canvas text can't take tabular figures (no font-variant-numeric on a 2D context), so the numbers a reader compares sit
// in HTML beside the chart (the facts, the sentence, the table), where the tokens' tabular-nums apply.
//
// The haggle's price ladder (Track H) can adopt this as is: `gooseTheme(chartPalette(el))` as the chart's `theme`, and
// `ink`/`gold`/`mark` for its series.

import type { AgChartTheme } from "ag-charts-community";

export interface ChartPalette {
  /** The strongest ink: the line or bar the question is about. */
  ink: string;
  /** Secondary ink: labels, the quieter line. */
  ink2: string;
  /** The quietest ink that still passes AA on the card: axis labels, other sellers. */
  ink3: string;
  /** The egg's gold: the one highlight (the deal Goose brings, the limit, what protected you). */
  gold: string;
  /** The scam's marker: a small red, never a fill area. */
  mark: string;
  /** The surface the chart sits on, for marker rims and text drawn over a fill. */
  page: string;
  /** Gridlines and hairlines. */
  edge: string;
  /** The body face. */
  face: string;
}

/** The two token sets the charts can sit on: Midnight (`--lx-*`, the back room) and the Desk's palettes (`--ink`, …). */
const MIDNIGHT = { ink: "--lx-ink", ink2: "--lx-ink-2", ink3: "--lx-ink-3", gold: "--lx-gold", mark: "--lx-mark", page: "--lx-raised", edge: "--lx-edge", face: "--lx-face" } as const;
const DESK = { ink: "--ink", ink2: "--ink-2", ink3: "--ink-3", gold: "--gold", mark: "--red", page: "--card-flat", edge: "--line", face: "--face" } as const;
const FALLBACK_FACE = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/**
 * The palette in force on `el` (the chart's own container, so a Desk pane and a back-room page each get theirs). Midnight
 * when its tokens are present, else the Desk's. A missing token throws: a chart drawn in a browser default colour would
 * be a silent off-brand chart, so the page fails loudly in development instead.
 */
export function chartPalette(el: Element = document.documentElement): ChartPalette {
  const css = getComputedStyle(el);
  const v = (n: string) => css.getPropertyValue(n).trim();
  const names = v(MIDNIGHT.ink) ? MIDNIGHT : DESK;
  const out = {} as Record<keyof ChartPalette, string>;
  for (const [k, n] of Object.entries(names) as [keyof ChartPalette, string][]) {
    const got = v(n);
    if (!got && k !== "face") throw new Error(`chart palette: the page has no ${n}`);
    out[k] = got || FALLBACK_FACE;
  }
  return out;
}

/** Type size: 13 px on every axis (`--t-micro`), desktop and phone alike; never smaller. `narrow` is kept for callers. */
export const chartText = (p: ChartPalette, _narrow = false) => ({ fontFamily: p.face, fontSize: 13, color: p.ink2 });

/**
 * The AG Charts theme: dark base, transparent background (the card behind it is the page's), the palette's inks, quiet
 * axes, faint gridlines, no tooltips, no animation, no legend toggling. Series colours are always set per series by the
 * chart that draws them (each colour means something), so the palette's fills are only a fallback in ink.
 */
export function gooseTheme(p: ChartPalette, narrow = false): AgChartTheme {
  const text = chartText(p, narrow);
  return {
    baseTheme: "ag-default-dark",
    palette: { fills: [p.ink, p.ink3, p.gold], strokes: [p.ink, p.ink3, p.gold] },
    params: {
      fontFamily: p.face, fontSize: text.fontSize, foregroundColor: p.ink, textColor: p.ink2, subtleTextColor: p.ink3,
      backgroundColor: "transparent", chartBackgroundColor: "transparent", accentColor: p.gold,
      axisLineColor: p.edge, gridLineColor: p.edge, chartPadding: 0,
    },
    overrides: {
      common: {
        animation: { enabled: false },
        tooltip: { enabled: false },
        background: { visible: false },
        legend: { enabled: false, item: { label: { ...text }, marker: { size: 8 } }, toggleSeries: false },
        axes: {
          category: { line: { enabled: false }, gridLine: { enabled: false }, label: { ...text } },
          number: { line: { enabled: false }, gridLine: { enabled: true, style: [{ stroke: p.edge, lineDash: [] }] }, label: { ...text } },
        },
      },
    },
  };
}

/** WCAG 2 contrast ratio of two `#rrggbb` colours (the probe and the review use it to hold every ink at AA on its card). */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = hex.replace("#", "");
    const [r, g, bl] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
}
