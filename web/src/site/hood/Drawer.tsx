// Under the hood, beside the run (spec §6.2): an AG Grid ledger of the run's own events, rows only ever added. Each row
// names who proposed it, what it was, the ledger's own why, and the PayPal call that made it, tagged Live or Recorded.
// At 1100 px and wider it is a drawer beside the run, open by default; narrower, the same grid in a pull-up sheet. The
// grid reuses the ledger's Theming API theme (web/src/ledger/gridTheme.ts), restyled with the site's tokens, so it stays
// recognisably AG Grid. A row that arrives while the drawer is open flashes gold once (never under reduced motion).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, RowAutoHeightModule, type ColDef, type GridApi, type ICellRendererParams, type RowDataUpdatedEvent } from "ag-grid-community";
import { ledgerTheme, registerLedgerModules } from "../../ledger/gridTheme.ts";
import { Provenance } from "../ui/Provenance.tsx";
import { Sheet } from "../ui/Sheet.tsx";
import { useReducedMotion } from "../ui/motion.ts";
import type { HoodRow } from "./rows.ts";
import "./drawer.css";

registerLedgerModules();
// Rows grow to fit their why: the ledger page holds rows to a fixed height, this narrow drawer can't.
ModuleRegistry.registerModules([RowAutoHeightModule]);

const WIDE = "(min-width: 1100px)";

/** The ledger's theme in the bench's materials: light, hairlines, the reading face, gold only for a fresh row. */
const hoodTheme = ledgerTheme.withParams({
  fontFamily: "var(--font-sans)", fontSize: 14, dataFontSize: 14, headerFontSize: 13, headerFontWeight: 500,
  spacing: 6, rowHeight: 44, headerHeight: 40, cellHorizontalPadding: 12, iconSize: 14,
  backgroundColor: "var(--surface-raised)", foregroundColor: "var(--ink)", textColor: "var(--ink)", headerTextColor: "var(--ink-3)",
  headerBackgroundColor: "var(--surface-raised)", chromeBackgroundColor: "var(--surface-raised)", oddRowBackgroundColor: "var(--surface-raised)",
  borderColor: "var(--line)", rowBorder: { color: "var(--line)" }, headerRowBorder: { color: "var(--line-strong)" },
  accentColor: "var(--focus)", rowHoverColor: "var(--surface-2)", rangeSelectionBorderColor: "var(--focus)",
  valueChangeValueHighlightBackgroundColor: "oklch(0.8 0.135 84 / 0.28)",
  tooltipBackgroundColor: "var(--surface-raised)", tooltipTextColor: "var(--ink)", tooltipBorder: { color: "var(--line-strong)" },
});

function WhoCell({ data }: ICellRendererParams<HoodRow>) {
  if (!data) return null;
  return (
    <span className="hood-who">
      <span>{data.who}</span>
      <span className="hood-kind" data-kind={data.kind}>{data.kind === "live" ? "Live" : "Recorded"}</span>
    </span>
  );
}

function WhatCell({ data }: ICellRendererParams<HoodRow>) {
  if (!data) return null;
  return (
    <span className="hood-what">
      <span className="hood-what-line">{data.what}</span>
      {data.why && data.why.replace(/\.$/, "") !== data.what ? <span className="hood-why">{data.why}</span> : null}
      {data.call ? <span className="hood-call"><span className="hood-call-k">PayPal</span><code>{data.call}</code></span> : null}
    </span>
  );
}

/** On a phone the three columns don't fit, so each row is one stacked cell: step, who and where it came from, then what and why. */
function StackedCell({ data }: ICellRendererParams<HoodRow>) {
  if (!data) return null;
  return (
    <span className="hood-stack">
      <span className="hood-stack-top">
        <span className="hood-seq figure">{data.seq}</span>
        <span className="hood-stack-who">{data.who}</span>
        <span className="hood-kind" data-kind={data.kind}>{data.kind === "live" ? "Live" : "Recorded"}</span>
      </span>
      <WhatCell {...({ data } as ICellRendererParams<HoodRow>)} />
    </span>
  );
}

const COLUMNS_NARROW: ColDef<HoodRow>[] = [
  { headerName: "Step, who, what and why", colId: "stack", flex: 1, minWidth: 0, cellRenderer: StackedCell, autoHeight: true, wrapText: true },
];

