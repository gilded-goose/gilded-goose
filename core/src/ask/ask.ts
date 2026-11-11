// Ask Goose, typed first (A1; N7, N16, N22; 019): the shopper's want, typed or dictated by the phone keyboard's mic,
// becomes chips. One model call proposes; F4's `validateChips` decides each chip, and code drops anything else. The
// output has no field a number, a quantity, a limit or a memory could go in, and nothing downstream reads one from the
// words: the limit chip is the fixed words "under your limit", resolved from Settings when the guard decides (F4).
// The words are never kept: everything returned here is chips and fixed sentences, never the words and never a
// provider's error text (project Lesson 15). Pure: the browser runs the rule half when live mode isn't answering (H1).

import type { Catalog, CatalogItem } from "../trust/catalog.ts";
import { NEW_SELLERS_ASK_FIRST, UNDER_YOUR_LIMIT, validateChips, type Chip } from "../trust/chips.ts";
import type { CapHit } from "../judge/caps.ts";
import { demoCatalogItems, demoPolicy, type DemoSession, type DemoShoppers } from "../scenario.ts";
import { fromCents } from "../money.ts";
import { categoryLimitFor } from "../trust/policy.ts";
import { RUN_ENTRIES, notShoppedYet, SAY_WHICH, runsShop, runsShopCategory } from "./shops.ts";
import { ASK_TIMEOUT_MS, MAX_ASK_CHARS, SETTINGS_ONLY, TAP_TO_BUY, YES, keepsLastChips } from "./copy.ts";
import { withoutSeenPrices } from "./saw.ts";
import { foldMemory, rememberedChip } from "./memory.ts";

export { ASK_TIMEOUT_MS, MAX_ASK_CHARS, SETTINGS_ONLY, TAP_TO_BUY };

/** More proposed chips than this are refused unread: a want needs a handful, and each one is checked against the rest. */
export const MAX_PROPOSED = 8;

/** The model behind Ask Goose. Whatever it returns is a proposal, read as `unknown`: code decides every chip. */
export interface AskPort {
  readonly name: string;
  /** One call: the words as quoted data, and the only chips code would accept. Abort `signal` at the timeout. */
  propose(words: string, legal: readonly Chip[], signal?: AbortSignal): Promise<unknown>;
}

/**
 * Why the rule read the words instead of the AI: the server has no key ("off"), the page is in the browser ("away"), she is
 * offline so the page is in the browser ("offline", R-13: the cause the code saw is her network, never the server), the
 * server's count of rule asks from here is used up so the browser read them ("capped"), a live cap, or the call fell over.
 */
export type AskWhy = "off" | "away" | "offline" | "capped" | CapHit | "timeout" | "error" | "bad-answer";
/** What read the words. The server may keep this beside the chips; never the words. */
export type AskSource = "ai" | "rule-off" | "rule-cap" | "rule-fallback" | "rule-browser";

export interface AskResult {
  source: AskSource;
  /** Checked by F4 one at a time and together; "under your limit" is always one of them (code adds it). */
  chips: Chip[];
  /** How many proposed chips code refused, and why, in F4's fixed words (never the chip's own text). */
  refused: number;
  reasons: string[];
  /** Which reader ran, in fixed words. */
  label: string;
  /** The speak-back line, built by code from the chips: never a question, never a number (N27). */
  speak: string;
  /** The words asked for something only Settings or your tap can do (a limit, a quantity, approving, remembering). */
  settingsOnly: boolean;
  /**
   * A2: the color chip memory added ("from your week"), the key that forgets it, and the speak-back without it (what
   * the page says once it is forgotten), or null. Code adds it from her own paid rows after the reader ran; no model sees
   * the ledger.
   */
  memory: { color: string; key: string; speak: string } | null;
  /**
   * The limit, in dollars, of the item the chips name, from this browser's own Settings (`categoryLimitFor`), so the
   * ladder compares a jacket against the clothing limit, not the kitchen's. Only the server's ask has it; never the model's.
   */
  itemLimit?: string;
}

/** The shape every caller gets: these keys, nothing the model wrote (an `AskResult` is rebuilt by code, never spread). */
export const ASK_RESULT_KEYS = ["source", "chips", "refused", "reasons", "label", "speak", "settingsOnly", "memory"] as const;

