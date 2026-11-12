// The ledger grid's look, on its own (Track L), so any page or widget that shows ledger rows (Behind the scenes today,
// an AG Studio widget next) wears the same calm Midnight grid: import `ledgerTheme` and `registerLedgerModules`.
//
// Midnight through AG Grid's Theming API, calmed: the grid is clear so a glass panel behind it shows; only hairlines
// between rows, none between columns; a quiet header (its small caps are ledger.css's `.lx-grid` rules: the API has no
// param for them); fixed 72 px rows, so Why holds to two lines and the side sheet is its expand; the hover a step
// lighter, which ledger.css lifts with a soft shadow; the flash in gold. Colours are midnight.css's tokens, by name; the
// type is the DD's scale by name too (--t-small cells, a --t-micro header at --w-strong: system.md §2, §5), the same
// tokens the shell table (shell.css) reads, so the grid that replaces it changes no size or weight (B-7).

import {
  CellStyleModule, ClientSideRowModelApiModule, ClientSideRowModelModule, ExternalFilterModule, HighlightChangesModule, ModuleRegistry, PinnedRowModule,
  QuickFilterModule, RenderApiModule, RowApiModule, RowStyleModule, ScrollApiModule, TextFilterModule, TooltipModule, themeQuartz,
} from "ag-grid-community";

/** A column's text filter in the row under the header: no menu button, no funnel, and it waits a beat so a long table keeps up with typing. */
export const FLOATING_TEXT = { filter: "agTextColumnFilter", floatingFilter: true, suppressHeaderMenuButton: true, suppressHeaderFilterButton: true, suppressFloatingFilterButton: true, filterParams: { maxNumConditions: 1, debounceMs: 120, filterPlaceholder: "Filter" }, floatingFilterComponentParams: { filterPlaceholder: true } } as const;

export const ledgerTheme = themeQuartz.withParams({
  fontFamily: "var(--lx-face)", fontSize: "var(--t-small)", headerFontSize: "var(--t-micro)", headerFontWeight: "var(--w-strong)", dataFontSize: "var(--t-small)",
  spacing: 8, rowHeight: 72, headerHeight: 44, cellHorizontalPadding: 16, iconSize: 14,
  backgroundColor: "transparent", foregroundColor: "var(--lx-ink)", textColor: "var(--lx-ink)", headerTextColor: "var(--lx-ink-3)",
  headerBackgroundColor: "transparent", chromeBackgroundColor: "transparent", oddRowBackgroundColor: "transparent", borderColor: "var(--lx-edge)",
  rowBorder: { color: "var(--lx-edge)" }, columnBorder: false, headerColumnBorder: false, headerRowBorder: { color: "var(--lx-edge-2)" },
  pinnedColumnBorder: false, pinnedRowBorder: { color: "var(--lx-edge-2)" }, wrapperBorder: false, wrapperBorderRadius: 0,
  accentColor: "var(--lx-ink-2)", rowHoverColor: "var(--lx-hover-glass)", selectedRowBackgroundColor: "transparent", rangeSelectionBorderColor: "var(--lx-ink-2)",
  valueChangeValueHighlightBackgroundColor: "var(--lx-gold-wash)",
  // The filter row under the header and the rule's tooltip, in the same inks: a hairline input, an opaque card.
  inputBackgroundColor: "transparent", inputBorder: { color: "var(--lx-edge-2)" }, inputFocusBorder: { color: "var(--lx-ink-2)" }, inputTextColor: "var(--lx-ink)", inputPlaceholderTextColor: "var(--lx-ink-3)", inputHeight: 44,
  tooltipBackgroundColor: "var(--card)", tooltipTextColor: "var(--lx-ink)", tooltipBorder: { color: "var(--lx-edge-2)" },
});

let registered = false;
/** The Community modules the ledger grid uses (no Enterprise module), registered once. */
export function registerLedgerModules(): void {
  if (registered) return;
  registered = true;
  ModuleRegistry.registerModules([
    ClientSideRowModelModule, ClientSideRowModelApiModule, RowApiModule, RowStyleModule, CellStyleModule, QuickFilterModule, ExternalFilterModule,
    PinnedRowModule, HighlightChangesModule, RenderApiModule, ScrollApiModule, TextFilterModule, TooltipModule,
  ]);
}
