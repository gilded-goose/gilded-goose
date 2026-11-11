// The Claude buyer behind core's LlmPort. It sees fenced offers only (numbers
// and ids; seller text only as the quoted `noteText` in the labeled open mode) and answers through one tool whose schema is the
// BuyerMove. Whatever it returns is a proposal: the guard decides. The honest
// and evil prompts (M2) differ only in the prompt file passed in here.

import Anthropic from "@anthropic-ai/sdk";
import { Agent, fetch as undiciFetch } from "undici";
import type { ViewCall, ViewLlm, ViewRequest, ViewToolTable, ViewTurn } from "../view.ts";
import { isBuyerMove, racePorts, READER_SIGNS, type AskPort, type MarketMakerPort, type Photo, type PhotoPort, type ReaderInput, type ReaderPort, type ScamBrief, type ScammerPort, type BuyerInput, type BuyerMove, type Chip, type LlmPort, type RaceOptions } from "@goose/core";

export const BUYER_MODEL = "claude-haiku-5-5";

const MOVE_TOOL: Anthropic.Tool = {
  name: "move",
  description: "Your one move this round. Prices are integer cents. You may only propose; a code guard enforces the shopper's limits.",
  input_schema: {
    type: "object",
    properties: {
      type: { type: "string", enum: ["counter", "accept", "wait", "walk"] },
      sellerId: { type: "string", description: "Required for counter and accept." },
      price: { type: "integer", description: "Integer cents. Required for counter and accept." },
      why: { type: "string", description: "One short sentence the shopper will read." },
    },
    required: ["type", "why"],
  },
};

export interface ClaudeBuyerOptions {
  model?: string;
  /** "off" by default: Haiku 5.5 thinks unless told not to, and a haggle move has a 1.5 s budget (S3). */
  thinking?: "off" | "adaptive";
}

/**
 * One connection pool for every buyer call in the process (M2 step 1). Node's default
 * keeps an idle socket 4 s, so a run's first move paid a fresh TLS handshake and fell
 * back in 2 of 4 baseline runs; 60 s keeps the racers' sockets open between runs.
 * The SDK gets undici's own fetch with it: an Agent handed to a different undici
 * (Node 22's built-in fetch is 6.x) is not guaranteed to work.
 */
const POOL = new Agent({ keepAliveTimeout: 60_000, keepAliveMaxTimeout: 600_000 });
const WARM_TIMEOUT_MS = 2000;

export class ClaudeBuyer implements LlmPort {
  readonly name: string;
  private readonly client: Anthropic;
  private readonly systemPrompt: string;
  private readonly model: string;
  private readonly thinking: "off" | "adaptive";

  constructor(apiKey: string, systemPrompt: string, opts: ClaudeBuyerOptions = {}) {
    this.client = new Anthropic({ apiKey, maxRetries: 0, fetch: undiciFetch as unknown as typeof fetch, fetchOptions: { dispatcher: POOL } });
    this.systemPrompt = systemPrompt;
    this.model = opts.model ?? BUYER_MODEL;
    this.thinking = opts.thinking ?? "off";
    this.name = this.model;
  }

  /** A free call (lists one model, no tokens) that leaves a warm socket in the pool. A failure only means the first move may be cold. */
  async warm(): Promise<void> {
    await this.client.models.list({ limit: 1 }, { signal: AbortSignal.timeout(WARM_TIMEOUT_MS) }).catch(() => undefined);
  }

  async decide(input: BuyerInput, signal?: AbortSignal): Promise<BuyerMove> {
    const res = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: 200,
        system: this.systemPrompt,
        tools: [MOVE_TOOL],
        // One move per call: without this Haiku 5.5 starts a second, empty `move` and runs to max_tokens
        // (200 output tokens instead of ~140, every call; M2 step 1 diagnosis, results-first-move.json).
        tool_choice: { type: "tool", name: "move", disable_parallel_tool_use: true },
        thinking: this.thinking === "off" ? { type: "disabled" } : { type: "adaptive" },
        messages: [{ role: "user", content: JSON.stringify(input) }],
      },
      // The engine aborts at its timeout and the race aborts its losers; input tokens already sent are still billed.
      { signal },
    );
    const use = res.content.find((c) => c.type === "tool_use");
    const move = use && use.type === "tool_use" ? use.input : null;
    if (!isBuyerMove(move)) throw new Error("claude returned a malformed move");
    return move;
  }
}

