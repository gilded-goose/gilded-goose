// "Ask for a view" (Track AS, slice 3; docs/guild/044-ag-studio.md §4): the one server route behind the dashboard's ask
// box. The browser's AG Studio agent sends each turn of its conversation here (`POST /api/view`), this file checks it,
// asks the model (or a fixed rule when there is no key), and answers in the shape AG's adapter expects. It can only
// build views: the request may name only the eight view tools below, any other name is a 400 before a model is asked,
// and any call a model returns to anything else is dropped before it reaches the browser. By construction it has no way
// to pay, approve, hold, refund, change a limit or write a ledger row: it imports nothing from payments, the guard, the
// policy or the ledger, and `core/test/ask-view.test.ts` greps these imports so a planted one fails the check. Money moves
// only through POST /api/runs/:id/approve, the shopper's own tap, as today.

import type { Context } from "hono";

/** The eight view tools (AG Studio's names): read the schema, the page and the data; add, configure and place a widget; filter. */
export const VIEW_TOOLS = ["view_schema", "view_page", "execute_query", "add_widget", "configure_widget", "position_widget", "add_page_filter", "add_widget_filter"] as const;
export type ViewToolName = (typeof VIEW_TOOLS)[number];
const VIEW_TOOL_SET: ReadonlySet<string> = new Set(VIEW_TOOLS);
export const isViewTool = (name: string): name is ViewToolName => VIEW_TOOL_SET.has(name);

/**
 * The server's own description of each view tool (server/prompts/view-tools.json, read by main.ts): what the model is
 * told a tool does and the arguments it takes. A request only names tools; their descriptions and schemas always come
 * from here, never from the browser (security review of 47ff6e7: a client's own prompt, system message or schema
 * made the route an open proxy to the model on Goose's key).
 */
export interface ViewToolSpec { description: string; parameters: Record<string, unknown> }
export type ViewToolTable = Readonly<Record<ViewToolName, ViewToolSpec>>;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string";

/** Reads the table file and refuses to boot unless it describes exactly the eight view tools, each with an object schema. */
export function viewToolTable(json: unknown): ViewToolTable {
  const tools = isObj(json) && isObj(json.tools) ? json.tools : null;
  if (!tools) throw new Error("view-tools: no tools table");
  const names = Object.keys(tools).sort();
  if (names.join() !== [...VIEW_TOOLS].sort().join()) throw new Error(`view-tools: the table must name exactly the eight view tools, got ${names.join(", ")}`);
  const out: Partial<Record<ViewToolName, ViewToolSpec>> = {};
  for (const name of VIEW_TOOLS) {
    const t = tools[name];
    if (!isObj(t) || !str(t.description) || !isObj(t.parameters) || t.parameters.type !== "object") throw new Error(`view-tools: "${name}" needs a description and an object schema`);
    out[name] = { description: t.description, parameters: t.parameters };
  }
  return out as ViewToolTable;
}

/**
 * One item of the conversation as the server keeps it: the shopper's own words, a view-tool call a model made, and that
 * call's result. Nothing else is kept: a system or developer message, assistant text (a client could put words in the
 * model's mouth) and `instructions` are refused with a 400 (Round 2 red team); a tool's description or schema and a
 * response format are dropped (the browser never sends them; the server's own table describes each tool).
 */
export interface ViewMessage { type: "message"; role: "user"; text: string }
export interface ViewCallItem { type: "function_call"; callId: string; name: ViewToolName; arguments: string }
export interface ViewResultItem { type: "function_call_output"; callId: string; output: string }
export type ViewItem = ViewMessage | ViewCallItem | ViewResultItem;
export type ViewToolChoice = "auto" | "none" | "required" | { name: ViewToolName };
/** What reaches a model: the kept items, the names of the view tools offered (the server describes them), the choice. */
export interface ViewRequest { input: ViewItem[]; tools: ViewToolName[]; toolChoice: ViewToolChoice }

/** A body past this is refused before it is read. */
export const VIEW_MAX_BYTES = 600_000;
/** The shopper's words in one message: past this is a 400. */
export const VIEW_MAX_ASK_CHARS = 2_000;
/** The shopper's messages in one conversation (the dashboard opens one per ask): past this is a 400. */
export const VIEW_MAX_ASKS = 6;
/** Tool calls in one conversation (the browser agent's 8 turns, a few calls each): past this is a 400. */
export const VIEW_MAX_CALLS = 24;
/** One call's arguments, as the model wrote them: past this is a 400. */
export const VIEW_MAX_ARGS_CHARS = 4_000;
/** One tool result is cut here (a query's rows can be long); the model is told the rest was not sent. */
export const VIEW_MAX_RESULT_CHARS = 12_000;
/** Everything kept, after cutting: past this is a 400, so one turn's input to the model is bounded. */
export const VIEW_MAX_TOTAL_CHARS = 48_000;
export const VIEW_CUT = "\n[The rest of this result was not sent.]";
const MAX_ITEMS = 120;
const MAX_TOOLS = 16;
const TOO_LONG = "That conversation is too long. Start a new one.";
const NOT_A_VIEW_TOOL = (name: string) => `"${name}" is not a view tool. This box only builds views of the ledger.`;

export type ParsedView = { ok: true; req: ViewRequest } | { ok: false; error: string };

