// The board's two AG Grid Community tables (Track T), in the ledger's calm Midnight theme: the rule behind each verdict
// (a row picks that rule across the board) and every try, which takes new rows through AG's row ids, so a live row enters
// at the top with the one Enter and the rows under it keep their place in the list. Its own chunk beside the shared AG Grid one, and only on a
// screen wide enough for a table; a phone reads the same rows as lists (threat-widgets.tsx) and never downloads a grid.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, GridApi, ICellRendererParams, IRowNode } from "ag-grid-community";
import { FLOATING_TEXT, ledgerTheme, registerLedgerModules } from "../ledger/gridTheme.ts";
import { ruleFindText, ruleTip, sparkPoints, triesArrived, tryWord, type RuleRow, type Source, type TryRow, type TypeLine } from "./threat-model.ts";
import { sparkWords } from "./threat-words.ts";
import type { AttemptRule, AttemptVerdict } from "./threat-shape.ts";

registerLedgerModules();

/** AG Grid has no prop for a grid's accessible name: name its role="grid" element after the heading above it, as the ledger's does. */
const name = (box: HTMLElement | null, labelledBy: string) => box?.querySelector('[role="grid"], [role="treegrid"]')?.setAttribute("aria-labelledby", labelledBy);

const compact = ledgerTheme.withParams({ rowHeight: 52, headerHeight: 44 });
const roomy = ledgerTheme.withParams({ rowHeight: 64, headerHeight: 44 });


/** One soft gold flash, as a row arrives on the ledger; never under reduced motion. */
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const FLASH = { flashDuration: 700, fadeDuration: 1500 };
/** The row on screen that holds this one: itself, or the nearest group that's open down to it. */
const shownAs = <T,>(node: IRowNode<T>): IRowNode<T> => { let n = node; while (!n.displayed && n.parent && n.parent.level >= 0) n = n.parent; return n; };

const VerdictCell = ({ data }: ICellRendererParams<{ verdict: AttemptVerdict; rule: string; verdictWords?: string }>) => {
  if (!data) return null;
  const words = data.verdictWords ?? tryWord(data);
  return <span className={`tb-v tb-v-${data.verdict}`}><i aria-hidden="true" />{words}</span>;
};

const ruleColumns: ColDef<RuleRow>[] = [
  {
    headerName: "Rule", field: "words", flex: 1, minWidth: 180, sortable: true,
    cellRenderer: ({ data }: ICellRendererParams<RuleRow>) => (data ? <span className="tb-rule-cell"><span>{data.words}</span><span className="tb-rule-by">{data.by} · <code>{data.rule}</code></span></span> : null),
  },
  { headerName: "Verdict", field: "verdict", width: 124, sortable: true, cellRenderer: VerdictCell },
  { headerName: "Tries", field: "count", width: 88, type: "rightAligned", cellClass: "tb-num ag-right-aligned-cell", sortable: true, sort: "desc", sortingOrder: ["desc", "asc"] },
];

/** One object for good, as TRY_DEFAULT_COL below. */
const RULE_DEFAULT_COL = { resizable: false, suppressMovable: true };