/**
 * Three identical calls raced is what ships (S3, budget 1500 ms): one call p95 1957 ms; two raced
 * 1349–1645 ms over three runs, not stable; three raced 1355/1375/1349 ms, 0 of 90 moves over
 * (results-race3.json keeps only the last run; live first moves are slower, see M1.md).
 * Costs up to 3× the Haiku spend per move. Flip: 1 = one call plus the labeled rule fallback.
 */
export const BUYER_RACE = 3;

/** The buyer the server runs and S3 measures: BUYER_RACE ClaudeBuyers raced, losers aborted. */
export function makeClaudeBuyer(apiKey: string, systemPrompt: string, opts: ClaudeBuyerOptions & RaceOptions & { race?: number } = {}): LlmPort {
  const n = opts.race ?? BUYER_RACE;
  return racePorts(Array.from({ length: n }, () => new ClaudeBuyer(apiKey, systemPrompt, opts)), opts);
}

/**
 * Ask Goose's one call (A1): the shopper's words, quoted as data in the user turn, and the chips code would accept. It
 * answers through one tool whose schema has a kind, a name and a value, all words from the legal list: there is no field
 * for an amount, a quantity, a limit or a memory. Whatever comes back is read as unknown and checked by F4 in core.
 * Same model, client settings and pool as the buyer; one call, no race (the judge box's 3 s single-call budget).
 */
export class ClaudeAsker implements AskPort {
  readonly name: string;
  private readonly client: Anthropic;
  private readonly systemPrompt: string;
  private readonly model: string;

  constructor(apiKey: string, systemPrompt: string, model = BUYER_MODEL) {
    this.client = new Anthropic({ apiKey, maxRetries: 0, fetch: undiciFetch as unknown as typeof fetch, fetchOptions: { dispatcher: POOL } });
    this.systemPrompt = systemPrompt;
    this.model = model;
    this.name = model;
  }

  async propose(words: string, legal: readonly Chip[], signal?: AbortSignal): Promise<unknown> {
    const values = [...new Set(legal.map((c) => c.value))];
    const names = [...new Set(legal.flatMap((c) => (c.kind === "attribute" ? [c.name] : [])))];
    const tool: Anthropic.Tool = {
      name: "chips",
      // Strict: the API checks the answer against this schema (W49f: unstrict, Haiku once sent `chips` as a JSON string).
      strict: true,
      description: "The chips for this want, each copied exactly from the legal list. No prices, amounts, quantities, limits or memories: there is no field for them.",
      input_schema: {
        type: "object",
        properties: {
          chips: {
            type: "array",
            items: {
              type: "object",
              properties: {
                kind: { type: "string", enum: ["item", "category", "attribute", "seller"] },
                name: { type: "string", enum: names, description: "Only for an attribute chip." },
                value: { type: "string", enum: values },
              },
              required: ["kind", "value"],
              additionalProperties: false,
            },
          },
        },
        required: ["chips"],
        additionalProperties: false,
      },
    };
    const res = await this.client.messages.create(
      {
        model: this.model,
        // 400, not the buyer's 200: up to MAX_PROPOSED chips must fit, and a cut-off tool call reads as a bad answer.
        max_tokens: 400,
        system: this.systemPrompt,
        tools: [tool],
        tool_choice: { type: "tool", name: "chips", disable_parallel_tool_use: true },
        thinking: { type: "disabled" },
        messages: [{ role: "user", content: JSON.stringify({ words, legal }) }],
      },
      { signal },
    );
    const use = res.content.find((c) => c.type === "tool_use");
    return use && use.type === "tool_use" ? use.input : null;
  }
}

/**
 * The market maker (Desk slice 1, "Ask for anything"): one call turns the shopper's words, quoted as data, into 3–5
 * fictional sellers through one strict tool. The schema has no field for a limit, a category or a memory; whatever comes
 * back is read as unknown and checked by `parseMarket` in core, which also refuses real brands. Code plants the scam
 * seller after, never the model. Same client settings and pool as the buyer.
 */
export class ClaudeMarketMaker implements MarketMakerPort {
  readonly name: string;
  private readonly client: Anthropic;
  private readonly systemPrompt: string;
  private readonly model: string;

  constructor(apiKey: string, systemPrompt: string, model = BUYER_MODEL) {
    this.client = new Anthropic({ apiKey, maxRetries: 0, fetch: undiciFetch as unknown as typeof fetch, fetchOptions: { dispatcher: POOL } });
    this.systemPrompt = systemPrompt;
    this.model = model;
    this.name = model;
  }