export const ASK_LABEL: Record<AskWhy, string> & { ai: (aiName: string) => string } = {
  ai: (aiName: string) => `${aiName} read your words and proposed; code checked every chip against the catalog.`,
  off: "Live AI is off on this server, so a plain keyword rule read your words; code checked every chip.",
  away: "Live mode isn't answering, so a plain keyword rule read your words in your browser; code checked every chip.",
  // R-13: built like PAIR_WORDS.offline; the rule still ran here, in her browser.
  offline: "You're offline, so a plain keyword rule read your words in your browser; code checked every chip.",
  capped: "The server's asks from here are used up for today, so a plain keyword rule read your words in your browser; code checked every chip.",
  token: "You've used this browser's live AI asks for today, so a plain keyword rule read your words; code checked every chip.",
  ip: "This network has used its live AI asks for today, so a plain keyword rule read your words; code checked every chip.",
  global: "Today's live AI cap is reached, so a plain keyword rule read your words; code checked every chip.",
  // Written out (not built from ASK_TIMEOUT_MS) so docs/claims.md can find it; its probe fails if the timeout moves.
  timeout: "The AI didn't answer within 3 s, so a plain keyword rule read your words; code checked every chip.",
  error: "The AI call failed, so a plain keyword rule read your words; code checked every chip.",
  "bad-answer": "The AI's answer was unusable, so a plain keyword rule read your words; code checked every chip.",
};


/** Validate what a browser sent. Over-long text is refused, never cut silently (as the judge box). */
export function parseAsk(body: unknown): { ok: true; words: string } | { ok: false; error: string } {
  const w = typeof body === "object" && body !== null ? (body as Record<string, unknown>).words : undefined;
  if (typeof w !== "string") return { ok: false, error: "words must be text" };
  if (w.length > MAX_ASK_CHARS) return { ok: false, error: `that's over ${MAX_ASK_CHARS} characters` };
  if (w.trim() === "") return { ok: false, error: "type what Goose should find" };
  return { ok: true, words: w };
}

/** Every chip code would accept on its own: what the model may choose from. The limit chip is added by code, never asked for. */
export function legalChips(catalog: Catalog): Chip[] {
  const out: Chip[] = [];
  const cats = new Set<string>();
  for (const [id, e] of catalog) {
    out.push({ kind: "item", value: id });
    cats.add(e.category);
    for (const [name, words] of Object.entries(e.attributes ?? {})) for (const value of words) {
      if (!out.some((c) => c.kind === "attribute" && c.name === name && c.value === value)) out.push({ kind: "attribute", name, value });
    }
  }
  for (const value of cats) out.push({ kind: "category", value });
  out.push({ kind: "seller", value: NEW_SELLERS_ASK_FIRST });
  return out;
}

// ---------- reading words (transiently; nothing here is kept) ----------

