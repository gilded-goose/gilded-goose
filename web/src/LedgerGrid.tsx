// The "Every decision" ledger as an AG Grid Community table (Track C, docs/guild/022-ag-grid-ledger.md). Its own lazy
// chunk, loaded only on screens 768 px and wider once there are rows, so the first screen and phones never fetch it
// (ADR 0007). Community modules only (MIT; each one checked against AG Grid's docs in 022 §1): no Side Bar, Status Bar,
// Set Filter, grouping or charts, which are Enterprise.

import { useEffect, useMemo, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  CellStyleModule, ClientSideRowModelApiModule, ClientSideRowModelModule, ExternalFilterModule, ModuleRegistry, QuickFilterModule, RowApiModule,
  RowSelectionModule, RowStyleModule, ScrollApiModule, themeQuartz,
  type ColDef, type GridApi, type ICellRendererParams, type IRowNode, type RowClassRules,
} from "ag-grid-community";
import { LAYER_SHORT, passesChips, searchText, type Chips, type GridRow } from "@goose/core/grid";
import { RefusedStamp, WhyCell } from "./Ledger.tsx";

ModuleRegistry.registerModules([
  ClientSideRowModelModule, ClientSideRowModelApiModule, RowStyleModule, CellStyleModule, QuickFilterModule, ExternalFilterModule, RowSelectionModule, ScrollApiModule, RowApiModule,
]);

// The page's own tokens, so the grid turns dark with the page and never looks pasted in.
const theme = themeQuartz.withParams({
  fontFamily: "inherit", fontSize: 14, headerFontSize: 13, headerFontWeight: 600, spacing: 6,
  backgroundColor: "var(--white)", foregroundColor: "var(--ink)", textColor: "var(--ink)", headerTextColor: "var(--grey)",
  headerBackgroundColor: "var(--paper)", borderColor: "var(--line)", rowBorder: { color: "var(--line)" },
  accentColor: "var(--teal)", selectedRowBackgroundColor: "transparent", rowHoverColor: "var(--paper)",
  wrapperBorderRadius: 12, wrapperBorder: { color: "var(--line)" }, cellHorizontalPadding: 10, rowHeight: 58, headerHeight: 40,
});

const rowClassRules: RowClassRules<GridRow> = {
  "lg-refused": (p) => p.data?.tone === "refused",
  "lg-scam": (p) => p.data?.tone === "scam",
  "lg-asked": (p) => p.data?.tone === "asked",
  "lg-unmatched": (p) => p.data?.tone === "unmatched",
  "lg-differs": (p) => p.data?.tone === "differs",
};

function SeqCell({ data }: ICellRendererParams<GridRow>) {
  if (!data) return null;
  // data-ledger-seq / data-also: what scripts/screens.ts reads to check every drawn mark names a row (Lesson 21).
  return <span className="lg-seq" data-ledger-seq={data.seq} data-also={data.also.join(" ")}>{data.seq}</span>;
}

function DidCell({ data }: ICellRendererParams<GridRow>) {
  if (!data) return null;
  // Design B: a refusal is stamped on the receipt, as on the wallet's card; the byline names who refused it.
  if (data.verdict === "refused") return <RefusedStamp r={data} />;
  return <span className={`lg-did ${data.verdict ?? ""}`}>{data.verdict && <i aria-hidden />}{data.did}</span>;
}

// A refusal has no price of its own: its Amount shows the refused ask, struck, so the stamped row still reads across.
function AmountCell({ data, context }: ICellRendererParams<GridRow, unknown, { rows: GridRow[] }>) {
  if (!data) return null;
  if (data.verdict !== "refused" || data.price) return <>{data.price ?? ""}</>;
  const ask = context.rows.filter((r) => r.refusedAt === data.seq && r.seq < data.seq && r.price).at(-1);
  return ask ? <s className="lg-struck"><span className="sr">refused ask </span>{ask.price}</s> : null;
}

// Widths fit the Why column on screen beside the moment panel at 1440 px; the why is clamped to two lines here (all of
// it is in the moment panel, the cards and the cell's title), so a filmed frame holds a dozen rows.
const columns = (full: boolean): ColDef<GridRow>[] => [
  { headerName: "#", field: "seq", width: 60, cellRenderer: SeqCell, sort: "asc", comparator: (a: number, b: number) => a - b },
  { headerName: "Round", field: "round", width: 70, hide: !full, valueFormatter: (p) => (p.value === null || p.value === undefined ? "" : String(p.value)) },
  { headerName: "Who", field: "who", width: 150, cellClass: "lg-clamp" },
  { headerName: "Did", field: "did", width: 164, cellRenderer: DidCell },
  { headerName: "Amount", field: "price", width: 86, type: "rightAligned", cellRenderer: AmountCell, comparator: (_a, _b, x, y) => (x.data?.cents ?? -1) - (y.data?.cents ?? -1) },
  { headerName: "Check", field: "layerLabel", width: 112, cellRenderer: ({ data }: ICellRendererParams<GridRow>) => (data ? <span className={`tag layer l${data.layer}`} title={data.layerLabel}>{LAYER_SHORT[data.layer]}</span> : null) },
  { headerName: "Rule", field: "rule", width: 112, cellRenderer: ({ data }: ICellRendererParams<GridRow>) => (data?.rule ? <span className="rules">{data.rule.split(", ").map((x) => <code key={x} className="rule">{x}</code>)}</span> : <span className="none" role="img" aria-label="no rule">–</span>) },
  // The why cell also shows the fold ("×4, also rows 9, 13, 18") and the refusal it points at, which change while its
  // text doesn't; its value carries them, so AG Grid redraws the cell when a repeat folds in.
  { headerName: "Why", colId: "why", valueGetter: (p) => (p.data ? `${p.data.why} ${p.data.also.join(",")} ${p.data.refusedAt ?? ""}` : ""), flex: 1, minWidth: 260, sortable: false, cellRenderer: ({ data }: ICellRendererParams<GridRow>) => (data ? <WhyCell r={data} clamp /> : null), getQuickFilterText: (p) => (p.data ? searchText(p.data) : "") },
];