  async propose(words: string, signal?: AbortSignal): Promise<unknown> {
    const tool: Anthropic.Tool = {
      name: "market",
      strict: true,
      description: "A fictional market for the shopper's words: one item title and 3 to 5 made-up sellers. No limits, categories or memories: there is no field for them.",
      input_schema: {
        type: "object",
        properties: {
          item: { type: "string", description: "A short plain title for the item, 60 characters at most, no brand." },
          sellers: {
            type: "array",
            description: "3 to 5 made-up sellers, each with a different invented name.",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "An invented shop name, 40 characters at most, never a real brand or store." },
                price: { type: "integer", description: "An estimated US price in whole cents, from 100 to 200000." },
                history: { type: "integer", description: "Completed sales on this fictional market, 0 to 10000." },
                note: { type: "string", description: "One short line the seller writes, 140 characters at most." },
              },
              required: ["name", "price", "history", "note"],
              additionalProperties: false,
            },
          },
        },
        required: ["item", "sellers"],
        additionalProperties: false,
      },
    };
    const res = await this.client.messages.create(
      {
        model: this.model,
        // Five sellers with notes fit well under 600; a cut-off tool call reads as a bad answer, so leave room.
        max_tokens: 600,
        system: this.systemPrompt,
        tools: [tool],
        tool_choice: { type: "tool", name: "market", disable_parallel_tool_use: true },
        thinking: { type: "disabled" },
        messages: [{ role: "user", content: JSON.stringify({ words }) }],
      },
      { signal },
    );
    const use = res.content.find((c) => c.type === "tool_use");
    return use && use.type === "tool_use" ? use.input : null;
  }
}

/**
 * The AI reader (W41 part 3): one call on a seller's three fields, quoted as data, answered through one strict tool with
 * two enums and nothing else. Whatever comes back is read as unknown and checked by `parseReading` in core, and enters
 * the Watcher only through `escalate`, which can only add caution. Same client settings and pool as the buyer.
 */
/**
 * The scammer AI's one call (Joshua's Tier 2a). No tools, on purpose and for good: its only output is text, which the caller
 * reads as a seller's note. "" means it declined.
 */
/**
 * The scammer AI's model, chosen by `scripts/scammer-measure.ts` (Nov 4), not by price: with the same honest prompt, Haiku 5.5 said
 * no to 39% and Sonnet 5.5 to 0 of 36. On the fuller prompt that ships, Sonnet 5.5 said no to 4 of 36. Every other job stays on `BUYER_MODEL`.
 */
export const SCAMMER_MODEL = "claude-sonnet-5-5";

/** Room for the thinking the Opus and Fable tiers can't turn off, which counts against this. The prompt and the fence cap the note. */
const SCAMMER_MAX_TOKENS = 2000;

/** What each tier takes for "no thinking, least effort": Haiku can disable it, Sonnet 5.5 says it differently, Opus 5.5 and Fable 5.1 can't. */
function scammerThinking(model: string): object {
  if (model.includes("haiku")) return { thinking: { type: "disabled" }, output_config: { effort: "low" } };
  if (model.includes("sonnet")) return { thinking: { type: "between_tools" }, output_config: { effort: "low" } };
  return { output_config: { effort: "low" } };
}

/** One answer from the scammer AI. `text` is "" on a refusal stop. Tokens are for the measuring script's cost column. */
export interface ScamAttempt { text: string; stop: string | null; category: string | null; inputTokens: number; outputTokens: number }

export class ClaudeScammer implements ScammerPort {
  readonly name: string;
  private readonly client: Anthropic;
  private readonly systemPrompt: string;
  private readonly model: string;

  constructor(apiKey: string, systemPrompt: string, model = SCAMMER_MODEL) {
    this.client = new Anthropic({ apiKey, maxRetries: 0, fetch: undiciFetch as unknown as typeof fetch, fetchOptions: { dispatcher: POOL } });
    this.systemPrompt = systemPrompt;
    this.model = model;
    this.name = model;
  }

  async write(brief: ScamBrief, signal?: AbortSignal): Promise<string> {
    return (await this.attempt(brief, signal)).text;
  }