const fold = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
const tokens = (s: string) => fold(s).split(/[^\p{L}']+/u).filter(Boolean);
const NEGATORS = new Set(["not", "no", "without", "except", "never", "nor", "non", "sin", "sans", "nicht", "kein", "keine"]);
const negates = (t: string) => NEGATORS.has(t) || t.endsWith("n't");

/** Words the shopper negated ("not black", "without a red one"): a negator up to two words before, in the same clause. */
function negatedWords(words: string): Set<string> {
  const out = new Set<string>();
  for (const clause of fold(words).split(/[,.;:!?\n]+/)) {
    const t = tokens(clause);
    t.forEach((w, i) => { if (t.slice(Math.max(0, i - 2), i).some(negates)) out.add(w); });
  }
  return out;
}

const SETTINGS_WORDS = /\b(limits?|limite|max(imum)?|budget|precio|preis|prix|dutzend|spend(ing)?|money|price|cost|quantity|qty|units?|pieces?|pack|dozen|remember|memori[sz]e|forget|always|automatic(ally)?|auto|approve[ds]?|approval|settings?|raise|increase|unlimited|object|ask me)\b/;
// A number alone is a size ("a 1.7L kettle", "2 litres"); only money or a count of things asks for what Settings holds.
const COUNT = "(?:\\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|hundred)";
const MONEY = /\p{Sc}|\b(dollars?|bucks|usd|eur|euros?|pounds?|pesos?|cents?|thousand)\b/u;
const QUANTITY = new RegExp(`\\bx\\s?\\d+\\b|\\b\\d+\\s?x\\b|\\b(buy|get|order|want|need)\\s+${COUNT}\\b|\\b${COUNT}\\s+(?!(?:lit(?:er|re)s|quarts|cups|inches|watts|volts|years|days|hours|minutes|seconds)\\b)\\p{L}+s\\b`, "u");

/**
 * The plain keyword rule: catalog words found in the shopper's words, nothing else. An item by its id or a word of its
 * name (lowercased, plurals), a category by name, an attribute word the words don't negate, and "new sellers ask first"
 * when the words mention a new or trusted seller. It never reads a number; the limit chip is added by code anyway.
 */
export function ruleChips(words: string, catalog: Catalog): Chip[] {
  const t = new Set(tokens(words));
  const neg = negatedWords(words);
  const has = (w: string) => t.has(w) || t.has(`${w}s`) || t.has(`${w}es`);
  const out: Chip[] = [];
  // The entry the words name most: its id, or the most words of its name, so "the Tidewater jacket" is the Tidewater,
  // not the first entry that shares "jacket". A tie inside one category ("a black jacket") names neither: it's the
  // category, never a guessed item. Any other tie keeps the catalog's order (the kettle first).
  const score = ([id, e]: [string, CatalogItem]) => (has(fold(id)) ? 100 : 0) + tokens(e.item).filter((w) => w.length >= 4 && w !== "fictional").filter(has).length;
  const top = Math.max(0, ...[...catalog].map(score));
  const tied = [...catalog].filter((x) => top > 0 && score(x) === top);
  const tiedCategory = tied[0]?.[1].category;
  const oneCategory = tied.length > 1 && tied.every(([, e]) => e.category === tiedCategory);
  const entry = oneCategory ? undefined : tied[0];
  if (entry) out.push({ kind: "item", value: entry[0] });
  else if (oneCategory && tiedCategory) out.push({ kind: "category", value: tiedCategory });
  else { const cat = [...new Set([...catalog.values()].map((e) => e.category))].find((c) => has(fold(c))); if (cat) out.push({ kind: "category", value: cat }); }
  const pool = entry ? [entry[1]] : [...catalog.values()];
  const named = new Set<string>();
  for (const e of pool) for (const [name, ws] of Object.entries(e.attributes ?? {})) {
    if (named.has(name)) continue;
    const w = ws.find((v) => t.has(fold(v)) && !neg.has(fold(v)));
    if (w) { out.push({ kind: "attribute", name, value: w }); named.add(name); }
  }
  if (/\b(new|unknown|trusted|established)\b/.test(fold(words)) && /\b(sellers?|shops?|stores?)\b/.test(fold(words))) out.push({ kind: "seller", value: NEW_SELLERS_ASK_FIRST });
  return out;
}

/**
 * The trusted half: proposed chips, one at a time, each kept only if F4 accepts it beside the ones already kept. A chip
 * for an attribute word the shopper negated ("not black") is refused too: a proposal can't flip the shopper's own no.
 * "under your limit" is always added by code. Every kept chip is F4's rebuilt copy, so no extra field survives.
 */
export function keepLegal(proposed: readonly unknown[], catalog: Catalog, words: string): { chips: Chip[]; refused: number; reasons: string[] } {
  let kept: Chip[] = [];
  let refused = 0;
  const reasons = new Set<string>();
  const neg = negatedWords(words);
  const refuse = (why: string) => { refused++; reasons.add(why); };
  if (proposed.length > MAX_PROPOSED) refuse(`more than ${MAX_PROPOSED} chips proposed; the rest were not read`);
  for (const c of proposed.slice(0, MAX_PROPOSED)) {
    const check = validateChips([...kept, c], catalog);
    if (check.kind === "refused") { refuse(check.reason.replace(/^chip \d+:? /, "")); continue; }
    const last = check.chips.at(-1)!;
    if (last.kind === "attribute" && neg.has(fold(last.value))) { refuse("your words said not that"); continue; }
    kept = check.chips;
  }
  if (!kept.some((c) => c.kind === "limit")) {
    const check = validateChips([...kept, { kind: "limit", value: UNDER_YOUR_LIMIT }], catalog);
    if (check.kind === "accepted") kept = check.chips;
  }
  return { chips: kept, refused, reasons: [...reasons] };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Said for an item or category a run doesn't shop yet (ask/shops.ts): true whether or not the Ask saved a want. */
export const NOT_SHOPPED_SPOKEN = "Runs don't shop for that yet. Say “I really want” it and Goose watches its price.";
/** A category that names more than one thing a run shops ("any travel deals?"). Never a question (N27). */
export const SAY_WHICH_SPOKEN = "Goose shops more than one of those. Say which one by name.";

/**
 * About 2 s of speech, from the chips alone: what Goose read. Never a question (N27), and no promise about Go: a run
 * doesn't read the chips yet (flip in 020: "Tap Go to find it." once chips steer a run).
 */
export function speakLine(chips: readonly Chip[], words: string): string {
  const item = chips.find((c) => c.kind === "item")?.value;
  const category = chips.find((c) => c.kind === "category")?.value;
  const color = chips.find((c) => c.kind === "attribute")?.value;
  if ((item !== undefined && !runsShop(item)) || (item === undefined && category !== undefined && !runsShopCategory(category))) return notShoppedYet(chips) === SAY_WHICH ? SAY_WHICH_SPOKEN : NOT_SHOPPED_SPOKEN;
  // An item as Goose says it ("Marsh Lights ticket"), never its catalog id.
  const what = (item !== undefined ? RUN_ENTRIES[item]?.said : undefined) ?? item ?? (category ? `${category} item` : undefined);
  if (what) return `${cap([color, what].filter(Boolean).join(" "))}, under your limit.`;
  if (YES.test(fold(words))) return TAP_TO_BUY;
  return "Nothing in the catalog matches that yet.";
}

function result(source: AskSource, label: string, proposed: readonly unknown[], catalog: Catalog, words: string): AskResult {
  const { chips, refused, reasons } = keepLegal(proposed, catalog, words);
  // A seen price ("I saw it for $55") goes to its own field, not Settings, so only the rest of the words can ask for it.
  const f = fold(withoutSeenPrices(words));
  return { source, chips, refused, reasons, label, speak: speakLine(chips, words), settingsOnly: SETTINGS_WORDS.test(f) || MONEY.test(f) || QUANTITY.test(f) || YES.test(f), memory: null };
}

export interface AskOptions {
  catalog: Catalog;
  /** The live model, or null when the server has none. */
  port: AskPort | null;
  /** Set when the AI may not be called (a cap, or the page is in the browser): the rule reads the words and says why. */
  why?: Extract<AskWhy, "off" | "away" | "offline" | "capped" | CapHit>;
  /** The name the shopper reads, e.g. "Claude Haiku 5.5". */
  aiName: string;
  timeoutMs?: number;
  /** Told the fixed kind of a failed call (never its text) so the server can log that one happened. */
  onFail?: (why: Extract<AskWhy, "timeout" | "error" | "bad-answer">) => void;
}

/** The proposed list: an array, or `{chips: [...]}`. */
const listOf = (v: unknown): unknown[] | null =>
  Array.isArray(v) ? v : typeof v === "object" && v !== null && Array.isArray((v as { chips?: unknown }).chips) ? (v as { chips: unknown[] }).chips : null;

/**
 * The model's answer as a list of proposals, or null. Haiku sometimes sends `chips` as a JSON string of the list (W49f,
 * seen live): that string is parsed once, never again, and what it holds goes through the same F4 loop as any proposal.
 */
function chipList(raw: unknown): unknown[] | null {
  const direct = listOf(raw);
  if (direct) return direct;
  const s = typeof raw === "object" && raw !== null ? (raw as { chips?: unknown }).chips : undefined;
  if (typeof s !== "string") return null;
  try { return listOf(JSON.parse(s)); } catch { return null; }
}

/** Words → chips: one model call when allowed, else the plain rule; either way F4 decides each chip. */
export async function askToChips(words: string, o: AskOptions): Promise<AskResult> {
  const rule = (why: AskWhy): AskResult => result(why === "away" || why === "offline" || why === "capped" ? "rule-browser" : why === "off" ? "rule-off" : why === "token" || why === "ip" || why === "global" ? "rule-cap" : "rule-fallback", ASK_LABEL[why], ruleChips(words, o.catalog), o.catalog, words);
  if (o.why || !o.port) return rule(o.why ?? "off");
  const ms = o.timeoutMs ?? ASK_TIMEOUT_MS;
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => { rej(new Error("timeout")); abort.abort(); }, ms); }); // timeout settles first, so a port that rejects on abort still reads as a timeout
  let raw: unknown;
  try {
    raw = await Promise.race([o.port.propose(words, legalChips(o.catalog), abort.signal), timeout]);
  } catch (e) {
    const why = e instanceof Error && e.message === "timeout" ? "timeout" : "error";
    o.onFail?.(why);
    return rule(why);
  } finally { clearTimeout(timer); }
  const list = chipList(raw);
  if (!list) { o.onFail?.("bad-answer"); return rule("bad-answer"); }
  return result("ai", ASK_LABEL.ai(o.aiName), list, o.catalog, words);
}

