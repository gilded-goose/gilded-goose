// The AG Grid half of Compare (Compare.tsx), split off so AG Grid's ~1 MB loads only when a compare is about to show
// (the Nov 11 speed gate), never with the shop's first screen. Community modules only (core/test/no-enterprise.test.ts).
import { useMemo, type CSSProperties } from "react";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, RowAutoHeightModule, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { usdWhole } from "@goose/core/money";
import { ledgerTheme, registerLedgerModules } from "../../ledger/gridTheme.ts";
import { Egg } from "../ui/Egg.tsx";
import { Stamp } from "../ui/Stamp.tsx";
import type { GridRow } from "./compare-grid.ts";
import { usd } from "./receipt-words.ts";

registerLedgerModules();
ModuleRegistry.registerModules([RowAutoHeightModule]);

const whole = usdWhole;

/** The ledger's theme on the shop's paper: clear ground, hairlines between rows only, the reading face. */
const compareTheme = ledgerTheme.withParams({
  fontFamily: "var(--font-sans)", fontSize: 16, dataFontSize: 16, headerFontSize: 13, headerFontWeight: 500,
  spacing: 6, rowHeight: 64, headerHeight: 36, cellHorizontalPadding: 12,
  backgroundColor: "transparent", foregroundColor: "var(--ink)", textColor: "var(--ink)", headerTextColor: "var(--ink-3)",
  headerBackgroundColor: "transparent", chromeBackgroundColor: "transparent", oddRowBackgroundColor: "transparent",
  borderColor: "var(--line)", rowBorder: { color: "var(--line)" }, headerRowBorder: { color: "var(--line-strong)" },
  accentColor: "var(--focus)", rowHoverColor: "var(--surface-2)",
});

export type Row = (GridRow & { kind: "seller" }) | { kind: "line"; id: string };
const seller = (r: Row | undefined): (GridRow & { kind: "seller" }) | null => (r?.kind === "seller" ? r : null);

function SellerCell({ data, context }: ICellRendererParams<Row, unknown, { narrow: boolean }>) {
  const r = seller(data);
  if (!r) return null;
  return (
    <span className="cg-seller">
      <span className="ranked-name">
        {r.name}
        {r.best ? <span className="ranked-pick">Goose's pick</span> : null}
      </span>
      {context?.narrow ? <span className="cg-stamp-inline"><Stamp verdict={r.verdict} /></span> : null}
      {r.reason || r.quoted ? (
        <span className="ranked-why">
          {r.reason ? <span>{r.reason[0]?.toUpperCase()}{r.reason.slice(1)}.</span> : null}
          {r.quoted ? <span className="ranked-note">“{r.quoted}”</span> : null}
        </span>
      ) : null}
    </span>
  );
}

function StampCell({ data }: ICellRendererParams<Row>) {
  const r = seller(data);
  return r ? <Stamp verdict={r.verdict} /> : null;
}

function PriceCell({ data }: ICellRendererParams<Row>) {
  const r = seller(data);
  return r ? <span className="ranked-price figure">{usd(r.price)}</span> : null;
}

const colsFor = (narrow: boolean): ColDef<Row>[] => [
  { headerName: "", colId: "n", width: narrow ? 36 : 48, valueGetter: (p) => seller(p.data)?.rank ?? "", cellClass: "cg-n figure" },
  { headerName: "Seller", colId: "seller", flex: 1, minWidth: 140, cellRenderer: SellerCell, autoHeight: true, wrapText: true },
  { headerName: "Watcher", colId: "stamp", width: 148, cellRenderer: StampCell, hide: narrow },
  { headerName: "Price", colId: "price", width: narrow ? 96 : 112, cellRenderer: PriceCell, headerClass: "cg-right", cellClass: "cg-right" },
];
const DEFAULT_COL: ColDef<Row> = { sortable: false, resizable: false, suppressMovable: true, suppressHeaderMenuButton: true };

export function CompareGrid({ data, narrow, limit }: { data: Row[]; narrow: boolean; limit: number }) {
  const cols = useMemo(() => colsFor(narrow), [narrow]);
  const context = useMemo(() => ({ narrow }), [narrow]);
  const LimitLine = useMemo(() => function LimitLine() {
    return <span className="ranked-line"><Egg size="s" /><span>Your limit {whole(limit)}</span></span>;
  }, [limit]);
  return (
    <AgGridReact<Row>
      key={narrow ? "narrow" : "wide"}
      theme={compareTheme}
      rowData={data}
      columnDefs={cols}
      context={context}
      defaultColDef={DEFAULT_COL}
      getRowId={(p) => p.data.id}
      domLayout="autoHeight"
      animateRows
      suppressCellFocus
      isFullWidthRow={(p) => p.rowNode.data?.kind === "line"}
      fullWidthCellRenderer={LimitLine}
      getRowHeight={(p) => (p.data?.kind === "line" ? 44 : undefined)}
      getRowStyle={(p) => {
        const r = seller(p.data);
        return r ? ({ "--fill": String(r.fill), "--i": String(r.rank - 1) } as CSSProperties as Record<string, string>) : undefined;
      }}
      rowClassRules={{
        "cg-best": (p) => !!seller(p.data)?.best,
        "cg-aside": (p) => seller(p.data)?.verdict === "aside",
        "cg-over": (p) => seller(p.data)?.verdict === "over",
      }}
    />
  );
}