export function RuleGrid({ rows, picked, onPick, arrived, labelledBy }: { rows: RuleRow[]; picked: AttemptRule | null; onPick: (r: RuleRow) => void; arrived: ReadonlySet<string>; labelledBy: string }) {
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  const rowClassRules = useMemo(() => ({ "tb-row-on": (p: { data?: RuleRow | undefined }) => p.data?.rule === pickedRef.current }), []);
  const api = useRef<GridApi<RuleRow> | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // The picked row's mark is a class rule on a ref, so a change of pick redraws it without replacing the rows.
  useEffect(() => { api.current?.redrawRows(); }, [picked]);
  // A try just arrived: its row's count flashes. A rule's first try has no row yet, so it waits for the grid to hold one, as TryGrid's does.
  const toFlash = useRef<ReadonlySet<string>>(new Set());
  const flash = useCallback(() => {
    const grid = api.current;
    if (!grid || toFlash.current.size === 0 || still()) return;
    const nodes = [...toFlash.current].map((id) => grid.getRowNode(id)).filter((n) => n !== undefined);
    if (nodes.length === 0) return;
    toFlash.current = new Set();
    requestAnimationFrame(() => grid.flashCells({ rowNodes: nodes, columns: ["count"], ...FLASH }));
  }, []);
  useEffect(() => { toFlash.current = arrived; flash(); }, [arrived, flash]);
  // A new pick moves on to its tries, so the grid lets go of focus; otherwise its redraw takes it back from the heading. Clearing a pick stays put.
  const choose = (grid: GridApi<RuleRow>, row: RuleRow) => { if (pickedRef.current !== row.rule) grid.clearFocusedCell(); onPick(row); };
  return (
    <div className="tb-grid" ref={box}>
      <AgGridReact<RuleRow>
        theme={roomy}
        rowData={rows}
        columnDefs={ruleColumns}
        defaultColDef={RULE_DEFAULT_COL}
        getRowId={(p) => p.data.id}
        tabToNextCell={() => false} // Tab leaves the grid from a cell; arrows move inside it (keyboard-tour)
        domLayout="autoHeight"
        animateRows={false}
        onRowDataUpdated={flash}
        rowClassRules={rowClassRules}
        onRowClicked={(e) => { if (e.data) choose(e.api, e.data); }}
        onCellKeyDown={(e) => { const k = (e.event as KeyboardEvent | undefined)?.key; if ((k === "Enter" || k === " ") && e.data) { e.event?.preventDefault(); choose(e.api, e.data); } }}
        onGridReady={(e) => { api.current = e.api; name(box.current, labelledBy); }}
        onGridPreDestroyed={() => { api.current = null; }}
      />
    </div>
  );
}

const SPARK_W = 180, SPARK_H = 28;
const sparks = ledgerTheme.withParams({ rowHeight: 44, headerHeight: 40 });