/**
 * A2: the reader's chips with memory's one color chip added, when the chips name an item that comes in colors and say
 * none (memory.ts `rememberedChip`). The speak-back is rebuilt from the new chips, so it says the color too.
 */
export function withMemory(r: AskResult, session: Pick<DemoSession, "shopper" | "memory"> | undefined, words: string, at: number): AskResult {
  if (!session) return r;
  const catalog = demoCatalogItems();
  const neg = negatedWords(words);
  const got = rememberedChip(r.chips, foldMemory(session.shopper.read(), session.memory, catalog, at), words, catalog, (w) => neg.has(fold(w)));
  if (!got) return r;
  // Said aloud too, so a shopper who hears rather than sees the chip knows the color came from her week, not her words.
  const from = `${got.fact.color.charAt(0).toUpperCase()}${got.fact.color.slice(1)} is from your week; tap its x to forget it.`;
  return { ...r, chips: got.chips, speak: `${speakLine(got.chips, words)} ${from}`, memory: { color: got.fact.color, key: got.fact.key, speak: r.speak } };
}

/**
 * What POST /api/runs/ask runs: words → chips for one browser's session, and only the chips are kept (F4's
 * `setChips`). The session's Policy, its ledger (the week, and A2's memory folded from it) and the cart's quantity are
 * never touched: the words reach no field that holds them. Memory may add one color chip, read from her own paid rows.
 */
