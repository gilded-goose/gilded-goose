// AG Studio in Midnight (Track AS, slice 2; the Design Director's spec, dd/system.md): every colour is a Midnight token by
// role name (midnight.css's `--lx-*`, the back room's aliases of tokens.css), so a palette change is one file and Studio's
// chrome, its grid widgets and its charts all follow. Type sizes are the one scale (`--t-small` 15 for data, `--t-micro`
// 13 for meta); radii the shape scale (`--r-3` 12). Gold is the one accent, for protection and the deal only; blue and
// teal appear nowhere, which is why the palette's second and later series are inks, never AG's defaults.

import { studioTheme, type AgStudioTheme } from "ag-studio";
import { GUTTER_PX } from "./layout.ts";

export const midnightStudio: AgStudioTheme = studioTheme.withParams({
  fontFamily: "var(--lx-face)",
  fontSize: 15,
  backgroundColor: "var(--lx-raised)",
  foregroundColor: "var(--lx-ink)",
  textColor: "var(--lx-ink)",
  subtleTextColor: "var(--lx-ink-3)",
  borderColor: "var(--lx-edge)",
  accentColor: "var(--lx-gold)",
  borderRadius: 8,
  // The page is the canvas: no second frame, no shadow, no border around the dashboard; on a phone it is as wide as
  // the phone (Studio's own minimums would make a 390 px screen scroll sideways).
  studioMinWidth: 0,
  studioCanvasMinWidth: 0,
  studioWrapperBorder: false,
  studioWrapperBackgroundColor: "transparent",
  studioCanvasBorder: false,
  studioCanvasShadow: false,
  studioCanvasBackgroundColor: "transparent",
  studioCanvasPadding: 0,
  // Cards: Midnight's raised surface, one hairline, 12 px corners, no shadow (dd/system.md §5).
  studioWidgetBackgroundColor: "var(--lx-raised)",
  studioWidgetBorder: { width: 1, color: "var(--lx-edge)" },
  studioWidgetBorderRadius: 12,
  studioWidgetPadding: GUTTER_PX / 2, // the gutter: half on each card, so neighbours are one --s-2 apart (layout.ts)
  studioWrapperSpacing: 0, // no page padding: the outer cards sit the half gutter inside the column (was 12 px)
  // Studio's own widgets (its pivot grids) draw their cells in the canvas's face, not `fontFamily`, and AG's default is
  // "Source Sans 3", a face this site never loads, so the pivots fell back to the system sans (Round 6b's AG seat, nit 1).
  studioCanvasFontFamily: "var(--lx-face)",
  studioWidgetTitleFontFamily: "var(--lx-face)",
  studioWidgetTitleFontSize: 17,
  studioWidgetTitleFontWeight: 400,
  studioWidgetTitleTextColor: "var(--lx-ink)",
  studioWidgetSubtitleTextColor: "var(--lx-ink-2)",
  studioWidgetCaptionFontSize: 13,
  studioWidgetCaptionTextColor: "var(--lx-ink-3)",
  // Edit mode's chrome (session 5; the Design Director's flip list, item 1): AG's panels on Midnight's roles. The panel
  // container is a raised surface with one hairline and the card radius; its header reads like a card head; the segmented
  // Widgets/Page control is ink on the hover tone (gold is protection and the deal, never a UI toggle); group and section
  // lines are hairlines; the widget tiles in Compose sit on the page tone with a hairline.
  studioPanelContainerBackgroundColor: "var(--lx-raised)",
  studioPanelContainerBorder: { width: 1, color: "var(--lx-edge)" },
  studioPanelContainerBorderRadius: 12,
  studioPanelDividerWidth: 1,
  studioPanelDividerColor: "var(--lx-edge)",
  studioPanelDividerActiveColor: "var(--lx-ink-3)",
  studioPanelHeaderHeight: 48,
  studioPanelHeaderFontFamily: "var(--lx-face)",
  studioPanelHeaderFontSize: 15,
  studioPanelHeaderFontWeight: 560,
  studioPanelChevronButtonBorderRadius: 8,
  studioPanelChevronButtonHoverBackgroundColor: "var(--lx-hover)",
  studioPanelChevronButtonHoverColor: "var(--lx-ink)",
  studioPanelItemBorderRadius: 8,
  studioPanelSectionBorderColor: "var(--lx-edge)",
  studioPanelGroupBackgroundColor: "transparent",
  studioPanelGroupTitleBarTextColor: "var(--lx-ink-2)",
  studioFormLabelColor: "var(--lx-ink-2)",
  studioFormLabelFontSize: 13,
  studioSearchInputHeight: 44,
  studioWidgetSelectionItemBackgroundColor: "var(--lx-page)",
  studioWidgetSelectionItemBorder: { width: 1, color: "var(--lx-edge)" },
  studioToggleButtonActiveBackgroundColor: "var(--lx-hover)",
  studioToggleButtonActiveBorderColor: "var(--lx-edge-2)",
  studioToggleButtonActiveColor: "var(--lx-ink)",
  // The toolbar that appears over a widget in edit mode, the resize edge and the canvas's drag preview: raised, hairline,
  // no shadow, ink.
  studioWidgetToolbarBackgroundColor: "var(--lx-raised)",
  studioWidgetToolbarBorder: { width: 1, color: "var(--lx-edge)" },
  studioWidgetToolbarShadow: "none",
  studioWidgetToolbarButtonColor: "var(--lx-ink-2)",
  studioWidgetToolbarButtonHoverBackgroundColor: "var(--lx-hover)",
  studioWidgetResizeBorderColor: "var(--lx-ink-3)",
  studioCanvasGridLineColor: "var(--lx-edge)",
  studioCanvasDragPreviewBackgroundColor: "var(--lx-hover)",
  studioCanvasDragPreviewShadow: "none",
  // Studio's own grid widgets (the ones a visitor adds in edit mode): the ledger grid's calm, restated as Studio params.
  gridWrapperBorder: false,
  gridHeaderBackgroundColor: "transparent",
  gridHeaderTextColor: "var(--lx-ink-3)",
  gridRowBorder: { width: 1, color: "var(--lx-edge)" },
  gridColumnBorder: false,
  gridHeaderRowBorder: { width: 1, color: "var(--lx-edge-2)" },
  gridRowHoverColor: "var(--lx-hover)",
  gridRowHeight: 48,
  // Studio's own charts: the first three series are inks (dd/system.md §5: series ink / ink-2 / ink-3), gold fourth and red
  // fifth, so a visitor's chart reaches gold only on its fourth series. The same palette draws the widget icons in the
  // Compose panel (their fills are the first three series), so moving gold to fourth is what made those icons ink, not
  // amber (the Design Director's flip list, item 1). No blue, no teal.
  chartFontFamily: "var(--lx-face)",
  chartTextColor: "var(--lx-ink-2)",
  chartSubtleTextColor: "var(--lx-ink-3)",
  chartAxisLineColor: "var(--lx-edge-2)",
  chartGridLineColor: "var(--lx-edge)",
  chartPaletteFills1Color: "var(--lx-ink)",
  chartPaletteStrokes1Color: "var(--lx-ink)",
  chartPaletteFills2Color: "var(--lx-ink-3)",
  chartPaletteStrokes2Color: "var(--lx-ink-3)",
  chartPaletteFills3Color: "var(--lx-ink-2)",
  chartPaletteStrokes3Color: "var(--lx-ink-2)",
  chartPaletteFills4Color: "var(--lx-gold)",
  chartPaletteStrokes4Color: "var(--lx-gold)",
  chartPaletteFills5Color: "var(--lx-mark)",
  chartPaletteStrokes5Color: "var(--lx-mark)",
});