export default function LedgerGrid({ rows, chips, search, at, onPick, full, busy }: { rows: GridRow[]; chips: Chips; search: string; at: number | null; onPick: (seq: number) => void; full: boolean; busy: boolean }) {
  const api = useRef<GridApi<GridRow> | null>(null);
  const chipsRef = useRef(chips);
  chipsRef.current = chips;
  // The picked row opens to its whole why (row 15's over-ask story on camera): its height is re-read on every pick.
  const atRef = useRef(at);
  atRef.current = at;
  // Rows that were there when the grid opened don't flash; a row that streams in after does, once (reduced motion: never).
  const first = useRef<Set<number> | null>(null);
  if (first.current === null) first.current = new Set(rows.map((r) => r.seq));
  const defaultColDef = useMemo<ColDef<GridRow>>(() => ({ sortable: true, resizable: false, suppressMovable: true, getQuickFilterText: () => "" }), []);

  useEffect(() => { api.current?.onFilterChanged(); }, [chips]);
  // While the run streams, follow the newest row; once it ends, bring the first refusal into view (the row the film is
  // about). A picked row stays selected and in view.
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    a.resetRowHeights();
    if (at === null) {
      a.deselectAll();
      const n = a.getDisplayedRowCount();
      const red = busy ? null : rows.find((r) => r.tone === "refused");
      const i = red ? a.getRowNode(String(red.seq))?.rowIndex : null;
      if (i !== null && i !== undefined) { a.ensureIndexVisible(0, "top"); a.ensureIndexVisible(i); } else if (n > 0) a.ensureIndexVisible(n - 1, "bottom");
      return;
    }
    const node = a.getRowNode(String(at));
    node?.setSelected(true, true);
    if (node?.rowIndex !== null && node?.rowIndex !== undefined) a.ensureIndexVisible(node.rowIndex);
  }, [at, rows, busy]);

  return (
    <div className={full ? "lg-grid full" : "lg-grid"}>
      <AgGridReact<GridRow>
        theme={theme}
        rowData={rows}
        context={{ rows }}
        columnDefs={useMemo(() => columns(full), [full])}
        defaultColDef={defaultColDef}
        getRowId={(p) => String(p.data.seq)}
        tabToNextCell={() => false} // Tab leaves the grid from a cell; arrows move inside it (keyboard-tour)
        // The scam offer and the Watcher's refusal show all their words: the attack is what the shot is for.
        getRowHeight={(p) => (p.data?.tone === "scam" || p.data?.tone === "refused" ? (full ? 124 : 150) + (p.data.count > 1 ? 26 : 0) : p.data && p.data.seq === atRef.current ? 96 : 58)}
        rowClassRules={rowClassRules}
        getRowClass={(p) => (p.data && !first.current!.has(p.data.seq) ? "lg-fresh" : undefined)}
        quickFilterText={search}
        isExternalFilterPresent={() => chipsRef.current.layers.size > 0 || chipsRef.current.actors.size > 0}
        doesExternalFilterPass={(n: IRowNode<GridRow>) => (n.data ? passesChips(n.data, chipsRef.current) : true)}
        rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
        onRowClicked={(e) => { if (e.data) onPick(e.data.seq); }}
        onCellKeyDown={(e) => { const k = (e.event as KeyboardEvent | undefined)?.key; if ((k === "Enter" || k === " ") && e.data) onPick(e.data.seq); }}
        domLayout={full ? "normal" : "autoHeight"}
        // A run's ledger is tens of rows: every row stays in the page, so a screen reader reads them all and the red row is
        // always there to find (AG Grid's accessibility page advises this). A long shopper ledger virtualises again.
        suppressRowVirtualisation={rows.length <= 200}
        ensureDomOrder
        suppressCellFocus={false}
        animateRows
        onGridReady={(e) => { api.current = e.api; document.querySelector(full ? ".spine .lg-grid [role=grid]" : ".lg-grid [role=grid]")?.setAttribute(full ? "aria-labelledby" : "aria-label", full ? "spine-title" : "Every decision"); }}
        // A fold makes the scam row taller: re-read the heights whenever the rows change (tens of rows; cheap).
        onRowDataUpdated={(e) => e.api.resetRowHeights()}
      />
    </div>
  );
}