/** A message role the box refuses (Round 2 red team, fix 1): a 400 with a plain reason, never a silent drop. */
export const NOT_YOUR_WORDS = (role: string) => `A "${role}" message can't be sent here: only your own words reach the model, and the server's prompt is the only system prompt.`;
export const NO_INSTRUCTIONS = `"instructions" can't be sent here: the server's own prompt is the only one the model reads.`;
/** A top-level `system` field (Round 3 red team, fix 4): refused like `instructions`, never silently dropped. */
export const NO_SYSTEM = `"system" can't be sent here: the server's own prompt is the only one the model reads.`;
/**
 * The fields each view tool's arguments may carry: exactly the properties of its schema in server/prompts/view-tools.json
 * (`core/test/redteam-round3.test.ts` keeps the two equal; each schema says `additionalProperties: false`).
 */
export const VIEW_ARG_KEYS: Readonly<Record<ViewToolName, readonly string[]>> = {
  view_schema: [], view_page: [], execute_query: ["query"],
  add_widget: ["widgetId", "type", "xTrack", "yTrack", "xSpan", "ySpan"],
  configure_widget: ["widgetId", "op", "value"], position_widget: ["op", "value", "widgetId"],
  add_page_filter: ["op", "value"], add_widget_filter: ["op", "value", "widgetId"],
};
/**
 * Each field's own kind, as its schema in server/prompts/view-tools.json declares it at the top (Round 4 red team, fix 5;
 * `core/test/ask-view.test.ts` keeps this table equal to the schemas): a string, a number or an object, and for `op` and
 * add_widget's `type` the schema's own words. position_widget's `value` holds numbers only.
 */
export const VIEW_ARG_KINDS: Readonly<Record<ViewToolName, Readonly<Record<string, "string" | "number" | "object" | readonly string[]>>>> = {
  view_schema: {}, view_page: {}, execute_query: { query: "object" },
  add_widget: { widgetId: "string", type: "string", xTrack: "number", yTrack: "number", xSpan: "number", ySpan: "number" },
  configure_widget: { widgetId: "string", op: ["patch"], value: "object" },
  position_widget: { op: ["patch"], value: "object", widgetId: "string" },
  add_page_filter: { op: ["append"], value: "object" },
  add_widget_filter: { op: ["append"], value: "object", widgetId: "string" },
};
/** A string field's length, and any string inside an object field (a field name, a filter's member): past it is a 400. */
export const VIEW_MAX_ARG_STRING = 200;
/**
 * A call's `arguments` that aren't a JSON object of its own tool's fields, each of its own kind (Round 3, fix 4; V34
 * smuggled a scratchpad as a call's whole arguments; Round 4, fix 5: an allowed key carried a conversation as its value).
 * A string where the schema says number, a number where it says object, or a long string anywhere is a 400; the tools a
 * value reaches only build views either way.
 */
export const NOT_ITS_ARGUMENTS = (name: string) => `A "${name}" call can only carry its own fields, as a JSON object.`;
const shortStrings = (v: unknown, depth = 0): boolean =>
  depth > 12 ? false
  : typeof v === "string" ? v.length <= VIEW_MAX_ARG_STRING
  : Array.isArray(v) ? v.every((x) => shortStrings(x, depth + 1))
  : isObj(v) ? Object.entries(v).every(([k, x]) => k.length <= VIEW_MAX_ARG_STRING && shortStrings(x, depth + 1))
  : true;
const ownArguments = (name: ViewToolName, raw: string): boolean => {
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return false; }
  if (!isObj(v)) return false;
  const kinds = VIEW_ARG_KINDS[name];
  return Object.entries(v).every(([k, x]) => {
    const kind = kinds[k];
    if (kind === undefined || !VIEW_ARG_KEYS[name].includes(k)) return false;
    if (kind === "string") return typeof x === "string" && x.length <= VIEW_MAX_ARG_STRING;
    if (kind === "number") return typeof x === "number" && Number.isFinite(x);
    if (kind === "object") return isObj(x) && shortStrings(x) && (name !== "position_widget" || Object.values(x).every((n) => typeof n === "number" && Number.isFinite(n)));
    return typeof x === "string" && kind.includes(x);
  });
};

/**
 * Reads AG's `AgLlmRequest` by hand (no schema library in this repo). Kept: the shopper's text, calls to the eight view
 * tools, and results that answer one of those calls. A 400 with a plain reason (Round 2 red team): a system, developer
 * or assistant message, or an `instructions` or top-level `system` field, so a misconfigured client learns the box refused
 * it instead of believing its words were read (the browser's `viewBody` never sends them); a call whose `arguments` aren't
 * a JSON object of only that tool's own fields (Round 3, fix 4). Dropped without a word: every tool's
 * description and schema, `responseFormat`, a model's reasoning. A 400 too for any other tool name, an image, a result
 * that answers no call, or input past the caps above.
 */