  /**
   * One answer and what it cost. No retry and no fallback model, on purpose: a decline is the model's answer, and asking again
   * or asking another model would be pressing past it (Joshua, Nov 4). Hence no `fallbacks`, which every other caller could use.
   */
  async attempt(input: object, signal?: AbortSignal): Promise<ScamAttempt> {
    const res = await this.client.messages.create(
      { model: this.model, max_tokens: SCAMMER_MAX_TOKENS, system: this.systemPrompt, ...scammerThinking(this.model), messages: [{ role: "user", content: JSON.stringify(input) }] } as Anthropic.MessageCreateParamsNonStreaming,
      { signal },
    );
    const refused = res.stop_reason === "refusal";
    return {
      text: refused ? "" : res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim(),
      stop: res.stop_reason ?? null,
      category: refused ? ((res as unknown as { stop_details?: { category?: string | null } | null }).stop_details?.category ?? null) : null,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
    };
  }
}

export class ClaudeReader implements ReaderPort {
  readonly name: string;
  private readonly client: Anthropic;
  private readonly systemPrompt: string;
  private readonly model: string;

  constructor(apiKey: string, systemPrompt: string, model = BUYER_MODEL) {
    this.client = new Anthropic({ apiKey, maxRetries: 0, fetch: undiciFetch as unknown as typeof fetch, fetchOptions: { dispatcher: POOL } });
    this.systemPrompt = systemPrompt;
    this.model = model;
    this.name = model;
  }

  async read(input: ReaderInput, signal?: AbortSignal): Promise<unknown> {
    const tool: Anthropic.Tool = {
      name: "reading",
      strict: true,
      description: "Your reading of the seller's words. It can only make the shopping agent more careful.",
      input_schema: {
        type: "object",
        properties: {
          verdict: { type: "string", enum: ["clear", "hold", "refuse"] },
          sign: { type: "string", enum: [...READER_SIGNS] },
        },
        required: ["verdict", "sign"],
        additionalProperties: false,
      },
    };
    const res = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: 100,
        system: this.systemPrompt,
        tools: [tool],
        tool_choice: { type: "tool", name: "reading", disable_parallel_tool_use: true },
        thinking: { type: "disabled" },
        messages: [{ role: "user", content: JSON.stringify(input) }],
      },
      { signal },
    );
    const use = res.content.find((c) => c.type === "tool_use");
    return use && use.type === "tool_use" ? use.input : null;
  }
}

/**
 * The camera's one call (item 12): the photo as an image block and the legal chips as data, answered through one strict
 * tool with chip words from the legal list and one integer (the tag's price in cents, 0 for none). There is no field for
 * text, a limit, a quantity or a memory, so words in the photo can only become chips F4 refuses. Never kept, never logged.
 */
export class ClaudeLooker implements PhotoPort {
  readonly name: string;
  private readonly client: Anthropic;
  private readonly systemPrompt: string;
  private readonly model: string;

  constructor(apiKey: string, systemPrompt: string, model = BUYER_MODEL) {
    this.client = new Anthropic({ apiKey, maxRetries: 0, fetch: undiciFetch as unknown as typeof fetch, fetchOptions: { dispatcher: POOL } });
    this.systemPrompt = systemPrompt;
    this.model = model;
    this.name = model;
  }

  async look(photo: Photo, legal: readonly Chip[], signal?: AbortSignal): Promise<unknown> {
    const values = [...new Set(legal.map((c) => c.value))];
    const names = [...new Set(legal.flatMap((c) => (c.kind === "attribute" ? [c.name] : [])))];
    const tool: Anthropic.Tool = {
      name: "look",
      strict: true,
      description: "The chips for what this photo shows, each copied exactly from the legal list, and the price tag's whole cents (0 if none). Nothing else: there is no field for it.",
      input_schema: {
        type: "object",
        properties: {
          chips: {
            type: "array",
            items: {
              type: "object",
              properties: {
                kind: { type: "string", enum: ["item", "category", "attribute"] },
                // The API refuses an empty enum, so a catalog with no attributes sends no `name` at all.
                ...(names.length > 0 ? { name: { type: "string", enum: names, description: "Only for an attribute chip." } } : {}),
                value: { type: "string", enum: values },
              },
              required: ["kind", "value"],
              additionalProperties: false,
            },
          },
          tag_cents: { type: "integer", description: "The visible price tag in whole cents, or 0." },
        },
        required: ["chips", "tag_cents"],
        additionalProperties: false,
      },
    };
    const res = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: 400,
        system: this.systemPrompt,
        tools: [tool],
        tool_choice: { type: "tool", name: "look", disable_parallel_tool_use: true },
        thinking: { type: "disabled" },
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: photo.mediaType, data: photo.data } },
          { type: "text", text: JSON.stringify({ legal }) },
        ] }],
      },
      { signal },
    );
    const use = res.content.find((c) => c.type === "tool_use");
    return use && use.type === "tool_use" ? use.input : null;
  }
}