const COLUMNS: ColDef<HoodRow>[] = [
  { headerName: "#", field: "seq", width: 56, cellClass: "hood-seq figure" },
  { headerName: "Who", field: "who", width: 132, cellRenderer: WhoCell, autoHeight: true },
  { headerName: "What, and why", colId: "what", flex: 1, minWidth: 200, cellRenderer: WhatCell, autoHeight: true, wrapText: true },
];
const DEFAULT_COL: ColDef<HoodRow> = { sortable: false, resizable: false, filter: false, suppressMovable: true, suppressHeaderMenuButton: true };
const rowId = (p: { data: HoodRow }) => `${p.data.kind}-${p.data.seq}`;

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => matchMedia("(max-width: 560px)").matches);
  useEffect(() => {
    const m = matchMedia("(max-width: 560px)");
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}

function Grid({ rows }: { rows: HoodRow[] }) {
  const api = useRef<GridApi<HoodRow> | null>(null);
  const narrow = useNarrow();
  const seen = useRef<Set<string>>(new Set());
  const still = useReducedMotion();
  const onData = useCallback((e: RowDataUpdatedEvent<HoodRow>) => {
    const fresh: NonNullable<ReturnType<GridApi<HoodRow>["getRowNode"]>>[] = [];
    e.api.forEachNode((n) => { if (n.id && !seen.current.has(n.id)) { if (seen.current.size > 0) fresh.push(n); seen.current.add(n.id); } });
    if (fresh.length === 0) return;
    const last = e.api.getDisplayedRowCount() - 1;
    if (last >= 0) e.api.ensureIndexVisible(last, "bottom");
    if (!still) e.api.flashCells({ rowNodes: fresh, flashDuration: 600, fadeDuration: 1200 });
  }, [still]);
  return (
    <div className="hood-grid" data-mixed={rows.some((r) => r.kind === "live") && rows.some((r) => r.kind !== "live") ? "" : undefined}>
      <AgGridReact<HoodRow>
        theme={hoodTheme}
        rowData={rows}
        columnDefs={narrow ? COLUMNS_NARROW : COLUMNS}
        defaultColDef={DEFAULT_COL}
        getRowId={rowId}
        onGridReady={(e) => { api.current = e.api; e.api.forEachNode((n) => { if (n.id) seen.current.add(n.id); }); void document.fonts.ready.then(() => { if (!e.api.isDestroyed()) e.api.resetRowHeights(); }); }}
        onRowDataUpdated={onData}
        suppressCellFocus={false}
        animateRows={!still}
        overlayNoRowsTemplate="No rows yet."
      />
    </div>
  );
}

function useWide(): boolean {
  const [wide, setWide] = useState(() => matchMedia(WIDE).matches);
  useEffect(() => {
    const m = matchMedia(WIDE);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

function Caption({ rows, note }: { rows: HoodRow[]; note?: ReactNode }) {
  const kind = rows.some((r) => r.kind === "live") ? "live" : "recorded";
  return (
    <div className="hood-caption">
      <p className="hood-sum">Every step as the ledger wrote it: who proposed it, what code decided and why, and each PayPal call by its real name.</p>
      <p className="hood-meta">
        <Provenance kind={kind} />
        <span className="figure">{rows.length} {rows.length === 1 ? "row" : "rows"}</span>
        <span>Built with AG Grid</span>
      </p>
      {note ? <p className="hood-note">{note}</p> : null}
    </div>
  );
}

export function HoodDrawer({ rows, open, onToggle, note }: { rows: HoodRow[]; open: boolean; onToggle(): void; note?: ReactNode }) {
  const wide = useWide();
  // Rows are only added: a stable array per content, so the grid sees appends, never a reset.
  const data = useMemo(() => rows, [rows]);

  if (!wide) {
    return (
      <Sheet open={open} onClose={() => { if (open) onToggle(); }} title="Under the hood">
        <Caption rows={data} note={note} />
        {open ? <Grid rows={data} /> : null}
      </Sheet>
    );
  }
  if (!open) {
    return (
      <aside className="hood hood-closed" aria-label="Under the hood">
        <button type="button" className="hood-tab" onClick={onToggle} aria-expanded="false">
          <span>Under the hood</span><span className="figure">{data.length}</span>
        </button>
      </aside>
    );
  }
  return (
    <aside className="hood" aria-labelledby="hood-h">
      <header className="hood-head">
        <h2 id="hood-h">Under the hood</h2>
        <button type="button" className="hood-close" onClick={onToggle} aria-expanded="true">Hide</button>
      </header>
      <Caption rows={data} note={note} />
      <Grid rows={data} />
    </aside>
  );
}

/** The same ledger on its own page: the caption and the grid, no drawer around them. */
export function HoodLedger({ rows, note }: { rows: HoodRow[]; note?: ReactNode }) {
  const data = useMemo(() => rows, [rows]);
  return (
    <div className="hood-page-ledger">
      <Caption rows={data} note={note} />
      <Grid rows={data} />
    </div>
  );
}