/** Community's own sparkline, a tiny SVG in a cell renderer: the same rows and buckets as the board's bars (`typeRows`). */
const SparkCell = ({ data }: ICellRendererParams<TypeLine>) => {
  if (!data) return null;
  const line = sparkPoints(data.bars, SPARK_W, SPARK_H).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`);
  return (
    <svg className="tb-spark" role="img" aria-label={sparkWords(data.bars)} width={SPARK_W} height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}>
      <polygon points={`0,${SPARK_H} ${line.join(" ")} ${SPARK_W},${SPARK_H}`} />
      <polyline points={line.join(" ")} />
    </svg>
  );
};

const SPARK_COLUMNS: ColDef<TypeLine>[] = [
  { headerName: "Trick type", field: "words", flex: 1, minWidth: 180 },
  { headerName: "Tries", field: "count", width: 88, type: "rightAligned", cellClass: "tb-num ag-right-aligned-cell" },
  // `bars` is an array: with no `cellDataType: false`, AG Grid infers an object type and warns (#48) that it has no formatter,
  // a line in the Community ledger's console (the licence-expiry walk, Nov 6).
  { headerName: "Over time", field: "bars", width: 216, sortable: false, cellDataType: false, cellRenderer: SparkCell },
  { headerName: "Set aside", field: "setAside", width: 110, type: "rightAligned", cellClass: "tb-num ag-right-aligned-cell", valueFormatter: (x) => `${Math.round((x.value as number) * 100)}%` },
];

export function SparkGrid({ lines, labelledBy }: { lines: TypeLine[]; labelledBy: string }) {
  const box = useRef<HTMLDivElement>(null);
  return (
    <div className="tb-grid tb-sparks" ref={box} data-sparks={lines.length}>
      <AgGridReact<TypeLine> theme={sparks} rowData={lines} columnDefs={SPARK_COLUMNS} defaultColDef={RULE_DEFAULT_COL} getRowId={(p) => p.data.id} tabToNextCell={() => false} domLayout="autoHeight" animateRows={false} onGridReady={() => name(box.current, labelledBy)} />
    </div>
  );
}

/** Up to this many rows the table is its rows' own height; past it, the frame holds and the rows scroll inside. */
const ROOMY_ROWS = 8;

export const TRY_COLUMNS: ColDef<TryRow>[] = [
  { headerName: "When", field: "when", width: 140, sortable: true, sort: "desc", sortingOrder: ["desc", "asc"], cellClass: "tb-num tb-dim", comparator: (_a, _b, x, y) => (x.data?.at ?? 0) - (y.data?.at ?? 0), ...FLOATING_TEXT },
  { headerName: "Type", field: "typeWords", width: 180, sortable: true, ...FLOATING_TEXT },
  { headerName: "Who", field: "who", width: 200, sortable: true, cellClass: "tb-dim", ...FLOATING_TEXT },
  // The cell says the verdict's words, so the filters read those words, not the record's "set-aside".
  { headerName: "Verdict", field: "verdict", width: 180, sortable: true, cellRenderer: VerdictCell, ...FLOATING_TEXT, filterValueGetter: (p) => p.data?.verdictWords ?? "", getQuickFilterText: (p) => p.data?.verdictWords ?? "", tooltipValueGetter: (p) => (p.data ? ruleTip(p.data) : null), valueFormatter: (p) => p.data?.verdictWords ?? "" },
  { headerName: "Rule", field: "ruleWords", flex: 1, minWidth: 240, sortable: true, cellRenderer: ({ data }: ICellRendererParams<TryRow>) => (data ? <span className="tb-rule-cell"><span>{data.ruleWords}</span></span> : null), ...FLOATING_TEXT, filterValueGetter: (p) => (p.data ? ruleFindText(p.data) : ""), getQuickFilterText: (p) => (p.data ? ruleFindText(p.data) : ""), tooltipValueGetter: (p) => (p.data ? ruleTip(p.data) : null) },
];

export const TRY_COLUMNS_NO_WHO = TRY_COLUMNS.filter((c) => c.field !== "who");
/** One object for good: a new defaultColDef resets the columns, and that redraws them on every arrival (onShown re-renders this). */
const TRY_DEFAULT_COL: ColDef<TryRow> = { resizable: false, suppressMovable: true };
/** AG Grid's own overlay when filters empty the table reads this, not `overlayNoRowsTemplate`. */
const TRY_OVERLAY = { noMatchingRows: { overlayText: "No tries match. Clear the filters." } };

export function TryGrid({ rows, who, fresh, spot, find, onShown, onApi, onOpen, labelledBy }: { onOpen: (r: TryRow) => void; rows: TryRow[]; source: Source; who: boolean; fresh: ReadonlySet<string>; spot: number; find: string; onShown: (on: number, of: number) => void; onApi: (a: GridApi<TryRow> | null) => void; labelledBy: string }) {
  // A row is born with its mark, so its one entrance plays as it arrives; a row already here is never redrawn by an arrival.
  const freshRef = useRef(fresh);
  freshRef.current = fresh;
  const getRowClass = useCallback((p: { data?: TryRow | undefined }) => (p.data && freshRef.current.has(p.data.id) ? "tb-fresh" : undefined), []);
  const box = useRef<HTMLDivElement>(null);
  const api = useRef<GridApi<TryRow> | null>(null);
  // The rows go in once. After that a live try is one transaction, added at the top, and any other change of the list
  // (a view, a filter on the board) replaces it: the grid is told which, not left to work it out from a new array.
  const [firstRows] = useState(rows);
  const held = useRef(rows);
  const arrivals = useRef(0);
  const sync = useCallback((next: readonly TryRow[]) => {
    const grid = api.current;
    if (!grid || held.current === next) return;
    const added = triesArrived(held.current, next);
    held.current = next as TryRow[];
    if (added === null) { grid.setGridOption("rowData", next as TryRow[]); return; }
    if (added.length === 0) return;
    grid.applyTransaction({ add: added, addIndex: 0 });
    arrivals.current += added.length;
    box.current?.setAttribute("data-arrivals", String(arrivals.current));
  }, []);
  useEffect(() => { sync(rows); }, [rows, sync]);
  // Asked to see it: bring the row into the frame, whatever the sort, and play its entrance again where it can be seen.
  useEffect(() => {
    if (spot === 0 || !api.current) return;
    // A frame on, once the filters clearing with this ask have let the row back in (ThreatTries).
    let again = 0;
    const go = requestAnimationFrame(() => {
      // The first of the marked rows in the record's order is the newest.
      let found = false;
      api.current?.forEachNode((node) => {
        if (found || !node.data || !freshRef.current.has(node.data.id)) return;
        found = true;
        // Under groups, the row's groups open first, and the grid draws them a frame on.
        for (let up = node.parent; up && up.level >= 0; up = up.parent) up.setExpanded(true);
        again = requestAnimationFrame(() => api.current?.ensureNodeVisible(node, "top"));
      });
      api.current?.redrawRows();
    });
    return () => { cancelAnimationFrame(go); if (again) cancelAnimationFrame(again); };
  }, [spot]);
  // A row just arrived, or the one someone came here to see: its cells flash. A new row isn't in the grid yet when this runs,
  // so it waits for the grid's own word that it holds the rows (`onRowDataUpdated`); a row asked for again is there already.
  const toFlash = useRef<ReadonlySet<string>>(new Set());
  const flash = useCallback(() => {
    const grid = api.current;
    if (!grid || toFlash.current.size === 0 || still()) return;
    const nodes = [...toFlash.current].map((id) => grid.getRowNode(id)).filter((n) => n !== undefined);
    if (nodes.length === 0) return;
    toFlash.current = new Set();
    // A try that landed inside a closed group flashes the group it's in, or nobody would ever see it arrive.
    const seen = new Set(nodes.map(shownAs));
    requestAnimationFrame(() => grid.flashCells({ rowNodes: [...seen], ...FLASH }));
  }, []);
  // Each row once, as it arrives; asked to see it, again.
  const flashed = useRef(new Set<string>());
  const asked = useRef(spot);
  useEffect(() => {
    const again = asked.current !== spot;
    asked.current = spot;
    const ids = [...fresh].filter((id) => again || !flashed.current.has(id));
    for (const id of ids) flashed.current.add(id);
    toFlash.current = new Set(ids);
    flash();
  }, [fresh, spot, flash]);
  return (
    <div className={rows.length > ROOMY_ROWS ? "tb-grid tb-grid-tries" : "tb-grid"} ref={box}>
      <AgGridReact<TryRow>
        theme={compact}
        domLayout={rows.length > ROOMY_ROWS ? "normal" : "autoHeight"}
        rowData={firstRows}
        columnDefs={(who ? TRY_COLUMNS : TRY_COLUMNS_NO_WHO) as ColDef<TryRow>[]}
        defaultColDef={TRY_DEFAULT_COL}
        getRowId={(p) => p.data.id}
        tabToNextCell={() => false} // Tab leaves the grid from a cell; arrows move inside it (keyboard-tour)
        getRowClass={getRowClass}
        animateRows={!still()}
        quickFilterText={find}
        tooltipShowDelay={250}
        overlayComponentParams={TRY_OVERLAY}
        onRowDataUpdated={flash}
        // Tries, never rows on screen: under groups those are heads, and a closed group hides tries no filter took.
        onModelUpdated={(e) => { let of = 0, on = 0; e.api.forEachNode((n) => { if (n.data) of++; }); e.api.forEachNodeAfterFilter((n) => { if (n.data) on++; }); onShown(on, of); }}
        onRowClicked={(e) => { if (e.data) onOpen(e.data); }}
        onCellKeyDown={(e) => { const k = (e.event as KeyboardEvent | undefined)?.key; if ((k === "Enter" || k === " ") && e.data) { e.event?.preventDefault(); onOpen(e.data); } }}
        onGridReady={(e) => { api.current = e.api; onApi(e.api); name(box.current, labelledBy); sync(rows); }}
        onGridPreDestroyed={() => { api.current = null; onApi(null); }}
      />
    </div>
  );
}
