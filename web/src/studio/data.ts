// What the dashboard shows, read once and shared with every widget (Track AS, slice 2). Nothing here types a number:
// the rows are core's `sessionRows`/`weekRows` (the same rows as the Community ledger), the week's story is core's
// `weekStory`, the haggle is core's `haggleModel` over the recorded week, spending against limits is D's `spendLimits`
// over the same events and the server's fold. Studio's own flat table (for a widget a visitor adds in edit mode) says
// everything in our words: a kind is "Set aside", not `skipped`; an amount carries its dollar sign; a time is the
// ledger's UTC clock or nothing, never a date made up for a recorded row (N6).

import { createContext, useContext } from "react";
import type { LedgerEvent } from "@goose/core";
import { haggleModel, type HaggleModel } from "@goose/core/haggle";
import type { LedgerRow, WeekStory } from "@goose/core/session";
import type { AgDataSourcesDefinition } from "ag-studio";
import type { FoldWeek, SpendLimitsData } from "../charts/spend.ts";
import { spendLimits } from "../charts/spend.ts";
import { KIND_ONE, timeOf } from "../ledger/marks.tsx";
import { didWords, fromWords, whoWords } from "../ledger/rows.ts";
import { dayKey, dayWords, decidedBy, showsSources, sourceWords, tryWord, whenWords, type Source } from "./threat-model.ts";
import { RULE_WORDS, TYPE_WORDS, type Attempt } from "./threat-shape.ts";

export interface StudioData {
  /** Every ledger row: this session's own (live, newest last), then the demo week's, as the Community ledger orders them. */
  rows: LedgerRow[];
  /** This browser has rows of its own (a session), so times show and the week is a lead, not the whole story. */
  hasSession: boolean;
  /** The recorded week's ticket, day by day (core's `weekStory`). */
  story: WeekStory;
  /** The haggle in the recorded week, round by round. */
  haggle: HaggleModel;
  /** Each paid cart against its category's limit, and the week against the weekly limit (from the server's fold). */
  spend: SpendLimitsData;
}

export const StudioDataContext = createContext<StudioData | null>(null);
export function useStudioData(): StudioData {
  const d = useContext(StudioDataContext);
  if (!d) throw new Error("a Goose widget rendered outside the dashboard");
  return d;
}

/** The dashboard's data from its parts, so the page composes it in one place and tests can too. */
export function studioData(rows: LedgerRow[], hasSession: boolean, story: WeekStory, weekEvents: readonly LedgerEvent[], sessionEvents: readonly LedgerEvent[], fold: FoldWeek | null): StudioData {
  return { rows, hasSession, story, haggle: haggleModel(weekEvents), spend: spendLimits([...sessionEvents, ...weekEvents], fold) };
}

/** A ledger row as Studio's flat table: plain words in every column, money as a number Studio can sum (formatted as dollars). */
export interface StudioRow { seq: number; when: string; part: string; kind: string; actor: string; who: string; did: string; dollars: number | null; why: string; rule: string; layer: string; from: string; signed: boolean }

export const flat = (r: LedgerRow): StudioRow => ({
  seq: r.seq,
  when: timeOf(r),
  part: r.part === "week" ? "The demo week" : "This session",
  kind: KIND_ONE[r.kind],
  actor: r.actor,
  who: whoWords(r),
  did: didWords(r),
  dollars: r.cents === null ? null : Number(r.cents) / 100,
  why: r.why, // the Watcher writes its one verb at the source ("Watcher set <seller> aside: …", POL-3)
  rule: r.rule ?? "",
  layer: r.layer,
  from: fromWords(r),
  signed: r.signed,
});

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** The Live Threat Board's rows as a Studio table: two sources, so a visitor's own widget can't add one side to the other. */
const threatSource = (id: string, name: string, rows: readonly Attempt[], source: Source) => {
  // Who tried is a column only where real rows answer it two ways, the same test as the board's.
  const who = showsSources(rows, source);
  return {
    id, name,
    // `tries` and `setAside` are what the pivots add up: one try each, and the share of them Goose set aside.
    data: rows.map((a) => ({ when: whenWords(a.at, source), day: source === "demo" ? dayWords(a.at, source) : dayKey(a.at), type: TYPE_WORDS[a.type], verdict: tryWord(a), rule: RULE_WORDS[a.rule], decided: decidedBy(a.rule), tries: 1, setAside: a.verdict === "set-aside" ? 1 : 0, ...(who ? { who: sourceWords(a.source) } : {}) })),
    fields: [
      { id: "when", name: "When", format: "textFormat" as const },
      { id: "day", name: "Day", format: "textFormat" as const },
      { id: "type", name: "Type", format: "textFormat" as const },
      { id: "verdict", name: "Verdict", format: "textFormat" as const },
      { id: "rule", name: "Rule", format: "textFormat" as const },
      { id: "decided", name: "Decided by", format: "textFormat" as const },
      { id: "tries", name: "Tries", format: "integerFormat" as const, blankValue: "–" },
      { id: "setAside", name: "Set aside", format: "percentageFormat" as const, blankValue: "–" },
      ...(who ? [{ id: "who", name: "Who", format: "textFormat" as const }] : []),
    ],
  };
};

/** Studio's data sources: "Goose's ledger", the columns a visitor's own widget can pick from, and the board's two. */
export function studioSources(rows: LedgerRow[], attempts?: { real: readonly Attempt[] | null; demo: readonly Attempt[] }): AgDataSourcesDefinition {
  return {
    sources: [...(attempts ? [threatSource("threat-real", "Real tries", attempts.real ?? [], "real"), threatSource("threat-seeded", "Seeded demo week", attempts.demo, "demo")] : []), {
      id: "ledger", name: "Goose's ledger", data: rows.map(flat),
      fields: [
        { id: "seq", name: "Row", format: "integerFormat" },
        { id: "when", name: "When (UTC)", format: "textFormat" },
        { id: "part", name: "Part", format: "textFormat" },
        { id: "kind", name: "What", format: "textFormat" },
        { id: "actor", name: "Who wrote it", format: "textFormat" },
        { id: "who", name: "Who", format: "textFormat" },
        { id: "did", name: "Did", format: "textFormat" },
        { id: "dollars", name: "Amount", format: "currencyFormat", formatOptions: { format: USD } },
        { id: "why", name: "Why", format: "textFormat" },
        { id: "rule", name: "Rule", format: "textFormat" },
        { id: "layer", name: "Layer", format: "textFormat" },
        { id: "from", name: "From", format: "textFormat" },
        { id: "signed", name: "Signed by PayPal", format: "booleanFormat" },
      ],
    }],
  };
}
