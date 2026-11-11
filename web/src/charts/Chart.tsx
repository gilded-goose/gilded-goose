// The one AG Charts canvas every Goose chart draws through (Track D): AG Charts Community 14 (MIT; no Enterprise
// package is installed or imported), the Community modules the charts use registered once, and the shared theme
// (`theme.ts`) applied under each chart's own options. Load it lazily (`lazy(() => import("…/charts/Chart.tsx"))`):
// the library is a large chunk and never belongs on a first screen.
//
// The canvas is hidden from screen readers by the chart's caller, which always renders the chart's text alternative
// (a sentence or a table) in HTML beside it.

import { useEffect, useRef, useState, useLayoutEffect, type ReactNode } from "react";
import { AgCharts } from "ag-charts-react";
import {
  AreaSeriesModule, BarSeriesModule, CartesianChartModule, CategoryAxisModule, CrossLinesModule, DonutSeriesModule, LegendModule, LineSeriesModule, ModuleRegistry, NumberAxisModule, PolarChartModule,
  type AgChartOptions,
} from "ag-charts-community";
import { chartPalette, gooseTheme, type ChartPalette } from "./theme.ts";

ModuleRegistry.registerModules([CartesianChartModule, PolarChartModule, AreaSeriesModule, BarSeriesModule, DonutSeriesModule, LineSeriesModule, CategoryAxisModule, NumberAxisModule, CrossLinesModule, LegendModule]);

// Mounting a chart is the heaviest thing these pages do. All of them in one commit was a 500 ms task on a phone at 4x CPU, with every
// chart below the fold: so a chart waits until it's within a screen or so, and only one starts per turn, so scrolling stays alive.
const NEAR = "800px 0px";
const TURN_MS = 120;
let nextTurn = 0;
function takeTurn(go: () => void): number {
  const now = performance.now(), at = Math.max(now, nextTurn);
  nextTurn = at + TURN_MS;
  return window.setTimeout(go, at - now);
}

/**
 * A themed chart, whatever its kind. `build` gets the palette in force on the chart's own box (so a Desk pane and a back-room
 * page each get their tokens) and returns the chart's options; the theme sits under them, so a chart's own setting wins.
 */
export default function Chart({ build, height, narrow = false, waiting = null }: { build: (p: ChartPalette) => AgChartOptions; height?: number; narrow?: boolean; waiting?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [p, setP] = useState<ChartPalette | null>(null);
  const [near, setNear] = useState(false);
  // AG Studio can draw a widget into a container it hasn't attached yet (a dashboard drawn under the shell, pick.ts), and a
  // detached box has no tokens to read; the chart waits for the page rather than throwing the whole page away.
  useLayoutEffect(() => {
    let raf = 0;
    const read = () => { if (!box.current) return; if (box.current.isConnected) setP(chartPalette(box.current)); else raf = requestAnimationFrame(read); };
    read();
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let turn = 0;
    const io = new IntersectionObserver((seen) => {
      if (!seen.some((s) => s.isIntersecting)) return;
      io.disconnect();
      turn = takeTurn(() => setNear(true));
    }, { rootMargin: NEAR });
    io.observe(el);
    return () => { io.disconnect(); clearTimeout(turn); };
  }, []);
  // With its keyboard off, AG still leaves its canvas in the Tab order, and tabbing past it lands on a 0 x 0 guard: two dead
  // stops per chart, 12 on the threat board (keyboard-tour). Its swap keeps whatever tabindex it finds, so setting it once
  // on each new canvas holds. A chart with its keyboard on keeps its stop: that's how the keyboard reads its data.
  useEffect(() => {
    const el = box.current;
    if (!el || !p || build(p).keyboard?.enabled !== false) return;
    const out = () => { for (const a of el.querySelectorAll<HTMLElement>(".ag-charts-swapchain[tabindex]")) a.tabIndex = -1; };
    out();
    const seen = new MutationObserver(out);
    seen.observe(el, { childList: true, subtree: true });
    return () => seen.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `build` is new every render; the keyboard setting isn't
  }, [p]);
  // No height: the chart fills its container (a dashboard widget's cell), and AG Charts follows the box as it resizes.
  const h = height ?? "100%";
  return (
    <div ref={box} style={{ height: h }}>
      {!p || !near ? waiting : <AgCharts options={{ theme: gooseTheme(p, narrow), ...build(p), ...(height === undefined ? {} : { height }) } as AgChartOptions} style={{ height: h }} />}
    </div>
  );
}
