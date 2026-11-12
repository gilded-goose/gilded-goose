// "Ask for a view" in the browser (Track AS, slice 3; docs/guild/044-ag-studio.md §4): AG Studio's Agent Framework with
// one agent of our own, a Direct LLM Runner whose adapter POSTs each turn to the server's `/api/view` and streams AG's
// events back from the one JSON reply. The browser knows only that address: no key, no provider, no model name here
// (check-bundle greps the bundle for them). The agent lists only view tools, so nothing it is asked can pay, approve,
// change a limit or write a ledger row; the server refuses any other tool name as well (server/src/view.ts), and the
// test in core/test/ask-view.test.ts reads this file's tool list against that allow-list. Loaded only with the Studio chunk.

import { createAiHarness, directLlmRunner, type AgAiEvent, type AgAiHarness, type AgAiPromptStarter, type AgAiTool, type AgLlmAdapter, type AgLlmRequest, type AgLlmResponse, type AgStudioApi } from "ag-studio";
import { tracksIn } from "./layout.ts";
import { widgetOfType } from "./widgets/index.tsx";
import { PROMPT_STARTERS as STARTERS } from "./words.ts";
import { PAGE_RULE_NOTE, PAGE_RULE_OFFLINE, pagePick, pageRuleTurn, stockAnswer, stockTold, type PageItem } from "./rule.ts";

export const VIEW_URL = "/api/view";
export const VIEW_AGENT = "goose-view";
/** The fixed words when the server can't answer (the route's own sentence wins when it sends one). */
export const VIEW_FAILED = "Goose couldn't build that just now. Nothing changed.";

/** The three asks on the box (words.ts, shared with the shell), each a question one of the six Goose widgets answers. */
export const PROMPT_STARTERS: AgAiPromptStarter[] = [...STARTERS];

/**
 * What the server reads from one of AG's requests, and nothing more (security review of 47ff6e7): the shopper's own
 * words, the view-tool calls and their results, the names of the tools offered and the tool choice. The agent's
 * instructions live on the server (server/prompts/view.md) and so do each tool's description and schema
 * (server/prompts/view-tools.json); the server drops anything else a request carries.
 */
export function viewBody(request: AgLlmRequest): { input: unknown[]; tools: Array<{ name: string }>; toolChoice?: AgLlmRequest["toolChoice"] } {
  const input = request.input.flatMap((item): unknown[] => {
    if (item.type === "message" && item.role === "user") return [{ type: "message", role: "user", content: item.content }];
    if (item.type === "function_call") return [{ type: "function_call", callId: item.callId, name: item.name, arguments: item.arguments }];
    if (item.type === "function_call_output") return [{ type: "function_call_output", callId: item.callId, output: item.output }];
    return [];
  });
  return { input, tools: (request.tools ?? []).map((t) => ({ name: t.name })), ...(request.toolChoice ? { toolChoice: request.toolChoice } : {}) };
}

/**
 * The quiet note for the latest ask, when a rule answered because the live model couldn't: the server's one cap sentence
 * (`VIEW_CAPPED`, "Today's AI view-building from here is used up."), the same whether it came as a capped 200's `note`
 * or a 429's `error` (AS-14: only the cause; the answer's own label says a rule answered), or PAGE_RULE_NOTE (no answer
 * at all). Studio reads it when the ask settles and clears it before the next.
 */
export const viewNote = { text: "" };
/** The shopper's latest words, for the one tool that has to read them: a stock pick's nearest card (`addOnce`). */
const askedNow = { text: "" };
/** The page's own answer when the model asked for a chart it can't have. Studio shows it in place of the model's words, so one line says it and no model can claim more. */
export const viewSaid = { text: "" };
/**
 * After a 429 the rest of this page's asks go to the page's own rule without asking the server again (its caps are per
 * day, so a second ask would only print a second red line in the console). A reload asks the server again.
 */
let pageOnly: string | null = null;