export function parseViewRequest(body: unknown): ParsedView {
  if (!isObj(body)) return { ok: false, error: "Send the conversation as JSON." };
  if (body.instructions !== undefined) return { ok: false, error: NO_INSTRUCTIONS };
  if (body.system !== undefined) return { ok: false, error: NO_SYSTEM };
  if (!Array.isArray(body.input) || body.input.length === 0) return { ok: false, error: "The conversation is empty." };
  if (body.input.length > MAX_ITEMS) return { ok: false, error: TOO_LONG };
  const input: ViewItem[] = [];
  const open = new Set<string>(); // calls not yet answered
  let chars = 0, asks = 0, calls = 0;
  for (const raw of body.input) {
    if (!isObj(raw) || !str(raw.type)) return { ok: false, error: "A conversation item has no type." };
    if (raw.type === "reasoning") continue; // a model's own notes: never resent
    if (raw.type === "message") {
      const role = raw.role;
      if (role === "system" || role === "developer" || role === "assistant") return { ok: false, error: NOT_YOUR_WORDS(role) }; // never forwarded, and said so
      if (role !== "user") return { ok: false, error: "A message has no role." };
      if (!Array.isArray(raw.content)) return { ok: false, error: "A message has no content." };
      const parts: string[] = [];
      for (const part of raw.content) {
        if (!isObj(part) || part.type !== "text" || !str(part.text)) return { ok: false, error: "Only text can be asked here (no images or files)." };
        parts.push(part.text);
      }
      const text = parts.join("\n");
      if (text.length > VIEW_MAX_ASK_CHARS) return { ok: false, error: `Ask in fewer words (at most ${VIEW_MAX_ASK_CHARS.toLocaleString("en-US")} characters).` };
      if (++asks > VIEW_MAX_ASKS) return { ok: false, error: TOO_LONG };
      chars += text.length;
      input.push({ type: "message", role: "user", text });
    } else if (raw.type === "function_call") {
      if (!str(raw.callId) || !str(raw.name) || !str(raw.arguments)) return { ok: false, error: "A tool call is malformed." };
      if (!isViewTool(raw.name)) return { ok: false, error: NOT_A_VIEW_TOOL(raw.name) };
      if (raw.arguments.length > VIEW_MAX_ARGS_CHARS || ++calls > VIEW_MAX_CALLS) return { ok: false, error: TOO_LONG };
      if (!ownArguments(raw.name, raw.arguments)) return { ok: false, error: NOT_ITS_ARGUMENTS(raw.name) };
      open.add(raw.callId);
      chars += raw.arguments.length;
      input.push({ type: "function_call", callId: raw.callId, name: raw.name, arguments: raw.arguments });
    } else if (raw.type === "function_call_output") {
      if (!str(raw.callId) || !str(raw.output)) return { ok: false, error: "A tool result is malformed." };
      if (!open.delete(raw.callId)) return { ok: false, error: "A tool result answers no view-tool call." }; // one result per call, after it
      const output = raw.output.length > VIEW_MAX_RESULT_CHARS ? raw.output.slice(0, VIEW_MAX_RESULT_CHARS) + VIEW_CUT : raw.output;
      chars += output.length;
      input.push({ type: "function_call_output", callId: raw.callId, output });
    } else return { ok: false, error: `"${raw.type}" is not a conversation item this box reads.` };
    if (chars > VIEW_MAX_TOTAL_CHARS) return { ok: false, error: TOO_LONG };
  }
  if (asks === 0) return { ok: false, error: "The conversation is empty." };

  const tools: ViewToolName[] = [];
  if (body.tools !== undefined) {
    if (!Array.isArray(body.tools) || body.tools.length > MAX_TOOLS) return { ok: false, error: "The tool list is malformed." };
    for (const t of body.tools) {
      if (!isObj(t) || !str(t.name)) return { ok: false, error: "A tool has no name." };
      if (!isViewTool(t.name)) return { ok: false, error: NOT_A_VIEW_TOOL(t.name) };
      if (t.kind !== undefined && t.kind !== "client") return { ok: false, error: NOT_A_VIEW_TOOL(t.name) }; // no provider-run or server tools
      if (!tools.includes(t.name)) tools.push(t.name); // its description and schema, if sent, are never read
    }
  }

  let toolChoice: ViewToolChoice = "auto";
  const tc = body.toolChoice;
  if (tc === "auto" || tc === "none" || tc === "required") toolChoice = tc;
  else if (isObj(tc) && str(tc.name)) {
    if (!isViewTool(tc.name)) return { ok: false, error: NOT_A_VIEW_TOOL(tc.name) };
    toolChoice = { name: tc.name };
  } else if (tc !== undefined) return { ok: false, error: "The tool choice is malformed." };

  return { ok: true, req: { input, tools, toolChoice } };
}

/** One tool call a model asks for. `name` is whatever the model said; `onlyViewCalls` is what keeps the browser safe. */
export interface ViewCall { callId: string; name: string; args: Record<string, unknown> }
export interface ViewTurn { text: string; calls: ViewCall[]; model: string; usage?: { input: number; output: number }; incomplete?: "max_output_tokens" }

/** Anything that answers one turn: Claude (server/src/adapters/claude.ts, `ClaudeViewer`) or the fixed rule below. */
export interface ViewLlm { readonly name: string; turn(req: ViewRequest, signal?: AbortSignal): Promise<ViewTurn> }

/** Defence in depth: a call to anything but a view tool never reaches the browser. The text stays; the names dropped are logged by kind only. */
export function onlyViewCalls(turn: ViewTurn): { turn: ViewTurn; dropped: string[] } {
  const dropped = turn.calls.filter((c) => !isViewTool(c.name)).map((c) => c.name);
  return { turn: { ...turn, calls: turn.calls.filter((c) => isViewTool(c.name)) }, dropped };
}

/** AG's `AgLlmResponse`: what the browser adapter turns into the chat's events. Never streamed: one JSON body per turn. */
export interface AgResponseBody {
  id: string; createdAt: number; status: "completed" | "incomplete"; model: string;
  output: Array<
    | { id: string; kind: "output"; type: "message"; role: "assistant"; status: "completed"; content: Array<{ type: "text"; text: string; annotations: [] }> }
    | { id: string; kind: "output"; type: "function_call"; callId: string; name: string; arguments: string; status: "completed" }
  >;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  incompleteDetails?: { reason: "max_output_tokens" };
}

