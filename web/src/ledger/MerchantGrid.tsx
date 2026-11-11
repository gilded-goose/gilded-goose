// The For merchants table's grid (MerchantOrders.tsx draws its frame): AG Grid Community, in its own lazy chunk, so the
// Community ledger's first files never carry AG (prerender.ts fails a build whose ledger preloads an AG chunk). Only where
// the page's column holds every column (MERCHANT_GRID.min); a narrower page draws the same cells as cards (merchant-cells.tsx).
import { useRef, type ReactNode } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { MERCHANT_GRID, MERCHANT_WORDS, type MerchantRow } from "@goose/core/merchants";
import { Order, Status, Word } from "./merchant-cells.tsx";
import { ledgerTheme, registerLedgerModules } from "./gridTheme.ts";

registerLedgerModules();
// Rows tall enough for wrapped words, so every column fits the page's 1136 px column at 1440 without a sideways scroll.
const theme = ledgerTheme.withParams({ rowHeight: MERCHANT_GRID.row, headerHeight: MERCHANT_GRID.head });

const W = MERCHANT_WORDS.cols;
const wrap = "mo-wrap";
const cell = (C: (p: { r: MerchantRow }) => ReactNode) => ({ data }: ICellRendererParams<MerchantRow>) => (data ? <C r={data} /> : null);
// Fixed widths sum to 738 px, PayPal's webhook takes the rest from a 276 px floor: MERCHANT_GRID.min (1016, borders in) is
// the narrowest column the grid draws in. No "Order" column: the recorded order says so under its id (the DD, Nov 6).
const COLUMNS: ColDef<MerchantRow>[] = [
  { headerName: W.status, field: "status", width: 180, cellClass: wrap, cellRenderer: cell(Status) },
  { headerName: W.word, field: "word", flex: 1, minWidth: 276, cellClass: wrap, cellRenderer: cell(Word) },
  { headerName: W.amount, field: "amount", width: 92, cellClass: "lx-num", type: "rightAligned", valueFormatter: (p) => p.value || MERCHANT_WORDS.dash },
  { headerName: W.cart, field: "mark", width: 116, cellClass: "lx-num mo-mono", valueFormatter: (p) => p.value ?? MERCHANT_WORDS.dash, tooltipValueGetter: (p) => (p.data?.cart ? `custom_id ${p.data.cart}` : null) },
  { headerName: W.approved, field: "approved", width: 150, cellClass: `lx-num ${wrap}` },
  { headerName: W.order, field: "orderId", width: 200, cellClass: wrap, cellRenderer: cell(Order) },
];

export default function MerchantGrid({ rows, labelledBy }: { rows: MerchantRow[]; labelledBy: string }) {
  const box = useRef<HTMLDivElement>(null);
  return (
    <div ref={box} style={{ height: "100%" }}>
      <AgGridReact<MerchantRow>
        theme={theme}
        rowData={rows}
        columnDefs={COLUMNS}
        getRowId={(p) => `${p.data.from}-${p.data.orderId}`}
        suppressMovableColumns
        // Two-line headers inside the fixed 44 px head ("Cart (custom_id)", "Seen approved (UTC)"), never cut short; no
        // resize handles on a read-only table whose columns already fit (the DD, Nov 6).
        defaultColDef={{ wrapHeaderText: true, resizable: false }}
        tooltipShowDelay={300}
        // AG Grid has no prop for the grid's name: its role="grid" element takes the heading's, as LedgerTable's does.
        onGridReady={() => box.current?.querySelector('[role="grid"]')?.setAttribute("aria-labelledby", labelledBy)}
      />
    </div>
  );
}