/** One reply in AG's shape from the page's own rule (rule.ts): the same content events a server reply streams. */
function pageReply(request: ReturnType<typeof viewBody>, at: number): AgLlmResponse {
  const turn = pageRuleTurn(request.input as PageItem[], request.tools.map((t) => t.name));
  const base = `view-${at.toString(36)}`;
  const output: AgLlmResponse["output"] = [];
  if (turn.text) output.push({ id: `${base}-m`, kind: "output", type: "message", role: "assistant", status: "completed", content: [{ type: "text", text: turn.text, annotations: [] }] });
  turn.calls.forEach((c, i) => output.push({ id: `${base}-c${i}`, kind: "output", type: "function_call", callId: c.callId, name: c.name, arguments: JSON.stringify(c.args), status: "completed" } as AgLlmResponse["output"][number]));
  return { id: base, createdAt: at, status: "completed", output };
}

/**
 * One turn: the request as AG shaped it, cut to `viewBody`, posted to the server; the reply's items replayed as AG's
 * content events. When the server can't answer (a 429, a 5xx, no network), the page's own rule answers instead, labelled
 * "No AI call", so the box never goes dead (Round 4 judges, fix 2). A 400, 403 or 413 is the server refusing the
 * conversation itself, and its sentence is the answer.
 */
export const viewAdapter: AgLlmAdapter = {
  executeTurn(request, options) {
    const complete = (async (): Promise<AgLlmResponse> => {
      const at = Date.now();
      const said = (text: string): AgLlmResponse => ({ id: `view-${at.toString(36)}`, createdAt: at, status: "completed", output: [{ id: `view-${at.toString(36)}-m`, kind: "output", type: "message", role: "assistant", status: "completed", content: [{ type: "text", text, annotations: [] }] }] });
      const sent = viewBody(request);
      const latest = sent.input[sent.input.length - 1] as PageItem | undefined;
      if (latest?.type === "message") { viewNote.text = ""; askedNow.text = latest.content.map((p) => p.text ?? "").join("\n"); }
      if (pageOnly !== null) { viewNote.text = pageOnly; return pageReply(sent, at); }
      let r: Response;
      try {
        r = await fetch(VIEW_URL, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(viewBody(request)), signal: options?.signal ?? null });
      } catch (e) {
        if ((e as Error).name === "AbortError") throw e;
        viewNote.text = navigator.onLine ? PAGE_RULE_NOTE : PAGE_RULE_OFFLINE;
        return pageReply(sent, at);
      }
      const body = (await r.json().catch(() => null)) as (AgLlmResponse & { error?: never; note?: string }) | { error?: string } | null;
      const error = body && "error" in body && typeof body.error === "string" ? body.error : "";
      if (r.status === 429) { pageOnly = error || PAGE_RULE_NOTE; viewNote.text = pageOnly; return pageReply(sent, at); }
      if (r.status >= 500) { viewNote.text = PAGE_RULE_NOTE; return pageReply(sent, at); }
      if (!r.ok || !body || !("output" in body) || !Array.isArray(body.output)) return said(error || VIEW_FAILED);
      if (typeof body.note === "string" && body.note) viewNote.text = body.note;
      return body;
    })();
    const stream = {
      async *[Symbol.asyncIterator](): AsyncIterator<AgAiEvent> {
        const res = await complete;
        for (const item of res.output) {
          if (item.type === "message") {
            yield { type: "TEXT_MESSAGE_START", messageId: item.id, role: "assistant" };
            for (const part of item.content) if (part.type === "text" && part.text) yield { type: "TEXT_MESSAGE_CONTENT", messageId: item.id, delta: part.text };
            yield { type: "TEXT_MESSAGE_END", messageId: item.id };
          } else if (item.type === "function_call") {
            yield { type: "TOOL_CALL_START", toolCallId: item.callId, toolCallName: item.name };
            yield { type: "TOOL_CALL_ARGS", toolCallId: item.callId, delta: item.arguments };
            yield { type: "TOOL_CALL_END", toolCallId: item.callId };
          }
        }
      },
    };
    return { stream, complete };
  },
};

/** The words the model (or the rule) reads back when a view was already on the page; `alreadyOnPage` is what the rule looks for. */
export const ALREADY_ON_PAGE = (widgetId: string, type: string) => `That view is already on this page (widget "${widgetId}", type ${type}): it was scrolled into view and lit. Nothing was added; add nothing else for it.`;