export async function askForSession(shoppers: DemoShoppers, token: string, at: number, words: string, o: Omit<AskOptions, "catalog">): Promise<AskResult> {
  const catalog = demoCatalogItems();
  const read = await askToChips(words, { ...o, catalog });
  const kept = keepsLastChips(words, read.chips);
  // `session`, not `peek`: setChips below makes this session anyway (after the caps), and a new one holds the seeded week.
  const r = kept ? read : withMemory(read, shoppers.session(token, at), words, at);
  if (!kept) shoppers.setChips(token, r.chips, at);
  const item = r.chips.find((c) => c.kind === "item");
  const entry = item ? catalog.get(item.value) : undefined;
  return entry ? { ...r, itemLimit: fromCents(categoryLimitFor(shoppers.peek(token, at)?.policy ?? demoPolicy(), entry.category)) } : r;
}

/** A per-browser, per-network and per-day count (core's `LiveCaps`). */
export interface AskGate { takeOrWhy(token: string, ip: string): CapHit | null }
export type AskReply = { status: 200; body: AskResult } | { status: 429; body: { error: string; cap: CapHit } };
export const ASK_RULE_CAPPED = "Today's asks from here are used up on the server. Nothing changed.";

/**
 * POST /api/runs/ask after its words are parsed (W49g). A live call takes the live caps; every other ask (no key, a live
 * cap hit) takes the rule caps before any session is made, so a flood of cookieless rule asks can't mint sessions and
 * push real browsers' chips out of DemoShoppers. Past the rule caps: 429, and the page reads the words in the browser.
 */
export async function askRequest(shoppers: DemoShoppers, token: string, ip: string, at: number, words: string, o: Omit<AskOptions, "catalog" | "why"> & { live: AskGate; rule: AskGate }): Promise<AskReply> {
  const liveHit = o.port ? o.live.takeOrWhy(token, ip) : null;
  if (!o.port || liveHit) {
    const ruleHit = o.rule.takeOrWhy(token, ip);
    if (ruleHit) return { status: 429, body: { error: ASK_RULE_CAPPED, cap: ruleHit } };
  }
  const r = await askForSession(shoppers, token, at, words, { port: o.port, aiName: o.aiName, ...(liveHit ? { why: liveHit } : {}), ...(o.timeoutMs ? { timeoutMs: o.timeoutMs } : {}), ...(o.onFail ? { onFail: o.onFail } : {}) });
  return { status: 200, body: r };
}

/** The page with no server (H1), or past the server's rule caps: the same rule and F4 check, in the browser, labeled as such. Nothing is kept. */
export function askInBrowser(words: string, why: "away" | "offline" | "capped" = "away"): Promise<AskResult> {
  return askToChips(words, { catalog: demoCatalogItems(), port: null, why, aiName: "" });
}
