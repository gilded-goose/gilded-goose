// The ledger table on its own (Track L): the calm Midnight AG Grid (gridTheme.ts) with the back room's columns, so Behind
// the scenes and an AG Studio widget show ledger rows the same way. Hand it `rows` and `onOpen` and it draws them; a page
// that streams (Behind the scenes) leaves `rows` out and adds rows through the grid's own transactions from `onGridReady`.
// Any other AG Grid prop passes straight through. Wrap it in `.lx-grid` (ledger.css) for the calm header, the two-line
// clamp and the hover lift, and keep midnight.css loaded for the colours.
//
// The row is the action: a click, or Enter or Space on a focused cell, opens it (`onOpen`); the grid is named by
// `labelledBy`, the id of the heading above it, so a screen reader announces which table it is in.

import { useRef } from "react";
import { AgGridReact, type AgGridReactProps } from "ag-grid-react";
import type { ColDef, ICellRendererParams, IRowNode, RowClassRules } from "ag-grid-community";
import type { LedgerRow } from "@goose/core/session";
import { Amount, KIND_ONE, Kind, PayPalMark, timeOf } from "./marks.tsx";
import { COL_W, didWords, fromWords, whoWords, whyFindText } from "./rows.ts";
import { ledgerTheme, registerLedgerModules } from "./gridTheme.ts";

registerLedgerModules();

export const isPinned = (n: IRowNode) => n.rowPinned !== undefined && n.rowPinned !== null;

/** The rule behind a row, in the words of the side sheet's "which rule": a closed list, never the seller's text. */
const ruleTip = (p: { data?: LedgerRow | undefined; node?: IRowNode | null }): string | null => (p.data?.rule && !(p.node && isPinned(p.node)) ? `Rule: ${p.data.rule}. ${p.data.layer}.` : null);

/** What the search reads in the What column: the word its cell draws and the record's own; the cell says "Set aside", and "skipped" still finds it. */
const kindFind = (r: LedgerRow | undefined): string => (!r ? "" : r.kind === "skipped" ? "set aside skipped seller" : `${KIND_ONE[r.kind]} ${r.kind}`);

const NO_MATCH = "No rows match. Clear the filter or the search.";
/** AG Grid's own overlay when filters empty the table reads this, not `overlayNoRowsTemplate`. */
const LEDGER_OVERLAY = { noMatchingRows: { overlayText: NO_MATCH } };

// Sized for the 1184 px panel at 1440 wide, so Why has the most room and nothing hides off the right edge. Every row is
// one height: Why, Who and Did hold to two lines, and the chevron at the end says the row opens its full story. A row's
// place in the ledger is its order, so there is no "#" column. With no rows of the session's own, Time is hidden.
const columnsFor = (withTime: boolean): ColDef<LedgerRow>[] => [
  { headerName: "Time (UTC)", field: "t", width: COL_W.t, hide: !withTime, cellClass: "lx-num lx-dim", valueFormatter: (p) => (p.data && !(p.node && isPinned(p.node)) ? timeOf(p.data) : ""), getQuickFilterText: () => "" },
  {
    headerName: "Who", field: "who", width: COL_W.who,
    cellRenderer: ({ data, node }: ICellRendererParams<LedgerRow>) => (!data ? null : isPinned(node) ? <span className="lx-tot-label">{data.who}</span> : <span className="lx-who"><span className="lx-clamp">{whoWords(data)}</span><PayPalMark r={data} /></span>),
  },
  {
    headerName: "What", field: "kind", width: COL_W.kind, tooltipValueGetter: ruleTip,
    cellRenderer: ({ data, node }: ICellRendererParams<LedgerRow>) => (!data || isPinned(node) ? null : <Kind r={data} />),
    getQuickFilterText: (p) => kindFind(p.data), // the cell says "Set aside"; "skipped" still finds it
  },
  { headerName: "Did", field: "did", width: COL_W.did, cellRenderer: ({ data, node }: ICellRendererParams<LedgerRow>) => (!data ? null : isPinned(node) ? <span className="lx-tot">{data.did}</span> : <span className="lx-did lx-clamp">{didWords(data)}</span>) },
  {
    headerName: "Amount", field: "price", width: COL_W.price, type: "rightAligned", cellClass: "lx-num ag-right-aligned-cell", // the column's own cellClass replaces the type's, so it names the right-aligned class itself: the figures end under AMOUNT, as in the shell (DD, B-6)
    cellRenderer: ({ data, node }: ICellRendererParams<LedgerRow>) => (!data ? null : isPinned(node) ? <span className="lx-tot lx-num">{data.price}</span> : <Amount r={data} />),
  },
  // Why holds to two lines; every word is in the side sheet, which a click or Enter opens.
  {
    headerName: "Why", field: "why", flex: 1, minWidth: COL_W.whyMin, tooltipValueGetter: ruleTip,
    getQuickFilterText: (p) => (p.data ? whyFindText(p.data) : ""),
    cellRenderer: ({ data, node }: ICellRendererParams<LedgerRow>) => (!data ? null : isPinned(node) ? <span className="lx-tot">{data.why}</span> : <span className="lx-whytext lx-clamp">{data.why}{data.quoted && <>{" "}<q className="sl-quoted">{data.quoted}</q></>}</span>),
  },
  {
    // field stays sourceWords: scripts/session-ledger-check.ts reads this column by its id.
    headerName: "From", field: "sourceWords", width: COL_W.from,
    valueGetter: (p) => (p.data && !(p.node && isPinned(p.node)) ? fromWords(p.data) : ""),
    cellRenderer: ({ data, node, value }: ICellRendererParams<LedgerRow, string>) => (!data || isPinned(node) ? null : <span className={data.part === "week" ? "lx-from lx-clamp lx-dim" : "lx-from lx-clamp"}>{value}</span>),
  },
  {
    headerName: "Open", headerClass: "lx-sr-head", colId: "open", width: COL_W.open, cellClass: "lx-open-cell", getQuickFilterText: () => "",
    cellRenderer: ({ node }: ICellRendererParams<LedgerRow>) => (isPinned(node) ? null : <span className="lx-open" aria-hidden="true" />),
  },
];
/** Module constants, never new objects per render: a new columnDefs or defaultColDef resets the grid's columns. */
export const LEDGER_COLUMNS_TIMED = columnsFor(true);
export const LEDGER_COLUMNS = columnsFor(false);
// Columns are sized for the page and never resized, so the header carries no resize ticks.
const defaultColDef: ColDef<LedgerRow> = { sortable: false, resizable: false, filter: false, suppressMovable: true, suppressHeaderMenuButton: true };