/**
 * "Ask for a view" (Track AS, 044 §4): one turn of the dashboard's view-building agent. AG Studio's conversation items
 * become Messages API turns (a tool call is a `tool_use` block, its result a `tool_result` block). Everything the model
 * is told comes from the server (security review of 47ff6e7): the system prompt is server/prompts/view.md and nothing
 * else, and each tool's description and schema come from the server's table (server/prompts/view-tools.json) for the
 * view-tool names the request offered. The browser supplies only the shopper's words, the calls and their results, all
 * capped by `parseViewRequest`. There is no field here for money, a limit or a ledger row, and whatever comes back is
 * filtered again by `onlyViewCalls`. Same model, client and pool as the buyer; one call, no race; the route's timeout
 * aborts it.
 */
export class ClaudeViewer implements ViewLlm {
  readonly name: string;
  private readonly client: Anthropic;
  private readonly systemPrompt: string;
  private readonly table: ViewToolTable;
  private readonly model: string;

  constructor(apiKey: string, systemPrompt: string, table: ViewToolTable, model = BUYER_MODEL) {
    this.client = new Anthropic({ apiKey, maxRetries: 0, fetch: undiciFetch as unknown as typeof fetch, fetchOptions: { dispatcher: POOL } });
    this.systemPrompt = systemPrompt;
    this.table = table;
    this.model = model;
    this.name = model;
  }

  async turn(req: ViewRequest, signal?: AbortSignal): Promise<ViewTurn> {
    const res = await this.client.messages.create(viewParams(this.model, this.systemPrompt, this.table, req), { signal });
    const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    const calls: ViewCall[] = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use").map((b) => ({ callId: b.id, name: b.name, args: (typeof b.input === "object" && b.input !== null ? b.input : {}) as Record<string, unknown> }));
    return { text, calls, model: this.model, usage: { input: res.usage.input_tokens, output: res.usage.output_tokens }, ...(res.stop_reason === "max_tokens" ? { incomplete: "max_output_tokens" as const } : {}) };
  }
}

/** One view turn's whole Messages API request: the server's prompt, the server's tool table, the kept conversation. */
export function viewParams(model: string, systemPrompt: string, table: ViewToolTable, req: ViewRequest): Anthropic.MessageCreateParamsNonStreaming {
  const tools: Anthropic.Tool[] = req.tools.map((name) => ({ name, description: table[name].description, input_schema: table[name].parameters as Anthropic.Tool.InputSchema }));
  const tc = req.toolChoice;
  const tool_choice: Anthropic.ToolChoice | undefined = tools.length === 0 ? undefined : tc === "auto" ? { type: "auto" } : tc === "none" ? { type: "none" } : tc === "required" ? { type: "any" } : req.tools.includes(tc.name) ? { type: "tool", name: tc.name } : { type: "auto" };
  return { model, max_tokens: 1500, system: systemPrompt, tools, ...(tool_choice ? { tool_choice } : {}), thinking: { type: "disabled" }, messages: viewMessages(req.input) };
}

/**
 * The kept conversation as Messages API turns: the shopper's words and tool results on the user side, tool calls on the
 * assistant side, consecutive same-side items in one turn, empty text skipped, a leading assistant turn given the user
 * turn the API requires. Arguments that aren't JSON become an empty object.
 */
export function viewMessages(items: ViewRequest["input"]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  const push = (role: "user" | "assistant", block: Anthropic.ContentBlockParam) => {
    const last = out[out.length - 1];
    if (last && last.role === role && Array.isArray(last.content)) last.content.push(block);
    else out.push({ role, content: [block] });
  };
  for (const it of items) {
    if (it.type === "message") {
      if (!it.text.trim()) continue;
      push("user", { type: "text", text: it.text });
    } else if (it.type === "function_call") {
      let input: unknown = {};
      try { input = JSON.parse(it.arguments); } catch { input = {}; }
      push("assistant", { type: "tool_use", id: it.callId, name: it.name, input: typeof input === "object" && input !== null ? input : {} });
    } else {
      push("user", { type: "tool_result", tool_use_id: it.callId, content: it.output || "(empty)" });
    }
  }
  if (out.length === 0 || out[0]!.role !== "user") out.unshift({ role: "user", content: [{ type: "text", text: "(The conversation starts here.)" }] });
  return out;
}