/**
 * AG's `add_widget` with one rule of the page's own in front of it (the Design Director's gate, slice 3 item 2): a Goose
 * view that is already on the page is shown, not added twice. The page's `show(widgetId)` scrolls to the existing card
 * and lights it; the tool's result tells the model so, with `alreadyOnPage: true` for the fixed rule to read. A view
 * that is new, or any stock Studio widget, goes to AG's tool unchanged. The name stays `add_widget`, the one the server
 * allows, so the allow-list and the tests read the same list.
 */
export function addOnce(api: AgStudioApi, tool: AgAiTool, show: (widgetId: string) => void): AgAiTool {
  // An asked card goes at the bottom of the page, wherever the model says: past the bottom, AG draws it with no frame, under the board.
  const bottom = () => {
    const state = api.getState();
    return tracksIn((state.pages.find((p) => p.id === state.selectedPageId) ?? state.pages[0])?.widgetLayout ?? {});
  };
  return {
    name: tool.name,
    description: tool.description,
    kind: tool.kind,
    schema: () => tool.schema(),
    async execute(call, ctx) {
      const type = typeof call.args.type === "string" ? call.args.type : "";
      // The prompt and the tool's own list name only Goose's cards, but a model can still send a stock type, and with no configure_widget
      // on the page it draws "No data to display". So it never lands: the nearest Goose card does, or the page says it can't.
      if (!type.startsWith("goose-")) {
        const { near, note } = stockAnswer(askedNow.text);
        viewSaid.text = note;
        if (!near) return ctx.success(stockTold(type, null), { added: false, type });
        const there = widgetOfType(api.getState(), near);
        if (there) { show(there); return ctx.success(stockTold(type, near), { alreadyOnPage: true, widgetId: there, type: near }); }
        if (!tool.execute) return ctx.error("add_widget can't run here.");
        const height = pagePick(askedNow.text)!.height;
        const added = await tool.execute.call(tool, { ...call, args: { ...call.args, type: near, xTrack: 0, yTrack: bottom(), xSpan: 24, ySpan: height } }, ctx);
        if (!added.success) return added;
        if (typeof call.args.widgetId === "string") show(call.args.widgetId);
        return ctx.success(stockTold(type, near), { widgetId: call.args.widgetId, type: near });
      }
      const existing = widgetOfType(api.getState(), type);
      if (existing) {
        show(existing);
        return ctx.success(ALREADY_ON_PAGE(existing, type), { alreadyOnPage: true, widgetId: existing, type });
      }
      if (!tool.execute) return ctx.error("add_widget can't run here.");
      const done = await tool.execute.call(tool, { ...call, args: { ...call.args, yTrack: bottom() } }, ctx);
      // A card the ask added is a card to go to, like one it found: until the charts of the tries, every Goose view was already on the
      // page, so nothing took the reader to a new one. An add that failed draws no card with this id, so the landing finds nothing.
      if (typeof call.args.widgetId === "string") show(call.args.widgetId);
      return done;
    },
  };
}

/**
 * Studio's harness with our one agent. Its tools are seven of the server's eight view tools (configure_widget binds to
 * one widget and would need a listing per widget; a follow-up in 044); no remove, no expressions, no delegation.
 * `show` is the page's scroll-to-and-light for a view that is already there.
 */
export function viewHarness(api: AgStudioApi, show: (widgetId: string) => void = () => {}): AgAiHarness {
  return createAiHarness(api, ({ tools }) => ({
    primary: VIEW_AGENT,
    promptStarters: PROMPT_STARTERS,
    agents: [
      directLlmRunner({
        id: VIEW_AGENT,
        name: "Goose's view builder",
        description: "Builds views of Goose's ledger. Never pays, approves or changes a limit.",
        adapter: viewAdapter,
        maxTurns: 8, // no instructions here: the server's prompt is the only one the model reads
        tools: () => [tools.studio.viewSchema(), tools.studio.viewPage(), tools.studio.executeQuery(), addOnce(api, tools.studio.addWidget(), show), tools.studio.positionWidget(), tools.studio.addPageFilter(), tools.studio.addWidgetFilter()],
      }),
    ],
  }));
}
