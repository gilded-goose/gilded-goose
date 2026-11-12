# AG Grid, AG Charts and AG Studio: what the live site really uses

Rule for this list (Nov 12): it is the only thing we are allowed to claim about AG. Read from the code at commit `61a35a43`
(paths are under `web/src/` unless they start with `server/`, `core/`, `web/` or `scripts/`), and checked against the live site on
Nov 12 with a headless browser doing GET requests and ordinary clicks only (no POST was sent). Where the code and the live page
could differ, the row says so. If a feature is configured but never visible, it says that too.

Live address of each page: Shop `https://gilded-goose.onrender.com/goose.html#/shop`, Under the hood / Behind the scenes
`https://gilded-goose.onrender.com/goose.html#/under-the-hood` (**not** `#/hood`: that hash is not a route and shows the home page;
`web/src/site/route.ts:3`), Proof `#/proof`, Builders `#/builders`. The older Desk pages open at `/?desk=1` (`/?desk=ledger` opens the
same Behind the scenes board). The site has no sign-in anywhere, so "without signing in" means "any visitor".

## 1. The packages and the licence

| Package | Version | Where | Licence tier in use |
|---|---|---|---|
| `ag-grid-community`, `ag-grid-react` | 36.2.0 | `web/package.json:26-27` | Community (MIT). No Grid Enterprise package or key of ours: `core/test/no-enterprise.test.ts:20-34` fails the build if any source imports `ag-grid-enterprise` or `ag-charts-enterprise`, if a package of ours depends on them, or if a build reads `VITE_AG_GRID_LICENSE`. |
| `ag-charts-community`, `ag-charts-react` | 14.2.0 | `web/package.json:24-25` | Community (MIT), same test. |
| `ag-studio`, `ag-studio-react` | 3.0.0 | `web/package.json:28-29` | Licensed: a Studio key, built in from `VITE_AG_STUDIO_LICENSE` (`web/vite.config.ts:34,49`; `render.yaml:57`), passed to `AgStudioProvider` at `studio/Studio.tsx:471`. Studio's own package carries its Enterprise code inside its own chunks; that is the only place Enterprise code may be (`core/test/no-enterprise.test.ts:2-3`). The key is never printed or committed. |

