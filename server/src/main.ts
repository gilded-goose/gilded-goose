// Gilded Goose server: Hono + SSE. Runs the haggle engine from core, places the
// bound cart with PayPal through the guard, and streams the ledger to the screen.
// Every press is a fresh market (Joshua, 2026-10-23). The buyer is live Claude Haiku by default
// when ANTHROPIC_API_KEY is set (BUYER=rule turns it off), within LIVE_HAGGLE_CAP haggles a day
// and per-browser and per-IP limits; every live haggle is saved to the run library. When a cap is
// hit or there is no key, a recorded run replays (the three fixture weeks, then the library),
// labeled "recorded · run N of M"; when none fits, the rule engine buys and says why.

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { serveStatic } from "@hono/node-server/serve-static";
import { cacheControlFor, isAssetPath, notModifiedSince, robotsFor, rootFile } from "./static-cache.ts";
import {
  RuleBuyer, RecordedPort, RunLibrary, LiveCaps, DailyCap, Cooldown, ipKey, forwardedKeyWarnOnce, isDemoWeek, MOVE_TIMEOUT_MS, demoCatalogItems, demoDeps, demoGuard, demoPolicy, demoWant, runHaggle, worstCase, fromCents,
  parseJudgeRequest, parsePrice, JudgeCaps, JUDGE_HISTORY, MAX_JUDGE_NOTE, marketSellers, steersMarket, validateChips, planRun, recordPort, libraryTape, recordedLabel, LIBRARY_MAX,
  askRequest, parseAsk, parsePhoto, photoToChips, MAX_PHOTO_CHARS, type AskPort, type PhotoPort, type ReaderPort, readShop, readerHeld, shopSellers, keepRead, keptAnswer, type KeptRead,
  challengeWords, DEMO_SHOPPER, DEMO_ENTRY, DAY_MS, APPROVAL_TTL_MS, settingsRows, recordedWeek, entryLimit, demoJudgeRound, CONTROL_CAP, controlOrder, DemoShoppers, SESSION_IDLE_MS, SAVE_WAIT_MS, AttemptLog, FirstTries, MinuteCap, ATTEMPTS_SERVED, type AttemptSource, type ScamReplay, type ScammerPort, type ThreatType, ScamNotes, parseStoredScamNotes, SCAM_REPLAY_CAPPED, SCAM_REVIEW_ABOUT, cleanScamNote, scamBrief, SLOW_DOWN, answerOf, attemptOf, countsAsTry, undoRun, recheckHeld, capWords, ShopperLedger, trickGoose, TRICK_RUN, SeenEvents, WebhookGate, readWebhook, webhookMatches, webhookRow, shopperFold, dialRows, DIAL_ALWAYS_ASKS, cancelledInPayPal, setAside, broughtBack, settleAnswer, paymentIntent, seededRows, swapAfterHold, swapNow, type AttemptStore, type Cents, type ChallengeBoard, type RunLedger, type SavedSession, type DemoSession, type RecordedControl, type AiState, type Chip, type BoundCart, type CapHit, type CapStore, type Guard, type HeldState, type HaggleResult, type LedgerEvent, type LlmPort, type Market, type PaymentPort, type Tape, type TapeFallback, type TapeMove, type Undoable, shippedRow, trackingFor, SHIP_CARRIER, disputeRow, payLaterConfig, reconcileRow, type NewEvent,
  STORE_SYNC_CLAIM, STORE_SAYS, storeSearch, storeListing, storeCart, marketReadRows,
  fixedMarketMaker, recordedMarket, understand, notAnAsk, heldResults, spokenCap, capHoldsLine, heldWords, MARKET_CAPPED, MARKET_FAILED, MARKET_TIMEOUT_MS, MarketCache, makeFictionalMarket, marketCategory, marketGuard, marketKey, marketListing, marketResults, marketWant, marketWords, type MarketMakerPort,
} from "@goose/core";
import { PayPalPort, type DisputesPort, type ReportPort, type ShippingPort } from "./adapters/paypal.ts";
import { FakePaymentPort, assertFakeAllowed } from "./adapters/fake-payment.ts";
import { openWalletCookie, signWalletCookie, walletCookieKey } from "./wallet-cookie.ts";
import { makeClaudeBuyer, ClaudeAsker, ClaudeBuyer, ClaudeLooker, ClaudeMarketMaker, ClaudeReader, ClaudeScammer, ClaudeViewer, BUYER_MODEL } from "./adapters/claude.ts";
import { hidePayPalIds } from "./hide-ids.ts";
import { VIEW_COOKIE, VIEW_COOKIE_MAX_AGE_S, VIEW_MAX_BYTES, ruleViewer, sharedLiveGate, viewHandler, viewKey, viewToolTable, type ViewLlm, type ViewTokenKit } from "./view.ts";
import { HELD_WAIT, RELEASE_CONFIRMED_WHY, heldCapWords, RETURN_ALREADY, RETURN_WORDS, returnCard, returnKind, weekCookie, WALLET_HELD_COOKIE, WALLET_PAID_COOKIE, WALLET_REFUNDED_COOKIE, parseWalletHeld, parseWalletPaid, unreleased, walletHeldValue, walletPaidValue, weekCounts, type WalletPaid } from "@goose/core/wallet";
import { RETURN_ALREADY_UNDONE, STOP_SAID, type ReturnKind } from "@goose/core/return";
import { DEMO_GIFTS, DEMO_TOTAL, TOTAL_NOT_A_CHOICE, isTotalChoice, listView, nextDec20 } from "@goose/core/list";
import { dealRead, totalLeft, wantReads, wantsYear } from "@goose/core/want-reads";
import { pingsFor, watchingRows } from "@goose/core/watching-list";
import { DAY_MS as WATCH_DAY_MS, realRow } from "@goose/core/real-watch";
import { BROWSER_READS_PER_DAY, IP_READS_PER_DAY, PRODUCT_READS_PER_DAY, ProductReads, watchOn } from "./adapters/channel3-product.ts";
import { PUSH_PLAIN, PUSH_PLAIN_TITLE, REAL_OFF } from "@goose/core/watching-words";
import { PushAddresses, pushOn, sendPush, vapidAuth, vapidKey } from "./push.ts";
import { WANT_WHICH, saveIntent, wantCards, wantItem, wantSavedWords, type WantReply, type WantsKept } from "@goose/core/wants";
import { tradeoffLine } from "@goose/core/tradeoff";
import { triedFromRows } from "@goose/core/tries";
import { shelfFor } from "@goose/core/shelf";
import { MEMORY_EMPTY, confirmColor, foldMemory, memoryCards } from "@goose/core/memory";
import { BEAT_DAY, limitRefused, limitRows, watchedCards } from "@goose/core/watching";
import { notShoppedYet, runEntry } from "@goose/core/shops";
import { POSTED_ROUNDS, movingItem, postedNote, postedSellers, postedWant } from "@goose/core/posted";
import { appendMoves, moveRows } from "./move-log.ts";
import { keepAwake, livePaused, openTurso, type DbCheck, type Kv } from "./store.ts";
import { inlineScriptHashes, policyFor } from "./csp.ts";
import { ReferencePrices, parseRecorded } from "./adapters/channel3.ts";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
/** The category the worst case and the dial read (N9): the catalog entry every cart names (DEMO_ENTRY), never the want's. */
const CATALOG = demoCatalogItems();
const ENTRY_CATEGORY = CATALOG.get(DEMO_ENTRY)?.category;
// A trailing slash typed into Render's form would make PayPal's return link "//api/runs/…", which no route matches.
// A builder's copy from the Deploy to Render button sets neither (or leaves them blank), so it uses the address Render gives it; the live site sets both.
const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
const WEB_URL = (process.env.WEB_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:5173").replace(/\/+$/, "");
// Every run spends Anthropic credits and makes a sandbox order, so by default only this machine can start one.
// Hosting (M2) sets HOST and must first add LIVE_AI_CAP per IP and per day.
const HOST = process.env.HOST || "127.0.0.1";
// Pages allowed to start a run: the dev page (WEB_URL) and the single-service page (PUBLIC_URL), each under both local names.
const ALLOWED_ORIGINS = new Set([WEB_URL, PUBLIC_URL].flatMap((u) => {
  const o = new URL(u).origin;
  return [o, o.replace("//localhost", "//127.0.0.1"), o.replace("//127.0.0.1", "//localhost")];
}));
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const API_KEY = process.env.ANTHROPIC_API_KEY;
// Live by default whenever the key is set (Joshua, 2026-10-23: "run the AI live by default within a daily cap"); BUYER=rule turns it off.
const LIVE = Boolean(API_KEY) && process.env.BUYER !== "rule";
const PROMPT_FILE = process.env.BUYER_PROMPT || "buyer.honest.md";
const LIVE_PROMPT = readFileSync(join(here, "..", "prompts", PROMPT_FILE), "utf8");
const LIVE_MODEL_LABEL = "Claude Haiku 5.5";
const RULE = new RuleBuyer();

// Built once per process (M2 step 1): a buyer per run threw away its warm connections, and
// the run's first move paid a fresh handshake. Warmed now, and again at each run's start.
// A racer that fails while another wins is not silent (shared Lesson 39): the server log says so.
const BUYER: LlmPort = LIVE ? makeClaudeBuyer(API_KEY!, LIVE_PROMPT, { onRacerError: (e, port) => console.warn(`buyer racer ${port} failed: ${e.message}`) }) : RULE;
void BUYER.warm?.();
const BUYER_NAME = LIVE ? BUYER_MODEL : "rule";

/**
 * A small JSON file that keeps one cap's count across restarts (the file holds the day and one number).
 * H1 (018 N13), said plainly: on Render's free tier the disk is wiped on every spin-down and deploy, so hosted, these
 * counts last only as long as the process (in-process caps). Turso would keep them, but its free account isn't made
 * (Joshua's call), and Render Postgres is never used. The stated backstop is the spend cap on the key in the Anthropic
 * Console. Nothing a judge needs lives here: the recorded demo runs in the browser from tapes bundled into the page.
 * It bounds money, so it fails closed: a missing file is a fresh day, an unreadable one stops the server
 * rather than handing out a new 1,000. Written to a temp file and renamed, so a crash never leaves half a file.
 */
function fileStore(path: string): CapStore {
  return {
    load() {
      let text: string;
      try { text = readFileSync(path, "utf8"); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
      return readCaps(text, path);
    },
    save(day, counts) {
      try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(`${path}.tmp`, JSON.stringify({ day, counts }));
        renameSync(`${path}.tmp`, path);
      } catch (e) { console.warn(`cap store: ${(e as Error).message}`); }
    },
  };
}

/** A cap's saved record, or a stop: an unreadable count never becomes a fresh day (it bounds money). */
function readCaps(text: string, where: string): { day: string; counts: Record<string, number> } {
  const v = JSON.parse(text) as { day?: unknown; counts?: unknown };
  if (typeof v.day !== "string" || typeof v.counts !== "object" || v.counts === null) throw new Error(`cap store ${where} is unreadable; fix or delete it (deleting resets today's count)`);
  return v as { day: string; counts: Record<string, number> };
}

/** The same record in the Turso store (store.ts): one key per cap. */
function kvCapStore(kv: Kv, name: string): CapStore {
  const key = `cap:${name}`;
  return {
    load() { const text = kv.get(key); return text === undefined ? null : readCaps(text, key); },
    save(day, counts) { kv.set(key, JSON.stringify({ day, counts })); },
  };
}

// Live haggles (Joshua, 2026-10-23): 1,000 a day across everyone, kept across restarts; 10 per browser and
// HAGGLE_PER_IP per address in memory, "so no single person can drain it". A bad value stops the server at boot.
// GOOSE_DIR: where caps, the move log and the run library live; a test boots on an empty one (H1, boot_with_empty_disk_serves_full_demo).
const GOOSE_DIR = process.env.GOOSE_DIR || join(here, "..", "..", ".goose");
// N13/H1/W18 (Joshua, Thu Oct 29): with TURSO_DATABASE_URL set, the caps, the run library and the shopper's week live in
// Turso and survive a restart; without it they stay on GOOSE_DIR's disk, which a Render restart wipes. Health says which.
// The server always starts (Joshua, Thu Oct 29: Turso's free plan archives a database idle 10 days, and judging runs to
// Dec 21). A store it can't reach in STORE_WAIT_MS leaves the caps on this disk and pauses live mode until the next start:
// no live AI and no new PayPal order, since nothing may spend without saved caps. The recorded demo, the wallet and the
// ledger keep working. A write that fails later pauses live mode the same way until it lands (store.ts).
const STORE_WAIT_MS = 10_000;
const PAUSED = "Live mode is paused: the store isn't reachable";
async function openStore(url: string): Promise<Kv | null> {
  try {
    return await Promise.race([openTurso(url, process.env.TURSO_AUTH_TOKEN || undefined), new Promise<never>((_, no) => setTimeout(() => no(new Error(`no answer in ${STORE_WAIT_MS / 1000} s`)), STORE_WAIT_MS).unref())]);
  } catch (e) {
    console.warn(`turso: the store isn't reachable, so live mode is paused until the next start: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
const KV = process.env.TURSO_DATABASE_URL ? await openStore(process.env.TURSO_DATABASE_URL) : null;
const STORE_DOWN = Boolean(process.env.TURSO_DATABASE_URL) && !KV;
/** True while nothing may spend (store.ts livePaused): the store was unreachable at boot, or a write waits to be retried. */
const paused = (): boolean => livePaused(STORE_DOWN, KV);
// Not claimed: a deploy. Render starts the new instance while the old one still serves, until the new one's health check
// passes; what the old one counts or pays in those seconds after the new one has read the store is missing from the new
// one, and its next write of that key overwrites it (both reviews, 024 "Turso review"). A restart loses nothing.
const store = (): "turso" | "turso-retrying" | "unreachable" | "disk" => (KV ? (KV.retrying() ? "turso-retrying" : "turso") : STORE_DOWN ? "unreachable" : "disk");
// Health's keep-alive read (store.ts keepAwake): one `SELECT 1` a minute at most, started by a health check and never
// waited on, so health answers at once even when Turso is slow (Render's check gives up at 5 s). "failed" when the store
// was unreachable at boot, "none" with no store set. A failed read only says so: it never pauses live mode.
const KEEP_AWAKE_MS = 60_000;
const DB_READ_MS = 2_000;
const dbCheck = KV ? keepAwake(() => KV.ping(), { everyMs: KEEP_AWAKE_MS, timeoutMs: DB_READ_MS }) : null;
const db = (): DbCheck | "none" => (dbCheck ? dbCheck() : STORE_DOWN ? "failed" : "none");
/** A cap's saved record: Turso when it's set, else its file under GOOSE_DIR. */
const capStore = (name: string): CapStore => (KV ? kvCapStore(KV, name) : fileStore(join(GOOSE_DIR, `${name}.json`)));
const HAGGLE_CAPS = new LiveCaps(
  { perToken: 10, perIp: Number(process.env.HAGGLE_PER_IP ?? 30), global: Number(process.env.LIVE_HAGGLE_CAP ?? 1000) },
  () => Date.now(), capStore("caps-haggle"),
);
const RUNS_COOKIE = "gg_runs";

/** A whole number from the environment, or its default; anything else stops the server at boot (shared Lesson 78). */
function envInt(name: string, fallback: number, min = 1): number {
  const raw = process.env[name];
  const n = raw === undefined ? fallback : Number(raw);
  if (raw?.trim() === "" || !Number.isSafeInteger(n) || n < min) throw new Error(`${name} must be a whole number >= ${min}, got ${JSON.stringify(raw)}`);
  return n;
}

// H2 (018 N11): one run budget per browser, per network and per day, across every kind of run (live, a replay, the plain
// rule), taken before any run starts. A replay costs no AI, but it is a run that can end in an order, and memory. A
// client that drops its cookie gets a new browser count, so the network and day counts are what hold a script; the day
// count is kept across restarts like the caps above. Past it, the page replays a recording in the browser and names the cap.
const RUN_CAPS = new LiveCaps(
  { perToken: envInt("RUN_PER_BROWSER", 20), perIp: envInt("RUN_PER_IP", 100), global: envInt("RUN_DAY_CAP", 1000) },
  () => Date.now(), capStore("caps-runs"),
);
// H2 review (must-fix): every judge round that isn't a live AI read (the plain rule, an AI pick with no key, an AI
// pick past the AI cap) feeds the "Tries to break it here" count, so it has its own per browser, per network and per
// day cap, kept across restarts like the others. A number shown to judges is bounded by the same caps as the request
// that raises it. Past it, the page runs the round in the browser, where it isn't counted.
const JUDGE_RULE_CAPS = new LiveCaps(
  { perToken: envInt("JUDGE_RULE_PER_BROWSER", 30), perIp: envInt("JUDGE_RULE_PER_IP", 200), global: envInt("JUDGE_RULE_DAY_CAP", 2000) },
  () => Date.now(), capStore("caps-judge-rule"),
);
// Joshua (Wed Oct 28): asking PayPal again about an unreleased hold is at most one call per cart every 10 seconds
// (HELD_RECHECK_SECONDS), and each call PayPal actually gets counts in this browser's, this network's and the day's
// own caps, kept like the others. Its own caps, not the run budget, so waiting on PayPal never spends the shopper's runs.
const HELD_CAPS = new LiveCaps(
  { perToken: envInt("HELD_CHECK_PER_BROWSER", 30), perIp: envInt("HELD_CHECK_PER_IP", 100), global: envInt("HELD_CHECK_DAY_CAP", 1000) },
  () => Date.now(), capStore("caps-held-check"),
);
// Security review (b167a45): a check for a cart this browser didn't start (a forged or stale cookie, or the owner after a
// restart) draws on its own caps, with a smaller day count, so forged cookies can never use up the owners' checks.
const HELD_READ_CAPS = new LiveCaps(
  { perToken: HELD_CAPS.perToken.limit, perIp: HELD_CAPS.perIp.limit, global: envInt("HELD_READ_DAY_CAP", 300) },
  () => Date.now(), capStore("caps-held-read"),
);
// PayPal additions 5 (Sonnet review, Oct 29): a market cart is a run, so it is capped, but on its own budget: a judge
// clicking through the shelf never spends the haggle's runs. Smaller than the run budget, kept across restarts the same.
const STORE_CAPS = new LiveCaps(
  { perToken: envInt("STORE_CART_PER_BROWSER", 15), perIp: envInt("STORE_CART_PER_IP", 60), global: envInt("STORE_CART_DAY_CAP", 500) },
  () => Date.now(), capStore("caps-store-cart"),
);
const STORE_CAP_WORDS: Readonly<Record<CapHit, string>> = {
  token: "This browser has used its market carts for today.",
  ip: "This network has used its market carts for today.",
  global: "Today's market carts on the server are used up.",
};
const HELD_COOLDOWN = new Cooldown<HeldState>(envInt("HELD_RECHECK_SECONDS", 10, 0) * 1000, () => Date.now());
/** Runs kept in memory at once (H2, 018 N11); past it the oldest evictable run goes first, and its id answers "no such run". */
// H2 review: sized with the day caps, so a flood under them can't fill it with protected runs; the 503 below stays for
// the day boundary (yesterday's protected runs are still kept when the day count resets). Market carts are runs on their
// own day cap (security review, Oct 29), so both are counted: a day of market carts still leaves the haggle's day.
const RUNS_DAY = RUN_CAPS.global.limit + STORE_CAPS.global.limit;
const RUNS_KEPT = envInt("RUNS_KEPT", Math.max(500, RUNS_DAY)); // small day caps never shrink it
if (RUNS_KEPT < RUNS_DAY) console.warn(`RUNS_KEPT ${RUNS_KEPT} < RUN_DAY_CAP ${RUN_CAPS.global.limit} + STORE_CART_DAY_CAP ${STORE_CAPS.global.limit}: a flood under the day caps can fill it with protected runs and refuse new runs`);
// H2 review: how long a paid run is kept so its receipt and Undo still answer. Its key lives only in the tab that
// started the run, so an hour covers a shopper who pays and changes their mind in the same visit, and is short enough
// that paid runs can't hold the map for long. W82: it is also Undo's window, enforced by the route (`undoOpen`).
const UNDO_KEEP_MS = envInt("UNDO_KEEP_MINUTES", 60) * 60_000;
/** Browser sessions kept at once (H2, 020 W19); past it the least recently used goes first. */
const SESSIONS_KEPT = envInt("SESSIONS_KEPT", 1000);

// The run library: the three fixture weeks (M2 step 3) first, then every saved live haggle. The saved haggles sit on the
// same wiped disk as the caps (H1): hosted, they last as long as the process; the fixture weeks ship with the repo and in
// the web build, so a fresh boot still replays all three. A tape recorded
// with another prompt is kept on disk but never played; `pnpm check` fails on a stale fixture too.
const FIXTURES = join(here, "..", "..", "docs", "fixtures");
const LIBRARY_DIR = process.env.RUN_LIBRARY_DIR || join(GOOSE_DIR, "runs");
const HONEST_PROMPT_SHA = sha256(readFileSync(join(here, "..", "prompts", "buyer.honest.md"), "utf8"));
// Only honest live runs join the library: a run on another prompt (the evil swap) is not a haggle the screen replays as Haiku's.
const SAVE_TO_LIBRARY = LIVE && sha256(LIVE_PROMPT) === HONEST_PROMPT_SHA;
function readTapes(dir: string, pattern: RegExp, newest = Infinity): Tape[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => pattern.test(f)).sort().slice(-newest).flatMap((f) => {
    try { return [JSON.parse(readFileSync(join(dir, f), "utf8")) as Tape]; } catch (e) { console.warn(`run library: skipped ${f}: ${(e as Error).message}`); return []; }
  });
}
const fixtureTapes = readTapes(FIXTURES, /^tape-seed-\d+\.json$/);
// A replay must meet the sellers its run met; a fixture with no known week would miss at round 1 or quietly meet week 1's.
for (const t of fixtureTapes) if (!isDemoWeek(t.meta.week)) throw new Error(`tape seed ${t.meta.seed}: unknown week ${String(t.meta.week)}; re-record with pnpm record:tape`);
// Only the newest LIBRARY_MAX files are read (their names start with the time), so boot stays well under a second.
/** The library's saved runs from the Turso store, newest LIBRARY_MAX (keys start with the time, as the file names do). */
function storedTapes(kv: Kv): Tape[] {
  return kv.keys("tape:").slice(-LIBRARY_MAX).flatMap((k) => {
    try { return [JSON.parse(kv.get(k)!) as Tape]; } catch (e) { console.warn(`run library: skipped ${k}: ${(e as Error).message}`); return []; }
  });
}
/** Only the newest LIBRARY_MAX runs are ever read, so older ones leave the store (at boot, and after each new one). */
function pruneTapes(kv: Kv): void {
  for (const k of kv.keys("tape:").slice(0, -LIBRARY_MAX)) kv.drop(k);
}
if (KV) pruneTapes(KV);
const LIBRARY = new RunLibrary(HONEST_PROMPT_SHA, [...fixtureTapes, ...(KV ? storedTapes(KV) : readTapes(LIBRARY_DIR, /\.json$/, LIBRARY_MAX)).filter((t) => t.meta.market)]);

interface RunPlan { buyer: LlmPort; label: string; market: Market; note: string | null; live: boolean }

/** The core planner's answer as a buyer port: a replay, live Claude (counted by the caps), or the plain rule. */
function planFor(asked: number | null, maxPrice: number, pace: boolean, token: string, ip: string, chips: readonly Chip[]): RunPlan {
  const plan = planRun({
    asked, maxPrice, live: LIVE && !paused(), library: LIBRARY, dayLimit: HAGGLE_CAPS.global.limit, steers: steersMarket(chips, demoWant().item),
    take: () => HAGGLE_CAPS.takeOrWhy(token, ip),
    // A fresh number never reuses a fixture week's (1–3; project Lesson 18).
    fresh: () => 10 + Math.floor(Math.random() * 999_999_990),
  });
  switch (plan.kind) {
    case "replay": return { buyer: new RecordedPort(plan.recorded.tape, sha256, { pace }), label: recordedLabel(plan.recorded), market: plan.market, note: pausedNote(plan.note), live: false };
    case "live": return { buyer: BUYER, label: `live · ${LIVE_MODEL_LABEL}`, market: plan.market, note: null, live: true };
    case "rule": return { buyer: RULE, label: "rule", market: plan.market, note: pausedNote(plan.note), live: false };
  }
}

/**
 * A moving item's run (§15B part 2): no recording is of a posted market, so live Claude (counted by the caps, as any
 * live haggle) or the plain rule, never a kettle replay. Its market is empty: the sellers are the item's posted ones.
 */
function postedPlan(seed: number, token: string, ip: string): RunPlan {
  const why = LIVE && !paused() ? HAGGLE_CAPS.takeOrWhy(token, ip) : "off";
  const market: Market = { seed, sellers: [] };
  if (why === null) return { buyer: BUYER, label: `live · ${LIVE_MODEL_LABEL}`, market, note: postedNote(BEAT_DAY), live: true };
  return { buyer: RULE, label: "rule", market, note: pausedNote(`${capWords(why, HAGGLE_CAPS.global.limit)}, so a plain rule is buying. ${postedNote(BEAT_DAY)}`), live: false };
}

/** A run's note while live mode is paused says so first, where the server would otherwise have haggled live. */
function pausedNote(note: string | null): string | null {
  return LIVE && paused() ? [`${PAUSED}.`, note].filter(Boolean).join(" ") : note;
}

/** A finished live haggle into the library: haggle only, whitelisted by `libraryTape` (never the judge's notes). */
function saveToLibrary(run: { seed: number; market: Market; maxPrice: number; moves: TapeMove[]; fallbacks: TapeFallback[] }): boolean {
  if (!SAVE_TO_LIBRARY || run.moves.length + run.fallbacks.length === 0) return false;
  const at = new Date().toISOString();
  const tape = libraryTape({ model: BUYER_MODEL, modelLabel: LIVE_MODEL_LABEL, promptSha256: HONEST_PROMPT_SHA, seed: run.seed, market: run.market, item: demoWant().item, maxPrice: run.maxPrice, at, moves: run.moves, fallbacks: run.fallbacks });
  try {
    if (KV) { KV.set(`tape:${at}-m${run.seed}`, JSON.stringify(tape)); pruneTapes(KV); }
    else {
      mkdirSync(LIBRARY_DIR, { recursive: true });
      writeFileSync(join(LIBRARY_DIR, `${at.replace(/[:.]/g, "-")}-m${run.seed}.json`), JSON.stringify(tape) + "\n");
    }
    LIBRARY.add(tape);
    return true;
  } catch (e) { console.warn(`run library: not saved: ${(e as Error).message}`); return false; }
}
const SESSION = new Date().toISOString();
const MOVE_LOG = join(GOOSE_DIR, "moves.jsonl");

// The judge box's live AI (ADR 0009): one honest ClaudeBuyer, no race, whenever the key is set; capped
// at 10 tries per session token and 20 per IP per day, and LIVE_AI_CAP judge requests per day across
// everyone (a bad value stops the server at boot). The haggle's live calls join that cap before hosting (step 7).
const JUDGE_AI: LlmPort | null = API_KEY
  ? new ClaudeBuyer(API_KEY, readFileSync(join(here, "..", "prompts", "buyer.honest.md"), "utf8"))
  : null;
const JUDGE_AI_NAME = "Claude Haiku 5.5";
// The AI reader (W41 part 3) reads your offer's words in the same AI round, at the same time as the buyer, and can
// only add caution. It is a second call, so it draws its own count from LIVE_AI_CAP (a cap counts requests sent, not
// tries); with none left the round runs without it and code's verdict stands. The per-token and per-IP caps count tries.
const JUDGE_READER: ReaderPort | null = API_KEY ? new ClaudeReader(API_KEY, readFileSync(join(here, "..", "prompts", "reader.md"), "utf8")) : null;
// Its day count is kept across restarts too: a restart must not reset what bounds the money.
const JUDGE_CAPS = new JudgeCaps({ perToken: 10, perIp: 20, global: Number(process.env.LIVE_AI_CAP ?? 200) }, () => Date.now(), capStore("caps-judge"));
// The AI reader in shopping runs (Joshua, Fri Nov 6 12:10: "YES, escalate-only"): the judge's reader, asked about each
// seller code cleared on a Desk run, and only ever able to hold one (`readShop`, `ReaderHold`). Its caps are counted
// here, on the server: at most DESK_READER_PER_RUN sellers a run and DESK_READER_DAY reads a day across everyone (saved,
// so a restart can't reset it), each read under the run's own timeout. Decided by default: 6 a run (a made-up market
// has three sellers), 300 a day, 2.5 s. Flip if Joshua says other numbers. No key, or live AI paused, is code-only.
// Signed by a fresh Q on Fri Nov 6 (pass with conditions, no MUSTs; its four fixes are in the same commit as this flip,
// with the copy that now says the Desk's sellers are read by code and then by the reader, which can only hold one).
// Joshua: "If it isn't green and signed by Sat noon, it stays code-only and Devpost says so honestly": back to false,
// with that copy, is the way back. DESK_READER=on still turns it on for a local seat where it ships false.
const DESK_READER_SHIPS = true;
const DESK_READER_ON = DESK_READER_SHIPS || process.env.DESK_READER === "on";
const DESK_READER_PER_RUN = envInt("DESK_READER_PER_RUN", 6);
const DESK_READER_DAY = new DailyCap(envInt("DESK_READER_DAY", 300), () => Date.now(), capStore("caps-desk-reader"));
// Per address too (Lead, Nov 6, decided by default; flip if Joshua says global only): with the day cap alone, one script
// could spend all 300 and leave everyone code-only. Counted before the day cap, in memory only (no address is ever
// written down), the way Channel3's LIVE_PER_VISITOR is. 30 is ten made-up markets of three sellers a day.
const DESK_READER_PER_ADDRESS = new DailyCap(envInt("DESK_READER_PER_ADDRESS", 30), () => Date.now());
const DESK_READER_TIMEOUT_MS = 2500;
/** A market's reads. Every hold is kept, so the cart applies the hold the Desk showed, even from a run where another read
 *  missed (a hold shown at search must never vanish at the cart). A read that missed nothing is kept whole too, so asking
 *  again spends nothing; one that missed stands for `MISSED_READ_MS` and is then asked again (Q: asks of a cached market
 *  cost no Ask cap, so a missed read asked again each time let asks alone spend the day's reads). Keyed by what its sellers wrote, not the market's id alone: an id
 *  comes from the words, and a market made again for the same words may have other sellers, which a kept read never covers. */
const DESK_READS = new Map<string, KeptRead>();
const deskKey = (m: { id: string; listings: Parameters<typeof shopSellers>[1] }): string => `${m.id}:${sha256(JSON.stringify(m.listings.map((l) => [l.id, l.note, l.merchant, l.item])))}`;
async function deskRead(m: { id: string; listings: Parameters<typeof shopSellers>[1] }, results: ReturnType<typeof readerHeld>, ip: string): Promise<{ results: ReturnType<typeof readerHeld>; readerSays?: string }> {
  if (!DESK_READER_ON) return { results };
  const key = deskKey(m);
  const kept = DESK_READS.get(key);
  const now = Date.now();
  // Every caller whose address can't be read shares "unknown": its cap running out is said as the day's, not "This address".
  const visitor = { take: () => DESK_READER_PER_ADDRESS.take(ip), give: () => DESK_READER_PER_ADDRESS.give(ip), shared: ip === "unknown" };
  const again = keptAnswer(kept, now);
  const read = again ?? await readShop(JUDGE_READER && !paused() ? JUDGE_READER : null, shopSellers(results, m.listings), { perRun: DESK_READER_PER_RUN, timeoutMs: DESK_READER_TIMEOUT_MS, day: DESK_READER_DAY, visitor });
  // A kept answer is used as it is: keeping it again would restart a missed read's minute on every ask.
  const next = again ? kept! : keepRead(kept, read, now);
  if (next && !again) {
    if (!kept && DESK_READS.size >= 500) DESK_READS.delete(DESK_READS.keys().next().value!);
    DESK_READS.set(key, next);
  }
  const holds = next?.holds ?? read.holds;
  // The fixed kind only, never a seller's words or the model's (Lesson 15); once a fresh read, not on each kept answer.
  if (!again && read.miss && read.miss !== "off") console.warn(`desk reader: code-only (${read.miss})`);
  return { results: readerHeld(results, holds), readerSays: read.says };
}
const JUDGE_COOKIE = "gg_judge";

// PAYMENT=fake: CI's keyless port (localhost only, every id "FAKE-"); otherwise PayPal's sandbox, or off without keys.
const FAKE_PAYMENT = process.env.PAYMENT === "fake";
if (FAKE_PAYMENT) assertFakeAllowed(PUBLIC_URL, HOST, process.env);
let paypal: PaymentPort | null = null;
if (FAKE_PAYMENT) {
  const fake = new FakePaymentPort(PUBLIC_URL);
  // Test knobs (fake only, so loopback only): PayPal holding another amount, and voids PayPal doesn't confirm.
  fake.holdDelta = Number(process.env.FAKE_HOLD_DELTA ?? 0) || 0;
  fake.voidFails = Number(process.env.FAKE_VOID_FAILS ?? 0) || 0;
  fake.captureDelta = Number(process.env.FAKE_CAPTURE_DELTA ?? 0) || 0;
  paypal = fake;
} else try { paypal = PayPalPort.fromEnv(process.env); } catch (e) { console.error(`PayPal disabled: ${(e as Error).message}`); }
const PAYMENT_LABEL = FAKE_PAYMENT ? "fake" : paypal ? "sandbox" : "off";
// The wallet's held and paid cookies are signed with a key from PayPal's client secret (random per process without one).
const WALLET_COOKIE_KEY = walletCookieKey(process.env.PAYPAL_CLIENT_SECRET);
/** This browser's payment for a recorded week, only if this server (or one with the same secret) signed it. Not a recorded week: none. */
const paidCookie = (c: Context, week: number | null | undefined): WalletPaid | null => {
  if (week === null || week === undefined) return null;
  const name = weekCookie(WALLET_PAID_COOKIE, week);
  const paid = parseWalletPaid(openWalletCookie(WALLET_COOKIE_KEY, name, getCookie(c, name)));
  return paid?.week === week ? paid : null;
};
/** Signed under its week's own name, so paying one week never overwrites another's and one week's can't pass for another's. */
function setWeekCookie(c: Context, base: string, week: number, value: string, days: number): void {
  const name = weekCookie(base, week);
  setCookie(c, name, signWalletCookie(WALLET_COOKIE_KEY, name, value), { sameSite: "Lax", path: "/", maxAge: days * 86_400, secure: PUBLIC_URL.startsWith("https://") });
}
// 021 §4 item 4: how orders take the money. CAPTURE until `pnpm e2e:sandbox` passes on AUTHORIZE; a typo stops the boot.
const PAYMENT_INTENT = paymentIntent(process.env.PAYMENT_INTENT);
if (PAYMENT_INTENT === "AUTHORIZE" && paypal && !(paypal.authorize && paypal.captureAuthorization && paypal.voidAuthorization)) throw new Error("PAYMENT_INTENT=AUTHORIZE needs a payment port that can authorize, capture and void");

function timingSafeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

interface Run {
  id: string;
  /** Per-run secret in PayPal's return URL, for an order this process places; the return route checks `secretHash`. */
  secret: string;
  /** sha256 of the return URL's secret: what the return route compares, and all a restart keeps of it. */
  secretHash: string;
  /** sha256 of the run's Undo secret (H2, 018 N12), which goes once to the browser that started the run, never in a URL or a view. */
  undoKeyHash: string;
  /** This run's rows, written into its shopper's one ledger (N19) and read back on their own for the run's screen. */
  ledger: RunLedger;
  /** The session's one shopper ledger: the week, the dial and the in-flight hold span its runs (W8, W11, W12). */
  shopper: ShopperLedger;
  /** sha256 of the runs session token that started this run (its shopper key): only that browser reads its shopper fold (020 W20). Never sent. */
  owner: string;
  guard: Guard;
  want: ReturnType<typeof demoWant>;
  policy: ReturnType<typeof demoPolicy>;
  buyerName: string;
  /** The market number (the RNG seed); shown on screen so a run can be replayed and two runs told apart. */
  seed: number;
  /** The simulated week (1–3) when this is one of the fixture weeks, else null (a generated market). */
  week: number | null;
  /** The catalog entry's category (N9), set when the run starts: the kettle's, or the moving item's. Never read from a want. */
  category: string | undefined;
  /** Why this run isn't live (a cap, no key, a replay asked for), or null. */
  note: string | null;
  /** True once the run has a recording its number replays (a replay, or a live run saved to the library). */
  replayable: boolean;
  /** Started by the wallet's Approve (`replayOnly`, W53): PayPal's return lands back on the wallet (Joshua's answer 1). */
  wallet: boolean;
  /**
   * Attack corpus 12: the wallet's price-swap run. The seller adds one cent to the cart right after PayPal holds the money
   * (`swapAfterHold`); the guard's re-check finds it and releases the hold. Nothing is charged, so this browser's paid
   * cookie doesn't stop it. Saved with the run, so a restart between the tap and the return still swaps, never pays.
   */
  swap?: boolean;
  /**
   * PayPal additions 5: the Store Sync-shaped market's listing id when this run is that market's cart step (no haggle).
   * Its complete_payment is this run's Approve; PayPal's return lands back on the market's page.
   */
  store?: string;
  /** Desk slice 1: this cart came from the Desk page (`?desk=1`), so PayPal's return goes back there. */
  desk?: boolean;
  /** A cart from the board page (web/goose.html): PayPal's return goes back there. Also a Desk cart in every other way. */
  line?: boolean;
  /**
   * Desk-L: a made-up market's cart only. Which limit held it and why, in fixed words (`marketCategory`), e.g. "Events
   * limit $90.00, set for this demo, because you asked for tickets." The guard held the cart to that limit.
   */
  limitWhy?: string;
  /** A2: the color chip she sent with this run (F4-checked), so a paid cart that listed it is remembered. Never words. */
  color?: string;
  bound?: BoundCart;
  approveUrl?: string;
  /** Set aside by the shopper ("Not this one", 025): Approve refuses and PayPal's return captures nothing until brought back. */
  aside?: boolean;
  /** Rows "Not this one" and "Bring it back" have written for this cart, capped at ASIDE_WRITES (security review). */
  asideWrites?: number;
  /** PayPal additions 2 and 3: each kind of look at PayPal for this purchase (disputes, the report): when, its words, rows. */
  looks?: Partial<Record<LookKind, { at: number; words: string | null; rows: number }>>;
  outcome?: HaggleResult["outcome"];
  settled?: { ok: boolean; reason?: string; captureId?: string };
  /** When the settle came back paid (H2 review): the run is kept UNDO_KEEP_MS from here, so its Undo still answers. */
  paidAt?: number;
  /** A return of this settled run has been answered, so its cookies went to the browser PayPal sent back. A later opening of the link leaves none (`back`). */
  answered?: boolean;
  /** The one settle in flight; a second return waits for it instead of settling (and recording) on its own. */
  settling?: Promise<void>;
  /** The one order being created after Approve (H2): a second press waits for it, so a cart never gets two orders. */
  placing?: Promise<void> | undefined;
  refund?: Exclude<Undoable["refund"], undefined>;
  refunding?: Undoable["refunding"];
  done: boolean;
  /** Stops saving this run on its rows (it left the map). */
  off?: () => void;
}
const runs = new Map<string, Run>();
/**
 * H2 review: a run may go only once nothing waits on it. Never in flight (still haggling, an order being placed, a settle
 * or a refund under way, or a cart whose approval hasn't run out and isn't settled), never paid within UNDO_KEEP_MS.
 */
/**
 * W82: whether a paid run's Undo is open at `now`, from its paid settle for UNDO_KEEP_MS. The page (`view`) and the undo
 * route both ask this, with the same clock, so the page never shows an Undo the server would refuse, or hides one it would take.
 */
function undoOpen(run: Run, now: number): boolean {
  return Boolean(run.settled?.ok && run.paidAt !== undefined && now - run.paidAt <= UNDO_KEEP_MS);
}
function evictable(run: Run, now: number): boolean {
  if (!run.done || run.placing || run.refunding || (run.settling && !run.settled)) return false;
  // A run that holds the week's stop where money may have moved, or a hold isn't released, stays while its browser can come
  // back (fresh Q, Nov 5; `protectedRun`). Rare (PayPal answered nothing, a wrong amount, a hold). Any run with a stop leaves
  // its mark when it goes (`makeRoom`), so the stop itself outlives the run.
  if (protectedRun(run, now)) return false;
  if (run.bound && !run.settled && now <= run.bound.expiresAt) return false;
  return !(run.settled?.ok && now - (run.paidAt ?? now) <= UNDO_KEEP_MS);
}
/** Whether one more run fits (H2 review), changing nothing: checked before the run budget, so a capped client evicts no one. */
function hasRoom(now: number): boolean {
  if (runs.size < RUNS_KEPT) return true;
  for (const run of runs.values()) if (evictable(run, now)) return true;
  return false;
}
/** Room for one more run (H2 review): the oldest evictable runs go first; false when every kept run is protected. */
function makeRoom(now: number): boolean {
  for (const [id, run] of runs) { if (runs.size < RUNS_KEPT) break; if (evictable(run, now)) { markStop(run, now); runs.delete(id); run.off?.(); KV?.drop(`run:${id}`); } }
  return runs.size < RUNS_KEPT;
}
/** Keep a new run (H2): makeRoom() said yes with no await since, so the map never grows past RUNS_KEPT. */
function keep(run: Run): void {
  if (runs.size >= RUNS_KEPT) throw new Error("runs: keep() without room; call makeRoom() first"); // fail closed, never grow
  runs.set(run.id, run);
  if (KV) { run.off = run.ledger.on(() => touch(run)); touch(run); }
}
/**
 * Lead-12 and the narrow Q (Nov 5): a run that held its week's stop leaves a mark when it's evicted (or cut at a restart), kept
 * small by owner and week, so the stop outlives the run. Without it, a paid run past its Undo window, evicted under 1,500 newer
 * runs, left only the wallet cookies, and a browser that lost them could pay the week again. A mark lasts until
 * SESSION_IDLE_MS after its run started: the runs cookie is minted once with that max age (`sessionToken`), so no browser
 * presents that owner later. Saved under `stop:`, so a restart keeps it. At most MARKS_KEPT, a week of evictions under the day
 * caps; past that the oldest goes first.
 */
type StopMark = { kind: WeekStop["kind"]; orderId: string; total: string; refunded: boolean; until: number };
const MARKS = new Map<string, StopMark>();
const MARKS_KEPT = RUNS_KEPT * 7;
const markKey = (owner: string, week: number): string => `stop:${owner}:${week}`;
/** The stop's strength, as `weekStop` reads it: paid over unsure over held. */
const STOP_RANK: Record<WeekStop["kind"], number> = { paid: 0, unsure: 1, held: 2 };
/** When the run started: its first row (kept through a restart with its rows). */
const runStart = (run: Run, now: number): number => run.ledger.read()[0]?.t ?? now;
/**
 * The narrow Q (Nov 5): a run where money may have moved, or a hold isn't released, stays while its browser can still come
 * back: SESSION_IDLE_MS from its start, the runs cookie's own max age. After that no browser presents its owner, so it may go.
 */
function protectedRun(run: Run, now: number): boolean {
  const k = stopKind(run);
  return (k === "unknown" || k === "mismatch" || k === "held") && now - runStart(run, now) <= SESSION_IDLE_MS;
}
/** Leaves `run`'s week stop as a mark before it goes; nothing when it held none, or its owner can't come back. */
function markStop(run: Run, now: number): void {
  const s = stopOf(run);
  if (!s || run.week === null) return;
  const until = runStart(run, now) + SESSION_IDLE_MS;
  if (until <= now) return;
  const key = markKey(run.owner, run.week);
  const had = MARKS.get(key);
  if (had && had.until > now && STOP_RANK[had.kind] < STOP_RANK[s.kind]) return; // a stronger stop is already marked
  const mark: StopMark = { kind: s.kind, orderId: s.orderId, total: s.total, refunded: s.refunded, until };
  MARKS.delete(key);
  MARKS.set(key, mark);
  KV?.set(key, JSON.stringify(mark));
  for (const [k, m] of MARKS) if (m.until <= now) { MARKS.delete(k); KV?.drop(k); }
  for (const k of MARKS.keys()) { if (MARKS.size <= MARKS_KEPT) break; MARKS.delete(k); KV?.drop(k); }
}

// Joshua and Lead-4 (Thu Oct 29): with the Turso store a run outlives a restart, so `/api/runs/:id`, its events (a PayPal
// webhook row included: run 9cc3467b7610's was lost to a redeploy), its Approve, PayPal's return and its Undo still answer.
// The rows already live in the shopper's saved week (`week:`), so `run:<id>` keeps the rest of the run, written
// SAVE_WAIT_MS after a change (a run's burst of rows is one write). Its secrets only as hashes: the session token, the
// return URL's secret and the undo key are never written down. Without the store, runs live in this process only.
type SavedRun = Pick<Run, "id" | "owner" | "secretHash" | "undoKeyHash" | "buyerName" | "seed" | "week" | "category" | "note" | "replayable" | "wallet" | "swap" | "store" | "desk" | "line" | "limitWhy" | "color" | "want" | "bound" | "approveUrl" | "aside" | "asideWrites" | "outcome" | "settled" | "paidAt" | "answered" | "refund" | "done"> & { source: "recorded" | "live" | "market"; seen: number };
const changedRuns = new Set<Run>();
function touch(run: Run): void {
  if (!KV) return;
  if (changedRuns.size === 0) setTimeout(saveRuns, SAVE_WAIT_MS).unref();
  changedRuns.add(run);
}
/** Writes every run changed since the last write now (the server calls it before it exits); a run gone from the map isn't. */
function saveRuns(): void {
  for (const r of changedRuns) {
    if (runs.get(r.id) !== r) continue;
    // Every field named, so a new one is written on purpose; an absent one is left out of the JSON.
    const saved: { [K in keyof SavedRun]-?: SavedRun[K] | undefined } = {
      id: r.id, owner: r.owner, secretHash: r.secretHash, undoKeyHash: r.undoKeyHash, buyerName: r.buyerName, seed: r.seed, week: r.week, category: r.category, note: r.note, replayable: r.replayable,
      wallet: r.wallet, swap: r.swap, store: r.store, desk: r.desk, line: r.line, limitWhy: r.limitWhy, color: r.color, want: r.want, bound: r.bound, approveUrl: r.approveUrl, aside: r.aside, asideWrites: r.asideWrites, outcome: r.outcome, settled: r.settled, paidAt: r.paidAt, answered: r.answered,
      refund: r.refund, done: r.done, source: r.ledger.source === "recorded" || r.ledger.source === "market" ? r.ledger.source : "live", seen: Date.now(),
    };
    KV!.set(`run:${r.id}`, JSON.stringify(saved));
  }
  changedRuns.clear();
}

// One demo session per runs session token (N10, N19): the shopper ledger with the labeled week, the Policy and the chips,
// bounded and expiring (H2, 020 W18, W19). Keyed by the shopper key, a hash of the token (`shopperKey`), never the token.
// N13/H1/W18: with the Turso store, a session's week (rows, limit, chips) survives a restart under that key (the token
// is the cookie's secret, so it is never written down).
const shopperKey = (token: string) => sha256(token);
const SHOPPERS = new DemoShoppers({
  max: SESSIONS_KEPT,
  ...(KV ? { store: { load: (key: string) => { const t = KV.get(`week:${key}`); try { return t === undefined ? undefined : JSON.parse(t) as SavedSession; } catch { console.warn("turso: a saved week is unreadable; that session starts fresh"); return undefined; } }, save: (key: string, saved: SavedSession) => KV.set(`week:${key}`, JSON.stringify(saved)) } } : {}),
});
// The wants list (Nov 4–7; core/src/ask/wants.ts): one browser's wants, in its session beside its week, so with the Turso
// store they outlive a restart under the same `week:` key. Under /api/runs so the session cookie reaches them. A want only
// waits: nothing here starts a run, binds a cart or pays. Every word on the cards is code's (`wantCards`; each line is
// the price watch's when it has one, `watchedCards`).
const wantsKept = (): WantsKept => (KV ? (KV.retrying() ? "retrying" : "turso") : STORE_DOWN ? "unreachable" : "memory");
// A2: what Goose remembers rides with the wants (the same panel, page and session), as code's words with a forget key.
const wantsBody = (session: DemoSession | undefined) =>
  ({ wants: session ? watchedCards(session.wants, CATALOG, session.policy) : [], watching: session ? watchingRows(session.wants, CATALOG, session.policy) : [], real: session ? session.real.map((w) => realRow(w, Date.now())) : [], list: listView(session?.wants ?? [], session?.shopper.read() ?? [], session?.policy ?? demoPolicy(), CATALOG, Date.now()),
    // The ping on each want (the recorded week up to the day it reached her price, and the notification's words), made here
    // from this session's own wants, so a ping can only be hers and the page types none of it.
    pings: session ? pingsFor(session.wants, CATALOG, session.policy) : {},
    // Level 2's switch, so the page fetches the closed-tab button's chunk only when it's on (no key or address in it).
    push: PUSH_KEY !== null,
    // Goose's Read on each want (core/src/view/gooses-read.ts), computed here so none of it reaches a bundle.
    reads: session ? wantReads(session.wants, session.shopper.read(), session.policy, CATALOG, Date.now()) : {}, kept: wantsKept(), limits: limitRows(session?.policy ?? demoPolicy(), CATALOG), tradeoffs: session?.tradeoffs ?? true,
    // The dial in Settings, from this session's own rows (seeded ones never count, N19); no session yet: 0 of 3 everywhere.
    dial: dialRows(session ? session.shopper.read() : [], session?.policy ?? demoPolicy(), CATALOG), dialAsks: DIAL_ALWAYS_ASKS,
    // No session yet: the seeded week a fresh one starts from, so the list never says "nothing" while Ask offers black.
    memory: memoryCards(foldMemory(session ? session.shopper.read() : seededRows(Date.now()), session?.memory ?? MEMORY_EMPTY, CATALOG, Date.now()), CATALOG) });
// A save or a remove writes the session to the store, so each has its own per-browser, per-network and per-day count,
// taken before any session is made (as Ask's rule caps, W49g). A refused body or a remove of nothing makes no session, so
// only accepted saves do, and these caps bound them: a cookieless flood can't push real browsers out or fill the store.
const WANT_CAPS = new LiveCaps(
  { perToken: envInt("WANTS_PER_BROWSER", 60), perIp: envInt("WANTS_PER_IP", 200), global: envInt("WANTS_DAY_CAP", 3000) },
  () => Date.now(), capStore("caps-wants"),
);

/**
 * An Ask that asked to save (`saveIntent`): the priority only, on the item its chips (or the last ones) name. Its max stays.
 * Bounded by the Ask's own caps (taken before it), not WANT_CAPS: one Ask is at most one save.
 */
function saveFromAsk(key: string, words: string, chips: readonly Chip[], last: readonly Chip[]): WantReply | null {
  const priority = saveIntent(words);
  if (!priority) return null;
  const now = Date.now();
  const session = SHOPPERS.session(key, now);
  const id = wantItem(chips, last);
  if (!id || !CATALOG.has(id)) return { saved: false, words: WANT_WHICH };
  const had = session.wants.find((w) => w.catalogId === id);
  const color = chips.find((c) => c.kind === "attribute" && c.name === "color")?.value ?? had?.color;
  const r = SHOPPERS.setWant(key, { catalogId: id, priority, ...(had ? { max: had.max } : {}), ...(color ? { color } : {}) }, now);
  if (!r.ok) return { saved: false, words: r.error };
  return { saved: true, catalogId: id, priority, words: wantSavedWords(wantCards([r.want], CATALOG, SHOPPERS.session(key, now).policy)[0]!.item, priority) };
}

// A week idle past SESSION_IDLE_MS is never read again (the session starts fresh), so it leaves the store at boot.
if (KV) {
  for (const k of KV.keys("week:")) {
    let seen = Number.NaN;
    try { seen = (JSON.parse(KV.get(k)!) as Partial<SavedSession>).seen ?? Number.NaN; } catch { /* unreadable: dropped */ }
    if (!(Date.now() - seen <= SESSION_IDLE_MS)) KV.drop(k);
  }
}

/**
 * A saved run back in memory: it joins its shopper's restored week, whose rows it reads and writes, with a fresh guard
 * (single use is read from those rows, Fable F4, not from the old guard) and the session's Policy. Undefined when its
 * rows didn't come back (its week expired or didn't read): a run is never shown without them.
 */
function restoreRun(s: SavedRun): Run | undefined {
  const { source, seen, ...kept } = s;
  const session = SHOPPERS.session(s.owner, seen);
  const ledger = session.shopper.run(s.id, source);
  if (ledger.read().length === 0) return undefined;
  const deps = { ...demoDeps(s.seed, sha256), clock: { now: () => Date.now() } };
  // The old return secret is kept only as its hash, so a cart not yet placed gets a new one for the order Approve places.
  const secret = randomBytes(16).toString("hex");
  // A run saved before §15B part 2 has no category: every run then was the kettle's.
  return { ...kept, category: kept.category ?? ENTRY_CATEGORY, secret, secretHash: s.bound?.orderId ? s.secretHash : sha256(secret), ledger, shopper: session.shopper, policy: session.policy, guard: demoGuard(deps, ledger, session.policy) };
}
// Runs come back the way weeks do: the newest RUNS_KEPT, none idle past SESSION_IDLE_MS, unreadable ones dropped. One the
// restart cut off is closed and says so: a haggle stops there (it bound no cart, so nothing was paid), and a settle in
// flight answers from its hold's row, or says it can't say, as a settle that threw does.
// The narrow Q (Nov 5): the cut keeps protected runs first (`protectedRun`), then the newest, and a run it drops that held its
// week's stop leaves its mark, as an eviction does. The marks evicted runs left come back first, unexpired and well formed.
if (KV) {
  const now = Date.now();
  const marks: [string, StopMark][] = [];
  for (const k of KV.keys("stop:")) {
    let m: StopMark | undefined;
    try { m = JSON.parse(KV.get(k)!) as StopMark; } catch { /* unreadable: dropped */ }
    if (m && /^stop:[0-9a-f]{64}:[0-9]+$/.test(k) && typeof m.kind === "string" && Object.hasOwn(STOP_RANK, m.kind) && typeof m.orderId === "string" && typeof m.total === "string" && typeof m.refunded === "boolean" && typeof m.until === "number" && m.until > now) marks.push([k, m]);
    else KV.drop(k);
  }
  marks.sort((x, y) => x[1].until - y[1].until);
  marks.forEach(([k, m], i) => { if (i >= marks.length - MARKS_KEPT) MARKS.set(k, m); else KV.drop(k); });
  const saved: SavedRun[] = [];
  for (const k of KV.keys("run:")) {
    let s: SavedRun | undefined;
    try { s = JSON.parse(KV.get(k)!) as SavedRun; } catch { /* unreadable: dropped */ }
    if (s && k === `run:${s.id}` && /^[0-9a-f]{64}$/.test(String(s.owner)) && now - s.seen <= SESSION_IDLE_MS) saved.push(s);
    else KV.drop(k);
  }
  saved.sort((a, b) => a.seen - b.seen); // oldest first, as the map evicts, and each week's last use stays its newest
  const back: Run[] = [], answered = new Set<Run>();
  for (const s of saved) {
    let run: Run | undefined;
    try { run = restoreRun(s); } catch (e) { console.warn(`turso: a saved run didn't read, so it was dropped: ${(e as Error).message}`); }
    if (!run) { KV.drop(`run:${s.id}`); continue; }
    // What its own rows say it ended as, before the cut reads its stop: a settle in flight answers from its hold's row.
    if (run.bound?.spent && !run.settled) {
      run.settled = settleAnswer(run.ledger.read(), run.bound.hash) ?? { ok: false, reason: "the server restarted while PayPal was answering, so we can't say whether it was charged; check the order in the PayPal sandbox" };
      if (run.settled.ok) run.paidAt ??= now;
      answered.add(run);
    }
    back.push(run);
  }
  const guarded = back.filter((r) => protectedRun(r, now));
  const rest = back.filter((r) => !protectedRun(r, now));
  const kept = new Set([...guarded.slice(Math.max(0, guarded.length - RUNS_KEPT)), ...rest.slice(Math.max(0, rest.length - Math.max(0, RUNS_KEPT - guarded.length)))]);
  for (const run of back) {
    if (!kept.has(run)) { markStop(run, now); KV.drop(`run:${run.id}`); continue; }
    runs.set(run.id, run);
    run.off = run.ledger.on(() => touch(run));
    if (!run.done) {
      run.done = true;
      run.ledger.append({ t: Date.now(), shopperId: DEMO_SHOPPER, visibility: "owner", actor: "guard", action: "done", why: "The server restarted during this run, so it stopped here. Nothing was paid." });
    }
    if (answered.has(run)) touch(run);
  }
}
if (!KV) console.log(`runs: kept in this process only (${STORE_DOWN ? "the store isn't reachable" : "no TURSO_DATABASE_URL"}), so a restart forgets them and their pages`);
// A restart (Render sends SIGTERM on a deploy) writes the runs and sessions changed since their last write, then waits for the
// store's last writes (each tried once more), so a count or a week taken just before it isn't lost; at most 5 s, so a
// store that never answers can't hold the exit. With no store there is nothing waiting.
const EXIT_WAIT_MS = 5000;
if (KV) for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.once(sig, () => {
    saveRuns();
    SHOPPERS.flush();
    void Promise.race([KV.flush(), new Promise((r) => setTimeout(r, EXIT_WAIT_MS))]).finally(() => process.exit(0));
  });
}

const app = new Hono();

// W77 (red team): no site may frame the wallet and trick a click on Approve, Undo or "Not this one". Set on every
// response, API and static alike, after the handler ran, so a 404 or a file from the web build carries them too. Nothing
// of ours frames the app: PayPal comes back by redirect, /voice-test is its own page, and the GitHub Pages mirror is static
// (no server). The Content-Security-Policy is per response (csp.ts): a page runs only our own scripts, and its inline
// ones by hash; anything else may run nothing.
const SECURITY_HEADERS: readonly [string, string][] = [
  ["x-frame-options", "DENY"],
  ["x-content-type-options", "nosniff"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
  // HTTPS only: over plain http (local dev) a browser ignores it, and it must never pin localhost to https.
  ...(PUBLIC_URL.startsWith("https://") ? [["strict-transport-security", "max-age=31536000"] as [string, string]] : []),
];
app.use("*", async (c, next) => {
  await next();
  for (const [name, value] of SECURITY_HEADERS) c.res.headers.set(name, value);
  c.res.headers.set("content-security-policy", policyFor(c.req.path, c.res.headers.get("content-type") ?? "", PAGE_SCRIPTS));
});
/** The hashes of the inline scripts in the pages we serve, read once the pages' paths are known (below). */
let PAGE_SCRIPTS: string[] = [];

// `entryLimit` (core, shared with the browser's recorded demo): the limit the guard holds this Policy's carts to (N18).
// Before any run, the Max field shows the limit the next run's Policy holds (N18), so a max above it is said before Go.
app.get("/api/limit", (c) => c.json(entryLimit(demoPolicy())));

// "See how it keeps you safe": the Settings rows, read from the Policy every run's guard holds and the guard's approval
// time (016, shared Lesson 12); a row code doesn't enforce yet carries no value, and the page says "next".
app.get("/api/settings", (c) => c.json({ category: ENTRY_CATEGORY ?? null, rows: settingsRows(demoPolicy(), ENTRY_CATEGORY, APPROVAL_TTL_MS) }));

// The story page's recorded week (W38): week 1's tape through a fresh guard into a throwaway ledger, computed once.
// Read-only: it takes no payment port, so a visit never makes an order (the old page POSTed /api/runs on every load).
const WEEK1 = fixtureTapes.find((t) => t.meta.seed === 1);
let story: Promise<unknown> | null = null;
app.get("/api/story", async (c) => {
  if (!WEEK1) return c.json({ error: "no recorded week 1" }, 404);
  story ??= recordedWeek(WEEK1, sha256, () => Date.now(), ENTRY_CATEGORY).then((w) => ({ ...w, payment: PAYMENT_LABEL }));
  try { return c.json(await story); } catch (e) { story = null; console.error(`story: ${(e as Error).message}`); return c.json({ error: "the recorded week couldn't load" }, 500); }
});

// PayPal additions 4 (ADR 0013): the public client id for PayPal's Pay Later message, on sandbox PayPal only; null else.
app.get("/api/config", (c) => c.json({ payLater: payLaterConfig(process.env.PAYPAL_CLIENT_ID, paypal !== null && !FAKE_PAYMENT && (process.env.PAYPAL_ENVIRONMENT ?? "").toUpperCase() === "SANDBOX") }));
// Track R: the uptime monitor's URL (docs/ops/uptime.md) and Render's health check. Cheap and side-effect free: it reads
// only in-memory state (no store call, no cookie, no cap counted), and is never cached, so every ping sees the server.
// Every answer under /api/runs is one browser's own or a run's, so none is ever a cache's (a shared cache could hand one
// shopper's gifts to another). Here once, after the route, so a new route can't forget it and a stream's no-cache can't win.
app.use("/api/runs/*", async (c, next) => { await next(); c.header("Cache-Control", "no-store"); });
// One body limit on every API route (Round 5's red team: one 50 MB POST took memory from 86 to 490 MB on a 512 MB plan). No real
// request is near it. The two that carry more set their own limit on the route.
const API_MAX_BYTES = 64 * 1024;
const TAKES_MORE = new Set(["/api/view", "/api/runs/photo"]);
const apiBody = bodyLimit({ maxSize: API_MAX_BYTES, onError: (c) => c.json({ error: "That's too large to send." }, 413) });
app.use("/api/*", (c, next) => (TAKES_MORE.has(c.req.path) ? next() : apiBody(c, next)));

// The commit this server runs, so "check us" can point at it: Render sets RENDER_GIT_COMMIT on each deploy. Health names
// this one variable and no other env value, and only as a full 40-hex SHA; anything else (unset, a local run) reads null.
const COMMIT = /^[0-9a-f]{40}$/.test(process.env.RENDER_GIT_COMMIT ?? "") ? (process.env.RENDER_GIT_COMMIT as string) : null;
app.get("/api/health", (c) => c.json({ ok: true, commit: COMMIT, buyer: BUYER_NAME, paypal: paypal !== null && !FAKE_PAYMENT, payment: PAYMENT_LABEL, intent: PAYMENT_INTENT, store: store(), db: db(), runs: KV ? "turso" : "memory", paused: paused(), sandbox: !FAKE_PAYMENT && (process.env.PAYPAL_ENVIRONMENT ?? "").toUpperCase() === "SANDBOX" }, 200, { "cache-control": "no-store" }));

// Track C3: "Real prices right now", reference prices from Channel3 (real stores), read-only. The answer is plain text and
// links only; it never joins a market, the Watcher, the guard, the haggle or a cart (core/test/channel3.test.ts). The key
// is read here and handed to the adapter only; the shopper's words map to a fixed generic query or to nothing.
// Having the key in the environment isn't enough: a live call also needs CHANNEL3_LIVE=on, which only Joshua sets, in Render
// (J3, Thu Nov 5 5:20 PM). Then it calls inside the adapter's caps (200 a day, 24 per network address a day, 10,000 in all),
// whose day and run counts are saved like the other caps (Turso on the site), and never while the store can't save them.
// Without it, or past a cap, the recording answers, labeled "not live".
const PRICES = new ReferencePrices({
  key: process.env.CHANNEL3_LIVE === "on" ? process.env.CHANNEL3_API_KEY || undefined : undefined,
  fetch: (url, init) => fetch(url, init),
  now: () => Date.now(),
  recorded: (() => { try { return parseRecorded(JSON.parse(readFileSync(process.env.CHANNEL3_RECORDED ?? join(FIXTURES, "channel3-recorded.json"), "utf8"))); } catch { return null; } })(),
  warn: (line) => console.warn(line),
  counts: { day: capStore("caps-channel3"), all: capStore("caps-channel3-all") },
  paused,
});
app.get("/api/prices", async (c) => c.json(await PRICES.forWords(c.req.query("q") ?? "", clientIp(c)), 200, { "Cache-Control": "no-store" }));

/** Start a run: want → sellers → buyer → guard → (if a cart) a real sandbox order. */
app.post("/api/runs", async (c) => {
  // JSON only, from our own page: a cross-site form or no-preflight fetch can't start a paid run.
  if (!(c.req.header("content-type") ?? "").startsWith("application/json")) return c.text("send JSON", 415);
  const origin = c.req.header("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return c.text("not our page", 403);
  const body = (await c.req.json().catch(() => ({}))) as { maxPrice?: unknown; seed?: number; pace?: boolean; replayOnly?: boolean; swap?: boolean; chips?: unknown };
  // Round 0 red team A13: a maxPrice that isn't a dollar amount ("abc", "-500.00", {}, a huge number) is a 400 before
  // anything else, through the judge box's own price check, never a thrown 500. Left out, null or "" (the classic page's
  // cleared Max box, Lead-9's call), the demo's own limit, as before.
  const maxPriceIn = body.maxPrice === undefined || body.maxPrice === null || body.maxPrice === "" ? null : parsePrice(body.maxPrice, "maxPrice");
  if (maxPriceIn && !maxPriceIn.ok) return c.json({ error: maxPriceIn.error }, 400);
  // Attack corpus 12: only the wallet's recorded cart is swapped, so the void is always beside the cart judges just saw.
  const swap = body.swap === true && body.replayOnly === true;
  // W49c: the chips the page shows steer this run, checked against the catalog again here (refused = none). The wallet's
  // Approve replays its recorded week as it was, so it never takes chips.
  const checked = body.replayOnly === true || body.chips === undefined ? null : validateChips(body.chips, CATALOG);
  const chips = checked?.kind === "accepted" ? checked.chips : [];
  // §15B: a run shops the kettle only, so a run asked for another catalog entry isn't started (never a kettle under its chip).
  const notYet = notShoppedYet(chips);
  if (notYet) return c.json({ error: notYet }, 409);
  const id = randomBytes(6).toString("hex");
  const secret = randomBytes(16).toString("hex"); // ties PayPal's return call to this run
  const undoKey = randomBytes(16).toString("hex");
  const maxPrice = maxPriceIn ? maxPriceIn.value : demoWant().maxPrice;
  const asked = Number.isInteger(body.seed) && (body.seed as number) > 0 ? (body.seed as number) : null;
  // `pace: false` replays at engine speed: the round gate measures the engine, not the recorded waits (011 change 3).
  const token = sessionToken(c, RUNS_COOKIE, "/api/runs", SESSION_IDLE_MS / 1000);
  const ip = clientIp(c);
  // W53: the wallet's Approve replays its recorded week and nothing else. Without that recording here, say so before any
  // budget is taken, rather than haggle live (spending AI calls) or by rule and show the result as the recorded week.
  if (body.replayOnly === true && (asked === null || !LIBRARY.bySeed(asked, maxPrice))) return c.json({ error: "This server doesn't have that week's recording, so it can't bind its cart." }, 409);
  // Joshua's answer 1: a browser that paid this week's cart is never offered it again, even from a tab opened before it paid.
  const paid = paidCookie(c, asked);
  const undone = (): string => (undoneWeek(c, shopperKey(token), asked) ? RETURN_ALREADY_UNDONE : "This browser already paid for this cart.");
  if (body.replayOnly === true && !swap && paid) return c.json({ error: undone(), paid }, 409);
  // Fresh Q (Nov 5): the answer that would have left that cookie was lost and the tab closed, or PayPal hasn't finished. The server still knows.
  const stop = body.replayOnly === true && !swap ? weekStop(shopperKey(token), asked) : null;
  if (stop?.kind === "paid") {
    leaveStop(c, stop, asked!); // What turns the wallet to Paid, on this answer (`approveWeek`)
    return c.json({ error: undone() }, 409);
  }
  if (stop?.kind === "unsure") return c.json({ error: RETURN_WORDS.unknown, unsure: true }, 409);
  // Joshua's answer (Wed Oct 28): after a hold PayPal didn't confirm released, this browser's next cart for the week waits
  // until PayPal shows it released, read again now, before any budget is taken. Captured means money moved: no new cart.
  if (body.replayOnly === true) {
    const held = await heldGate(c, asked, token, ip);
    if (held.state === "held" || held.state === "captured") return c.json({ error: held.state === "held" ? HELD_WAIT : RETURN_WORDS.unknown, held: true, ...(held.retryIn ? { retryIn: held.retryIn } : {}) }, 409);
  }
  // H2 review: fail closed when every kept run is in flight or paid, before the budget is taken. hasRoom() deletes nothing,
  // so a client past its cap evicts no one; makeRoom() runs just before keep(run), with no await from here to there.
  if (!hasRoom(Date.now())) return c.json({ error: "Too many runs are in progress on the server. Try again in a minute.", cap: "runs-kept" }, 503);
  // The run budget comes first (H2): every kind of run counts, and nothing below runs without it.
  const spent = RUN_CAPS.takeOrWhy(token, ip);
  if (spent) return c.json({ error: `${capWords(`runs-${spent}`, RUN_CAPS.global.limit)}.`, cap: spent }, 429);
  // §15B part 2: the ticket, the hotel night or the flight seat shops its posted sellers on the wants card's simulated
  // day (`BEAT_DAY`), so the run buys what the card showed; anything else shops the kettle's market as before.
  const moving = movingItem(runEntry(chips));
  const plan = moving ? postedPlan(asked ?? 10 + Math.floor(Math.random() * 999_999_990), token, ip) : planFor(asked, maxPrice, body.pace !== false, token, ip, chips);
  const seed = plan.market.seed; // a replay's recorded market, or the fresh or asked-for number
  // Live runs use the wall clock, so the 15-minute approval TTL and the deadline are real.
  // The seeded RNG and hash stay injected so seller moves are repeatable per market number.
  const deps = { ...demoDeps(seed, sha256), clock: { now: () => Date.now() } };
  const owner = shopperKey(token);
  const session = SHOPPERS.session(owner, Date.now());
  const shopper = session.shopper;
  // A replay's moves were recorded; the rule's and live Claude's are made now. Either way, a capture is the shopper's own.
  const ledger = shopper.run(id, plan.buyer instanceof RecordedPort ? "recorded" : "live");
  // This browser's own Policy (N10): its limits, never another session's.
  const policy = session.policy;
  const want = moving ? postedWant(moving, policy, Date.now() + 7 * DAY_MS) : demoWant({ deadline: Date.now() + 7 * DAY_MS, maxPrice });
  const guard = demoGuard(deps, ledger, policy);
  // A live run is recorded as it happens, so the library keeps every live haggle, fallbacks included.
  const moves: TapeMove[] = [];
  const fallbacks: TapeFallback[] = [];
  const buyer = plan.live ? recordPort(plan.buyer, sha256, (m) => moves.push({ inputHash: m.inputHash, move: m.move, dtMs: m.dtMs }), undefined, (f) => fallbacks.push(f)) : plan.buyer;
  // A recorded week is the kettle's: a moving run is never one, whatever number it was asked with.
  const week = !moving && isDemoWeek(seed) ? seed : null;
  // N9: the category is the catalog entry's, never a want's (a posted want is built from the same code data).
  const category = moving ? CATALOG.get(moving.id)?.category : ENTRY_CATEGORY;
  const run: Run = { id, secret, secretHash: sha256(secret), undoKeyHash: sha256(undoKey), ledger, shopper, owner, guard, want, policy, buyerName: plan.label, seed, week, category, note: plan.note, replayable: plan.buyer instanceof RecordedPort, wallet: body.replayOnly === true, swap, done: false, ...colorChip(chips) };
  if (!makeRoom(Date.now())) throw new Error("runs: hasRoom() said yes, makeRoom() said no"); // sync since hasRoom: can't happen
  keep(run);

  const wc = worstCase(policy, want, category);
  ledger.append({ t: deps.clock.now(), shopperId: DEMO_SHOPPER, visibility: "owner", actor: "guard", action: "worst-case", layer: 2, verdict: "ok", price: fromCents(wc.cap), currency: "USD", why: wc.why, data: { buyer: buyer.name } });

  void (async () => {
    try {
      // Sockets the pool closed since the last run reopen alongside the first round (free calls); never awaited, so a slow network can't delay the sellers.
      void buyer.warm?.();
      // A recorded move waits its recorded time, which was under the live 1.5 s budget; the extra second keeps timer jitter from
      // turning a replay into a fallback. A tape miss falls back at once and says the recording had no move (reason "tape-miss").
      const llmTimeoutMs = plan.buyer instanceof RecordedPort ? MOVE_TIMEOUT_MS + 1000 : MOVE_TIMEOUT_MS;
      // A posted run keeps a seller the Watcher refused out of the buyer's choices (its refusal stays on the record), so
      // a scam listing's low total never ends the run before the honest seller's cart.
      const result = moving
        ? await runHaggle({ want, sellers: postedSellers(moving, BEAT_DAY), buyer, guard, deps, ledger, shopperId: DEMO_SHOPPER, catalogId: moving.id, llmTimeoutMs, chips, hideRefused: true, maxRounds: POSTED_ROUNDS })
        : await runHaggle({ want, sellers: marketSellers(plan.market, want.item), buyer, guard, deps, ledger, shopperId: DEMO_SHOPPER, catalogId: DEMO_ENTRY, llmTimeoutMs, chips });
      run.outcome = result.outcome;
      if (result.outcome === "cart" && paypal) {
        // H2 (018 N11): no order yet. PayPal's order is made only when the shopper presses Approve (POST .../approve).
        run.bound = result.decision.bound;
      } else if (result.outcome === "cart" && !paypal) {
        ledger.append({ t: deps.clock.now(), shopperId: DEMO_SHOPPER, visibility: "owner", actor: "paypal", action: "unavailable", verdict: "refused", why: "PayPal sandbox keys are not configured on this server, so no order was created." });
      }
    } catch (e) {
      // Lesson 15: a provider's error text never enters the ledger (it reaches the browser over SSE); the server log keeps it.
      console.error(`run ${id}: place failed: ${(e as Error).message}`);
      ledger.append({ t: deps.clock.now(), shopperId: DEMO_SHOPPER, visibility: "owner", actor: "paypal", action: "error", verdict: "refused", why: "Could not place the order with PayPal. Nothing was charged.", data: { reason: "create-failed" } });
    } finally {
      // In `finally`, so a run that throws still logs its moves (those may be the bad ones).
      if (plan.live) {
        try { appendMoves(MOVE_LOG, moveRows(ledger.read(), SESSION, id)); } catch (e) { console.warn(`move log: ${(e as Error).message}`); }
        // W49c: a run a chip steered met fewer sellers than its market has, so it is never a recording of that market.
        run.replayable = !moving && !steersMarket(chips, want.item)(plan.market) && saveToLibrary({ seed, market: plan.market, maxPrice, moves, fallbacks });
      }
      run.done = true;
      ledger.append({ t: deps.clock.now(), shopperId: DEMO_SHOPPER, visibility: "owner", actor: "guard", action: "done", why: run.bound ? "Waiting for your approval in PayPal." : "Run finished." });
    }
  })();

  // `undoKey` goes to this browser only, once: with the run id it is what Undo asks for (018 N12).
  return c.json({ runId: id, buyer: plan.label, source: plan.buyer.name, seed, note: plan.note, undoKey });
});

/** A2: the color chip a run was sent with, as the Run keeps it (absent when none). */
const colorChip = (chips: readonly Chip[]): { color?: string } => {
  const c = chips.find((x) => x.kind === "attribute" && x.name === "color");
  return c ? { color: c.value } : {};
};

/**
 * A2: a paid cart teaches memory its color only when her own color chip steered the run and the cart listed that same
 * color (bound into its hash; memory.ts `confirmColor`). Into her own session only, by the run's owner key.
 */
function rememberPaid(run: Run): void {
  if (!run.bound || run.color === undefined) return;
  const c = confirmColor([{ kind: "attribute", name: "color", value: run.color }], run.bound.cart, run.bound.hash, CATALOG);
  if (c) SHOPPERS.remember(run.owner, c, Date.now());
}

/** True when this request comes from the browser whose runs session token started the run (020 W20). */
function isOwner(run: Run, c: Context): boolean {
  const have = getCookie(c, RUNS_COOKIE);
  return Boolean(have) && timingSafeEq(shopperKey(have!), run.owner);
}

/** JSON from our own page only, as for starting a run: a cross-site form can't press Approve or Undo. */
function ownPage(c: Context): Response | null {
  if (!(c.req.header("content-type") ?? "").startsWith("application/json")) return c.text("send JSON", 415);
  const origin = c.req.header("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return c.text("not our page", 403);
  return null;
}

/**
 * Approve (H2, 018 N11): the shopper's press is what makes PayPal's order, for exactly the cart code bound, then the page
 * opens PayPal. Only the run's own browser may press it; a second press gets the same order, never a second one.
 */
app.post("/api/runs/:id/approve", async (c) => {
  const refused = ownPage(c);
  if (refused) return refused;
  const [body, status] = await approveRun(c, runs.get(c.req.param("id")));
  return c.json(body, status);
});

/**
 * Fresh Q (Nov 5): what this owner's other runs say about a recorded week, read from the runs themselves, so it needs no cookie and it survives
 * a restart with them. `run.owner` is on every run, so the return can ask this even though PayPal's redirect never carries the Strict runs
 * cookie; every same-origin door asks it for the browser's own owner, where that cookie does arrive (checked in Chromium, Nov 5). paid: PayPal
 * took it. unsure: money may have moved (`returnKind`), or a settle is under way. held: a hold nobody confirmed released. It lasts as long as the
 * run is kept, and the cookie lasts longer; a new browser is a new owner, so this is still no per-payer limit.
 * ONE PROCESS ONLY (fresh Q, Nov 5): `runs`, `run.settling` and the returns' turn-taking live in this process's memory, so two server
 * processes each see only their own and the stop fails OPEN: both could capture the same week. Render's deploy briefly runs the old and
 * new process side by side (render.yaml). Not locked before the freeze; a second process needs a shared lock first (shared Lesson 44).
 */
type WeekStop = { kind: "paid" | "unsure" | "held"; orderId: string; total: string; refunded: boolean; run?: Run };
/** What a recorded week's ordered run means for the stop, as its own browser reads it: a settle in flight is "unknown". Null: no order. */
function stopKind(r: Run): ReturnKind | null {
  if (r.week === null || !r.bound?.orderId) return null;
  return r.settling && !r.settled ? "unknown" : returnKind({ week: r.week, bound: { total: fromCents(r.bound.cart.price), orderId: r.bound.orderId }, settled: r.settled ?? null, events: r.ledger.read(), mine: true });
}
/** The stop one kept run holds for its week, or null: paid, unsure (money may have moved, or a settle is under way), or held. */
function stopOf(r: Run): WeekStop | null {
  const k = stopKind(r);
  const kind = k === "paid" ? "paid" : k === "unknown" || k === "mismatch" ? "unsure" : k === "held" ? "held" : null;
  return kind === null ? null : { kind, orderId: r.bound!.orderId!, total: fromCents(r.bound!.cart.price), refunded: Boolean(r.refund), run: r };
}
function weekStop(owner: string, week: number | null | undefined, self?: Run): WeekStop | null {
  if (week === null || week === undefined) return null;
  let best: WeekStop | null = null;
  for (const r of runs.values()) {
    if (r === self || r.owner !== owner || r.week !== week) continue;
    const s = stopOf(r);
    if (s && (!best || STOP_RANK[s.kind] < STOP_RANK[best.kind])) best = s;
    if (best?.kind === "paid") return best;
  }
  // An evicted run's stop (its mark, Lead-12 and the narrow Q): it has no run, only what the stop's cookies and words need.
  const m = MARKS.get(markKey(owner, week));
  if (m && m.until > Date.now() && (!best || STOP_RANK[m.kind] < STOP_RANK[best.kind])) return { kind: m.kind, orderId: m.orderId, total: m.total, refunded: m.refunded };
  return best;
}
/** This browser already paid this run's recorded week, from any page: its cookie, or, for the run's own browser, the server's stop. */
const paidThisWeek = (c: Context, run: Run): boolean => !run.swap && (paidCookie(c, run.week) !== null || (isOwner(run, c) && weekStop(run.owner, run.week, run)?.kind === "paid"));
/**
 * The week this browser paid was then undone (fresh Q, Nov 5): the refunded cookie names the paid one's order, or the paying run kept
 * here was refunded. Still no second cart (a refund isn't a reopen), but no word says "already paid".
 */
const undoneWeek = (c: Context, owner: string | null, week: number | null | undefined): boolean => {
  if (week === null || week === undefined) return false;
  const name = weekCookie(WALLET_REFUNDED_COOKIE, week);
  const back = parseWalletPaid(openWalletCookie(WALLET_COOKIE_KEY, name, getCookie(c, name)));
  const paid = paidCookie(c, week);
  if (back && paid && back.week === week && back.orderId === paid.orderId) return true;
  const stop = owner === null ? null : weekStop(owner, week);
  return stop?.kind === "paid" && stop.refunded;
};
const undoneThisWeek = (c: Context, run: Run): boolean => undoneWeek(c, isOwner(run, c) ? run.owner : null, run.week);
/** Money may have moved on another of this browser's runs for the week, so nobody can say this cart wouldn't pay twice. */
const unsureThisWeek = (c: Context, run: Run): boolean => !run.swap && isOwner(run, c) && weekStop(run.owner, run.week, run)?.kind === "unsure";
/** What Approve and "Not this one" say to a run that is gone, and to anyone but its own browser (W87). */
const RUN_GONE = "That run is gone. Start a new one.";
/**
 * The press itself, shared by Approve and the Store Sync-shaped market's complete_payment (PayPal additions 5): either way
 * it makes PayPal's order for exactly the cart the guard bound, and only the run's own browser may press it.
 */
async function approveRun(c: Context, run: Run | undefined): Promise<[{ approveUrl: string } | { error: string }, 200 | 404 | 409 | 410 | 502 | 503]> {
  // W87 (red team, as W80): another browser gets the missing run's 404, word for word, whatever state the run is in, so
  // this route adds no oracle of its own (GET /api/runs/:id still answers any id). The owner still hears her own 409s.
  if (!run || !isOwner(run, c)) return [{ error: RUN_GONE }, 404];
  if (!run.bound || !paypal) return [{ error: "There is no cart to approve on this run." }, 409];
  if (run.settled || run.bound.spent) return [{ error: "This cart is closed." }, 409];
  if (run.aside) return [{ error: SET_ASIDE_WORDS }, 409];
  // Fresh Q (Nov 5): the stop is on the deal, not on how the run started. A replay on the classic page, or a plain Go that
  // replays a recorded week, is the wallet's deal too: it still plays, and only the press is refused. A swap is never charged.
  if (paidThisWeek(c, run)) { leaveWeekStop(c, run.owner, run.week); return [{ error: undoneThisWeek(c, run) ? RETURN_ALREADY_UNDONE : RETURN_ALREADY }, 409]; }
  if (unsureThisWeek(c, run)) return [{ error: RETURN_WORDS.unknown }, 409];
  if (run.week !== null) {
    const held = await heldGate(c, run.week, sessionToken(c, RUNS_COOKIE, "/api/runs", SESSION_IDLE_MS / 1000), clientIp(c));
    if (held.state === "held" || held.state === "captured") return [{ error: held.state === "held" ? HELD_WAIT : RETURN_WORDS.unknown }, 409];
  }
  if (paused()) return [{ error: `${PAUSED}. Nothing was paid; the recorded demo, your wallet and the ledger still work.` }, 503];
  if (run.approveUrl) return [{ approveUrl: run.approveUrl }, 200];
  if (!(Date.now() <= run.bound.expiresAt)) return [{ error: "The approval time for this cart ran out. Start a new run." }, 410];
  const bound = run.bound, port = paypal;
  run.placing ??= run.guard.place(bound, port, `${PUBLIC_URL}/api/runs/${run.id}/return?k=${run.secret}`, PAYMENT_INTENT).then(
    (placed) => { run.approveUrl = placed.approveUrl; touch(run); },
    (e) => {
      // Lesson 15: a provider's error text never enters the ledger; the server log keeps it. A later press may try again.
      console.error(`run ${run.id}: place failed: ${(e as Error).message}`);
      run.ledger.append({ t: Date.now(), shopperId: DEMO_SHOPPER, visibility: "owner", actor: "paypal", action: "error", verdict: "refused", why: "Could not place the order with PayPal. Nothing was charged.", data: { reason: "create-failed" } });
    },
  ).finally(() => { run.placing = undefined; });
  await run.placing;
  // Set aside while PayPal was making the order (review, 025): the shopper said no after pressing, so PayPal never opens.
  if (run.aside) return [{ error: SET_ASIDE_WORDS }, 409];
  return run.approveUrl ? [{ approveUrl: run.approveUrl }, 200] : [{ error: "Could not place the order with PayPal. Nothing was charged." }, 502];
}

// PayPal additions 5 (Joshua, Oct 29): the Store Sync-shaped market, our fictional shelf behind three steps named as in
// Store Sync's published agent flow. Nothing here calls Store Sync, and `complete_payment` is that flow's step name, not a
// PayPal Agent Toolkit tool. Under /api/runs so the runs cookie (path /api/runs) names the shopper on every step.
// search: pure, no row, no money. cart: a run of its own (on the market's own cap, never the haggle's run budget), whose
// guard decides the listing's cart with the Watcher reading its words and record, under this browser's own limits, written
// as a "market" row so it is her money but never a clean cart toward the dial. complete_payment: that
// run's Approve, so PayPal's order is made for exactly the bound cart, and the money moves only after the shopper's tap,
// through PayPal's return and the guard's settle, as for every cart.
app.get("/api/runs/store/search", (c) => c.json({ step: "search", claim: STORE_SYNC_CLAIM, results: storeSearch(c.req.query("q") ?? "") }));

app.post("/api/runs/store/cart", async (c) => {
  const refused = ownPage(c);
  if (refused) return refused;
  const body = (await c.req.json().catch(() => ({}))) as { listingId?: unknown; market?: unknown; from?: unknown; maxPrice?: unknown };
  // Track H-3: the cap the shopper said (the Desk sends back what code read in her words). The same gate as a run's
  // maxPrice: anything but a dollar amount is a 400. It can only lower the cart's max (`marketWant` holds it under the
  // per-purchase cap, and the guard under the category's limit as always): no words raise a limit.
  const capIn = body.maxPrice === undefined || body.maxPrice === null || body.maxPrice === "" ? null : parsePrice(body.maxPrice, "maxPrice");
  if (capIn && !capIn.ok) return c.json({ step: "cart", claim: STORE_SYNC_CLAIM, error: capIn.error }, 400);
  // Desk slice 1: a listing on a made-up market names its market, which must still be in this server's cache. Desk-L: its
  // cart is held to the limit of the category code's keyword table places the market's words in (`marketCategory`), never
  // anything the AI or a seller wrote, and never a price the shopper typed.
  const made = typeof body.market === "string" ? MARKETS.get(body.market) : undefined;
  const listing = body.market !== undefined ? marketListing(made, body.listingId) : storeListing(body.listingId);
  if (!listing) return c.json({ step: "cart", claim: STORE_SYNC_CLAIM, kind: "missing", reason: STORE_SAYS.missing }, 404);
  const token = sessionToken(c, RUNS_COOKIE, "/api/runs", SESSION_IDLE_MS / 1000);
  const ip = clientIp(c);
  if (!hasRoom(Date.now())) return c.json({ error: "Too many runs are in progress on the server. Try again in a minute.", cap: "runs-kept" }, 503);
  const spent = STORE_CAPS.takeOrWhy(token, ip);
  if (spent) return c.json({ step: "cart", claim: STORE_SYNC_CLAIM, error: `${STORE_CAP_WORDS[spent]} Nothing was bought, and your haggle runs are untouched.`, cap: `store-${spent}` }, 429);
  const id = randomBytes(6).toString("hex");
  const secret = randomBytes(16).toString("hex");
  const undoKey = randomBytes(16).toString("hex");
  // A fresh number per cart, so the bound cart's nonce is never another cart's.
  const seed = 1 + (randomBytes(4).readUInt32BE(0) % 999_999_990);
  const deps = { ...demoDeps(seed, sha256), clock: { now: () => Date.now() } };
  const owner = shopperKey(token);
  const session = SHOPPERS.session(owner, Date.now());
  // Its own source (Sonnet review, Oct 29): the shopper's money and week, as any cart she pays, but never a clean cart
  // toward the dial (`COUNTS_TOWARD_RECORD.market`), so taps on a fixed shelf can't turn "buy within limits" on.
  const ledger = session.shopper.run(id, "market");
  const policy = session.policy;
  // The Desk sends no checked chips yet, so the words alone place it (decided by default, Desk-L).
  const place = made ? marketCategory(made.words, [], policy) : undefined;
  const want = made ? marketWant(made, place!, policy, Date.now(), capIn?.value) : demoWant({ deadline: Date.now() + 7 * DAY_MS });
  const category = made ? place!.category : ENTRY_CATEGORY;
  const guard = made ? marketGuard(deps, ledger, policy, made, place!) : demoGuard(deps, ledger, policy);
  const run: Run = { id, secret, secretHash: sha256(secret), undoKeyHash: sha256(undoKey), ledger, shopper: session.shopper, owner, guard, want, policy, buyerName: "market", seed, week: null, category, note: null, replayable: false, wallet: false, store: listing.id, ...(body.from === "desk" || body.from === "line" ? { desk: true } : {}), ...(body.from === "line" ? { line: true } : {}), ...(place ? { limitWhy: place.why } : {}), done: false };
  if (!makeRoom(Date.now())) throw new Error("runs: hasRoom() said yes, makeRoom() said no");
  keep(run);
  const wc = worstCase(policy, want, category);
  ledger.append({ t: deps.clock.now(), shopperId: DEMO_SHOPPER, visibility: "owner", actor: "guard", action: "worst-case", layer: 2, verdict: "ok", price: fromCents(wc.cap), currency: "USD", why: wc.why, data: { buyer: "market" } });
  // Track J: a made-up market's every seller and the Watcher's read of each go on the record with this cart, so Behind
  // the scenes shows the scam seller the Desk just set aside (fixed rows from code; the notes fenced and quoted).
  // Round 0: a market this session's Desk ask already read (`readIntoSession`) is on the record once, in the ask's run.
  if (made && !MARKET_READS.get(session.shopper)?.has(made.id)) for (const e of marketReadRows(deps.clock.now(), DEMO_SHOPPER, made.listings)) ledger.append(e);
  // The shopping-run reader's hold on this seller, read when the Desk asked (`deskRead`); it can only hold, never clear.
  const reading = made ? DESK_READS.get(deskKey(made))?.holds.get(listing.id) ?? null : null;
  const r = storeCart({ guard, want, ledger, shopperId: DEMO_SHOPPER, now: deps.clock.now(), listingId: listing.id, ...(made ? { listings: made.listings } : {}), reading });
  if (r.kind === "cart") {
    run.outcome = "cart";
    if (paypal) run.bound = r.bound;
    else ledger.append({ t: deps.clock.now(), shopperId: DEMO_SHOPPER, visibility: "owner", actor: "paypal", action: "unavailable", verdict: "refused", why: "PayPal sandbox keys are not configured on this server, so no order was created." });
  } else run.outcome = "refused";
  run.done = true;
  ledger.append({ t: deps.clock.now(), shopperId: DEMO_SHOPPER, visibility: "owner", actor: "guard", action: "done", why: run.bound ? "Waiting for your approval in PayPal." : "Run finished." });
  const said = r.kind === "cart"
    ? { kind: "cart", decision: r.decision, total: r.total, currency: "USD", reason: r.reason, holds: r.holds, hash: r.bound.hash, expiresAt: r.bound.expiresAt }
    : r.kind === "refused" ? { kind: "refused", reason: r.reason, rule: r.rule } : { kind: "missing", reason: r.reason };
  return c.json({ step: "cart", claim: STORE_SYNC_CLAIM, ...(made ? { fictional: made.claim, limitWhy: place!.why } : {}), runId: id, undoKey, canPay: Boolean(run.bound), ...said });
});

app.post("/api/runs/store/complete_payment", async (c) => {
  const refused = ownPage(c);
  if (refused) return refused;
  const body = (await c.req.json().catch(() => ({}))) as { runId?: unknown };
  const run = typeof body.runId === "string" ? runs.get(body.runId) : undefined;
  // W80 (red team): another browser gets the missing cart's 404, word for word, whether the cart is bound, refused or
  // gone, so a guessed run id learns nothing about whether it exists. The owner still hears her own 409s.
  if (!run || run.store === undefined || !isOwner(run, c)) return c.json({ step: "complete_payment", claim: STORE_SYNC_CLAIM, error: "That cart is gone. Start a new one." }, 404);
  if (!run.bound) return c.json({ step: "complete_payment", claim: STORE_SYNC_CLAIM, error: STORE_SAYS.noCart }, 409);
  const [said, status] = await approveRun(c, run);
  // Never "paid": the order waits for the shopper's tap in PayPal, and only the guard's settle after it can capture.
  return c.json({ step: "complete_payment", claim: STORE_SYNC_CLAIM, ...("approveUrl" in said ? { status: "waiting-for-your-tap" } : {}), ...said }, status);
});

const SET_ASIDE_WORDS = "You set this cart aside. Bring it back to approve it.";
/** The most rows one cart's "no" and "bring it back" may write: plenty for a shopper, never an unbounded ledger. */
const ASIDE_WRITES = 20;

/**
 * "Not this one" and "Bring it back" (Track T's suggestion, 025): the shopper's no, kept by the server as a ledger row, so
 * Approve and PayPal's return honor it on any page and a reload, and the dial counts it as a bad pick until it's taken
 * back. Only the run's own browser, and only while the cart is open: a paid or closed cart has nothing to set aside.
 */
app.post("/api/runs/:id/aside", async (c) => {
  const refused = ownPage(c);
  if (refused) return refused;
  const run = runs.get(c.req.param("id"));
  // W87: a non-owner hears the missing run's 404, word for word (see approveRun).
  if (!run || !isOwner(run, c)) return c.json({ error: RUN_GONE }, 404);
  if (!run.bound) return c.json({ error: "There is no cart on this run." }, 409);
  if (run.settled || run.settling || run.bound.spent) return c.json({ error: "This cart is closed." }, 409);
  const body = (await c.req.json().catch(() => ({}))) as { back?: unknown };
  const aside = body.back !== true;
  // Said twice, written once: a second "no" (or a second tap) changes nothing and adds no row.
  if (Boolean(run.aside) !== aside) {
    if ((run.asideWrites ?? 0) >= ASIDE_WRITES) return c.json({ error: "This cart has changed too many times. It stays as it is." }, 429);
    run.asideWrites = (run.asideWrites ?? 0) + 1;
    run.aside = aside;
    run.ledger.append((aside ? setAside : broughtBack)(Date.now(), DEMO_SHOPPER));
  }
  return c.json({ aside });
});

/**
 * Undo (H2, 018 N12): by run id and its undo key, nothing else. The capture refunded is the one this server's settle
 * recorded; a capture id in the request is never read. PayPal-Request-Id is fixed per run, so it refunds at most once.
 */
const UNDO_CLOSED = "The undo window has closed.";
app.post("/api/runs/:id/undo", async (c) => {
  const refused = ownPage(c);
  if (refused) return refused;
  const run = runs.get(c.req.param("id"));
  if (!run) return c.json({ error: "That run is gone, so it can't be undone here." }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { undoKey?: unknown };
  if (typeof body.undoKey !== "string" || !timingSafeEq(sha256(body.undoKey), run.undoKeyHash)) return c.json({ error: "Not this run's undo key." }, 403);
  // The press that sends the refund: none has landed (`refund`, kept through a restart) and none is in flight
  // (`refunding`, set before undoRun's first await), so a later press or a second one at the same moment is never it.
  const first = !run.refund && !run.refunding;
  // W82: past the window the page shows no Undo, so the route takes none either. A refund already landed or in flight
  // still answers as before (the same refund, idempotent); an unpaid run gets undoRun's own answer.
  if (first && run.settled?.ok && !undoOpen(run, Date.now())) return c.json({ ok: false, error: UNDO_CLOSED }, 409);
  const r = await undoRun(run, paypal, run.ledger, () => Date.now(), DEMO_SHOPPER, (m) => console.error(m));
  if (r.ok) {
    // The wallet's Undo: this browser's paid cookie gets its refunded twin, so a reload says "Undone", never "Paid". Set
    // first: the money is back, so nothing after this may keep the page saying "Paid".
    if (run.settled?.ok && run.bound?.orderId && run.week !== null) {
      setWeekCookie(c, WALLET_REFUNDED_COOKIE, run.week, walletPaidValue({ week: run.week, orderId: run.bound.orderId, total: fromCents(run.bound.cart.price) }), 90);
    }
    // QUEUE M3 slot 2: Undo is a bad pick (its "refunded" row, `isBadPick`) and turns the cart's category back to asking
    // first, once, on the press that sent the refund. A turn that fails is logged, never a 500 after PayPal refunded.
    const category = first && run.bound?.cart.catalogId ? CATALOG.get(run.bound.cart.catalogId)?.category : undefined;
    if (category) {
      try { SHOPPERS.turnBack(run.owner, category, Date.now()); } catch (e) { console.error(`undo: refunded, but the dial didn't turn back: ${e instanceof Error ? e.message : "unknown"}`); }
    }
    return c.json({ ok: true, refundId: r.refundId });
  }
  return c.json({ ok: false, error: r.reason }, r.code === "refund-failed" ? 502 : 409);
});

type LookKind = "disputes" | "report";
/**
 * PayPal additions 2 and 3: a read-only look at PayPal about this run's purchase, by the capture this server's settle
 * recorded (a capture id in the request is never read). Owner only, a paid run only. One look per LOOK_EVERY_MS for each
 * kind (a press inside it gets the last answer again, marked `cached`), at most LOOK_ROWS rows of each kind a run. Each
 * look writes one row with no verdict, so it moves no count.
 */
const LOOK_EVERY_MS = 30_000;
const LOOK_ROWS = 10;
type Lookable = PaymentPort & Partial<DisputesPort & ReportPort>;
function paidLook(kind: LookKind, can: (port: Lookable) => boolean, look: (port: Lookable, run: Run & { bound: BoundCart }, captureId: string) => Promise<NewEvent | Response>) {
  return async (c: Context) => {
    const refused = ownPage(c);
    if (refused) return refused;
    const run = runs.get(c.req.param("id") ?? "");
    if (!run) return c.json({ error: "That run is gone. PayPal still has your purchase." }, 404);
    if (!isOwner(run, c)) return c.json({ error: "Only the browser that paid can ask PayPal about this purchase here." }, 403);
    const captureId = run.settled?.ok ? run.settled.captureId : undefined;
    const bound = run.bound;
    if (!captureId || !bound) return c.json({ error: "Nothing was paid on this run, so there's nothing to ask PayPal about." }, 409);
    const port = paypal as Lookable | null;
    if (!port || !can(port)) return c.json({ error: "PayPal isn't connected here, so it can't be asked." }, 501);
    const now = Date.now();
    const last = (run.looks ??= {})[kind];
    // A look still in flight is said as one, never as an answer from "a moment ago" (P-3 review).
    if (last && last.words === null) return c.json({ words: "PayPal is being asked now.", pending: true });
    if (last && now - last.at < LOOK_EVERY_MS) return c.json({ words: last.words, cached: true });
    if (last && last.rows >= LOOK_ROWS) return c.json({ error: "PayPal was asked enough times about this purchase here." }, 429);
    const mine = { at: now, words: null as string | null, rows: (last?.rows ?? 0) + 1 };
    run.looks[kind] = mine;
    // A look that wrote no row (a refusal, or a throw) gives its slot back: no row spent, no window claimed.
    const row = await look(port, run as Run & { bound: BoundCart }, captureId).catch((e: unknown) => { if (last) run.looks![kind] = last; else delete run.looks![kind]; throw e; });
    if (row instanceof Response) { if (last) run.looks[kind] = last; else delete run.looks[kind]; return row; }
    run.ledger.append(row);
    mine.words = row.why;
    touch(run);
    return c.json({ words: row.why });
  };
}
const lookFailed = (run: Run, what: string) => (e: unknown) => { console.error(`run ${run.id}: ${what} threw: ${e instanceof Error ? e.message : String(e)}`); return null; };

/** PayPal additions 2, "if it never arrives": the disputes PayPal lists on this purchase (list_disputes). */
app.post("/api/runs/:id/disputes", paidLook("disputes", (p) => typeof p.disputes === "function", async (port, run, captureId) =>
  disputeRow(Date.now(), DEMO_SHOPPER, run.bound.cart.sellerId, captureId, await port.disputes!(captureId).catch(lookFailed(run, "disputes")))));

/**
 * PayPal additions 3, reconcile: PayPal's transaction report (list_transactions) against the amount this ledger recorded
 * for the capture: "PayPal agrees", or a red row when they differ.
 */
app.post("/api/runs/:id/reconcile", paidLook("report", (p) => typeof p.reported === "function", async (port, run, captureId) => {
  const captured = run.ledger.read().find((e) => e.actor === "paypal" && e.action === "captured" && e.data?.captureId === captureId && e.price && e.currency);
  if (!captured) return new Response(JSON.stringify({ error: "This ledger has no capture to check against." }), { status: 409, headers: { "content-type": "application/json" } });
  const reply = await port.reported!(captureId, captured.t, Date.now()).catch(lookFailed(run, "report"));
  return reconcileRow(Date.now(), DEMO_SHOPPER, run.bound.cart.sellerId, captureId, { price: captured.price!, currency: captured.currency! }, reply);
}));

/**
 * The session token a surface's per-browser cap counts: a random cookie, HttpOnly, scoped to that surface's path. The runs
 * token lasts a week (020 W18), as long as the session it keys, so the rolling 7-day total sees the whole week.
 */
function sessionToken(c: Context, name: string, path: string, maxAge = 86_400): string {
  const have = getCookie(c, name);
  if (have && /^[0-9a-f]{32}$/.test(have)) return have;
  const token = randomBytes(16).toString("hex");
  setCookie(c, name, token, { httpOnly: true, sameSite: "Strict", path, maxAge, secure: PUBLIC_URL.startsWith("https://") });
  return token;
}
const judgeToken = (c: Context) => sessionToken(c, JUDGE_COOKIE, "/api/judge");

/**
 * The caller's key for the per-IP cap: an IPv4 address or an IPv6 /64 (`ipKey`, H4). On Render the socket is Render's
 * proxy, and X-Forwarded-For ends with the proxy hop, a different address on every request (H4 live check, Wed Oct 28:
 * 8 takes from one machine counted under 8 keys). The client is the entry PROXY_HOPS from the right (`forwardedKey`);
 * anything the client typed into the header sits to its left. 3, measured live: at 2 the key still rotated through
 * Cloudflare's edge addresses (104.23.x, 172.70.x), so the chain is client, Cloudflare edge, Render's own hop.
 */
const PROXY_HOPS = envInt("PROXY_HOPS", 3);
// H4 review, W81: a chain shorter than PROXY_HOPS or an entry ipKey rejects puts every such caller on "unknown" and one
// cap. Said once per reason, shape and counts only.
const forwardedClient = forwardedKeyWarnOnce(PROXY_HOPS, (m) => console.warn(m));
function clientIp(c: Context): string {
  if (!process.env.RENDER) return ipKey(getConnInfo(c).remote.address ?? "");
  return forwardedClient(c.req.header("x-forwarded-for") ?? "");
}

// The Challenge's record (Joshua's Tier 2a, Nov 3): one row per real try, closed-list fields, never a word of the note
// (`core/src/judge/attempts.ts`). A key of its own, so it starts from zero and the old all-time count (`cap:attacks`: our
// probes and panels) stays out of it. With the store unreachable at boot there is no number at all, not a low one.
const ATTEMPT_KEY = "attempts1:";
function attemptStore(prefix: string): AttemptStore | null {
  if (STORE_DOWN) return null;
  if (KV) return { load: () => KV.keys(prefix).map((k) => KV.get(k) ?? "[]"), save: (key, text) => KV.set(`${prefix}${key}`, text) };
  const dir = join(GOOSE_DIR, prefix.slice(0, -1));
  return {
    load: () => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => readFileSync(join(dir, f), "utf8")) : []),
    save(key, text) {
      try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${key}.tmp`), text);
        renameSync(join(dir, `${key}.tmp`), join(dir, `${key}.json`));
      } catch (e) { console.warn(`challenge record: ${(e as Error).message}`); }
    },
  };
}
const ATTEMPTS = new AttemptLog(attemptStore(ATTEMPT_KEY), (m) => console.warn(m));
// Marks a repeat without keeping its words (`FirstTries`): a secret made fresh each UTC day, never written down, and dropped with that day's marks.
const FIRST_TRIES = new FirstTries(() => { const secret = randomBytes(32); return (text) => createHmac("sha256", secret).update(text).digest("base64url"); }, () => Date.now());
// The short window on top of the day's caps (Joshua: per browser and per address). The address's count is the one a script
// meets, and a classroom on one network shares it, so it is well above what one person can type.
const TRY_BURST = new MinuteCap({ perToken: envInt("TRY_PER_BROWSER_MINUTE", 10), perIp: envInt("TRY_PER_IP_MINUTE", 30) }, () => Date.now());
/** A note, a price and a mode as JSON: 500 characters at 6 bytes each (`\\uXXXX`) plus the rest. Past it nothing is parsed. */
const TRY_MAX_BYTES = 4096;
const tryBody = bodyLimit({ maxSize: TRY_MAX_BYTES, onError: (c) => c.json({ error: "That note is too long." }, 413) });
function tooFast(c: Context, token: string, ip: string): Response | null {
  const hit = TRY_BURST.take(token, ip);
  if (!hit) return null;
  // Your own pace is yours to wait out. A busy network isn't, so its 429 names the cap and the page answers in the browser.
  return hit.who === "token" ? c.json({ error: SLOW_DOWN, waitMs: hit.waitMs }, 429) : c.json({ error: "This network is at its limit for now. Try again in a minute.", cap: "ip", waitMs: hit.waitMs }, 429);
}
// What one address can add to the count in a day: well under the rounds it may run, so a script fills this first and a
// visitor on its network still gets answers. Errs low for a class on one network, and the page and the claims row say so.
const COUNTED_PER_IP = new DailyCap(envInt("TRY_COUNTED_PER_IP", 30), () => Date.now());
/**
 * The one place a round becomes a row, once per address per day. `counted` is what the page says: true means these words are
 * on the count, which holds for a neighbor's same words too (`FirstTries`). `full` says this address's count is used up.
 */
function countTry(rows: readonly LedgerEvent[], req: { note: string; price: Cents }, who: { ip: string; browser: string }, source: AttemptSource, type?: ThreatType): { counted: boolean; countFull: boolean } {
  if (!countsAsTry(req.note)) return { counted: false, countFull: false };
  const seen = FIRST_TRIES.take(who.ip, who.browser, req.note);
  if (seen === "repeat") return { counted: false, countFull: false };
  // Full first: answering a neighbor's words differently from new ones, once full, would confirm what the neighbor wrote.
  if (COUNTED_PER_IP.left(who.ip) === 0) return { counted: false, countFull: true };
  if (seen === "neighbor") return { counted: true, countFull: false };
  COUNTED_PER_IP.take(who.ip);
  ATTEMPTS.add(attemptOf({ rows, note: req.note, offered: req.price, max: demoWant().maxPrice, at: Date.now(), source, ...(type ? { type } : {}) }));
  return { counted: true, countFull: false };
}
function judgeStatus(token: string, ip: string) {
  const left = JUDGE_CAPS.triesLeft(token, ip);
  return { ai: JUDGE_AI && !paused() ? (left > 0 ? "on" : "capped") : "off", triesLeft: JUDGE_AI && !paused() ? left : 0, maxNote: MAX_JUDGE_NOTE, max: fromCents(demoWant().maxPrice), history: JUDGE_HISTORY, challenge: ATTEMPTS.counts() };
}

app.get("/api/judge", (c) => c.json(judgeStatus(judgeToken(c), clientIp(c))));

/**
 * The judge box: your note and price as a seller, one buyer move, the guard's verdict. Nothing is kept:
 * no run, no move log, no server log of the note; the card goes back to this request only.
 */
app.post("/api/judge", tryBody, async (c) => {
  if (!(c.req.header("content-type") ?? "").startsWith("application/json")) return c.text("send JSON", 415);
  const origin = c.req.header("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return c.text("not our page", 403);
  const parsed = parseJudgeRequest(await c.req.json().catch(() => null));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const token = judgeToken(c);
  const ip = clientIp(c);
  const fast = tooFast(c, token, ip);
  if (fast) return fast;
  const aiState: AiState = !JUDGE_AI || paused() ? "off" : parsed.value.mode === "ai" ? (JUDGE_CAPS.take(token, ip) ? "on" : "capped") : "on";
  if (parsed.value.mode === "rule" || aiState !== "on") {
    const hit = JUDGE_RULE_CAPS.takeOrWhy(token, ip);
    if (hit) return c.json({ error: "Today's counted tries from here are used up. Nothing was placed.", cap: hit }, 429);
  }
  const reader = aiState === "on" && parsed.value.mode === "ai" && JUDGE_READER && JUDGE_CAPS.global.take("all") ? JUDGE_READER : null;
  try {
    // Built by core's one judge factory (shared with the browser's plain-rule round): labeled an attack and kept in a
    // throwaway ledger, so the judge's rows never reach any shopper's week, dial or grid (N19).
    const card = await demoJudgeRound({
      req: parsed.value, hash: sha256, now: () => Date.now(), seed: randomBytes(4).readUInt32BE(0), runId: randomBytes(6).toString("hex"),
      ai: JUDGE_AI, reader, aiState, aiName: JUDGE_AI_NAME, where: "server",
    });
    // Counted from the round's own rows (the judge's want, so its max), then the rows are dropped: only the row's closed-list fields are kept.
    const tally = countTry(card.events, parsed.value, { ip, browser: token }, "person");
    // The ledger stays on the server side of this function: it carries raw ids, and the card already says everything (Lesson 17).
    const { events: _events, ...shown } = card;
    return c.json({ ...shown, ...tally, attempt: answerOf(card.events, parsed.value.note, parsed.value.price), ...judgeStatus(token, ip) });
  } catch (e) {
    // Never the note: the error's own text only (a port's error never carries the input).
    console.error(`judge round failed: ${(e as Error).message}`);
    return c.json({ error: "The judge round failed. Nothing was placed." }, 500);
  }
});

/**
 * "Try to trick Goose" (the Desk's slice 4): the judge box's own round, on its own caps (the AI's and the plain rule's, the
 * same per-network and per-day counts), whose rows about your offer then land in this browser's session ledger labeled
 * "a test of the guard" (`trickGoose`), so they stream into Behind the scenes (/api/runs/session/events). Under /api/runs so
 * the runs cookie, which keys the session, is sent; its per-browser counts are keyed apart from the judge box's cookie. The
 * caps are taken before any session is made (W49g). The note's words are never kept: not in the ledger, a log or a file.
 */
const trickKey = (token: string) => `trick:${shopperKey(token)}`;
function trickStatus(key: string, ip: string) {
  const left = JUDGE_CAPS.triesLeft(key, ip);
  const aiCap: CapHit | null = !JUDGE_AI || paused() || left > 0 ? null : JUDGE_CAPS.perToken.left(key) === 0 ? "token" : JUDGE_CAPS.perIp.left(ip) === 0 ? "ip" : "global";
  return { ai: JUDGE_AI && !paused() ? (left > 0 ? "on" : "capped") : "off", aiCap, networkFull: COUNTED_PER_IP.left(ip) === 0, triesLeft: JUDGE_AI && !paused() ? left : 0, maxNote: MAX_JUDGE_NOTE, max: fromCents(demoWant().maxPrice), challenge: ATTEMPTS.counts(), ...(SCAMMER_ON ? { scammer: true, scammerLeft: SCAMMER && !paused() ? SCAMMER_CAPS.triesLeft(key, ip) : 0, scammerKept: SCAM_NOTES.size } : {}) };
}
// A read makes no session and sets no cookie: with none yet, the per-browser count is a fresh browser's.
app.get("/api/runs/trick", (c) => { c.header("Cache-Control", "no-store"); const have = getCookie(c, RUNS_COOKIE); return c.json(trickStatus(have ? trickKey(have) : "trick:new", clientIp(c))); });
app.post("/api/runs/trick", tryBody, async (c) => {
  const refused = ownPage(c);
  if (refused) return refused;
  const parsed = parseJudgeRequest(await c.req.json().catch(() => null));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const token = sessionToken(c, RUNS_COOKIE, "/api/runs", SESSION_IDLE_MS / 1000);
  const key = trickKey(token);
  const ip = clientIp(c);
  const fast = tooFast(c, key, ip);
  if (fast) return fast;
  const aiState: AiState = !JUDGE_AI || paused() ? "off" : parsed.value.mode === "ai" ? (JUDGE_CAPS.take(key, ip) ? "on" : "capped") : "on";
  if (parsed.value.mode === "rule" || aiState !== "on") {
    const hit = JUDGE_RULE_CAPS.takeOrWhy(key, ip);
    if (hit) return c.json({ error: "Today's counted tries from here are used up. Nothing was placed.", cap: hit }, 429);
  }
  const reader = aiState === "on" && parsed.value.mode === "ai" && JUDGE_READER && JUDGE_CAPS.global.take("all") ? JUDGE_READER : null;
  try {
    const now = Date.now();
    const shopper = SHOPPERS.for(shopperKey(token), now);
    const r = await trickGoose({
      shopper, req: parsed.value, hash: sha256, now: () => Date.now(), seed: randomBytes(4).readUInt32BE(0), runId: `${TRICK_RUN}${randomBytes(6).toString("hex")}`,
      ai: JUDGE_AI, reader, aiState, aiName: JUDGE_AI_NAME,
    });
    // Counted exactly as the judge box's rounds are, from the whole round's rows, which are then dropped.
    const tally = countTry(r.round, parsed.value, { ip, browser: key }, "person");
    return c.json({ ...r.card, verdict: { seq: r.verdict.seq, why: r.verdict.why, verdict: r.verdict.verdict ?? null }, rows: r.rows.length, ...tally, attempt: answerOf(r.round, parsed.value.note, parsed.value.price), ...trickStatus(key, ip) });
  } catch (e) {
    console.error(`trick round failed: ${(e as Error).message}`);
    return c.json({ error: "Goose couldn't judge that just now. Nothing was placed." }, 500);
  }
});

/**
 * "Send in a scammer AI" (Joshua's Tier 2a): one model call, on its own caps inside the same day's LIVE_AI_CAP, and takes
 * nothing from the visitor: the request's body is never read, so no person's words can reach the model or the kept notes.
 * The model's words go through the visitor's own parser and the same round, in plain-rule mode, so it is the one model call.
 * A decline, a cap or an outage replays a note it wrote earlier: labeled, and neither N nor X moves.
 */
// Off by default, and Joshua alone turns it on in Render (Nov 4, §2f). Measured with `scripts/scammer-measure.ts`. Off, the route
// is not there, no model call can be spent, and the Challenge's status doesn't mention it, so the page draws nothing.
const SCAMMER_ON = process.env.SCAMMER_AI === "on";
const SCAMMER: ScammerPort | null = SCAMMER_ON && API_KEY ? new ClaudeScammer(API_KEY, readFileSync(join(here, "..", "prompts", "scammer.md"), "utf8")) : null;
const SCAMMER_CAPS = new LiveCaps({ perToken: 10, perIp: 20, global: JUDGE_CAPS.global }, () => Date.now());
const SCAMMER_TIMEOUT_MS = envInt("SCAMMER_TIMEOUT_MS", 8000);
const SCAM_NOTES = new ScamNotes(attemptStore("scammer1:"), SCAMMER_ON ? parseStoredScamNotes(JSON.parse(readFileSync(join(here, "..", "prompts", "scam-replays.json"), "utf8"))) : []);
app.post("/api/runs/scammer", tryBody, async (c) => {
  if (!SCAMMER_ON) return c.notFound();
  const refused = ownPage(c);
  if (refused) return refused;
  const token = sessionToken(c, RUNS_COOKIE, "/api/runs", SESSION_IDLE_MS / 1000);
  const key = trickKey(token);
  const ip = clientIp(c);
  const fast = tooFast(c, key, ip);
  if (fast) return fast;
  const want = demoWant();
  const { brief, type: asked, price: askedPrice } = scamBrief(want.item, want.maxPrice, randomInt);
  let fresh: string | null = null;
  let replay: ScamReplay | null = null;
  const spent = !SCAMMER || paused() ? null : SCAMMER_CAPS.takeOrWhy(key, ip);
  if (!SCAMMER || paused()) replay = "off";
  else if (spent) replay = spent;
  else {
    try {
      const wrote = await SCAMMER.write(brief, AbortSignal.timeout(SCAMMER_TIMEOUT_MS));
      fresh = cleanScamNote(wrote);
      if (!fresh) {
        replay = "declined";
        console.log(`scammer AI declined: ${wrote.trim() ? "in words" : "stop or empty"}`); // the kind only, never the words. The prompt tells the model this is logged, so it has to be.
      }
    } catch (e) {
      console.error(`scammer AI failed: ${(e as Error).name}`); // the kind only (Lesson 15)
      replay = "off";
    }
  }
  const earlier = fresh ? null : SCAM_NOTES.any(randomInt);
  const note = fresh ?? earlier?.note;
  const type = earlier?.type ?? asked;
  const price = earlier?.price ?? askedPrice;
  if (note === undefined) return c.json({ unavailable: true, replay, ...trickStatus(key, ip) });
  // A replay costs no model call, so the plain rule's count bounds it, as it bounds a visitor's plain round.
  if (!fresh) {
    const hit = JUDGE_RULE_CAPS.takeOrWhy(key, ip);
    if (hit) return c.json({ error: SCAM_REPLAY_CAPPED[hit], cap: hit }, 429);
  }
  const parsed = parseJudgeRequest({ note, price: fromCents(price), mode: "rule" });
  if (!parsed.ok) return c.json({ unavailable: true, ...trickStatus(key, ip) });
  try {
    const shopper = SHOPPERS.for(shopperKey(token), Date.now());
    const r = await trickGoose({
      shopper, req: parsed.value, hash: sha256, now: () => Date.now(), seed: randomBytes(4).readUInt32BE(0), runId: `${TRICK_RUN}${randomBytes(6).toString("hex")}`,
      writer: "scammer-ai", ai: null, reader: null, aiState: "off", aiName: JUDGE_AI_NAME,
    });
    const attempt = answerOf(r.round, note, price, type);
    const tally = fresh ? countTry(r.round, parsed.value, { ip, browser: key }, "scammer-ai", type) : { counted: false, countFull: false };
    if (fresh) SCAM_NOTES.add({ at: Math.floor(Date.now() / 60_000) * 60_000, note, verdict: attempt.verdict, rule: attempt.rule, type, price }); // the brief's type: what a later replay says it tried. The board's stays `kindOf`.
    return c.json({ ...r.card, verdict: { seq: r.verdict.seq, why: r.verdict.why, verdict: r.verdict.verdict ?? null }, rows: r.rows.length, note, price: fromCents(price), replay, tried: type, ...tally, attempt, ...trickStatus(key, ip) });
  } catch (e) {
    console.error(`scammer round failed: ${(e as Error).message}`);
    return c.json({ error: "Goose couldn't judge that just now. Nothing was placed." }, 500);
  }
});

// The scammer AI's misses, for Q: every note here was written to be a trick and the Watcher didn't set it aside, so each one
// becomes a Watcher test. The AI's words only, the same a replay shows anyone, so it needs no login. JSON, never rendered.
app.get("/api/challenge/review", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({ about: SCAM_REVIEW_ABOUT, notes: SCAM_NOTES.cleared(500), kept: SCAM_NOTES.size });
});

// The Challenge's public record, for the counter's probe and Track T's threat board: the fold and the rows, newest first.
// Closed-list fields per row and no cookie, so there is nothing in it about anyone. No cache: the count is live.
app.get("/api/challenge", (c) => {
  c.header("Cache-Control", "no-store");
  const counts = ATTEMPTS.counts();
  return c.json({ counts, attempts: ATTEMPTS.newest(ATTEMPTS_SERVED), cut: counts !== null && counts.tried > ATTEMPTS_SERVED, words: counts && challengeWords(counts, counts.byAi > 0) } satisfies ChallengeBoard);
});

// Ask Goose (A1): the shopper's words → chips. One Haiku call when the key is set and the caps allow, else the labeled
// keyword rule; F4 checks every chip either way. Its live calls count against LIVE_AI_CAP together with the judge box
// (one shared day count), 10 per browser and 20 per IP a day, as the judge box. The words are never kept: not in a
// ledger, a log or a file; only the chips go into this browser's session (in memory, F4's `setChips`) and the reply.
// Under /api/runs so the runs cookie, which keys the session, is sent.
const ASK_AI: AskPort | null = API_KEY ? new ClaudeAsker(API_KEY, readFileSync(join(here, "..", "prompts", "ask.md"), "utf8")) : null;
const ASK_CAPS = new LiveCaps({ perToken: 10, perIp: 20, global: JUDGE_CAPS.global }, () => Date.now());
// W49g (Fable): every ask the rule reads (no key, or past a live cap) makes or touches a session, so it has its own per
// browser, per network and per day count, taken before any session exists, as the judge box's rule rounds. Without it a
// cookieless flood minted a session per request and pushed real browsers' chips out past SESSIONS_KEPT.
const ASK_RULE_CAPS = new LiveCaps(
  { perToken: envInt("ASK_RULE_PER_BROWSER", 30), perIp: envInt("ASK_RULE_PER_IP", 100), global: envInt("ASK_RULE_DAY_CAP", 2000) },
  () => Date.now(), capStore("caps-ask-rule"),
);

app.post("/api/runs/ask", async (c) => {
  const refused = ownPage(c);
  if (refused) return refused;
  const parsed = parseAsk(await c.req.json().catch(() => null));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const token = sessionToken(c, RUNS_COOKIE, "/api/runs", SESSION_IDLE_MS / 1000);
  try {
    // What "it" names in "I really want it": the item this browser's chips named before this Ask replaces them.
    const last = SHOPPERS.peek(shopperKey(token), Date.now())?.chips ?? [];
    // The caps are taken inside, before any session is made; past the rule caps it's a 429 and the page reads the words itself.
    const reply = await askRequest(SHOPPERS, shopperKey(token), clientIp(c), Date.now(), parsed.words, {
      port: paused() ? null : ASK_AI, aiName: JUDGE_AI_NAME, live: ASK_CAPS, rule: ASK_RULE_CAPS,
      // The fixed kind only: never the words, never the provider's text (Lesson 15).
      onFail: (why) => console.warn(`ask: the AI call fell back to the rule (${why})`),
    });
    if (reply.status !== 200) return c.json(reply.body, reply.status);
    const want = saveFromAsk(shopperKey(token), parsed.words, reply.body.chips, last);
    return c.json(want ? { ...reply.body, want } : reply.body, 200);
  } catch (e) {
    console.error(`ask failed: ${(e as Error).name}`);
    return c.json({ error: "Goose couldn't read that just now. Nothing changed." }, 500);
  }
});

// Ask for a view (Track AS, 044 §4): the AG Studio dashboard's ask box. Each turn of the browser agent's conversation
// comes here; `server/src/view.ts` allow-lists the eight view tools, asks Claude (the fixed prompt in prompts/view.md
// names seller text as data) or, with no key or a paused store, a fixed rule labelled "no AI call", and drops any call
// to anything else. It holds no payment port, guard, policy or ledger (a test greps its imports): it can only build
// views. The model is told only what the server says: prompts/view.md is the whole system prompt and prompts/view-tools.json
// describes each tool; a request's own instructions and system, developer or assistant messages are refused with a 400,
// and its tool schemas dropped (security review of 47ff6e7; Round 2 red team).
// Live turns: per browser and per network, the view's own day share (saved, VIEW_DAY_CAP), and one take from the
// LIVE_AI_CAP day count the judge box and Ask share (saved as caps-judge), so a restart resets neither. The rule has its own.
// The route sits outside /api/runs on purpose: no session cookie reaches it, so it can neither read nor mint a session.
// Its own cookie (`gg_view`, Path=/api/view, HttpOnly, SameSite=Lax; Round 2 fix 3) is a random token and nothing else:
// it keys the per-browser cap so a judging room on one Wi-Fi doesn't share one day's turns; the network cap still holds.
// Round 3 (O2, O3): only a token this server signed counts (HMAC-SHA256 under VIEW_TOKEN_SECRET, at least 32 characters;
// unset or shorter, a key made at boot, so tokens then last until the next restart and a browser is simply handed a new
// one). Any other value is no token: the request gets a fresh signed one and is counted on it from its first ask. The
// per-network cap (VIEW_PER_IP, 70) sits below the view's day share (VIEW_DAY_CAP, 100), so one address can't take the day.
const VIEW_TOKEN_KEY = (process.env.VIEW_TOKEN_SECRET ?? "").length >= 32 ? process.env.VIEW_TOKEN_SECRET! : randomBytes(32);
if (process.env.VIEW_TOKEN_SECRET && process.env.VIEW_TOKEN_SECRET.length < 32) console.warn("view: VIEW_TOKEN_SECRET is under 32 characters, so a key made at boot signs the view tokens instead");
const VIEW_TOKENS: ViewTokenKit = {
  id: () => randomBytes(16).toString("hex"),
  sign: (id) => createHmac("sha256", VIEW_TOKEN_KEY).update(`${VIEW_COOKIE}:${id}`).digest("base64url"),
  same: timingSafeEq,
  hash: sha256,
};
const VIEW_AI: ViewLlm = API_KEY ? new ClaudeViewer(API_KEY, readFileSync(join(here, "..", "prompts", "view.md"), "utf8"), viewToolTable(JSON.parse(readFileSync(join(here, "..", "prompts", "view-tools.json"), "utf8")))) : ruleViewer;
const VIEW_CAPS = sharedLiveGate(new LiveCaps({ perToken: envInt("VIEW_PER_BROWSER", 60), perIp: envInt("VIEW_PER_IP", 70), global: envInt("VIEW_DAY_CAP", 100) }, () => Date.now(), capStore("caps-view")), JUDGE_CAPS.global);
const VIEW_RULE_CAPS = new LiveCaps({ perToken: envInt("VIEW_RULE_PER_BROWSER", 300), perIp: envInt("VIEW_RULE_PER_IP", 600), global: envInt("VIEW_RULE_DAY_CAP", 5000) }, () => Date.now(), capStore("caps-view-rule"));
app.post("/api/view", bodyLimit({ maxSize: VIEW_MAX_BYTES, onError: (c) => c.json({ error: "That conversation is too long. Start a new one." }, 413) }), viewHandler({
  llm: () => (paused() ? ruleViewer : VIEW_AI),
  live: VIEW_CAPS, rule: VIEW_RULE_CAPS,
  who: (c) => {
    const k = viewKey(getCookie(c, VIEW_COOKIE), clientIp(c), VIEW_TOKENS);
    if (k.mint) setCookie(c, VIEW_COOKIE, k.mint, { path: "/api/view", httpOnly: true, sameSite: "Lax", maxAge: VIEW_COOKIE_MAX_AGE_S, secure: PUBLIC_URL.startsWith("https://") });
    return { token: k.token, ip: k.ip };
  },
  ownPage,
  hash: sha256,
  onFail: (why) => console.warn(`view: ${why === "dropped" ? "a call to a tool outside the view list was dropped" : `the AI call fell back to the rule (${why})`}`),
}));

// Ask for anything (Desk slice 1): words outside the catalog → a fictional market. One Haiku call on the Ask's live caps
// (the same per-browser, per-network and day counts), cached by the words, so the same words cost no second call and
// spend no cap. Code checks every field (`parseMarket`), refuses real brands and plants one scam seller; any failure is
// the one rewording line. The words are never kept beyond the cache key's market; the market itself holds no shopper data.
// A practice server with no key (PAYMENT=fake) uses the fixed sellers, which name themselves "no AI call", so the Desk
// can be tried and screenshotted locally; a real server with no key still says the one rewording line.
const MARKET_AI: MarketMakerPort | null = API_KEY ? new ClaudeMarketMaker(API_KEY, readFileSync(join(here, "..", "prompts", "market.md"), "utf8")) : FAKE_PAYMENT ? fixedMarketMaker : null;
const MARKETS = new MarketCache();

/**
 * Round 0 (Q: data #1, reliability #11): every Desk ask that answers with a market (a chip's recorded week, a cached
 * market or a new one) opens this browser's session and writes the market's read into it: each seller's ask and the
 * Watcher's row for each seller it holds or sets aside (`marketReadRows`, Track J's rows), so Behind the scenes shows
 * what the Desk just showed before any Approve. Its own "market" run: the shopper's record, so the header strip counts
 * the sellers checked and skipped, but no money (no guard row, no cart, no order) and never toward the dial
 * (COUNTS_TOWARD_RECORD.market). Once per market per session: the same words asked again write nothing, and that
 * market's cart then leaves the read out of its own run (`MARKET_READS`), so no seller is counted twice. A browser with
 * no session yet takes the Ask's rule caps first, unless this ask already took a live cap (W49g): a cookieless flood
 * can't mint sessions; past them the market still answers, with no rows.
 */
const MARKET_READS = new WeakMap<ShopperLedger, Set<string>>();
function readIntoSession(c: Context, m: NonNullable<ReturnType<MarketCache["get"]>>, liveToken: string | null): void {
  // The live cap's token when this ask took one (its cookie is already set), so one ask never sets two cookies.
  const token = liveToken ?? sessionToken(c, RUNS_COOKIE, "/api/runs", SESSION_IDLE_MS / 1000);
  const key = shopperKey(token);
  const now = Date.now();
  if (liveToken === null && !SHOPPERS.peek(key, now) && ASK_RULE_CAPS.takeOrWhy(key, clientIp(c))) return;
  const shopper = SHOPPERS.session(key, now).shopper;
  const read = MARKET_READS.get(shopper) ?? new Set<string>();
  if (read.has(m.id)) return;
  const ledger = shopper.run(randomBytes(6).toString("hex"), "market");
  for (const e of marketReadRows(now, DEMO_SHOPPER, m.listings)) ledger.append(e);
  read.add(m.id);
  MARKET_READS.set(shopper, read);
}

// "Here's what I understood." (Desk-A, Joshua Oct 30): the card before Goose shops. Fixed tables read the words, no model
// and no cap (as the recorded week); the limit is this browser's own, peeked, so no session is made. Nothing is kept.
/** A category as a card names it: "Other", "Kitchen". */
const placeName = (c: string): string => c.charAt(0).toUpperCase() + c.slice(1);
app.post("/api/runs/market/understand", async (c) => {
  const refused = ownPage(c);
  if (refused) return refused;
  const body = (await c.req.json().catch(() => null)) as { words?: unknown } | null;
  const words = marketWords(body?.words);
  if (words.length < 2) return c.json({ error: "type what Goose should find" }, 400);
  // Words that name nothing to buy end here, in code: no card, no market, no model call, no deal.
  const notAsk = notAnAsk(words);
  if (notAsk) return c.json({ error: notAsk });
  const have = getCookie(c, RUNS_COOKIE);
  const policy = (have ? SHOPPERS.peek(shopperKey(have), Date.now())?.policy : undefined) ?? demoPolicy();
  return c.json({ kind: "understood", ...understand(words, policy) });
});

app.post("/api/runs/market/ask", async (c) => {
  const refused = ownPage(c);
  if (refused) return refused;
  const body = (await c.req.json().catch(() => null)) as { words?: unknown } | null;
  const words = marketWords(body?.words);
  // The same gate as the card's, before any cap is spent or model called: this route is reachable without the card.
  const notAsk = notAnAsk(words);
  if (words.length >= 2 && notAsk) return c.json({ kind: "failed", reason: notAsk });
  const have = getCookie(c, RUNS_COOKIE);
  const session = have ? SHOPPERS.peek(shopperKey(have), Date.now()) : undefined;
  const policy = session?.policy ?? demoPolicy();
  // Goose's Read on the deal: this browser's own wants and total, no session made here.
  const dealSays = (results: Parameters<typeof dealRead>[0], recorded?: { catalogId: string; day: number }) =>
    dealRead(results, { ...(recorded ? { recorded } : {}), wants: session?.wants ?? [], catalog: CATALOG, policy, leftCents: session ? totalLeft(session.shopper.read(), policy.shopperId) : null, now: Date.now() });
  // Track H-3: the cap her own words said, read by code's fixed patterns (as the understood card did), never the AI's
  // market or a seller's words. Sellers over the lower of it and the limit are marked set aside; it never raises anything.
  const cap = spokenCap(words)?.cents ?? null;
  // Desk-A (Joshua, Oct 30, the deal card): words that name a recorded item run its recorded week, no AI call and no
  // cap, so the card's earlier price is the record's. Kept with the made-up markets, so the cart finds it the same way.
  const rec = words.length >= 2 ? recordedMarket(words) : null;
  if (rec) {
    MARKETS.put(rec.market);
    const m = rec.market;
    readIntoSession(c, m, null);
    const place = marketCategory(m.words, [], policy);
    const { results, readerSays } = await deskRead(m, heldResults(marketResults(m), place, cap), clientIp(c));
    return c.json({ kind: "market", marketId: m.id, item: m.item, claim: m.claim, plantedSays: m.plantedSays, madeBy: m.madeBy, readerSays, cached: false, limitWhy: place.why, cap: cap ? fromCents(cap) : null, capSays: cap ? capHoldsLine(cap, place.limit, placeName(place.category)) : null, heldBy: heldWords(cap, place.limit, placeName(place.category)), results, read: dealSays(results, rec.peer ? undefined : rec), ...(rec.peer ? {} : { recorded: { catalogId: rec.catalogId, day: rec.day, unit: rec.unit, was: rec.was } }) });
  }
  let port: MarketMakerPort | null = null;
  let liveToken: string | null = null;
  // A market already made for these words costs nothing: no cap, no call. Otherwise the call takes the Ask's live caps.
  if (words.length >= 2 && !MARKETS.get(marketKey(words)) && MARKET_AI && !paused()) {
    const token = sessionToken(c, RUNS_COOKIE, "/api/runs", SESSION_IDLE_MS / 1000);
    const spent = ASK_CAPS.takeOrWhy(shopperKey(token), clientIp(c));
    if (spent) return c.json({ kind: "failed", reason: MARKET_CAPPED, cap: `ask-${spent}` }, 429);
    port = MARKET_AI;
    liveToken = token;
  }
  try {
    const r = await makeFictionalMarket({
      words, port, cache: MARKETS, signal: AbortSignal.timeout(MARKET_TIMEOUT_MS),
      // The fixed kind only: never the words, never the provider's text (Lesson 15).
      onFail: (why) => console.warn(`market: no made-up market (${why})`),
    });
    if (r.kind === "failed") return c.json({ kind: "failed", reason: r.reason }, 200);
    const m = r.market;
    // Desk-L: which limit this market's carts are held to and why, under this browser's own limits (no session made here).
    const place = marketCategory(m.words, [], policy);
    readIntoSession(c, m, liveToken);
    const { results, readerSays } = await deskRead(m, heldResults(marketResults(m), place, cap), clientIp(c));
    return c.json({ kind: "market", marketId: m.id, item: m.item, claim: m.claim, plantedSays: m.plantedSays, madeBy: m.madeBy, readerSays, cached: r.cached, limitWhy: place.why, cap: cap ? fromCents(cap) : null, capSays: cap ? capHoldsLine(cap, place.limit, placeName(place.category)) : null, heldBy: heldWords(cap, place.limit, placeName(place.category)), results, read: dealSays(results) });
  } catch (e) {
    console.error(`market failed: ${(e as Error).name}`);
    return c.json({ kind: "failed", reason: MARKET_FAILED }, 500);
  }
});

// Snap a photo (item 12): one vision call on the Ask caps, the same F4 check as words. The photo is read once, in
// memory, and never written anywhere: not a file, a log line, a tape or the ledger. Only the checked chips go into this
// browser's session, as an Ask's do. With no key or past a cap, it says why (no rule reads an image) and makes no session.
const PHOTO_AI: PhotoPort | null = API_KEY ? new ClaudeLooker(API_KEY, readFileSync(join(here, "..", "prompts", "photo.md"), "utf8")) : null;
app.post("/api/runs/photo", bodyLimit({ maxSize: MAX_PHOTO_CHARS + 1000, onError: (c) => c.json({ error: "That photo is too large." }, 413) }), async (c) => {
  const refused = ownPage(c);
  if (refused) return refused;
  const parsed = parsePhoto(await c.req.json().catch(() => null));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const token = sessionToken(c, RUNS_COOKIE, "/api/runs", SESSION_IDLE_MS / 1000);
  try {
    const r = await photoToChips(parsed.photo, {
      // The Ask's live caps are taken inside, before the call, so every vision call counts.
      // Paused (the store unreachable): no vision call spends without saved caps, as Ask. Keyed as Ask is (`shopperKey`), so
      // the photo and Ask share one per-browser budget, and its chips land in the browser's own session.
      catalog: CATALOG, port: paused() ? null : PHOTO_AI, live: ASK_CAPS, who: { token: shopperKey(token), ip: clientIp(c) }, aiName: JUDGE_AI_NAME,
      onFail: (why) => console.warn(`photo: the AI call didn't read it (${why})`),
    });
    if (r.kind === "read" && r.miss === null) SHOPPERS.setChips(shopperKey(token), r.chips, Date.now());
    return c.json(r);
  } catch (e) {
    console.error(`photo failed: ${(e as Error).name}`);
    return c.json({ error: "Goose couldn't read that photo just now. Nothing changed." }, 500);
  }
});

// The wants list's routes (helpers beside SHOPPERS): under /api/runs so the session cookie reaches them.
// Your price on real products (Joshua, Nov 5, 3b): a watch's price is read on her visit, at most once a day a watch and
// PRODUCT_READS_PER_DAY a day across the whole site, the count taken here on the server (Lead-12). Only a GET of the one
// product, never a search. Off unless CHANNEL3_WATCH=on, which the site doesn't set until Joshua says (then rows say
// "not checked yet"). The read fills the Watching list only: it never joins a market, the Watcher, the guard or a cart.
const PRODUCTS = new ProductReads({
  key: watchOn(process.env) ? process.env.CHANNEL3_API_KEY || undefined : undefined,
  fetch: (url, init) => fetch(url, init),
  now: () => Date.now(),
  // The site's count keeps its store name, so a restart mid-day doesn't hand out a fresh twenty.
  caps: new LiveCaps({ perToken: BROWSER_READS_PER_DAY, perIp: IP_READS_PER_DAY, global: PRODUCT_READS_PER_DAY }, () => Date.now(), capStore("caps-product-reads")),
  warn: (line) => console.warn(line),
});

app.get("/api/runs/wants", async (c) => {
  // Read without making a session: no cookie (or one the server never saw) is an empty list, and no cookie is set.
  const have = getCookie(c, RUNS_COOKIE);
  const key = have && /^[0-9a-f]{32}$/.test(have) ? shopperKey(have) : null;
  const now = Date.now();
  const session = key ? SHOPPERS.peek(key, now) : undefined;
  // Only watches a day past their last read are read, one at a time. Parallel visits can't spend twice: PRODUCTS joins a
  // read in flight and remembers today's, and holds this browser to five a day and its address to ten, inside the site's
  // twenty: a cookie is the page's to mint, so the address caps what new cookies can spend.
  const who = { token: key ?? "", ip: clientIp(c) };
  for (const w of session?.real.filter((r) => !r.last || now - r.last.checkedAt >= WATCH_DAY_MS) ?? []) {
    const read = await PRODUCTS.refresh(w, who);
    if (read !== w) SHOPPERS.keepRead(key!, read, Date.now());
  }
  return c.json(wantsBody(key ? SHOPPERS.peek(key, Date.now()) : undefined));
});

app.post("/api/runs/wants", async (c) => {
  const refused = ownPage(c);
  if (refused) return refused;
  const body = await c.req.json().catch(() => null) as unknown;
  const token = sessionToken(c, RUNS_COOKIE, "/api/runs", SESSION_IDLE_MS / 1000);
  const hit = WANT_CAPS.takeOrWhy(token, clientIp(c));
  if (hit) return c.json({ error: "Today's want changes from here are used up. Nothing changed.", cap: hit }, 429);
  const key = shopperKey(token);
  const r = SHOPPERS.setWant(key, body, Date.now());
  if (!r.ok) return c.json({ error: r.error, ...wantsBody(SHOPPERS.peek(key, Date.now())) }, 400);
  pushLater(key, r.want.catalogId);
  return c.json(wantsBody(SHOPPERS.session(key, Date.now())));
});

// The ping with the tab closed (Joshua, Nov 5 6:40 PM, Level 2; server/src/push.ts). Off unless PING_PUSH=on with its
// three VAPID keys: then every route here answers 404 and the page shows no button. The push carries nothing: the woken
// page reads her ping from /api/runs/push/words with her own cookie. Only her browser's push address is kept, in memory.
const PUSH_ENV = { PING_PUSH: process.env.PING_PUSH, VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: process.env.VAPID_SUBJECT };
const PUSH_KEY = pushOn(PUSH_ENV) ? vapidKey(PUSH_ENV.VAPID_PUBLIC_KEY!, PUSH_ENV.VAPID_PRIVATE_KEY!) : null;
const PUSHES = new PushAddresses(() => Date.now(), (k) => SHOPPERS.inMemory(k, Date.now()));
/** About the replay's five simulated days, so the closed-tab ping lands when the open tab's would. */
const PUSH_DELAY_MS = 5000;
/** Queues one empty push for this want's ping; true only when one is really on its way (her ping exists and this hour has room). */
function pushLater(key: string, catalogId: string): boolean {
  const session = SHOPPERS.peek(key, Date.now());
  if (!PUSH_KEY || !session || !pingsFor(session.wants, CATALOG, session.policy)[catalogId] || !PUSHES.take(key, catalogId)) return false;
  setTimeout(() => {
    const k = PUSHES.at(key);
    if (!k) return;
    void sendPush(k.endpoint, vapidAuth(k.endpoint, PUSH_ENV.VAPID_PUBLIC_KEY!, PUSH_KEY, PUSH_ENV.VAPID_SUBJECT!, Date.now())).then((sent) => { if (sent === "gone") PUSHES.forget(key); });
  }, PUSH_DELAY_MS).unref();
  return true;
}
const pushKeyOf = (c: Context) => { const have = getCookie(c, RUNS_COOKIE); return have && /^[0-9a-f]{32}$/.test(have) ? shopperKey(have) : null; };

app.get("/api/runs/push", (c) => {
  if (!PUSH_KEY) return c.json({ error: "off" }, 404);
  const key = pushKeyOf(c);
  return c.json({ key: PUSH_ENV.VAPID_PUBLIC_KEY, kept: key ? PUSHES.has(key) : false });
});
app.post("/api/runs/push", async (c) => {
  if (!PUSH_KEY) return c.json({ error: "off" }, 404);
  const refused = ownPage(c);
  if (refused) return refused;
  const body = await c.req.json().catch(() => null) as { endpoint?: unknown } | null;
  // Only for a session that already watches something, and inside the want changes' own caps (this browser and its
  // address), so fresh cookies can't churn the store (security review, Nov 5).
  const key = pushKeyOf(c);
  const session = key ? SHOPPERS.peek(key, Date.now()) : undefined;
  if (!key || !session || session.wants.length === 0) return c.json({ error: "Set your price on something first, so there's a ping to send." }, 400);
  const hit = WANT_CAPS.takeOrWhy(getCookie(c, RUNS_COOKIE)!, clientIp(c));
  if (hit) return c.json({ error: "Today's want changes from here are used up. Nothing changed.", cap: hit }, 429);
  if (PUSHES.keep(key, body?.endpoint) !== "kept") return c.json({ error: "That isn't a browser's push address, so nothing was kept." }, 400);
  // The first ping goes now, so a judge can close the tab and still get it: her first want that has one.
  const first = Object.keys(pingsFor(session.wants, CATALOG, session.policy))[0];
  // `ping`: a push is really on its way, so the page may promise one (the DD: PUSH_SENT or PUSH_SENT_NONE).
  return c.json({ kept: true, ping: first !== undefined && pushLater(key, first) });
});
app.post("/api/runs/push/remove", (c) => {
  if (!PUSH_KEY) return c.json({ error: "off" }, 404);
  const refused = ownPage(c);
  if (refused) return refused;
  const key = pushKeyOf(c);
  if (key) PUSHES.forget(key);
  return c.json({ kept: false });
});
// The woken page's words: her own ping, by her own cookie, once per push; anything else is the plain line, which names no price.
app.get("/api/runs/push/words", (c) => {
  if (!PUSH_KEY) return c.json({ error: "off" }, 404);
  const key = pushKeyOf(c);
  const due = key ? PUSHES.due(key) : null;
  const session = key ? SHOPPERS.peek(key, Date.now()) : undefined;
  const p = due && session ? pingsFor(session.wants, CATALOG, session.policy)[due] : undefined;
  return c.json(p ? { title: p.title, body: p.body, tag: due } : { title: PUSH_PLAIN_TITLE, body: PUSH_PLAIN, tag: "goose" });
});

// The Christmas list's total (Joshua, Nov 3, 4d; core/src/view/list.ts): the shopper's tap, one of the fixed picks or null to
// take it off. The guard reads it from this session's rows at decide and at capture (trust `listTotal`). Same page, cap and
// session as the wants; `demo` also fills the list with the demo's gifts, each checked like any want.
app.post("/api/runs/list", async (c) => {
  const refused = ownPage(c);
  if (refused) return refused;
  const body = await c.req.json().catch(() => null) as { total?: unknown; demo?: unknown } | null;
  const total = body?.demo === true ? DEMO_TOTAL : body?.total;
  if (total !== null && !isTotalChoice(total)) return c.json({ error: TOTAL_NOT_A_CHOICE }, 400);
  const token = sessionToken(c, RUNS_COOKIE, "/api/runs", SESSION_IDLE_MS / 1000);
  const hit = WANT_CAPS.takeOrWhy(token, clientIp(c));
  if (hit) return c.json({ error: "Today's want changes from here are used up. Nothing changed.", cap: hit }, 429);
  const key = shopperKey(token);
  const now = Date.now();
  if (body?.demo === true) for (const g of DEMO_GIFTS) SHOPPERS.setWant(key, { ...g, neededBy: nextDec20(now) }, now);
  SHOPPERS.setListTotal(key, total, now);
  return c.json(wantsBody(SHOPPERS.session(key, now)));
});

// The year view's plan, read only when the list's own chunk asks for it; no session is made here.
app.get("/api/runs/list/year", (c) => {
  const have = getCookie(c, RUNS_COOKIE);
  const session = have && /^[0-9a-f]{32}$/.test(have) ? SHOPPERS.peek(shopperKey(have), Date.now()) : undefined;
  return c.json(wantsYear(session?.wants ?? [], session?.shopper.read() ?? [], session?.policy ?? demoPolicy(), CATALOG, Date.now()));
});

// Settings: your limits (§15B reachable). The shopper's tap sets a category's limit for this browser's session only
// (`DemoShoppers.setLimit`; a lowered limit brings wants down to it, a raise lifts none). The demo's own kitchen limit
// doesn't change here. Same page, cap and session as the wants.
app.post("/api/runs/limit", async (c) => {
  const refused = ownPage(c);
  if (refused) return refused;
  const body = await c.req.json().catch(() => null) as { category?: unknown; limit?: unknown } | null;
  const token = sessionToken(c, RUNS_COOKIE, "/api/runs", SESSION_IDLE_MS / 1000);
  const hit = WANT_CAPS.takeOrWhy(token, clientIp(c));
  if (hit) return c.json({ error: "Today's want changes from here are used up. Nothing changed.", cap: hit }, 429);
  const key = shopperKey(token);
  // Checked before any session is made (W49g: a refused body makes none), against this browser's Policy if it has one.
  const why = limitRefused(SHOPPERS.peek(key, Date.now())?.policy ?? demoPolicy(), CATALOG, body?.category, body?.limit);
  if (why) return c.json({ error: why, ...wantsBody(SHOPPERS.peek(key, Date.now())) }, 400);
  SHOPPERS.setLimit(key, body!.category as string, body!.limit as number, Date.now());
  return c.json(wantsBody(SHOPPERS.session(key, Date.now())));
});

// Settings: the dial (QUEUE M3 "dial proper"), this browser's tap for one catalog category. On only at the strong record
// this session's own rows show (409 and nothing changes under it); off in one tap, the record kept. "On" never spends: the
// guard binds the exact cart and only the shopper's tap in PayPal pays. Same page, cap and session as the wants.
app.post("/api/runs/dial", async (c) => {
  const refused = ownPage(c);
  if (refused) return refused;
  const body = await c.req.json().catch(() => null) as { category?: unknown; on?: unknown } | null;
  const category = body?.category, on = body?.on;
  if (typeof category !== "string" || typeof on !== "boolean" || !limitRows(demoPolicy(), CATALOG).some((r) => r.category === category)) {
    return c.json({ error: "The dial is on or off for one catalog category. Nothing changed." }, 400);
  }
  const token = sessionToken(c, RUNS_COOKIE, "/api/runs", SESSION_IDLE_MS / 1000);
  const hit = WANT_CAPS.takeOrWhy(token, clientIp(c));
  if (hit) return c.json({ error: "Today's want changes from here are used up. Nothing changed.", cap: hit }, 429);
  const key = shopperKey(token);
  // Checked before any session is made (W49g): a browser with no session has no clean carts, so it can't turn one on.
  const peek = SHOPPERS.peek(key, Date.now());
  const row = dialRows(peek ? peek.shopper.read() : [], peek?.policy ?? demoPolicy(), CATALOG).find((r) => r.category === category)!;
  if (on && !row.on && !row.canTurnOn) return c.json({ error: `Goose has ${row.clean} of ${row.needed} clean ${category} carts, so it still asks you first. Nothing changed.`, ...wantsBody(peek) }, 409);
  if (row.on === on) return c.json(wantsBody(peek));
  SHOPPERS.setDial(key, category, on, Date.now());
  return c.json(wantsBody(SHOPPERS.session(key, Date.now())));
});

// Settings: "Show me tradeoffs" (§17), this browser's switch for the one honest line beside a cart. A boolean only: it
// changes no limit, want or buy. Same page, cap and session as the wants.
app.post("/api/runs/tradeoffs", async (c) => {
  const refused = ownPage(c);
  if (refused) return refused;
  const on = (await c.req.json().catch(() => null) as { on?: unknown } | null)?.on;
  if (typeof on !== "boolean") return c.json({ error: "Tradeoffs are on or off. Nothing changed." }, 400);
  const token = sessionToken(c, RUNS_COOKIE, "/api/runs", SESSION_IDLE_MS / 1000);
  const hit = WANT_CAPS.takeOrWhy(token, clientIp(c));
  if (hit) return c.json({ error: "Today's want changes from here are used up. Nothing changed.", cap: hit }, 429);
  const key = shopperKey(token);
  SHOPPERS.setTradeoffs(key, on, Date.now());
  return c.json(wantsBody(SHOPPERS.session(key, Date.now())));
});

// A2: forget one thing Goose remembers by its key, or everything ("all": the seeded week's color too). A key only; it
// changes no limit, want or buy. Same page, cap and session as the wants.
app.post("/api/runs/memory/forget", async (c) => {
  const refused = ownPage(c);
  if (refused) return refused;
  const key = (await c.req.json().catch(() => null) as { key?: unknown } | null)?.key;
  if (typeof key !== "string" || !/^(?:all|seeded|[0-9a-f]{16,128})$/.test(key)) return c.json({ error: "Say what to forget. Nothing changed." }, 400);
  const token = sessionToken(c, RUNS_COOKIE, "/api/runs", SESSION_IDLE_MS / 1000);
  const hit = WANT_CAPS.takeOrWhy(token, clientIp(c));
  if (hit) return c.json({ error: "Today's want changes from here are used up. Nothing changed.", cap: hit }, 429);
  const k = shopperKey(token);
  SHOPPERS.forget(k, key, Date.now());
  return c.json(wantsBody(SHOPPERS.session(k, Date.now())));
});

// Watch a real price, by her tap on Find (Joshua, Nov 5, 3b): Channel3's id, the store, its name and her price, never her
// search words; five per browser. Same page, cap and session as the wants. Saving reads nothing: the read waits for a visit.
app.post("/api/runs/wants/real", async (c) => {
  const refused = ownPage(c);
  if (refused) return refused;
  // Off: nothing is saved and no session is made, so no row waits on a read that never comes.
  if (!watchOn(process.env)) return c.json({ error: REAL_OFF }, 400);
  const body = await c.req.json().catch(() => null) as unknown;
  const token = sessionToken(c, RUNS_COOKIE, "/api/runs", SESSION_IDLE_MS / 1000);
  const hit = WANT_CAPS.takeOrWhy(token, clientIp(c));
  if (hit) return c.json({ error: "Today's want changes from here are used up. Nothing changed.", cap: hit }, 429);
  const key = shopperKey(token);
  const r = SHOPPERS.watchReal(key, body, Date.now());
  if (!r.ok) return c.json({ error: r.error, ...wantsBody(SHOPPERS.peek(key, Date.now())) }, 400);
  return c.json(wantsBody(SHOPPERS.session(key, Date.now())));
});

app.post("/api/runs/wants/real/remove", async (c) => {
  const refused = ownPage(c);
  if (refused) return refused;
  const b = await c.req.json().catch(() => null) as { productId?: unknown; domain?: unknown } | null;
  if (typeof b?.productId !== "string" || typeof b.domain !== "string") return c.json({ error: "Say which price to stop watching." }, 400);
  const token = sessionToken(c, RUNS_COOKIE, "/api/runs", SESSION_IDLE_MS / 1000);
  const hit = WANT_CAPS.takeOrWhy(token, clientIp(c));
  if (hit) return c.json({ error: "Today's want changes from here are used up. Nothing changed.", cap: hit }, 429);
  const key = shopperKey(token);
  SHOPPERS.stopReal(key, b.productId, b.domain, Date.now());
  return c.json(wantsBody(SHOPPERS.peek(key, Date.now())));
});

app.post("/api/runs/wants/remove", async (c) => {
  const refused = ownPage(c);
  if (refused) return refused;
  const id = (await c.req.json().catch(() => null) as { catalogId?: unknown } | null)?.catalogId;
  if (typeof id !== "string") return c.json({ error: "Say which want to remove." }, 400);
  const token = sessionToken(c, RUNS_COOKIE, "/api/runs", SESSION_IDLE_MS / 1000);
  const hit = WANT_CAPS.takeOrWhy(token, clientIp(c));
  if (hit) return c.json({ error: "Today's want changes from here are used up. Nothing changed.", cap: hit }, 429);
  const key = shopperKey(token);
  SHOPPERS.removeWant(key, id, Date.now());
  return c.json(wantsBody(SHOPPERS.peek(key, Date.now())));
});

// The guard-off control (v3's right-hand card): the judge's price straight to the payment port, no guard in between.
// 3 per browser a day (011 §11 #7), plus per-IP and per-day caps so a script can't fill the sandbox; counts kept on disk.
const CONTROL_CAPS = new LiveCaps({ perToken: CONTROL_CAP, perIp: 10, global: Number(process.env.CONTROL_DAY_CAP ?? 300) }, () => Date.now(), capStore("caps-control"));
const CONTROL_COOKIE = "gg_control";
const RECORDED_CONTROL = JSON.parse(readFileSync(join(FIXTURES, "control-order.json"), "utf8")) as RecordedControl;
const controlToken = (c: Context) => sessionToken(c, CONTROL_COOKIE, "/api/control");

app.get("/api/control", (c) => c.json({ on: paypal !== null && !paused(), fake: FAKE_PAYMENT, left: paypal && !paused() ? CONTROL_CAPS.triesLeft(controlToken(c), clientIp(c)) : 0, recorded: RECORDED_CONTROL }));

app.post("/api/control", async (c) => {
  if (!(c.req.header("content-type") ?? "").startsWith("application/json")) return c.text("send JSON", 415);
  const origin = c.req.header("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return c.text("not our page", 403);
  // The same price rules as the judge box: the two cards always get the same number.
  const parsed = parseJudgeRequest({ note: "", ...(await c.req.json().catch(() => ({}))), mode: "rule" });
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const token = controlToken(c), ip = clientIp(c);
  const card = await controlOrder({
    price: parsed.value.price, port: paused() ? null : paypal, fake: FAKE_PAYMENT, take: () => CONTROL_CAPS.takeOrWhy(token, ip), left: () => CONTROL_CAPS.triesLeft(token, ip),
    recorded: RECORDED_CONTROL, hash: sha256, now: Date.now(), nonce: `control-${randomBytes(8).toString("hex")}`, returnUrl: `${PUBLIC_URL}/control-return`,
  });
  return c.json(card);
});

/**
 * The Desk's "Behind the scenes" ledger (slice 3; Joshua, Fri Oct 30): this browser's whole shopper ledger as server-sent
 * events. Every row so far, then each new one as it's written (a run's rows, a payment, a refund, PayPal's webhook), so
 * the page adds rows to its grid as transactions (`SessionRows`, core/src/view/session.ts). Only the browser whose runs
 * cookie holds the session reads it; with no session yet it says so and makes none (a read never makes one, W49g).
 * Bounded: a few streams per browser and per network address (so one client with many cookies can't fill the cap
 * across everyone), each ended after SESSION_STREAM.ms (the page reconnects and skips the rows it has, by seq), with a
 * ping so a proxy doesn't close a quiet one.
 */
const SESSION_STREAM = { perBrowser: 2, perIp: 6, all: 200, ms: 5 * 60_000, pingMs: 25_000 } as const;
/**
 * "Things to try" (the Desk's slice 5): which of the eight this browser's session has really done, folded from its own
 * ledger rows (`triedFromRows`), never from a tap on the list. Keys only. A read makes no session and sets no cookie:
 * with none, nothing is tried yet. The page keeps the union in its own storage ("N of 8 tried", local to the browser).
 */
app.get("/api/runs/session/tried", (c) => {
  const have = getCookie(c, RUNS_COOKIE);
  const session = have ? SHOPPERS.peek(shopperKey(have), Date.now()) : undefined;
  c.header("cache-control", "no-store"); // one browser's own answer: never a cache's
  return c.json({ tried: session ? triedFromRows(session.shopper.read()) : [] });
});

/**
 * The Watch shelf (the Desk's slice 6): Joshua's five cards, then this browser's other wants, each with one status line
 * from the recorded week's price watch against this session's own wants and limits (`shelfFor`), and the hero's intro
 * (the ticket market's planted scam reseller). A read makes no session and no cookie: with none, the demo's Policy and
 * no wants. Watching never buys.
 */
app.get("/api/runs/shelf", (c) => {
  const have = getCookie(c, RUNS_COOKIE);
  const session = have ? SHOPPERS.peek(shopperKey(have), Date.now()) : undefined;
  c.header("cache-control", "no-store");
  return c.json(shelfFor(session?.wants ?? [], CATALOG, session?.policy ?? demoPolicy()));
});

const sessionStreams = new Map<string, number>();
const sessionStreamsByIp = new Map<string, number>();
let sessionStreamsAll = 0;
app.get("/api/runs/session/events", (c) => {
  const have = getCookie(c, RUNS_COOKIE);
  const key = have ? shopperKey(have) : null;
  const session = key ? SHOPPERS.peek(key, Date.now()) : undefined;
  // No session yet is an ordinary state, not a missing page: 204 ends an EventSource for good without a console error
  // (a 404 logged two on every visit to Behind the scenes), and the page says "Nothing here yet" in its own words.
  if (!key || !session) return c.body(null, 204);
  const ip = clientIp(c);
  if ((sessionStreams.get(key) ?? 0) >= SESSION_STREAM.perBrowser || (sessionStreamsByIp.get(ip) ?? 0) >= SESSION_STREAM.perIp || sessionStreamsAll >= SESSION_STREAM.all) return c.json({ error: "Too many ledgers are open; close a tab and try again." }, 429);
  sessionStreams.set(key, (sessionStreams.get(key) ?? 0) + 1);
  sessionStreamsByIp.set(ip, (sessionStreamsByIp.get(ip) ?? 0) + 1);
  sessionStreamsAll++;
  const shopper = session.shopper;
  return streamSSE(c, async (stream) => {
    // One chain keeps the rows in seq order; subscribing and replaying with no await between them loses none.
    let chain = Promise.resolve();
    const push = (event: string, id: string | undefined, data: string) => { chain = chain.then(() => stream.writeSSE({ event, ...(id ? { id } : {}), data })).catch(() => {}); };
    const row = (e: LedgerEvent) => push("row", String(e.seq), JSON.stringify(e));
    let end!: () => void;
    const ended = new Promise<void>((r) => { end = r; });
    const off = shopper.on(row);
    stream.onAbort(() => end());
    for (const e of shopper.read()) row(e);
    const ping = setInterval(() => push("ping", undefined, ""), SESSION_STREAM.pingMs);
    const stop = setTimeout(end, SESSION_STREAM.ms);
    try { await ended; } finally {
      off();
      clearInterval(ping);
      clearTimeout(stop);
      await chain;
      const n = (sessionStreams.get(key) ?? 1) - 1;
      if (n > 0) sessionStreams.set(key, n); else sessionStreams.delete(key);
      const m = (sessionStreamsByIp.get(ip) ?? 1) - 1;
      if (m > 0) sessionStreamsByIp.set(ip, m); else sessionStreamsByIp.delete(ip);
      sessionStreamsAll--;
    }
  });
});

app.get("/api/runs/:id", (c) => {
  const run = runs.get(c.req.param("id"));
  if (!run) return c.json({ error: "no such run" }, 404);
  // Q's question: the return's answer lost mid-flight, or a browser that came back after another. The page reads the run from our
  // own origin, where the Strict runs cookie arrives, so here (unlike the return) the owner check is good: the owner's read of a
  // settled run writes the stop it's missing, and nobody else's does.
  if (run.week !== null && isOwner(run, c)) leaveWeekStop(c, run.owner, run.week);
  return c.json(view(run, c));
});

/** Server-sent events: everything so far, then live until the run says done. */
app.get("/api/runs/:id/events", (c) => {
  const run = runs.get(c.req.param("id"));
  if (!run) return c.json({ error: "no such run" }, 404);
  return streamSSE(c, async (stream) => {
    // The same reader's trail as GET /api/runs/:id: a non-owner's rows carry no order id (`trailFor`).
    const send = (e: LedgerEvent) => stream.writeSSE({ event: "ledger", id: String(e.seq), data: JSON.stringify(trailFor(run, c, [e])[0]) });
    const finish = async () => { await stream.writeSSE({ event: "state", data: JSON.stringify(view(run, c)) }); };
    // Subscribe before replaying, so nothing appended during the replay's awaits is lost.
    // The client dedupes by seq, so an event seen twice is harmless; one never seen is not.
    let resolveDone!: () => void;
    const done = new Promise<void>((r) => { resolveDone = r; });
    const off = run.ledger.on((e) => { void send(e).then(() => { if (e.action === "done") resolveDone(); }); });
    stream.onAbort(() => { off(); resolveDone(); });
    for (const e of run.ledger.read()) await send(e);
    if (!run.done) await done;
    off();
    await finish();
  });
});

/**
 * Back to the screen the run started from: the wallet for its Approve (Joshua's answer 1), else the run's own page. A recorded
 * week's run that came back paid, from any page, leaves this browser the paid cookie, so no page offers the cart again here;
 * it is written on the return that answered the settle, never on a cancel or a failure. Automated review of the fix: a later
 * opening of the same link (`late`) is anyone who was sent it, so it leaves no cookie: a stop handed to a stranger is "Paid"
 * to someone who never paid. Not an owner check: the runs cookie is SameSite=Strict, so PayPal's redirect never carries it.
 */
function back(c: Context, run: Run, late = false): Response {
  touch(run); // a return closes or pays the cart, sometimes with no row (no PayPal, paidAt), so the run is saved here
  // Not HttpOnly: the wallet reads it to draw "Paid" with no request. Lax, so it is sent on PayPal's redirect back.
  if (!late) leaveStops(c, run);
  if (run.settled) run.answered = true;
  // `wallet=0`: in a wallet build (W64) `/` is the wallet, and a run from the classic page goes back to the classic page.
  // PayPal additions 5: a cart from the Store Sync-shaped market goes back to the market's page, which reads the run.
  if (run.line) return c.redirect(`${WEB_URL}/goose.html?run=${run.id}`);
  if (run.desk) return c.redirect(`${WEB_URL}/?desk=1&run=${run.id}`);
  if (run.store !== undefined) return c.redirect(`${WEB_URL}/?market=1&run=${run.id}`);
  if (!run.wallet) return c.redirect(`${WEB_URL}/?wallet=0&run=${run.id}`);
  return c.redirect(`${WEB_URL}/?wallet=1&run=${run.id}`);
}

/** The stop this owner's own browser is missing, on a same-origin answer: from whichever run earned it, and never sent twice. */
function leaveWeekStop(c: Context, owner: string, week: number | null): void {
  if (week === null) return;
  const stop = weekStop(owner, week);
  if (stop && stop.kind !== "unsure" && !getCookie(c, weekCookie(stop.kind === "paid" ? WALLET_PAID_COOKIE : WALLET_HELD_COOKIE, week))) leaveStop(c, stop, week);
}

/** What a settled run leaves the browser it answers: the paid stop, or the stop for a hold nobody confirmed released. */
/** A week stop's cookies, from its run while it's kept, or from its mark once it's gone (the same cookies a run leaves). */
function leaveStop(c: Context, stop: WeekStop, week: number): void {
  if (stop.run) return leaveStops(c, stop.run);
  if (stop.kind === "paid") setWeekCookie(c, WALLET_PAID_COOKIE, week, walletPaidValue({ week, orderId: stop.orderId, total: stop.total }), 90);
  if (stop.kind === "held") setWeekCookie(c, WALLET_HELD_COOKIE, week, walletHeldValue({ week, orderId: stop.orderId }), 30);
}
function leaveStops(c: Context, run: Run): void {
  if (run.settled?.ok && run.bound?.orderId && run.week !== null) setWeekCookie(c, WALLET_PAID_COOKIE, run.week, walletPaidValue({ week: run.week, orderId: run.bound.orderId, total: fromCents(run.bound.cart.price) }), 90);
  // Joshua's answer (Wed Oct 28): a hold whose release PayPal didn't confirm holds back this browser's Approve for the week
  // (`heldGate`) until PayPal shows it released. 30 days: a PayPal authorization doesn't outlive that.
  if (!run.settled?.ok && run.week !== null && run.bound?.orderId && unreleased(run.ledger.read())) setWeekCookie(c, WALLET_HELD_COOKIE, run.week, walletHeldValue({ week: run.week, orderId: run.bound.orderId }), 30);
}

/**
 * Joshua's answer (Wed Oct 28): this browser's held cookie for `week` keeps a fresh Approve waiting until PayPal shows the
 * earlier hold released (`recheckHeld` reads the order again; nothing is guessed). Released: the cookie is cleared, and the
 * run, while this server still keeps it, gets a row saying so. The hold is asked to be released again only for a run this
 * browser started; a cookie alone only reads, and only one this server signed (push review, Thu Oct 29: unsigned, anyone
 * could name any order and learn its state). A cookie with no good signature holds, with no PayPal call: never "none",
 * which would let Approve through. "none" when this browser has no held cookie for the week. PayPal is asked at most once
 * per cart every HELD_RECHECK_SECONDS, and each call it gets counts in HELD_CAPS.
 */
async function heldGate(c: Context, week: number | null, token: string, ip: string): Promise<HeldAnswer> {
  if (week === null) return { state: "none" };
  const name = weekCookie(WALLET_HELD_COOKIE, week);
  const raw = getCookie(c, name);
  const cookie = parseWalletHeld(raw);
  const kept = weekStop(shopperKey(token), week);
  const held = cookie?.week === week ? cookie : kept?.kind === "held" ? { week, orderId: kept.orderId } : null;
  if (!held) return { state: "none" };
  if (!paypal || paused()) return { state: "held" }; // when unsure, hold
  const run = [...runs.values()].find((r) => r.bound?.orderId === held.orderId && isOwner(r, c));
  // The browser that started the order is the owner whatever its cookie says; anyone else needs the server's signature.
  if (!run && parseWalletHeld(openWalletCookie(WALLET_COOKIE_KEY, name, raw))?.orderId !== held.orderId) return { state: "held" };
  // One PayPal call per cart per window (Joshua, Wed Oct 28). The browser that started the cart has its own window, so a
  // stranger's cookie naming the same order can't keep the owner on a stale answer; inside it, the last answer stands.
  const key = `${run ? "owner" : "read"}:${held.orderId}`;
  const recent = HELD_COOLDOWN.take(key, "held");
  if (recent) {
    if (recent.answer === "released") deleteCookie(c, name, { path: "/" });
    return { state: recent.answer, retryIn: Math.ceil(recent.waitMs / 1000) };
  }
  const cap = (run ? HELD_CAPS : HELD_READ_CAPS).takeOrWhy(token, ip); // past a cap the hold stands: when unsure, hold
  if (cap) return { state: "held", cap };
  const left = run ? unreleased(run.ledger.read()) : null;
  const own = left?.authorizationId && left.hash ? { authorizationId: left.authorizationId, hash: left.hash } : undefined;
  const state = await recheckHeld(paypal, held.orderId, own);
  HELD_COOLDOWN.answer(key, state);
  if (state === "released") {
    deleteCookie(c, name, { path: "/" });
    if (run && left) run.ledger.append({ t: Date.now(), shopperId: DEMO_SHOPPER, visibility: "owner", actor: "paypal", action: "voided", layer: 3, verdict: "ok", why: RELEASE_CONFIRMED_WHY, data: { orderId: held.orderId, release: "confirmed", ...(left.authorizationId ? { authorizationId: left.authorizationId } : {}) } });
  }
  if (state === "captured") console.error(`wallet: held order ${held.orderId} shows captured`);
  return { state, retryIn: HELD_COOLDOWN.ms / 1000 };
}
/** What `heldGate` found: PayPal's state (or "none"), the seconds before PayPal is asked again, or the cap that stopped it. */
type HeldAnswer = { state: HeldState | "none"; retryIn?: number; cap?: CapHit };

/** The wallet asks PayPal again whether the earlier hold was released (Joshua's answer, Wed Oct 28). Under /api/runs, where the runs cookie is sent. */
app.post("/api/runs/held", async (c) => {
  const refused = ownPage(c);
  if (refused) return refused;
  const token = sessionToken(c, RUNS_COOKIE, "/api/runs", SESSION_IDLE_MS / 1000);
  const r = await heldGate(c, parseWalletHeld(getCookie(c, WALLET_HELD_COOKIE))?.week ?? null, token, clientIp(c));
  if (r.cap) return c.json({ state: r.state, error: heldCapWords(r.cap), cap: r.cap }, 429);
  return c.json(r);
});

/** PayPal sends the shopper back here after the tap. Verify, then capture, then back to the screen. */
/**
 * PayPal additions 1: once a cart is paid, the fictional seller ships it and hands PayPal its tracking through the Agent
 * Toolkit; the run gets one row saying what PayPal holds. Never awaited by the return, so PayPal's redirect never waits
 * on it, and a failure only writes its own row: nothing about the purchase changes.
 */
async function shipPaid(run: Run): Promise<void> {
  const captureId = run.settled?.ok ? run.settled.captureId : undefined;
  const port = paypal as (PaymentPort & Partial<ShippingPort>) | null;
  if (!captureId || !port?.ship || !run.bound) return;
  const tracking = trackingFor(captureId, sha256);
  const reply = await port.ship(captureId, tracking, SHIP_CARRIER).catch((e: unknown) => { console.error(`run ${run.id}: ship threw: ${e instanceof Error ? e.message : String(e)}`); return null; });
  // Review fix: an Undo that landed while PayPal answered wins; a "shipped" row after "refunded" would tell it backwards.
  if (run.refund || run.refunding) return;
  run.ledger.append(shippedRow(Date.now(), DEMO_SHOPPER, run.bound.cart.sellerId, captureId, tracking, reply));
  touch(run);
}

/** Another of this owner's carts for the same recorded week, being settled right now. */
function settlingFirst(run: Run): Run | undefined {
  if (run.week === null) return undefined;
  for (const r of runs.values()) if (r !== run && r.owner === run.owner && r.week === run.week && r.settling && !r.settled) return r;
  return undefined;
}

app.get("/api/runs/:id/return", async (c) => {
  const run = runs.get(c.req.param("id"));
  if (!run) return c.text("no such run", 404);
  // Only PayPal's redirect carries this run's secret; anyone else gets nothing and changes nothing.
  if (!timingSafeEq(sha256(c.req.query("k") ?? ""), run.secretHash)) return c.text("not this run's return", 403);
  // Idempotent: a replayed or late return URL never re-settles and never overwrites what happened.
  if (run.settled) return back(c, run, run.answered);
  // A return that arrives while another is settling must not record "cart already used" over the real result.
  if (run.settling) { await run.settling; return back(c, run); }
  const token = c.req.query("token");
  if (!run.bound || !paypal) {
    run.settled = { ok: false, reason: "no bound cart or PayPal on this run" };
    return back(c, run);
  }
  // H4: PayPal sends this run's order id as `token` on the return and on the cancel. A missing or other one, even with this
  // run's `k` (a leaked or stale link), is not PayPal's redirect for this cart: it settles nothing, cancels nothing and writes
  // no row, so a stranger can't close the owner's cart (guard.settle's wrong-order refusal would have marked it failed).
  if (!token || !run.bound.orderId || !timingSafeEq(token, run.bound.orderId)) return c.text("not this run's order", 403);
  if (c.req.query("cancel")) {
    // Round 3 red team (O1), "when unsure, hold": PayPal's checkout token is this order id, so whoever reached PayPal's
    // page for it (the owner, or a stranger who got the id) can press Cancel and land here with this run's `k`. That
    // can't end the owner's cart: the row is written (once per cart), nothing settles, and the cart stays approvable
    // until its approval time runs out, so the owner can still Approve or set it aside. Not a bad pick (020 default).
    if (!run.ledger.read().some((e) => e.actor === "shopper" && e.action === "cancel")) run.ledger.append(cancelledInPayPal(Date.now(), DEMO_SHOPPER));
    return back(c, run);
  }
  // Fresh Q (Nov 5): two tabs tapped and their returns overlap, with no cookie yet on either. One settle at a time per owner and week, and only
  // then the stops below read what the first one really did: a decline there leaves this cart payable. No await from the last look here to
  // `run.settling` below, so two waiting returns can't both go on. A settle in flight never waits on one that's waiting, so this can't deadlock.
  if (!run.swap) {
    for (let first = settlingFirst(run); first; first = settlingFirst(run)) await first.settling!.catch(() => {});
    if (run.settled) return back(c, run, run.answered);
    if (run.settling) { await run.settling; return back(c, run); }
  }
  // A cart set aside after its order was placed: the shopper's later "no" wins over the tap at PayPal, so nothing is
  // captured (or held) and the cart closes. An approved order never captured moves no money.
  if (run.aside) {
    run.settled = { ok: false, reason: "set-aside" };
    run.bound.spent = true;
    run.ledger.append({ t: Date.now(), shopperId: DEMO_SHOPPER, visibility: "owner", actor: "cart", action: "refuse", layer: 3, verdict: "refused", why: "Not capturing: you set this cart aside, so nothing was captured and this cart is closed." });
    return back(c, run);
  }
  // Answer 1 (review): a second tab's cart, from any page, opened before this browser paid the first, closes unpaid here.
  // The paid cookie is SameSite=Lax, so PayPal's redirect back carries it; this browser never pays one week's cart twice.
  // Fresh Q (Nov 5): so does one whose browser's cookie never arrived, by the run's own owner, which needs no cookie on the redirect.
  const stop = run.swap ? null : weekStop(run.owner, run.week, run);
  if (paidThisWeek(c, run) || stop?.kind === "paid") {
    run.settled = { ok: false, reason: "already-paid" };
    run.bound.spent = true;
    run.ledger.append({ t: Date.now(), shopperId: DEMO_SHOPPER, visibility: "owner", actor: "cart", action: "refuse", layer: 3, verdict: "refused", why: "Not capturing: this browser already paid for this week's cart, so nothing was captured and this cart is closed.", data: { code: "already-paid", hash: run.bound.hash } });
    return back(c, run);
  }
  // Another cart for this week may have moved money, or left a hold nobody confirmed released: when unsure, hold.
  if (stop) {
    run.settled = { ok: false, reason: "week-unsure" };
    run.bound.spent = true;
    run.ledger.append({ t: Date.now(), shopperId: DEMO_SHOPPER, visibility: "owner", actor: "cart", action: "refuse", layer: 3, verdict: "refused", why: "Not capturing: an earlier cart for this week may already have taken your money, so nothing was captured and this cart is closed.", data: { code: "week-unsure", hash: run.bound.hash } });
    return back(c, run);
  }
  const hash = run.bound.hash;
  // Attack corpus 12: the seller changes one cent after the tap, after PayPal holds the money (or, with no hold to wait
  // for under CAPTURE, before the settle). The guard is told nothing; its own re-check finds it.
  const bound = run.bound;
  const port = run.swap ? swapAfterHold(paypal, bound, run.ledger, DEMO_SHOPPER, Date.now) : paypal;
  if (run.swap && bound.intent !== "AUTHORIZE") swapNow(bound, run.ledger, DEMO_SHOPPER, Date.now());
  run.settling = run.guard.settle(bound, token, port).then(
    (r) => { run.settled = r.ok ? { ok: true, captureId: r.captureId } : { ok: false, reason: r.reason }; },
    // W24: what happened is the hold's answer row (paid, released, or "can't say"), never one fixed line for every throw.
    (e) => { console.error(`run ${run.id}: settle threw: ${e instanceof Error ? e.message : String(e)}`); run.settled = settleAnswer(run.ledger.read(), hash) ?? { ok: false, reason: "the payment step failed, so we can't say whether it was charged; check the order in the PayPal sandbox" }; },
  ).then(() => { if (run.settled?.ok) { run.paidAt = Date.now(); rememberPaid(run); void shipPaid(run).catch((e: unknown) => console.error(`run ${run.id}: ship row failed: ${e instanceof Error ? e.message : String(e)}`)); } }); // H2 review: the paid run's keep window starts here
  await run.settling;
  return back(c, run);
});

// CI's fake PayPal page (PAYMENT=fake only, loopback only): the shopper's tap, then back to the order's return URL as
// PayPal does. The order id must be one the fake port made; the return URL is the one stored with it, never a parameter.
// H2 review: only the browser whose runs cookie started the order's run may tap; anyone else gets the unknown-order 404,
// so a guessed FAKE-0001 learns nothing. It lives under /api/runs because that is the runs cookie's path.
if (paypal instanceof FakePaymentPort) {
  const fake = paypal;
  app.get("/api/runs/fake-paypal/:order/approve", (c) => {
    const order = c.req.param("order");
    // The newest: this process numbers its orders from FAKE-0001 again, so a run kept across a restart may share one.
    const run = [...runs.values()].reverse().find((r) => r.bound?.orderId === order);
    const back = run && isOwner(run, c) ? fake.tap(order) : null;
    return back ? c.redirect(back) : c.text("no such fake order", 404);
  });
  // The return link for the route properties to play a leak with: it carries the run's secret, so only its owner gets it.
  app.get("/api/runs/fake-paypal/:order/return-link", (c) => {
    const order = c.req.param("order");
    const run = [...runs.values()].reverse().find((r) => r.bound?.orderId === order);
    return run && isOwner(run, c) ? c.json({ url: fake.returnLink(order) }) : c.text("no such fake order", 404);
  });
  app.get("/api/fake-paypal/refunds", (c) => c.json({ refunds: fake.refundCount() }));
  app.get("/api/fake-paypal/orders", (c) => c.json({ orders: fake.statusCounts() })); // counts by status only (H2 review)
  // Webhooks (021 §4 item 6), test-only like the two above: PayPal's signature for a body, and how many checks were asked.
  app.post("/api/fake-paypal/webhook-sign", async (c) => c.json(fake.signWebhook(await c.req.text())));
  app.get("/api/fake-paypal/webhook-checks", (c) => c.json({ checks: fake.webhookChecks }));
  app.get("/api/fake-paypal/order-reads", (c) => c.json({ reads: fake.orderReads }));
  // The Postman collection's mock decline: the next capture answers DECLINED. Fake rail only, so loopback only, like the rest of this block.
  app.post("/api/fake-paypal/decline-next", (c) => { fake.declines = 1; return c.json({ declines: fake.declines }); });
  app.post("/api/fake-paypal/pending-next", (c) => { fake.pendings = 1; return c.json({ pendings: fake.pendings }); });
  app.post("/api/fake-paypal/gate-shut", (c) => { fake.shutGate(); return c.json({ shut: true }); });
  app.post("/api/fake-paypal/gate-open", (c) => { fake.releaseGate(); return c.json({ shut: false }); });
  app.get("/api/fake-paypal/gate", (c) => c.json({ waiting: fake.waiting }));
  app.post("/api/fake-paypal/webhook-down/:n", (c) => { fake.webhookDown = Math.min(10, Number(c.req.param("n")) || 0); return c.json({ down: fake.webhookDown }); });
}

// ---------- 021 §4 item 6: PayPal's signed webhooks become ledger rows ----------
// Only PayPal calls this, so there's no browser token. A body is read only once PayPal says it signed it; a forged or
// unverifiable event writes no row at all, since the ledger is evidence. Rows carry fixed words and PayPal's event id.
// The gate (push review MEDIUM, Thu Oct 29): headers that can't be PayPal's get a 400 with no PayPal call; a check holds
// a place in budgets only unverified checks keep (per address per day and a 10-minute rate across everyone, in memory;
// a day's ceiling across everyone on disk, which bounds PayPal calls), and the day's event budget is charged once
// PayPal signs, so one address's forgeries never make PayPal's events wait, and many addresses' only while they last.
const WEBHOOK_MAX_BYTES = 64 * 1024;
const WEBHOOK_GATE = new WebhookGate(
  { unverifiedPerIp: envInt("WEBHOOK_UNVERIFIED_PER_IP", 20), unverifiedPerWindow: envInt("WEBHOOK_UNVERIFIED_PER_10MIN", 50), unverifiedDay: envInt("WEBHOOK_UNVERIFIED_DAY_CAP", 2000), eventsDay: envInt("WEBHOOK_DAY_CAP", 2000) },
  () => Date.now(), { unverified: capStore("caps-webhook-unverified"), events: capStore("caps-webhook") },
);
const WEBHOOK_SEEN = new SeenEvents();
/**
 * Verified events no cart here matches (a run evicted, or another server's order): labeled rows, kept here, attached to
 * nothing. A plain list, not a ledger: they belong to no shopper, so no fold ever reads them.
 */
const UNMATCHED_WEBHOOKS: (ReturnType<typeof webhookRow> & { t: number })[] = [];
const UNMATCHED_KEPT = 1000;
/** Which header kept a webhook from PayPal's check, said once per kind (only the kind: the headers are a stranger's). */
const shapeWarned = new Set<string>();
function warnShapeOnce(why: string) { if (!shapeWarned.has(why)) { shapeWarned.add(why); console.warn(`webhook: refused one whose ${why} can't be PayPal's (said once)`); } }
const WEBHOOK_HEADERS = { transmissionId: "paypal-transmission-id", transmissionTime: "paypal-transmission-time", transmissionSig: "paypal-transmission-sig", certUrl: "paypal-cert-url", authAlgo: "paypal-auth-algo" } as const;

// The size cap is counted as the body streams in (a chunked body declares no length), so an oversize one is never held whole.
app.post("/api/paypal/webhook", bodyLimit({ maxSize: WEBHOOK_MAX_BYTES, onError: (c) => c.json({ error: "too large" }, 413) }), async (c) => {
  const port = paypal;
  if (!port?.verifyWebhook || (!FAKE_PAYMENT && !process.env.PAYPAL_WEBHOOK_ID)) return c.json({ error: "Webhooks aren't connected on this server." }, 503);
  const raw = await c.req.text();
  const h = {} as Record<keyof typeof WEBHOOK_HEADERS, string>;
  for (const [k, name] of Object.entries(WEBHOOK_HEADERS) as [keyof typeof WEBHOOK_HEADERS, string][]) {
    const v = c.req.header(name) ?? "";
    if (v === "" || v.length > 2048) return c.json({ error: "not a PayPal webhook" }, 400);
    h[k] = v;
  }
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return c.json({ error: "not a PayPal webhook" }, 400); }
  if (json === null || typeof json !== "object" || Array.isArray(json)) return c.json({ error: "not a PayPal webhook" }, 400);
  // Shape checks come first, so junk never spends a check. Past a budget or inside the cooldown PayPal isn't asked; it sends again later.
  const ip = clientIp(c);
  const hit = WEBHOOK_GATE.before(h, ip);
  if (hit?.status === 400) { warnShapeOnce(hit.why); return c.json({ error: "not a PayPal webhook" }, 400); }
  if (hit) return c.json({ error: "too many webhooks", cap: hit.why }, 429);
  let signed: boolean;
  try { signed = await port.verifyWebhook(h, raw); } catch (e) {
    WEBHOOK_GATE.release(ip);
    console.error(`webhook: PayPal didn't answer the check: ${(e as Error).message}`);
    return c.json({ error: "couldn't check it with PayPal; send it again" }, 503);
  }
  if (!signed) { console.warn("webhook: refused one PayPal didn't sign"); return c.json({ error: "not signed by PayPal" }, 400); }
  if (!WEBHOOK_GATE.signed(ip)) return c.json({ error: "too many webhooks", cap: "events" }, 429);
  const read = readWebhook(json);
  if (!read.ok) return c.json({ ok: true, noted: read.code }); // signed, but not one Goose logs: acknowledged so PayPal stops sending
  const f = read.facts;
  const run = [...runs.values()].find((r) => r.bound && webhookMatches(f, { orderId: r.bound.orderId, captureId: r.settled?.captureId, hash: r.bound.hash }));
  // W83: an id is marked seen only once it lands on a cart. A refund PayPal sends before this server has the capture id
  // matches nothing yet; its retry must still land, so an unmatched id is deduped only against the unmatched list.
  const unmatchedAt = UNMATCHED_WEBHOOKS.findIndex((u) => u.data?.eventId === f.eventId);
  if (run) {
    if (run.ledger.read().some((e) => e.action === "webhook" && e.data?.eventId === f.eventId) || !WEBHOOK_SEEN.first(f.eventId)) return c.json({ ok: true, duplicate: true });
    run.ledger.append({ t: Date.now(), shopperId: DEMO_SHOPPER, ...webhookRow(f, true) });
    if (unmatchedAt >= 0) UNMATCHED_WEBHOOKS.splice(unmatchedAt, 1); // it found its cart, so it's no longer unmatched
    return c.json({ ok: true, matched: true });
  }
  if (unmatchedAt >= 0) return c.json({ ok: true, duplicate: true });
  if (UNMATCHED_WEBHOOKS.length < UNMATCHED_KEPT) UNMATCHED_WEBHOOKS.push({ t: Date.now(), ...webhookRow(f, false) });
  console.warn(`webhook: ${f.kind} event ${f.eventId} matches no cart here`);
  return c.json({ ok: true, matched: false });
});

/**
 * The fold the screen reads, without its grid rows, and only for the browser whose runs session token started the run:
 * a run's id travels in URLs and PayPal's return, so the id alone never reads the session's week or receipt (020 W20).
 * Anyone else gets null. The grid gets its own route when the AG Grid lands.
 */
function shopperView(run: Run, c: Context) {
  if (!isOwner(run, c)) return null;
  const fold = shopperFold(run.shopper.read(), run.policy, CATALOG, Date.now());
  const { grid: _grid, ...shown } = fold;
  // W50c: the wallet's "Your week" counts, from this fold's own rows (they need the grid, which stays here).
  return { ...shown, weekCounts: weekCounts(fold) };
}

/**
 * §17: the one honest line beside a cart this browser may still approve, from its own wants, Policy and week only (never
 * seller text). Approve stays the yes and "Not this one" the no: nothing here holds or refuses the cart.
 */
function tradeoffFor(run: Run, c: Context): string | null {
  const cart = run.bound?.cart;
  // Only beside a cart that still has its yes (Approve can be pressed): "Still want it?" never sits by a dead end.
  if (!cart?.catalogId || !paypal || run.settled || run.bound?.spent || run.aside || run.bound!.expiresAt <= Date.now() || !isOwner(run, c)) return null;
  const session = SHOPPERS.peek(run.owner, Date.now());
  if (!session) return null;
  const { week } = shopperFold(session.shopper.read(), session.policy, CATALOG, Date.now());
  return tradeoffLine({ cart: { catalogId: cart.catalogId, price: cart.price }, wants: session.wants, week, catalog: CATALOG, policy: session.policy, on: session.tradeoffs })?.line ?? null;
}

/** What a non-owner reads where PayPal's order, capture or authorization id was (AS-9; Round 3 red team, O1). */
const ORDER_HIDDEN = "(id hidden)";
/**
 * The run's trail as this reader may see it. The owner gets every row as written. Anyone else (a shared run link, the
 * judge path) gets every row, in the same order and the same shape, with PayPal's ids taken out: the order id (it is
 * PayPal's checkout token), the capture, authorization and refund ids, a webhook's resource and event ids and a refund's
 * request id, wherever they stand (any of those fields at any depth of `data`, the `order-created` row's "Order <id>
 * created for the bound cart…", a reconcile row's "capture <id>", any other string in `data`, nested or not) read
 * `ORDER_HIDDEN`, the same way `bound.orderId` is the owner's only. Each field stays a string, so the trail (core's
 * `payTrail`, which finds the order row by it and a signed webhook by its event id) still draws its steps and the cart's mark.
 */
function trailFor(run: Run, c: Context, events: readonly LedgerEvent[]): LedgerEvent[] {
  if (isOwner(run, c)) return [...events];
  const ids = new Set<string>();
  if (run.bound?.orderId) ids.add(run.bound.orderId);
  if (run.settled?.captureId) ids.add(run.settled.captureId);
  // From the whole ledger as well as the rows asked for: the run's stream sends one row at a time, and a later row (a
  // webhook's, a refund's) may name an id an earlier row brought in.
  return hidePayPalIds(events, [...run.ledger.read(), ...events], ids, ORDER_HIDDEN);
}

function view(run: Run, c: Context) {
  const wc = worstCase(run.policy, run.want, run.category);
  const returnedRun = { week: run.week ?? null, bound: run.bound ? { total: fromCents(run.bound.cart.price), orderId: run.bound.orderId ?? null } : null, settled: run.settled ?? null, events: run.ledger.read(), mine: isOwner(run, c), refunded: Boolean(run.refund), paidHere: isOwner(run, c) && paidThisWeek(c, run), unsureHere: unsureThisWeek(c, run) };
  const undoneHere = returnedRun.paidHere && undoneThisWeek(c, run);
  const now = Date.now();
  return {
    id: run.id, done: run.done, buyer: run.buyerName, seed: run.seed, week: run.week, note: run.note, replayable: run.replayable, payment: PAYMENT_LABEL,
    worstCase: { cap: fromCents(wc.cap), why: wc.why },
    // The limit is the run's own Policy's (N18), so the screen holds none of its own; the Policy itself isn't sent (no one reads it).
    // A moving run's category and limit are its own (§15B part 2): the kettle's would say the wrong one beside its cart.
    // Desk-L: a made-up market's cart says the limit code placed it under (`wc.cap`, its category's) and why, in fixed words.
    ...(run.limitWhy !== undefined ? { category: run.category ?? null, limit: fromCents(wc.cap), limitWhy: run.limitWhy }
      : run.category === ENTRY_CATEGORY ? entryLimit(run.policy)
      // A made-up market's cart saved before Desk-L ("fictional market", no limitWhy) was held to the strictest limit (`wc.cap`).
      : { category: run.category ?? null, limit: fromCents(run.category === "fictional market" ? wc.cap : run.want.maxPrice) }),
    // The one shopper fold (N19): the dial, the week and the receipt span this session's runs; the screen keeps none of its own.
    shopper: shopperView(run, c),
    tradeoff: tradeoffFor(run, c),
    want: { item: run.want.item, maxPrice: fromCents(run.want.maxPrice), qty: run.want.qty },
    // PayPal's order id is the owner's (Round 2 red team, fix 2): a shared run link shows the cart, its hash and the trail
    // (the judge path needs them), never the order. The shape stays the same for everyone, so no answer is an oracle.
    bound: run.bound ? { item: run.bound.cart.item, merchant: run.bound.cart.merchant, total: fromCents(run.bound.cart.price), currency: run.bound.cart.currency, hash: run.bound.hash, expiresAt: run.bound.expiresAt, orderId: isOwner(run, c) ? run.bound.orderId ?? null : null, spent: run.bound.spent } : null,
    // Only the run's own browser may press Approve or follow its order (H2): anyone else sees the cart, never the button.
    // Whether this reader is the run's owner, and nothing about who that is: a stranger's link never reads "you approved".
    mine: isOwner(run, c),
    approveUrl: isOwner(run, c) && !paidThisWeek(c, run) && !returnedRun.unsureHere ? run.approveUrl ?? null : null,
    canApprove: Boolean(run.bound && paypal && !run.settled && !run.bound.spent && !run.aside && isOwner(run, c) && !paidThisWeek(c, run) && !returnedRun.unsureHere),
    // This browser paid this week's cart on some other run: the replay plays, and there's nothing to press.
    paidHere: Boolean(run.bound && !run.settled && returnedRun.paidHere),
    // Money may have moved on this browser's other cart for the week: nothing to press, and no page may say it waits for a yes.
    unsureHere: Boolean(run.bound && !run.settled && !returnedRun.paidHere && returnedRun.unsureHere),
    // The stop's own words for the classic page's lane and strip, or null: the page shows these and keeps none of its own.
    stop: run.bound && !run.settled ? (returnedRun.paidHere ? (undoneHere ? STOP_SAID.undone : STOP_SAID.paid) : returnedRun.unsureHere ? STOP_SAID.unsure : null) : null,
    aside: Boolean(run.aside),
    outcome: run.outcome ?? null,
    // PayPal's capture id is the owner's too (Round 3, O1): anyone else reads ORDER_HIDDEN in its place, same shape.
    settled: run.settled ? (run.settled.captureId && !isOwner(run, c) ? { ...run.settled, captureId: ORDER_HIDDEN } : run.settled) : null,
    // Where this run's Undo stands (`UndoState`): open from a paid settle for UNDO_KEEP_MS, the window voice
    // "take it back" keeps to; refunded once PayPal's refund came back.
    undo: run.refund ? { state: "refunded" } : undoOpen(run, now) ? { state: "open", until: run.paidAt! + UNDO_KEEP_MS } : { state: "none" },
    // The trail whole for everyone, PayPal's order, capture and authorization ids only for the owner (`trailFor`).
    // What this run's return means, for this reader: one reading, so no page says "Not paid" over a capture nobody confirmed.
    returned: returnKind(returnedRun), card: returnCard({ ...returnedRun, undoneHere }),
    events: trailFor(run, c, run.ledger.read()),
  };
}

// S8 iPhone test (Joshua, Oct 29): the voice spike page over Render's real HTTPS, so iOS gets a secure context
// without serve.ts's self-signed warning. Test-only: nothing links here and search engines are told to skip it.
// The page keeps its tap log on the page and POSTs only to serve.ts, so no audio or transcript reaches this server.
// Round 2 red team (fix 4): both test pages are mounted only off Render (`!process.env.RENDER`); on the public host they
// are a 404 like any unknown path. Locally and in CI they stay, so the CSP smoke and the mic tests still visit them.
const voiceTest = join(here, "..", "..", "spikes", "s8-voice", "voice.html");
const DEV_PAGES = !process.env.RENDER;
if (DEV_PAGES) app.get("/voice-test", (c) => existsSync(voiceTest)
  ? c.html(readFileSync(voiceTest, "utf8"), 200, { "cache-control": "no-store", "x-robots-tag": "noindex" })
  : c.notFound());

// Single-service hosting: if the web build exists, serve it too. WEB_DIST (an absolute path) is for tests only, so a
// server test can serve a file without building the web app first.
const dist = process.env.WEB_DIST || join(here, "..", "..", "web", "dist");
// Track V (029): the on-device speech test, built by Vite into the web build. Same rules as /voice-test: unlinked,
// never indexed, never cached. Speech is turned into text inside the browser; this server receives no audio or text.
const voiceTest2 = join(dist, "voice-test-2.html");
if (DEV_PAGES) app.get("/voice-test-2", (c) => existsSync(voiceTest2)
  ? c.html(readFileSync(voiceTest2, "utf8"), 200, { "cache-control": "no-store", "x-robots-tag": "noindex" })
  : c.notFound());
PAGE_SCRIPTS = [voiceTest, ...(existsSync(dist) ? readdirSync(dist).filter((f) => f.endsWith(".html")).map((f) => join(dist, f)) : [])]
  .filter((f) => existsSync(f)).flatMap((f) => inlineScriptHashes(readFileSync(f, "utf8")));
if (existsSync(dist)) {
  // The build's own copy of the mic test page (web/voice-test-2.html) is a dev page too: off Render only.
  if (!DEV_PAGES) app.get("/voice-test-2.html", (c) => c.notFound());
  // Track F: web/compress.ts gives every text file a .br and a .gz copy, and a block on one exact path doesn't cover them:
  // /voice-test-2.html.br answered 200 on Render. serveStatic picks a copy itself from Accept-Encoding, so no page needs
  // one by name. Only a hashed /assets/ file keeps its own (the wasm's); nothing else, on any host.
  app.use("/*", async (c, next) => {
    if (/\.(?:br|gz)$/i.test(c.req.path) && !/^\/assets\/[^/]+$/.test(c.req.path)) return c.notFound();
    await next();
  });
  // Track V (029): the speech worker's WebAssembly (ONNX Runtime, 27 MB raw) is served from its Brotli/gzip copy
  // (web/compress.ts) and, being content-hashed, cached for good, so a phone downloads it once, compressed.
  // Track R: a conditional GET for a file of the build answers 304 while the browser's copy is current, so `no-cache`
  // HTML costs a few headers, not the page, on each visit (static-cache.ts). The file's open stream is cancelled.
  app.use("/*", async (c, next) => {
    await next();
    if ((c.req.method !== "GET" && c.req.method !== "HEAD") || c.res.status !== 200 || c.req.path.startsWith("/api/")) return;
    if (!notModifiedSince(c.req.header("if-modified-since"), c.res.headers.get("last-modified"))) return;
    await c.res.body?.cancel().catch(() => {});
    const headers = new Headers(c.res.headers);
    headers.delete("content-length");
    c.res = new Response(null, { status: 304, headers });
  });
  // Lead-13 (Nov 11): the bare domain is the white site (static-cache.ts rootFile): `/` with no old page named in its
  // query is answered from goose.html in place; every old address, back() and every other path are unchanged.
  const hasWhite = existsSync(join(dist, "goose.html"));
  app.use("/*", serveStatic({
    root: dist,
    precompressed: true,
    ...rootFile(hasWhite),
    onFound: (path, c) => {
      // 034: Goose's recorded lines (web/public/voice/*.m4a); Hono's type table has no .m4a, and Safari won't play
      // an octet-stream.
      if (path.endsWith(".m4a")) c.header("content-type", "audio/mp4");
      // Track R: the HTML and every unhashed file are checked with the server on each use (`no-cache`), so a deploy's
      // new page is seen at once; a content-hashed /assets/ file is kept for a year (`immutable`; static-cache.ts).
      c.header("cache-control", cacheControlFor(c.req.path));
      const robots = robotsFor(c.req.path, new URL(c.req.url).search); // ?desk=system: noindex, before any script runs
      if (robots) c.header("x-robots-tag", robots);
      if (!/\/assets\/[^/]+\.wasm(?:\.br|\.gz)?$/.test(path)) return;
      // The raw copy too, so a shared cache never hands the 27 MB file to a browser that takes Brotli.
      if (!c.res.headers.get("vary") && !path.endsWith(".wasm.br") && !path.endsWith(".wasm.gz")) c.header("vary", "Accept-Encoding");
    },
  }));
}

// W4 (Round 2's design judge): a browser asking for an unknown page gets the landing's shell (web/404.html: the bar, "Nothing
// here." with one "Back to Goose" pill (W-5), the footer), still with status 404. Anything else (an API path, a missing asset, a client that
// doesn't ask for HTML) keeps the plain 404.
// Track R: a missing /assets/ file (a chunk no release has) is always the plain 404, whatever the client accepts, never
// cached, so a script tag is never handed a page and a carried chunk is never hidden behind a kept miss.
const notFoundPage = join(dist, "404.html");
app.notFound((c) => isAssetPath(c.req.path) ? c.text("404 Not Found", 404, { "cache-control": "no-store" }) : c.req.method === "GET" && !c.req.path.startsWith("/api/") && (c.req.header("accept") ?? "").includes("text/html") && existsSync(notFoundPage)
  ? c.html(readFileSync(notFoundPage, "utf8"), 404, { "cache-control": "no-store" })
  : c.text("404 Not Found", 404));

const server = serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
  // The port is read back from the bound address, so a test knows the line is from its own child (core/test/boot.ts).
  console.log(`gilded-goose server on ${PUBLIC_URL}, listening on ${HOST}:${info.port} (buyer: ${BUYER_NAME}${LIVE ? `, ${HAGGLE_CAPS.global.left("all")} live haggles left today` : ""}, run library: ${LIBRARY.size} runs, store: ${store()}, payment: ${PAYMENT_LABEL})`);
  console.log(`keep-alive: ${(server as { keepAliveTimeout?: number }).keepAliveTimeout} ms, headers: ${(server as { headersTimeout?: number }).headersTimeout} ms`); // read back off the server (core/test/keep-alive.test.ts)
});
// A first tap's market ask got a 502 from the host's proxy (q/round1/consumer.md): Node closes an idle kept connection at 5 s, under the proxy's ~60 s, so the proxy can reuse a socket Node is closing. Outlast it; headers must outlast keep-alive.
Object.assign(server, { keepAliveTimeout: 65_000, headersTimeout: 66_000 });
