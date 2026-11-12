// The page's own rule (Track AS, AS-13; Round 4 judges, fix 2): when the server can't answer an ask (`/api/view` says
// 429 because every cap, the rule's own too, is used up from this network, or it fails or can't be reached), the box
// never goes dead. The same fixed rule the server runs (server/src/view.ts `ruleTurn`), here in the browser: read the
// page, add the one Goose view the words pick (or show it, if it is there), say so in one sentence labelled
// "No AI call". For words that ask the box to pay, approve or change a limit, the refusal comes first, from the words
// alone. It reads only the shopper's words and the page's track numbers, never seller text, and it can do only what the
// agent's view tools do. `core/test/ask-view.test.ts` keeps its tables and sentences equal to the server's.

import { OFFLINE } from "../states/words.ts";
import { asksChart } from "./threat-model.ts";
import { STOCK_CLOSEST } from "./words.ts";

export const PAGE_RULE_LABEL = "No AI call: a fixed rule read your words.";
export const PAGE_RULE_CANT = `I can only build views of Goose's ledger. Try “Show me everything Goose blocked this week”. ${PAGE_RULE_LABEL}`;
/** The refusal, said first when the words ask the box to act (the server's `BOUNDARY`, word for word). */
export const PAGE_BOUNDARY = "I can't approve, pay or change a limit: only your own tap in PayPal pays, and your limits live in code.";
/** The quiet note when the server didn't answer at all (a 429 brings the server's own sentence instead). */
export const PAGE_RULE_NOTE = "Goose's server didn't answer."; // DD AS-14 (b), system.md §8: a quiet note gives only the cause
/** R-12: the same quiet note when the ask failed while she was offline: her network is the cause the code saw, not the
 *  server (the kit's Offline title, word for word). */
export const PAGE_RULE_OFFLINE = OFFLINE.title;

/** The six Goose views and the words that pick each (the server's `GOOSE_WIDGETS`, in the same order). */
export const PAGE_WIDGETS: ReadonlyArray<{ type: string; heading: string; words: readonly string[]; height: number }> = [
  { type: "goose-blocked", heading: "What did the Watcher set aside, and why?", words: ["block", "set aside", "aside", "scam", "watcher", "refus", "stopp"], height: 30 },
  { type: "goose-spend", heading: "How close did each payment come to its limit?", words: ["limit", "spend", "spent", "budget", "how close"], height: 21 },
  { type: "goose-paypal", heading: "What did PayPal confirm?", words: ["paypal", "paid", "pay", "confirm", "capture", "refund", "webhook"], height: 20 },
  { type: "goose-ladder", heading: "How did the haggle go, round by round?", words: ["haggle", "round", "ladder", "offer", "counter", "bargain"], height: 41 },
  { type: "goose-every", heading: "Every row, as Goose's code wrote it", words: ["every row", "all rows", "all the rows", "table", "ledger", "everything"], height: 40 },
  { type: "goose-week", heading: "Where the ticket's price went this week", words: ["week", "price", "day", "story", "ticket"], height: 44 },
];

/** The tries as a chart (the server's `TRIES_WIDGETS`, in the same order): by type, unless the words name another split. */
export const PAGE_TRIES_WIDGETS: ReadonlyArray<{ type: string; heading: string; words: readonly string[]; height: number }> = [
  { type: "goose-tries-day", heading: "Tries by day", words: ["day", "daily", "date", "week", "time", "trend"], height: 24 },
  { type: "goose-tries-verdict", heading: "Tries by verdict", words: ["verdict", "outcome", "result"], height: 24 },
  { type: "goose-tries-type", heading: "Tries by type", words: [], height: 24 },
];
/** Words about the tries (the server's `ABOUT_TRIES`). "try" alone is usually the verb, so it counts only as a noun. */
export const PAGE_ABOUT_TRIES = /\b(?:tries|tried|attempts?|tricks?|threats?|(?:every|each|per|a|one|the)\s+try)\b/;

export function pagePick(words: string): (typeof PAGE_WIDGETS)[number] | null {
  const w = words.toLowerCase();
  if (asksChart(w) && PAGE_ABOUT_TRIES.test(w)) {
    const word = (k: string) => new RegExp(`\\b${k}\\b`).test(w);
    return PAGE_TRIES_WIDGETS.find((g) => g.words.some(word)) ?? PAGE_TRIES_WIDGETS[PAGE_TRIES_WIDGETS.length - 1]!;
  }
  const at = (k: string) => new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(w);
  return PAGE_WIDGETS.find((g) => g.words.some(at)) ?? null;
}

/** The page's words when the model picks a stock chart: add_widget has no config, so one could only draw "No data to display". */
export { STOCK_CLOSEST };
export const STOCK_NONE = "Goose can't draw that chart here. Nothing was added.";
/** What the model reads back: the same truth as the page's line, so its own sentence can't claim the stock chart. */
export const stockTold = (stock: string, near: string | null): string =>
  `${stock} can't be drawn here: this page has no way to fill it, so it would come out empty. ${near ? `${near}, the closest card, is on the page instead and is lit. Say that.` : "Nothing was added. Say you can't draw that here."}`;
/** A stock pick's answer: the Goose card nearest the shopper's words, or none, and the line the page shows either way. */
export function stockAnswer(words: string): { near: string | null; note: string } {
  const near = pagePick(words)?.type ?? null;
  return { near, note: near ? STOCK_CLOSEST : STOCK_NONE };
}