export function agResponse(turn: ViewTurn, id: string, at: number): AgResponseBody {
  const output: AgResponseBody["output"] = [];
  if (turn.text.trim()) output.push({ id: `${id}-m`, kind: "output", type: "message", role: "assistant", status: "completed", content: [{ type: "text", text: turn.text, annotations: [] }] });
  turn.calls.forEach((c, i) => output.push({ id: `${id}-c${i}`, kind: "output", type: "function_call", callId: c.callId, name: c.name, arguments: JSON.stringify(c.args), status: "completed" }));
  const body: AgResponseBody = { id, createdAt: at, status: turn.incomplete ? "incomplete" : "completed", model: turn.model, output };
  if (turn.usage) body.usage = { inputTokens: turn.usage.input, outputTokens: turn.usage.output, totalTokens: turn.usage.input + turn.usage.output };
  if (turn.incomplete) body.incompleteDetails = { reason: turn.incomplete };
  return body;
}

// ---- The fixed rule: no key, a paused store, or a model call that failed. Labelled "no AI call" in its words. ----

/**
 * The six Goose widgets the dashboard ships (ids as `web/src/studio/widgets/index.tsx` registers them; a test keeps the
 * two lists equal), the words that pick each, in the order a tie is broken (the specific question before the general),
 * and the height Studio gives it. The rule adds exactly one, 24 tracks wide, under the lowest widget on the page.
 * A word matches at the start of a word ("pay" in "payment", never "round" in "around"). Spending comes before PayPal
 * (Round 2 judges: "How close did each payment come to its limit?" lit PayPal, through "pay" in "payment"); "cap" is
 * gone from spending's words, so "capture" stays PayPal's. `core/test/ask-view.test.ts` maps every widget's own heading
 * and every chip to its widget.
 */
export const GOOSE_WIDGETS: ReadonlyArray<{ type: string; label: string; heading: string; words: readonly string[]; height: number }> = [
  { type: "goose-blocked", label: "what the Watcher set aside, and why", heading: "What did the Watcher set aside, and why?", words: ["block", "set aside", "aside", "scam", "watcher", "refus", "stopp"], height: 30 },
  { type: "goose-spend", label: "spending against your limits", heading: "How close did each payment come to its limit?", words: ["limit", "spend", "spent", "budget", "how close"], height: 21 },
  { type: "goose-paypal", label: "what PayPal confirmed", heading: "What did PayPal confirm?", words: ["paypal", "paid", "pay", "confirm", "capture", "refund", "webhook"], height: 20 },
  { type: "goose-ladder", label: "the haggle, round by round", heading: "How did the haggle go, round by round?", words: ["haggle", "round", "ladder", "offer", "counter", "bargain"], height: 41 },
  { type: "goose-every", label: "every row, as Goose's code wrote it", heading: "Every row, as Goose's code wrote it", words: ["every row", "all rows", "all the rows", "table", "ledger", "everything"], height: 40 },
  { type: "goose-week", label: "the week's story", heading: "Where the ticket's price went this week", words: ["week", "price", "day", "story", "ticket"], height: 44 },
];

/**
 * The tries as a chart (Nov 5: "Tries by day" picked the week's story through "day", and "Show tries by type as a bar chart" picked
 * nothing). Their own table, read first and only for a chart of the tries, so the six views keep their words. By type, unless the words
 * name another split. `CHART_ASK` is the page's (web/src/studio/threat-model.ts); `core/test/ask-charts.test.ts` holds them equal.
 */
export const TRIES_WIDGETS: ReadonlyArray<{ type: string; label: string; heading: string; words: readonly string[]; height: number }> = [
  { type: "goose-tries-day", label: "the tries by day", heading: "Tries by day", words: ["day", "daily", "date", "week", "time", "trend"], height: 24 },
  { type: "goose-tries-verdict", label: "the tries by verdict", heading: "Tries by verdict", words: ["verdict", "outcome", "result"], height: 24 },
  { type: "goose-tries-type", label: "the tries by type", heading: "Tries by type", words: [], height: 24 },
];
export const CHART_ASK = /\b(?:charts?|graphs?|plots?|histogram|pie|donut|bars?|trend|breakdown|break down|over time|daily|by (?:type|kind|day|date|week|verdict|outcome|result)|per (?:day|week|type|kind|verdict)|each (?:day|type|kind|verdict))\b/;
/** Words about the tries. "try" alone is usually the verb, so it counts only as a noun. */
export const ABOUT_TRIES = /\b(?:tries|tried|attempts?|tricks?|threats?|(?:every|each|per|a|one|the)\s+try)\b/;

export const RULE_NAME = "rule";
const RULE_LABEL = "No AI call: a fixed rule read your words.";
export const RULE_CANT = `I can only build views of Goose's ledger. Try “Show me everything Goose blocked this week”. ${RULE_LABEL}`;

/**
 * A card named by the words on its face, its heading, in curly quotes, never by the widget's internal label and never
 * "here" (dd/system.md §8, the Design Director's AS-9 ruling). A heading that is not a question ends the sentence with a
 * full stop after the closing quote.
 */
export const cardName = (g: { heading: string }) => `“${g.heading}”`;
const cardSentenceEnd = (g: { heading: string }) => (/[?.!]$/.test(g.heading) ? "" : ".");
/** The sentence for a card that was already on the page: shown and lit, nothing added. */
export const LIT_BELOW = (g: { heading: string }) => `Lit below: ${cardName(g)}${cardSentenceEnd(g)}`;