**Trial-expiry gate.** `core/src/view/studio-gate.ts` decides at runtime, against the clock, whether Behind the scenes mounts AG Studio:
only with a valid, unexpired key (`studioAllowed`, line 111; `STUDIO_DEFAULT = true`, line 76; Studio is switched off from the start of the day
the key's printed expiry names, `licenceEnds`, line 61). The facts come from AG's own licence manager at build time
(`web/studio-licence.ts:13-22`, which also throws on a build if AG changes that call's shape). `studio/pick.ts:11` runs the gate: Studio when
allowed, otherwise the Community-only ledger `SessionLedger.tsx` (so a lapsed key shows no AG watermark or banner). `?studio=force` opens
Studio on a good key anywhere and on a developer's own machine; it does nothing for a public visitor with no key (`studio-gate.ts:111-113`).
The Studio key is a trial that ends December 20, 2026, after judging (Joshua's note of Nov 5; the date lives in that note and the key, not in code we can quote). **Live check (Nov 12):** Behind the scenes opens in AG Studio; the page text shows no trial or watermark wording.

Registered modules. Grid, shared (`ledger/gridTheme.ts:38-41`): ClientSideRowModel, ClientSideRowModelApi, RowApi, RowStyle, CellStyle, QuickFilter,
ExternalFilter, PinnedRow, HighlightChanges, RenderApi, ScrollApi, TextFilter, Tooltip; plus RowAutoHeight (`site/hood/Drawer.tsx:18`,
`site/shop/CompareGrid.tsx:14`); the Desk's older ledger registers its own set with RowSelection (`LedgerGrid.tsx:16-18`). Charts
(`charts/Chart.tsx:17`): CartesianChart, PolarChart, AreaSeries, BarSeries, DonutSeries, LineSeries, CategoryAxis, NumberAxis, CrossLines, Legend
(`haggle/Ladder.tsx:16` a smaller set). Studio: `AgStudioAiModule` (`studio/Studio.tsx:471`).

## 2. Features that are used

"Visible" = a visitor with no sign-in sees it without our help. Phone = under about 768 px: the board and ledger show lists, not grids
(`studio/ThreatGrid.tsx:3-4`, `SessionLedger.tsx:10`), so the grid rows below are desktop and tablet unless a row says otherwise.

### AG Grid Community

| AG feature (the vendor's term) | What it does on our site | Where a visitor sees it | File:line | Visible without signing in |
|---|---|---|---|---|
| Client-side row model, `AgGridReact` | Every table below. Lazy chunks: no grid loads on a first screen. | all rows below | `site/shop/CompareGrid.tsx:4,76`; `site/hood/Drawer.tsx:7,108`; `studio/ThreatGrid.tsx:7,70,118,210`; `ledger/LedgerTable.tsx:11,97`; `ledger/MerchantGrid.tsx:5,33`; `LedgerGrid.tsx:7,107` | Yes, see each row |
| Theming API: `themeQuartz.withParams` | One calm "Midnight" grid theme (`ledgerTheme`), restyled with the site's own colours and type for Shop, Under the hood and the merchant table. | every grid | `ledger/gridTheme.ts:19-31`; reused `site/hood/Drawer.tsx:23`, `site/shop/CompareGrid.tsx:19`, `ledger/MerchantGrid.tsx:13`, `studio/ThreatGrid.tsx:19-20,91` | Yes |
| Sorting (`sortable`, `sort`, `sortingOrder`, custom `comparator`) | Click a column head to sort "The rule behind each verdict" (Rule, Verdict, Tries; Tries sorts descending first) and "Every try" (When, Type, Who, Verdict, Rule). The ledger and Shop grids are deliberately not sortable (`sortable: false`). | Under the hood, "The rule behind each verdict" and "Every try" | `studio/ThreatGrid.tsx:37-41,127-132`; off in `site/hood/Drawer.tsx:79`, `site/shop/CompareGrid.tsx:67`, `ledger/LedgerTable.tsx:72`. The Desk's "Every decision" grid sorts by default (`sortable: true`, `LedgerGrid.tsx:83`, `#` column `sort: "asc"` `:61`) | Yes. **Live check:** clicking the Type head set `aria-sort="ascending"` |
| Text Filter with floating filters (`agTextColumnFilter`, `floatingFilter`) | A filter box under each column head of "Every try": When, Type, Who, Verdict, Rule (Who only where the source has two answers). | Under the hood, "Every try" | `ledger/gridTheme.ts:17` (`FLOATING_TEXT`); `studio/ThreatGrid.tsx:127-132` | Yes. **Live check:** 5 floating filter inputs rendered |
| Quick Filter (`quickFilterText`, `getQuickFilterText`) | The "Filter these tries" search box filters "Every try" across columns, using the words the cells show (so "set aside" finds it). The Desk's ledger and the fallback ledger search the same way. | Under the hood, "Every try" (the box above the grid). Phones filter their list with the same box, not the grid. | `studio/ThreatGrid.tsx:220` (grid), `:131-132` (what it reads); box at `studio/threat-widgets.tsx:550-552`. Desk ledger `LedgerGrid.tsx:119`; fallback ledger `SessionLedger.tsx:451`, `ledger/LedgerTable.tsx:36-64` | Yes (the box is on the page) |
| External Filter (`isExternalFilterPresent`, `doesExternalFilterPass`) | Chip filters (layer, actor) narrow the ledger rows. | The Desk's "Every decision" (`/?desk=1`, after a run starts). Also the Community fallback ledger. | `LedgerGrid.tsx:120-121`; `SessionLedger.tsx:453-454` | Desk: after starting a run (a POST). Fallback ledger: not shown while the Studio key is valid (see section 3) |
| Custom cell renderers (`cellRenderer`, React) | The Watcher's verdict stamp in Shop's compare (a "stamp" column), the verdict word on every try, Who/What/Did/Amount/Why cells with the PayPal mark, the SVG sparkline cell, the refusal stamp. | Shop compare; Under the hood grids | `site/shop/CompareGrid.tsx:31-59,63-65` (`Stamp`); `studio/ThreatGrid.tsx:29-33,94-110`; `site/hood/Drawer.tsx:34-53`; `ledger/LedgerTable.tsx:36-66`; `LedgerGrid.tsx:37-47` | Yes (Shop compare after a run) |
| Row styling (`rowClassRules`, `getRowClass`, `getRowStyle`) | Rows tinted: Goose's pick, set aside, over the limit (Shop); picked rule; skipped/week rows (ledgers). | Shop compare; Under the hood | `site/shop/CompareGrid.tsx:90-98`; `studio/ThreatGrid.tsx:50,145`; `ledger/LedgerTable.tsx:74-78`; `LedgerGrid.tsx:29-35,118` | Yes |
| Row IDs (`getRowId`) | Every grid tracks rows by id, so an arriving row is added, not redrawn. | all grids | `site/shop/CompareGrid.tsx:83`; `site/hood/Drawer.tsx:80,113`; `studio/ThreatGrid.tsx:75,118,216`; `ledger/LedgerTable.tsx:101`; `ledger/MerchantGrid.tsx:37` | Yes |
| Row transactions (`applyTransaction`, sync) | A live try enters "Every try" at the top as one transaction; the fallback ledger streams a visitor's own rows in through transactions. `applyTransactionAsync` is not used. | Under the hood, "Every try" (when a try lands while the board is open) | `studio/ThreatGrid.tsx:160`; `SessionLedger.tsx:151,188,206,210,458` | Yes for a new try if one lands while you watch; most visits see only the rows already there. Fallback ledger: not shown while the Studio key is valid |
| Live updates by row data (`rowData` with `getRowId`) | Shop's compare and the Under the hood drawer take a new `rowData` array; AG adds or moves only the changed rows (`animateRows`). `setGridOption("rowData")` is used for a changed view on "Every try". | Shop compare (after a finished run); the drawer beside a Shop run | `site/shop/CompareGrid.tsx:79-85`; `site/hood/Drawer.tsx:110-119`; `studio/ThreatGrid.tsx:158` | Shop compare after a run (a POST); the drawer on any Shop run |
| Animated rows (`animateRows`) and change flash (`flashCells`) | Rows glide to a new rank; a new row flashes gold once (never under reduced motion). | Shop compare; the Shop drawer; Under the hood grids | `site/shop/CompareGrid.tsx:85`; `site/hood/Drawer.tsx:104,117`; `studio/ThreatGrid.tsx:63,195,219`; `SessionLedger.tsx:140` | Shop: after a run; Under the hood: when a row arrives |
| Row auto-height (`autoHeight`, `wrapText`, `RowAutoHeightModule`) | Rows grow to fit the Watcher's reason and the seller's quoted note. | Shop compare; the drawer | `site/shop/CompareGrid.tsx:63`; `site/hood/Drawer.tsx:71,76-77` | As above |
| Full-width rows (`isFullWidthRow`, `fullWidthCellRenderer`) | "Your limit $60" is ruled as a full-width row between the sellers under and over it. | Shop compare | `site/shop/CompareGrid.tsx:87-88` | After a run (a POST) |
| Pinned row (`pinnedBottomRowData`, `PinnedRowModule`) | A totals row (spent, set aside, kept) pinned under the session's ledger. **Pinned columns: not used.** | The fallback Community ledger only | `SessionLedger.tsx:298,449` | **No while the Studio key is valid.** Configured; it shows only if Studio is off (key missing or past its date) |
| Tooltips (`tooltipValueGetter`) | The rule behind a verdict, in a tooltip on the Verdict and Rule cells. | Under the hood, "Every try"; the merchant table (cart id) | `studio/ThreatGrid.tsx:131-132`; `ledger/MerchantGrid.tsx:24` | Yes |
| Row click / keyboard open (`onRowClicked`, `onCellKeyDown`) | A row opens its full story in a side sheet (Enter or Space too). | Under the hood, "Every try", "The rule behind each verdict", "Every row" | `studio/ThreatGrid.tsx:81-82,226-227`; `ledger/LedgerTable.tsx:108-112` | Yes |
| Row selection (`rowSelection`) | The Desk ledger's picked row is selected and kept in view. | The Desk's "Every decision" | `LedgerGrid.tsx:122` | After a Desk run (a POST) |
| Auto-height layout (`domLayout`) | Grids are as tall as their rows (`autoHeight`) or hold a frame and scroll inside (`normal`) past 8 rows. | all | `studio/ThreatGrid.tsx:212`; `site/shop/CompareGrid.tsx:84` | Yes |
| Overlay text (`overlayNoRowsTemplate`, `overlayComponentParams`) | Own words for "No rows match", "No tries match". | when a filter empties a grid | `ledger/LedgerTable.tsx:28-30`; `studio/ThreatGrid.tsx:139,222` | Yes (type a filter that matches nothing) |
| Accessibility options | Grid named by its heading (`aria-labelledby`); Tab leaves a grid from a cell (`tabToNextCell`); every row stays in the page for a screen reader (`ensureDomOrder`, `suppressRowVirtualisation`); sortable heads carry `aria-sort`. | all grids | `studio/ThreatGrid.tsx:17,76,83`; `ledger/LedgerTable.tsx:103,113-117`; `LedgerGrid.tsx:114,128-129` | Yes |
| Column options | Fixed widths, `flex`, `hide` per width, `type: "rightAligned"`, `valueFormatter`, `valueGetter`, `cellDataType: false`, no resize or move (`resizable: false`, `suppressMovable`). | all | `ledger/LedgerTable.tsx:35-72`; `site/shop/CompareGrid.tsx:61-67`; `studio/ThreatGrid.tsx:105-112` | Yes |

### AG Charts Community

| AG feature | What it does on our site | Where a visitor sees it | File:line | Visible without signing in |
|---|---|---|---|---|
| `AgCharts` (React) with the shared theme `AgChartTheme` | One chart canvas for every Goose chart, themed to the site. | Under the hood board | `charts/Chart.tsx:10,75`; `charts/theme.ts:69` | Yes. **Live check:** 20 chart elements on the page |
| Stacked bar series | "Tries over time, by type" (caught, rest, paid); clickable bars (`seriesNodeClick`). | Under the hood | `studio/threat-widgets.tsx:163-178` | Yes |
| Bar series (horizontal or vertical) | "Tries by type". | Under the hood | `studio/threat-widgets.tsx:215-228` | Yes |
| Stacked area series | Tries by verdict over time. | Under the hood | `studio/threat-widgets.tsx:243-255` | Yes |
| Donut series | The verdict split (`innerRadiusRatio` 0.72). | Under the hood | `studio/threat-widgets.tsx:267-275` | Yes |
| Line series with `crossLines` | The haggle's price ladder: each seller's ask round by round, your limit as a dashed line. | The Studio "The haggle's price ladder" card; the Desk's haggle page | `haggle/Ladder.tsx:60-72`; card `studio/widgets/index.tsx:25,325` | Studio card: yes (Under the hood). Desk haggle: `/?desk=1`, after a run |
| Ledger charts (money, sellers, checks), spend-against-limit | Small charts over a visitor's own session rows. | Fallback ledger and the Studio cards (the spend card) | `ledger/Charts.tsx:53-79`; `ledger/Bars.tsx:9,144`; `charts/SpendLimits.tsx` | Spend card: yes. Session charts: need session rows; fallback only |
| **Sparkline** (own SVG, not AG) | A "Tries by type, over time" mini-line in each row of a grid. This is a small SVG drawn in a Grid cell renderer. **It is not AG Charts Sparklines.** | Under the hood | `studio/ThreatGrid.tsx:93-110`; used `studio/threat-widgets.tsx:546` | Yes on screens wide enough for the grid. **Live check:** an "Over time" head rendered. Do not call it an AG sparkline |

### AG Studio (licensed; Behind the scenes)

| AG feature | What it does on our site | Where a visitor sees it | File:line | Visible without signing in |
|---|---|---|---|---|
| `AgStudio` dashboard (`AgStudioProvider`, `AgStudio`, `createWidgets`) | Under the hood opens as one Studio dashboard: custom widgets for the Live Threat Board and Goose's ledger cards, beside Studio's own. | Under the hood: `#/under-the-hood`, also `/?desk=ledger` | `studio/Studio.tsx:17,371,471-482`; card list `studio/widgets/index.tsx:323-339` | Yes while the key is valid. **Live check:** 383 Studio elements, 7 grids |
| Custom widgets (`additionalTypes`) | Six Goose cards (week, set aside, haggle ladder, spending, what PayPal confirmed, every row) plus the board's count, time, rules and tries. | Under the hood | `studio/widgets/index.tsx:323-339`; `studio/widgets/threat.tsx:81-86`; `studio/Studio.tsx:371` | Yes |
| **Pivot Table** (`pivot-grid`) | Two Studio pivot tables over the board's tries: "Trick type, rule and verdict" (rows type, rule, verdict; values tries as a sum, set-aside rate as an average; grand-total row) and "Tries by day" (trick type by day, with total columns). A phone gets one, trimmed. | Under the hood | `studio/widgets/threat.tsx:55-71`; data and fields `studio/data.ts:67-87`; `studio/Studio.tsx:134-135,411-418` | Yes. **Live check:** 2 pivot widgets rendered |
| Data sources and fields (`AgDataSourcesDefinition`) | The ledger and two try sources ("Real tries", "Seeded demo week") with typed fields (text, integer, currency, percentage, boolean). | Under the hood, in "Edit this view" (Data panel) | `studio/data.ts:12,89-110` | Yes via "Edit this view" |
| View and edit modes, panels (`mode`, `panels`) | View mode by default; "Edit this view" lets a visitor move, resize, add and remove widgets in their own browser (nothing saved to the server). Edit shows Compose, Data and Filters panels. | Under the hood: "Edit this view" | `studio/Studio.tsx:370,472-476` | Yes. **Live check:** the Compose panel listed Studio's stock charts (column, bar, line, area, scatter, radial, funnel, treemap), Table, Pivot Table, KPI, gauges and Button/List/Date filters beside the Goose cards |
| Theming (`studioTheme.withParams`) | The Midnight theme, with an ink-first chart palette. | Under the hood | `studio/theme.ts:7,10,95` | Yes |
| Custom words (`localeText`) | A pivot's head reads "Tries", not "Tries (sum)". | Under the hood | `studio/Studio.tsx:135,478` | Yes |
| **AI / "Ask for a view"** (`AgStudioAiModule`, `createAiHarness`, `directLlmRunner`) | A box takes plain English ("Show me everything Goose blocked this week") and Studio's agent adds or points to a view. One agent of ours (`goose-view`, 8 turns max) with seven view tools only (view schema, view page, execute query, add widget, position widget, page filter, widget filter); the page's `add_widget` shows a card that is already on the page instead of adding a second. | Under the hood, "Ask" box under the board with three starter chips | `studio/ai.ts:8,71-114,126-189`; starters `studio/words.ts:43-47`; mounted `studio/Studio.tsx:18,471` | Yes (the box and chips are visible; asking sends a POST). Asking calls the model below |
| Where the ask goes | The browser's agent posts each turn to our server at `POST /api/view`. The server allows only the eight view tool names, drops any other call, keeps its own system prompt, and caps use (60 a browser, 70 a network address, 100 a day by default, shared with the judge caps). The model is Claude Haiku 5.5 (`claude-haiku-5-5`, the buyer model's name). With no key, or past a cap, or on a model error, a fixed page rule answers and says "No AI call". | server | `studio/ai.ts:14,82`; `server/src/main.ts:1610-1613`; `server/src/view.ts:2-5,376`; `server/src/adapters/claude.ts:11,421-428` | Yes, with the caps above |
| Keyboard order and names for cards | Studio cards get a name and role for a screen reader; Tab steps through the card's own buttons and rows. | Under the hood | `studio/Studio.tsx:46-57`; `studio/plain-tabs.ts` | Yes |

### Our own code around AG, not AG's feature

| Feature | What is true | File:line |
|---|---|---|
| **CSV export** | Our own writer builds the file and a button saves it. AG Grid's `exportDataAsCsv` is **not called anywhere**. The board's "Download these rows" saves `goose-real-tries.csv` (live check: the file name was `goose-real-tries.csv`); the fallback ledger saves its own CSV. | `studio/threat-widgets.tsx:488,533`; `studio/threat-model.ts:341-350`; `SessionLedger.tsx:319-325` |
| **Excel export** | The "As Excel" button saves a real `.xlsx` that our own small zip-and-XML writer builds, with no library and no licence. AG Grid's `exportDataAsExcel` (an Enterprise feature) is **not used**. Live check: `goose-real-tries.xlsx`. | `studio/xlsx.ts:1-4,59`; `studio/threat-widgets.tsx:490-493,534`; label `studio/threat-words.ts:69-70` |

## 3. NOT used (do not claim)

The code has no use of these. Each was searched for in `web/src` and `server/src`.

- **AG Grid's own CSV or Excel export** (`exportDataAsCsv`, `exportDataAsExcel`): not called. The CSV and Excel files are ours, described above.
- **AG Grid Enterprise of our own** (any Enterprise module, Side Bar, Status Bar, Set Filter, Integrated Charts, `enableCharts`): none; the repo fails its own test if one appears.
- **Row grouping, pivot mode and aggregation in AG Grid** (`rowGroup`, `pivotMode`, `aggFunc`, `treeData`): not in our Grid code. The only pivots are **AG Studio's own Pivot Table widgets**, listed above.
- **`applyTransactionAsync`**: not used; only the synchronous `applyTransaction`.
- **Column state** (`getColumnState`, `applyColumnState`, saved or restored layouts): not used. Columns are fixed and not movable or resizable.
- **Pinned columns** (`pinned`, `lockPinned`): not used. A pinned **bottom row** exists in the fallback ledger only.
- **AG Charts Sparklines** (`AgSparklines`, a `sparkline` cell renderer): not used. Our sparkline is a small SVG in a cell renderer.
- **AG Charts Enterprise** (and anything needing it): not used.
- **Grid Master/Detail, row dragging, cell editing, clipboard and range selection:** not used (the grids are read-only; no `editable`).
- **Serverside or infinite row models:** not used; the client-side row model only.
- **A Grid key.** There is none: we hold a Studio key only.
- **Any AG feature behind a sign-in.** There is no sign-in on the site.

## 4. For the film: what can be captured with GET-only browsing and ordinary visitor clicks

Verified live on Nov 12 at 1440 x 900, with the browser sending no non-GET request. Starting a Shop run, asking for a view and asking
Goose anything send a POST (a run, or `/api/view`); those are marked.

1. **AG Studio dashboard.** Open `https://gilded-goose.onrender.com/goose.html#/under-the-hood`. Wait about 5 seconds for the board.
2. **Pivot tables (AG Studio).** Scroll down on the same page to the two cards titled "Trick type, rule and verdict" and "Tries by day".
3. **AG Charts.** On the same page, the cards "Tries over time, by type" and the donut; the haggle card "How did the haggle go, round by round?" is the line chart with the dashed limit.
4. **Sorting.** In "Every try", click the "Type" head once: it sorts ascending. Click "When" for newest first. In "The rule behind each verdict", click "Rule" or "Verdict".
5. **Filtering.** In "Every try", click into a filter box under a head (When, Type, Who, Verdict, Rule) and type; or type in "Filter these tries" above the grid (the quick filter), for example `gift card`.
6. **Custom verdict stamps (cell renderers).** The Verdict column in "Every try" carries the verdict word with its mark. The Watcher's stamp column in Shop's compare needs a run (POST).
7. **Sparklines.** In the "Tries by type" grid, the "Over time" column (a small SVG, not AG Sparklines).
8. **Download.** Click "Download these rows" (saves `goose-real-tries.csv`) or "As Excel" (saves `goose-real-tries.xlsx`). For the film, call these "download" buttons; do not call them AG Grid's export.
9. **Edit this view.** Click "Edit this view" above the board: the Compose, Data and Filters panels open, with Studio's stock charts, Table, Pivot Table and filters beside the Goose cards. (Edits stay in the browser.)
10. **Ask for a view.** The "Ask" box and three chips ("Everything Goose blocked", "What you paid", "The haggle") are visible; pressing one sends a POST to `/api/view` and calls the model or, past a cap, the page rule. Not GET-only.
11. **The ledger grid (Grid with cell renderers and animated rows).** Scroll to "The ledger" at the bottom of the page (the recorded week's rows). In Shop, open the drawer (`#/shop`, "Under the hood" toggle) to see the same grid with a run's rows arriving; starting a run is a POST.
12. **Shop's compare grid.** `#/shop`, then start an ask (a POST that starts a run); the ranked compare with stamps, the limit line and the pick appears when the run finishes.

What the live page cannot show without a visitor's own help: a live row arriving by transaction (needs a try to land), the Desk's "Every decision" grid (`/?desk=1`, needs a run), and the fallback ledger with its pinned totals row (hidden while the Studio key is valid).

## 5. Doubts and limits of this list

- The live page was read on Nov 12 at about 2 AM. It may be an older build than `61a35a43`; the file:line references are the commit's, the "live check" lines are the live page's.
- "Real tries" counts on the live page change with every visitor; this file quotes no count.
- A Studio card's insides (its own panels, menus, stock charts) are AG Studio's code, not ours; we claim only that Studio hosts them.
- The Studio key's end date is in Joshua's Nov 5 note, not in the repo; the gate switches Studio off from the start of that date.
