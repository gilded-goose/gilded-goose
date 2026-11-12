// The Live Threat Board as AG Studio custom widgets (Track T; Joshua's Tier 2b): the same four components the plain page
// draws (threat-widgets.tsx), in Studio's frames, so a visitor in edit mode can move, resize or add them, and Studio's Data
// panel can chart the two attempt sources. Their own list beside `gooseWidgets`: the six ledger widgets are the ones the
// ask agent may add (server/src/view.ts holds that list to them), with the three charts of the tries; the board's other views are read by the fixed rule.
// Nothing here can pay, approve, change a limit or write a row: they only read the board.

import { useEffect, type ReactNode } from "react";
import type { AgWidgetParams } from "ag-studio";
import type { AgWidgetDefinition } from "ag-studio-react";
import { ThreatCounter, ThreatRules, ThreatTimeline, ThreatTries, ThreatViewLine, TriesChart } from "../threat-widgets.tsx";
import type { Source } from "../threat-model.ts";

function Frame({ widgetApi, widgetId, className, children }: AgWidgetParams & { className: string; children: ReactNode }) {
  useEffect(() => { widgetApi.setDisplayState("displayed"); }, [widgetApi]);
  return <div className={`st-card ${className}`} data-widget-id={widgetId}>{children}</div>;
}

const Counter = (p: AgWidgetParams) => <Frame {...p} className="tb-w-counter"><ThreatCounter /><ThreatViewLine said="" /></Frame>;
const Time = (p: AgWidgetParams) => <Frame {...p} className="tb-w-time"><ThreatTimeline /></Frame>;
const Rules = (p: AgWidgetParams) => <Frame {...p} className="tb-w-rules"><ThreatRules /></Frame>;
const Tries = (p: AgWidgetParams) => <Frame {...p} className="tb-w-tries"><ThreatTries /></Frame>;
const ByType = (p: AgWidgetParams) => <Frame {...p} className="tb-w-by"><TriesChart by="type" /></Frame>;
const ByDay = (p: AgWidgetParams) => <Frame {...p} className="tb-w-by"><TriesChart by="day" /></Frame>;
const ByVerdict = (p: AgWidgetParams) => <Frame {...p} className="tb-w-by"><TriesChart by="verdict" /></Frame>;

const ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/></svg>';

const widget = (id: string, label: string, comp: (p: AgWidgetParams) => ReactNode, defaultSize: { width: number; height: number }, minSize: { width: number; height: number }, description: string): AgWidgetDefinition<never> => ({
  id, label, comp, icon: ICON, defaultSize, minSize,
  form: (p: { createDefaults: (x: object) => unknown }) => p.createDefaults({}),
  ai: { description },
} as unknown as AgWidgetDefinition<never>);

export const threatWidgets = [
  widget("goose-threat-counter", "Live threat board: the count", Counter, { width: 24, height: 22 }, { width: 12, height: 16 }, "How many real tries at tricking Goose there have been and how many got it to pay, from the stored rows, with the seeded demo week apart."),
  widget("goose-threat-time", "Tries over time, by type", Time, { width: 14, height: 36 }, { width: 10, height: 24 }, "Attempts over time, one row per kind of trick, on one scale."),
  widget("goose-threat-rules", "The rule behind each verdict", Rules, { width: 10, height: 36 }, { width: 8, height: 16 }, "Each rule that answered a try, who decided, the verdict and how many."),
  widget("goose-threat-tries", "Every try", Tries, { width: 24, height: 38 }, { width: 12, height: 20 }, "Every try as a table: when, type, verdict, rule, and who decided. Never the note's words."),
  // The ask box's charts of the tries. They need no configuration: the page lists no tool that could fill a stock chart (ai.ts).
  widget("goose-tries-type", "Tries by type", ByType, { width: 24, height: 24 }, { width: 10, height: 16 }, "A bar chart of the tries in view, one bar per kind of trick."),
  widget("goose-tries-day", "Tries by day", ByDay, { width: 24, height: 24 }, { width: 10, height: 16 }, "A bar chart of the tries in view, one bar per day, quiet days too."),
  widget("goose-tries-verdict", "Tries by verdict", ByVerdict, { width: 24, height: 24 }, { width: 10, height: 16 }, "A bar chart of the tries in view, one bar per verdict."),
];

const SOURCE_ID: Record<Source, string> = { real: "threat-real", demo: "threat-seeded" };
const SOURCE_NAME: Record<Source, string> = { real: "Real tries", demo: "Seeded demo week" };

/**
 * AG Studio's own pivot tables over the board (Joshua's AG Grid item 1): trick type, then rule, then verdict, with counts and
 * set-aside rates, and the same tries by day. Built-in widgets, so Studio's licence covers them. Each reads one source and
 * says which in its title: real tries and the seeded week are never added together. `threat-pivot` and `threat-days` take
 * the desktop's places (layout.ts); a phone has `threat-pivot` alone (Round 6b's AG seat), since `threat-days` is a column
 * a day. Each says under its title that it is Studio's own pivot, so a judge can tell it from the Goose cards around it.
 */
export function threatPivots(source: Source, phone = false) {
  const f = (id: string) => `${SOURCE_ID[source]}.${id}`;
  const tries = { id: f("tries"), aggregation: "sum" };
  const style = { grandTotalRow: { enabled: true, position: "bottom" } };
  const own = (text: string) => ({ text, enabled: true });
  const values = [tries, { id: f("setAside"), aggregation: "avg" }];
  // The phone's: trick type, then verdict (the rules card right above it names each rule), and the tries alone: its rows are
  // the verdicts, so a set-aside rate beside them says nothing new, and the type and its count fit a 360 px phone's card
  // with no sideways scroll inside it (two value columns ran 26-33 px past it at 360 and 390, even at 13 px type).
  const pivot = phone
    ? { "threat-pivot": { type: "pivot-grid", format: { title: own(`Trick type and verdict · ${SOURCE_NAME[source]}`), subtitle: own(PIVOT_WORDS.byTypePhone), style }, dataMapping: { rows: [{ id: f("type") }, { id: f("verdict") }], columns: [], values: [tries] } } }
    : { "threat-pivot": { type: "pivot-grid", format: { title: own(`Trick type, rule and verdict · ${SOURCE_NAME[source]}`), subtitle: own(PIVOT_WORDS.byType), style }, dataMapping: { rows: [{ id: f("type") }, { id: f("rule") }, { id: f("verdict") }], columns: [], values } } };
  return phone ? pivot : {
    ...pivot,
    "threat-days": { type: "pivot-grid", format: { title: own(`Tries by day · ${SOURCE_NAME[source]}`), subtitle: own(PIVOT_WORDS.byDay), style: { ...style, totalColumns: true } }, dataMapping: { rows: [{ id: f("type") }], columns: [{ id: f("day") }], values: [tries] } },
  };
}

/** The line under each pivot's title: what it is (AG Studio's own pivot widget) and what a visitor can do with it. */
export const PIVOT_WORDS = {
  byType: "AG Studio's own pivot table: each trick type, the rules that answered it and their verdicts, with totals.",
  byTypePhone: "AG Studio's own pivot table: each trick type and its verdicts, with totals.",
  byDay: "AG Studio's own pivot table, one column a day, with each trick type's total.",
};

/** The state's widget ids to their types, at the top of the page. */
export const THREAT_WIDGETS = {
  "threat-counter": { type: "goose-threat-counter" },
  "threat-time": { type: "goose-threat-time" },
  "threat-rules": { type: "goose-threat-rules" },
  "threat-tries": { type: "goose-threat-tries" },
};