/** The widget the words ask for, or null. */
export function pickWidget(words: string): (typeof GOOSE_WIDGETS)[number] | null {
  const w = words.toLowerCase();
  if (CHART_ASK.test(w) && ABOUT_TRIES.test(w)) {
    const word = (k: string) => new RegExp(`\\b${k}\\b`).test(w);
    return TRIES_WIDGETS.find((g) => g.words.some(word)) ?? TRIES_WIDGETS[TRIES_WIDGETS.length - 1]!;
  }
  const at = (k: string) => new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(w);
  return GOOSE_WIDGETS.find((g) => g.words.some(at)) ?? null;
}

/**
 * The boundary sentence, said FIRST when the shopper's words ask the box to act (Round 2 judges: an injection in the
 * ask box got "'Spending against your limits' is already on this page… Nothing was added." with no refusal; the judge
 * wants the refusal, then the card). It only adds words: nothing in this file can act on any of them either way.
 */
export const BOUNDARY = "I can't approve, pay or change a limit: only your own tap in PayPal pays, and your limits live in code.";

/**
 * Words that ask the box to act rather than to show: approve, pay or buy something, raise or change a limit, refund, or
 * set the rules aside. A question about what happened ("What did Goose pay, and when?", "Which carts were approved?")
 * is not one. A heuristic for words only (a miss means no extra sentence, never a payment).
 */
