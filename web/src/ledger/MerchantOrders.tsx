// For merchants on Behind the scenes (scorecard row 20, Lead-12 Nov 6): one AG Grid Community row per PayPal order, the
// recorded sandbox order first, then this browser's own (core/src/view/merchants.ts says where each cell comes from).
// Read only: no cell is a button that reaches PayPal. The same table under AG Studio's dashboard and on the Community
// ledger, so it stays when Studio's licence ends. This file is the frame (no AG code): the heading, the words and a box
// the grid's own height (up to six rows; more scroll inside it), so nothing below moves when the grid's lazy chunk lands.
// A column narrower than the grid's columns (MERCHANT_GRID.min: a phone, a tablet, a narrow window) draws each order as a
// card instead, and never fetches the grid's chunk (the DD, Nov 6: at 390 the grid hid Status, PayPal's column and the
// amount behind a sideways scroll with no hint).
import { Suspense, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MERCHANT_GRID, MERCHANT_WORDS, merchantRows, readRecorded, type OrderEvent } from "@goose/core/merchants";
import { lazyOr } from "../states/online.ts";
import { MerchantCards } from "./merchant-cells.tsx";
import "./merchants.css";

// A lost chunk draws its own line in the frame, never an empty page (lazy-lost.test).
const MerchantGrid = lazyOr(() => import("./MerchantGrid.tsx"), () => <p className="mo-none mo-lost">{MERCHANT_WORDS.lost}</p>);

// The recorded order, when `pnpm e2e:settle` has written it: a build without the file draws this browser's rows only.
const FILE = import.meta.glob<unknown>("../../../docs/fixtures/merchant-order.json", { eager: true, import: "default" });
export const RECORDED = readRecorded(Object.values(FILE)[0] ?? null);

/** The table for these rows (`events`: this browser's own ledger rows, newest last). */
export default function MerchantOrders({ events }: { events: readonly OrderEvent[] }) {
  const rows = useMemo(() => merchantRows(RECORDED, events), [events]);
  const box = useRef<HTMLElement>(null);
  // Measured before the first paint (a layout effect), so the page never shows the grid and then swaps it for cards.
  const [wide, setWide] = useState<boolean | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setWide(el.clientWidth >= MERCHANT_GRID.min);
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return (
    <section className="mo" aria-labelledby="mo-h" ref={box}>
      <h2 id="mo-h" className="mo-h">{MERCHANT_WORDS.head}</h2>
      <p className="mo-sub">{MERCHANT_WORDS.sub}</p>
      {rows.length === 0 ? (
        <div className="mo-empty"><p className="mo-empty-h">{MERCHANT_WORDS.noneHead}</p><p className="mo-none">{MERCHANT_WORDS.none}</p></div>
      ) : wide === null ? null : !wide ? (
        <MerchantCards rows={rows} labelledBy="mo-h" />
      ) : (
        <div className="lx-grid mo-grid" style={{ height: MERCHANT_GRID.head + Math.min(rows.length, MERCHANT_GRID.most) * MERCHANT_GRID.row + 2 }}>
          <Suspense fallback={null}>
            <MerchantGrid rows={rows} labelledBy="mo-h" />
          </Suspense>
        </div>
      )}
    </section>
  );
}