const BASE_CLASSES: RowClassRules<LedgerRow> = {
  "sl-skipped": (p) => p.data?.kind === "skipped",
  "lx-week": (p) => p.data?.part === "week",
  "sl-totals": (p) => p.node.rowPinned === "bottom",
};

export interface LedgerTableProps extends Omit<AgGridReactProps<LedgerRow>, "rowData" | "theme" | "columnDefs" | "defaultColDef"> {
  /** The rows to draw. Leave out to add rows through transactions instead (a streaming page). */
  rows?: LedgerRow[];
  /** Show the Time column (rows of a live session have a time; the recorded week's don't). */
  timed?: boolean;
  /** The row's full story: a click, or Enter or Space on a focused cell. */
  onOpen: (r: LedgerRow) => void;
  /** The id of the heading that names this table. */
  labelledBy: string;
  /** Columns of the caller's own (Studio's licensed ledger adds its visit); left out, the ledger's. */
  columns?: ColDef<LedgerRow>[];
}

export function LedgerTable({ rows, timed = false, onOpen, labelledBy, rowClassRules, onGridReady, columns, ...grid }: LedgerTableProps) {
  const box = useRef<HTMLDivElement>(null);
  return (
    <div ref={box} style={{ display: "contents" }}>
    <AgGridReact<LedgerRow>
      theme={ledgerTheme}
      columnDefs={columns ?? (timed ? LEDGER_COLUMNS_TIMED : LEDGER_COLUMNS)}
      defaultColDef={defaultColDef}
      getRowId={(p) => p.data.id}
      tooltipShowDelay={250}
      tabToNextCell={() => false} // Tab leaves the grid from a cell; arrows move inside it. Tabbing every cell is hundreds of presses (keyboard-tour)
      {...(rows ? { rowData: rows } : {})}
      rowClassRules={{ ...BASE_CLASSES, ...rowClassRules }}
      overlayNoRowsTemplate={`<span class="lx-none">${NO_MATCH}</span>`}
      overlayComponentParams={LEDGER_OVERLAY}
      onRowClicked={(e) => { if (e.data && !isPinned(e.node)) onOpen(e.data); }}
      onCellKeyDown={(e) => {
        const k = (e.event as KeyboardEvent | null)?.key;
        if ((k === "Enter" || k === " ") && e.data && !isPinned(e.node)) { (e.event as KeyboardEvent).preventDefault(); onOpen(e.data); }
      }}
      onGridReady={(e) => {
        // AG Grid has no prop for the grid's accessible name: name its role="grid" element after the heading above it.
        const el = box.current?.querySelector('[role="grid"], [role="treegrid"]');
        el?.setAttribute("aria-labelledby", labelledBy);
        onGridReady?.(e);
      }}
      {...grid}
    />
    </div>
  );
}