export function asksToAct(words: string): boolean {
  const w = words.toLowerCase();
  const question = /^\s*(what|when|how|which|who|did|show|where|why)\b/.test(w);
  // Asked as a question about what happened ("Did anything change my limit?") is not a request to act; setting the
  // rules aside or a planted "SYSTEM:" is, however it is phrased.
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

/** A sentence that refuses in its own words ("I can't approve purchases…"). */
const REFUSES = /\b(can't|cannot|can not|won't|will not|unable to|not able to)\b[^.!?]*\b(approv|pay|limit|buy|purchas|refund)/i;

/**
 * A final sentence for words that ask the box to act: the refusal first, then what was shown. The model's own refusal,
 * wherever it put it, moves to the front; with none, the boundary sentence goes there. Said once.
 */
export function boundaryFirst(text: string, asked: string): string {
  if (!asksToAct(asked)) return text;
  const sentences = text.trim().split(/(?<=[.!?])\s+/);
  const own = sentences.findIndex((s) => REFUSES.test(s));
  if (own >= 0) return [sentences[own]!, ...sentences.filter((_, i) => i !== own)].join(" ");
  return `${BOUNDARY} ${text.replace(" This box only builds views: nothing here can pay, approve or change a limit.", "")}`.trim();
}

/**
 * The lowest edge of the page as `view_page` described it: the largest yTrack + ySpan of any one widget (walked from
 * the result's JSON, whatever its nesting). If the result isn't JSON, the largest yTrack plus the largest ySpan, which is
 * at or below the true edge, so a new widget never lands on another.
 */
export function pageBottom(pageJson: string): number {
  let bottom = -1;
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

/**
 * Three turns, every one of them from the words alone: read the page (`view_page`), add the one widget the words pick
 * under the lowest one (`add_widget`), say so. Without `view_page` in the tools it adds at the top; without `add_widget`
 * it only answers. Seller text in any result is never read: the rule looks at the shopper's words and at track numbers.
 */
export const ruleViewer: ViewLlm = { name: RULE_NAME, turn: (req) => ruleTurn(req, RULE_LABEL) };

/** The label on a sentence the rule wrote to finish a view the live model started and then stopped without a view call (session 6). */
export const FINISH_LABEL = "The page's own rule finished this view.";

/** The shopper's latest words in the conversation. */
export const askedWords = (req: ViewRequest) => [...req.input].reverse().find((i): i is ViewMessage => i.type === "message")?.text ?? "";

/**
 * Raw tool markup never reaches the page (Round 1 judges: a model wrote `<invoke name="view_page">` and a tool's JSON
 * as text): tool-call tags and their bodies, any other tag, fenced code, lines that are JSON objects, and U+FFFD go;
 * what is left is plain sentences, whitespace collapsed.
 */
export function cleanModelText(text: string): string {
  return text
    .replace(/<(invoke|function_calls|function_call|tool_call|tool_use|parameter|antml:[a-z_]+)\b[^>]*>[\s\S]*?(<\/\1>|$)/gi, " ")
    .replace(/<\/?[a-zA-Z_:][^>]*>/g, " ")
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .split("\n").filter((line) => { const t = line.trim(); return !(t.startsWith("{") && t.endsWith("}")) && !(t.startsWith("[") && t.endsWith("]")); }).join("\n")
    .replace(/�/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function ruleTurn(req: ViewRequest, label: string): Promise<ViewTurn> {
    const has = (name: ViewToolName) => req.tools.includes(name);
    const asked = askedWords(req);
    const pick = pickWidget(asked);
    if (!pick) return { text: RULE_CANT, calls: [], model: RULE_NAME };
    const last = req.input[req.input.length - 1]!;
    const callOf = (r: ViewResultItem) => req.input.find((i): i is ViewCallItem => i.type === "function_call" && i.callId === r.callId);
    if (last.type === "function_call_output") {
      const call = callOf(last);
      // Studio's tool result says whether the widget landed, or (the page's own `add_widget`, web/src/studio/ai.ts
      // `addOnce`) that the view was already on the page and was shown instead; the rule never claims beyond either
      // flag (the result's other words are never read).
      if (call?.name === "add_widget") {
        if (/"alreadyOnPage"\s*:\s*true/.test(last.output)) return { text: `${LIT_BELOW(pick)} Nothing was added. ${label}`, calls: [], model: RULE_NAME };
        return { text: /"success"\s*:\s*true/.test(last.output) ? `Added ${cardName(pick)} at the bottom of the page. This box only builds views: nothing here can pay, approve or change a limit. ${label}` : `I couldn't add ${cardName(pick)} to this page. Nothing changed. ${label}`, calls: [], model: RULE_NAME };
      }
      if (call?.name === "view_page" && has("add_widget")) return { text: "", calls: [addCall(pick, pageBottom(last.output))], model: RULE_NAME };
      return { text: `I read the page but couldn't add a widget here. ${label}`, calls: [], model: RULE_NAME };
    }
    if (has("view_page")) return { text: "", calls: [{ callId: `rule-page-${Date.now().toString(36)}`, name: "view_page", args: {} }], model: RULE_NAME };
    if (has("add_widget")) return { text: "", calls: [addCall(pick, 0)], model: RULE_NAME };
    return { text: RULE_CANT, calls: [], model: RULE_NAME };
}

/**
 * Every ask ends visibly (Round 1 judges and consumer: the headline ask settled on the model's interim note, or on its
 * reasoning, and nothing moved). The model's text is cleaned of tool markup. When the words pick a Goose view and the
 * model's turn carries no view call (it reasoned instead of calling, or wrote its call as text), the page's rule takes
 * that step: `view_page`, then `add_widget` (which the page turns into scroll-and-ring when the view is there), then one
 * shopper-facing sentence, labelled as the rule's. Once the view step is done (the last item is `add_widget`'s result)
 * and the model has words that the result bears out, they are its answer and they stand (Round 2 judges: the rule's
 * sentence had replaced the model's own refusal and answer); the rule speaks when the model says nothing, or claims
 * an add the page didn't make. An ask the rule can't pick keeps
 * the model's words; with no call and no words left, the fixed failure sentence, never silence. Every final sentence
 * to words that ask the box to act starts with the boundary (`boundaryFirst`), the model's or the rule's alike.
 */
export async function finishView(turn: ViewTurn, req: ViewRequest, model: string): Promise<ViewTurn> {
  const text = cleanModelText(turn.text);
  const asked = askedWords(req);
  if (turn.calls.length > 0) return { ...turn, text };
  const last = req.input[req.input.length - 1];
  const viewDone = last?.type === "function_call_output" && req.input.some((i) => i.type === "function_call" && i.callId === last.callId && i.name === "add_widget");
  // The model's words stand only where they can't claim beyond the page's answer: a widget that landed, or a view that
  // was already there with words that don't say one was added (a failed add, or "I added it" over a card that was only
  // shown, gets the rule's sentence, which reads only the result's two flags).
  const out = viewDone ? last.output : "";
  const already = /"alreadyOnPage"\s*:\s*true/.test(out), landed = /"success"\s*:\s*true/.test(out);
  const claimsAdd = /\badd(ed|ing)\b|\bnew (widget|card|view)\b/i.test(text) && !/\b(nothing|not|n't|no|without)\b[^.!?]*\badd/i.test(text);
  const modelStands = viewDone && !!text && (already ? !claimsAdd : landed);
  // The model was asked (and its usage counted), so the turn keeps its name; the sentence says the rule finished it.
  if (model !== RULE_NAME && pickWidget(asked) && !modelStands) {
    const ruled = await ruleTurn(req, FINISH_LABEL);
    return { ...ruled, text: ruled.calls.length ? ruled.text : boundaryFirst(ruled.text, asked), model, ...(turn.usage ? { usage: turn.usage } : {}) };
  }
  return { ...turn, text: boundaryFirst(text || VIEW_FAILED, asked) };
}

const addCall = (pick: (typeof GOOSE_WIDGETS)[number], yTrack: number): ViewCall => ({
  callId: `rule-add-${Date.now().toString(36)}`,
  name: "add_widget",
  args: { type: pick.type, widgetId: `asked-${pick.type.slice("goose-".length)}-${Date.now().toString(36)}`, xTrack: 0, yTrack, xSpan: 24, ySpan: pick.height },
});

// ---- The route ----

/**
 * A per-browser, per-network and per-day count (trust's `LiveCaps`), one for live calls and one for the rule. `ask` is
 * false for a turn that carries on an ask this server already counted (see `viewHandler`); a plain `LiveCaps` ignores it
 * and counts every turn (the rule's caps do).
 */
export interface ViewGate { takeOrWhy(token: string, ip: string, ask?: boolean): "token" | "ip" | "global" | null }
/** A day count shared with other surfaces (trust's `DailyCap`; main.ts passes the judge box's LIVE_AI_CAP count). */
export interface SharedDayCount { left(key: string): number; take(key: string): boolean }

/**
 * Live view turns (security review of 47ff6e7; Round 4 red team, R4-O1): the view's own caps (per browser, per network,
 * and its own day share, saved like the others so a restart can't reset it) count ASKS, one per ask's first turn, so
 * VIEW_DAY_CAP 100 is 100 asks, not ~33 (an ask is about three turns: read the page, add, say). Every live turn, the
 * first and each one after it, takes one from the day count every live surface shares (LIVE_AI_CAP), the hard ceiling on
 * model calls. Nothing is counted when either says no; every step is synchronous, so no other request can come between
 * the check and the take.
 */
export function sharedLiveGate(own: ViewGate, shared: SharedDayCount): ViewGate {
  return {
    takeOrWhy(token, ip, ask = true) {
      if (shared.left("all") === 0) return "global";
      if (ask) {
        const why = own.takeOrWhy(token, ip);
        if (why) return why;
      }
      shared.take("all");
      return null;
    },
  };
}

/** The route's own cookie: a random browser token under its path only, so the per-browser cap is per browser, not per network. */
export const VIEW_COOKIE = "gg_view";
/** A week, like the runs token (020 W18): long past the day the cap counts. */
export const VIEW_COOKIE_MAX_AGE_S = 7 * 86_400;
/** `<id>.<signature>`: 32 hex of the server's randomness, then the server's HMAC-SHA256 of it, base64url (43 characters). */
const VIEW_TOKEN_RE = /^([0-9a-f]{32})\.([A-Za-z0-9_-]{43})$/;

/**
 * What the route's token needs from main.ts (this file imports nothing but a type, so the crypto is handed in): a fresh
 * random id (32 hex), the server's signature over an id (HMAC-SHA256 under `VIEW_TOKEN_SECRET`, or a key made at boot
 * when that is unset), a constant-time compare, and the hash that names a token in the caps' keys.
 */
export interface ViewTokenKit { id: () => string; sign: (id: string) => string; same: (a: string, b: string) => boolean; hash: (s: string) => string }

/** The id inside a token this server signed, or null: a missing, malformed, made-up or other-key token is no token. */
export function viewTokenId(cookie: string | undefined, kit: ViewTokenKit): string | null {
  const m = cookie ? VIEW_TOKEN_RE.exec(cookie) : null;
  return m && kit.same(m[2]!, kit.sign(m[1]!)) ? m[1]! : null;
}

/**
 * The per-browser key for `/api/view`'s caps (Round 2 red team fix 3; Round 3 fixes O2 and O3). A browser carrying a
 * token this server signed is keyed by its id (hashed, so the key never names the cookie). Anything else (no cookie, a
 * junk one, or a made-up 32-hex value, which AS-8 took as a browser of its own: Round 3's L02) is handed a freshly
 * signed token (`mint`) and keyed by that new token from this first ask on, so a new browser never draws on a bucket
 * other cookie-less requests from its address used up (L03). A script that drops the cookie gets one turn per token,
 * and the per-network cap (`VIEW_PER_IP`, set below the view's day share) is what bounds it.
 */
export function viewKey(cookie: string | undefined, ip: string, kit: ViewTokenKit): { token: string; ip: string; mint: string | null } {
  const id = viewTokenId(cookie, kit);
  if (id) return { token: `view:${kit.hash(id)}`, ip, mint: null };
  const fresh = kit.id();
  return { token: `view:${kit.hash(fresh)}`, ip, mint: `${fresh}.${kit.sign(fresh)}` };
}

/**
 * The quiet line under a rule's answer when today's AI cap is used up: only the cause, in one sentence, the same on both
 * paths (the capped 200's `note` and the 429's `error`; the DD's AS-13 ruling, AS-14). The answer's own label already
 * says a rule answered ("No AI call: a fixed rule read your words.") and nothing was added, so this never repeats it.
 */
export const VIEW_CAPPED = "Today's AI view-building from here is used up.";
export const VIEW_FAILED = "Goose couldn't build that just now. Nothing changed.";
/** One model turn's budget: the page's state and a query's rows make a long prompt; the chat shows "thinking" meanwhile. */
export const VIEW_TIMEOUT_MS = 25_000;
/** How long a call this server handed out may be answered as part of the same ask (an ask takes seconds). */
export const VIEW_CALL_TTL_MS = 10 * 60_000;
/** The most calls held at once (oldest dropped first); a dropped call's answer is simply counted as a new ask. */
const VIEW_CALLS_HELD = 20_000;
/**
 * The turns one counted ask may run (its first and the ones that carry it on): an honest ask is three (read the page,
 * add, say), a model that also reads the schema or queries is four. The next turn is counted as a new ask, so a client
 * can't chain model turns under one count (commit security review of AS-13).
 */
export const VIEW_TURNS_PER_ASK = 4;

export interface ViewDeps {
  /** The live model when there is a key and the store isn't paused; the rule otherwise. Read per request. */
  llm: () => ViewLlm;
  live: ViewGate;
  rule: ViewGate;
  /** Who is asking, for the caps: a browser token (`viewKey` over the route's own cookie) and the network. */
  who: (c: Context) => { token: string; ip: string };
  /** The JSON-and-origin check every POST of ours makes. */
  ownPage: (c: Context) => Response | null;
  /** The fixed kind only, never the words or the provider's text (Lesson 15). */
  onFail?: (why: "timeout" | "error" | "dropped" | "capped") => void;
  now?: () => number;
  /** A digest for a conversation's prefix (main.ts passes SHA-256); `prefixHash` (FNV-1a, two lanes) when left out. */
  hash?: (s: string) => string;
}

/** A plain digest when no other is given: FNV-1a over two lanes (a forged prefix gains nothing a client can't just send). */
export function prefixHash(s: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b ^ c, 0x5bd1e995); }
  return `${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}`;
}
/** One conversation item in one fixed form, so the server's reply and the browser's echo of it read the same. */
const canon = (i: ViewItem | ViewCall): unknown => {
  if ("args" in i) return ["call", i.callId, i.name, JSON.stringify(i.args)];
  if (i.type === "message") return ["user", i.text];
  if (i.type === "function_call") { let a = i.arguments; try { a = JSON.stringify(JSON.parse(a)); } catch { /* kept as sent */ } return ["call", i.callId, i.name, a]; }
  return ["result", i.callId, i.output];
};

/**
 * The calls this server handed to each browser, so a turn that answers one is known to carry on an ask already counted
 * (Round 4 red team, R4-O1: "charging only an ask's first turn works only if continuation turns are bound to server-issued
 * call ids"). Keyed by browser token and call id; each is spent once, and only within VIEW_CALL_TTL_MS. Bound to its
 * ask (the commit security review of AS-13): each call is held with a digest of the conversation that produced it plus
 * the calls handed out, and a turn carries on only when its input is exactly that conversation followed by results to
 * those calls, and only up to VIEW_TURNS_PER_ASK turns in all. Anything else (a made-up call, a replay, another
 * conversation around a real call id, a restart, the fifth turn) is counted as a new ask.
 */
function issuedCalls(now: () => number, hash: (s: string) => string) {
  /** When each call was handed out, the digest of what it continues, which turn of its ask issued it, and whether that ask was the live caps'. */
  const held = new Map<string, { at: number; prefix: string; turn: number; live: boolean }>();
  const key = (token: string, callId: string) => `${token}\u0000${callId}`;
  const digest = (items: ReadonlyArray<ViewItem | ViewCall>) => hash(JSON.stringify(items.map(canon)));
  return {
    issue(token: string, req: ViewRequest, calls: ViewCall[], turn: number, live: boolean) {
      if (!calls.length) return;
      const prefix = digest([...req.input, ...calls]);
      for (const c of calls) held.set(key(token, c.callId), { at: now(), prefix, turn, live });
      for (const k of held.keys()) { if (held.size <= VIEW_CALLS_HELD) break; held.delete(k); }
    },
    /**
     * How the turn carries on: "live" when it continues an ask the live caps counted, "rule" when that ask was the
     * rule's (a capped ask stays the rule's to its end, so its later turns never reach the model past the caps), with
     * the turn's number in its ask; null for a new ask. Spends every call the turn answers, whatever the verdict.
     */
    carriesOn(token: string, req: ViewRequest): { how: "live" | "rule"; turn: number } | null {
      const input = req.input;
      let from = input.length;
      while (from > 0 && input[from - 1]!.type === "function_call_output") from--;
      const answers = input.slice(from) as ViewResultItem[];
      if (!answers.length) return null;
      const found = answers.map((r) => held.get(key(token, r.callId)));
      for (const r of answers) held.delete(key(token, r.callId));
      const first = found[0];
      if (!first || found.some((h) => !h || h.prefix !== first.prefix || h.at !== first.at)) return null;
      if (now() - first.at > VIEW_CALL_TTL_MS || first.turn >= VIEW_TURNS_PER_ASK) return null;
      if (digest(input.slice(0, from)) !== first.prefix) return null;
      return { how: first.live ? "live" : "rule", turn: first.turn + 1 };
    },
  };
}

/**
 * `POST /api/view`: check, cap, ask, filter, answer. Holds no payment port, no guard, no policy, no ledger. When the live
 * caps say no, the labelled rule answers under its own caps (Round 4 judges and red team: the box was dead on every 429
 * from a judging room's network), with `note` saying why; a 429 only when the rule's caps say no too.
 */
export function viewHandler(deps: ViewDeps): (c: Context) => Promise<Response> {
  const now = deps.now ?? (() => Date.now());
  const calls = issuedCalls(now, deps.hash ?? prefixHash);
  return async (c) => {
    const refused = deps.ownPage(c);
    if (refused) return refused;
    const parsed = parseViewRequest(await c.req.json().catch(() => null));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const { token, ip } = deps.who(c);
    let llm = deps.llm();
    const carries = calls.carriesOn(token, parsed.req);
    const ask = carries === null;
    let note: string | null = null;
    if (llm.name !== RULE_NAME && (carries?.how === "rule" || deps.live.takeOrWhy(token, ip, ask))) {
      llm = ruleViewer;
      note = VIEW_CAPPED;
      deps.onFail?.("capped");
    }
    const counted = llm.name !== RULE_NAME; // this turn's ask is the live caps' (a model failure below still leaves it so)
    if (llm.name === RULE_NAME && deps.rule.takeOrWhy(token, ip, ask)) return c.json({ error: VIEW_CAPPED }, 429);
    let turn: ViewTurn;
    try {
      turn = await llm.turn(parsed.req, AbortSignal.timeout(VIEW_TIMEOUT_MS));
    } catch (e) {
      if (llm.name === RULE_NAME) return c.json({ error: VIEW_FAILED }, 500);
      deps.onFail?.((e as Error).name === "TimeoutError" ? "timeout" : "error");
      llm = ruleViewer; // the rule still answers, labelled
      try { turn = await llm.turn(parsed.req); } catch { return c.json({ error: VIEW_FAILED }, 500); }
    }
    const kept = onlyViewCalls(await finishView(turn, parsed.req, llm.name));
    if (kept.dropped.length) deps.onFail?.("dropped");
    calls.issue(token, parsed.req, kept.turn.calls, carries?.turn ?? 1, counted);
    const at = now();
    const out = agResponse(kept.turn, `view-${at.toString(36)}`, at);
    return c.json(note ? { ...out, note } : out, 200, { "Cache-Control": "no-store" });
  };
}