/** Words that ask the box to act rather than to show (the server's `asksToAct`, the same patterns). */
export function pageAsksToAct(words: string): boolean {
  const w = words.toLowerCase();
  const question = /^\s*(what|when|how|which|who|did|show|where|why)\b/.test(w);
  return /\b(ignore|disregard|forget|override|bypass)\b.{0,40}\b(rules?|instructions?|limits?|guard|prompt)\b/.test(w)
    || /\bsystem\s*(:|override|prompt)|\bpre-?approved\b|\bdeveloper mode\b/.test(w)
    || (!question && (
      /\b(approve|authori[sz]e)\b/.test(w)
      || /\b(raise|increase|lift|change|set|double|remove|bump|up|drop|lower)\b.{0,30}\b(limits?|budget|max(imum)?|cap)\b/.test(w)
      || /\b(limits?|budget|max(imum)?)\b.{0,20}\bto\s+\$?\d/.test(w)
      || /\b(more|bigger|higher|larger)\b.{0,15}\b(budget|limits?|spend)/.test(w)
      || /\b(pay|buy|purchase|checkout|order)\b\s+(for\s+)?(the|it|that|this|now|me|\$|\d)/.test(w)
      || /\b(make|complete|confirm|place|finish)\s+(the\s+|my\s+|a\s+)?(payment|purchase|order|checkout)\b/.test(w)
      || /\b(refund|cancel|capture|send)\b\s+(the|it|my|that|this|\$)/.test(w)));
}

const cardName = (g: { heading: string }) => `“${g.heading}”`;
/** The server's `LIT_BELOW`: a card that was already on the page, named by its heading. */
export const pageLitBelow = (g: { heading: string }) => `Lit below: ${cardName(g)}${/[?.!]$/.test(g.heading) ? "" : "."}`;

/** The lowest edge of the page as `view_page` described it (the server's `pageBottom`). */
export function pageBottomOf(pageJson: string): number {
  let bottom = -1;
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  const walk = (v: unknown) => {
    if (!isObj(v)) { if (Array.isArray(v)) v.forEach(walk); return; }
    if (typeof v.yTrack === "number" && typeof v.ySpan === "number") bottom = Math.max(bottom, v.yTrack + v.ySpan);
    Object.values(v).forEach(walk);
  };
  try { walk(JSON.parse(pageJson)); } catch { /* not JSON: the sum below */ }
  if (bottom >= 0) return bottom;
  const max = (re: RegExp) => Math.max(0, ...[...pageJson.matchAll(re)].map((m) => Number(m[1])));
  return max(/"yTrack"\s*:\s*(\d+)/g) + max(/"ySpan"\s*:\s*(\d+)/g);
}

/** One conversation item as `viewBody` (ai.ts) sends it. */
export type PageItem =
  | { type: "message"; role: "user"; content: Array<{ type: string; text?: string }> }
  | { type: "function_call"; callId: string; name: string; arguments: string }
  | { type: "function_call_output"; callId: string; output: string };
export interface PageTurn { text: string; calls: Array<{ callId: string; name: string; args: Record<string, unknown> }> }

let seq = 0;
const id = (kind: string) => `page-${kind}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** The refusal first for words that ask to act; the "views only" line goes, since the refusal says it. */
const said = (text: string, asked: string): string =>
  pageAsksToAct(asked) ? `${PAGE_BOUNDARY} ${text.replace(" This box only builds views: nothing here can pay, approve or change a limit.", "")}` : text;

/** One turn of the page's rule over the conversation so far: read the page, add (or show) the view, say so. */
export function pageRuleTurn(input: readonly PageItem[], tools: readonly string[]): PageTurn {
  const has = (name: string) => tools.includes(name);
  const asked = [...input].reverse().find((i): i is Extract<PageItem, { type: "message" }> => i.type === "message")?.content.map((p) => p.text ?? "").join("\n") ?? "";
  const pick = pagePick(asked);
  if (!pick) return { text: said(PAGE_RULE_CANT, asked), calls: [] };
  const add = (yTrack: number) => ({ callId: id("add"), name: "add_widget", args: { type: pick.type, widgetId: `asked-${pick.type.slice("goose-".length)}-${Date.now().toString(36)}`, xTrack: 0, yTrack, xSpan: 24, ySpan: pick.height } });
  const last = input[input.length - 1];
  if (last?.type === "function_call_output") {
    const call = input.find((i): i is Extract<PageItem, { type: "function_call" }> => i.type === "function_call" && i.callId === last.callId);
    if (call?.name === "add_widget") {
      if (/"alreadyOnPage"\s*:\s*true/.test(last.output)) return { text: said(`${pageLitBelow(pick)} Nothing was added. ${PAGE_RULE_LABEL}`, asked), calls: [] };
      return { text: said(/"success"\s*:\s*true/.test(last.output) ? `Added ${cardName(pick)} at the bottom of the page. This box only builds views: nothing here can pay, approve or change a limit. ${PAGE_RULE_LABEL}` : `I couldn't add ${cardName(pick)} to this page. Nothing changed. ${PAGE_RULE_LABEL}`, asked), calls: [] };
    }
    if (call?.name === "view_page" && has("add_widget")) return { text: "", calls: [add(pageBottomOf(last.output))] };
    return { text: said(`I read the page but couldn't add a widget here. ${PAGE_RULE_LABEL}`, asked), calls: [] };
  }
  if (has("view_page")) return { text: "", calls: [{ callId: id("page"), name: "view_page", args: {} }] };
  if (has("add_widget")) return { text: "", calls: [add(0)] };
  return { text: said(PAGE_RULE_CANT, asked), calls: [] };
}
