// Track R-12 (the DD, Sat Oct 31: never claim beyond the code). A failure line names only the cause the code observed:
// while she is offline, live mode's state is "offline" (no probe runs, and a probe that came back away offline is not
// "away"), and every reader words that as offline, never as the server. Controls: online with no server still says the
// server line, since that one the code did see. The browser half is `pnpm probe:offline-strip` (checks e to h).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PAIR_WORDS, pairOutcome, rightOf } from "../src/live.ts";
import * as W from "../../web/src/states/words.ts";
import { PAGE_RULE_NOTE, PAGE_RULE_OFFLINE } from "../../web/src/studio/rule.ts";
import { ASK_LABEL, askInBrowser } from "../src/ask/ask.ts";
import { PHOTO_OFF } from "../src/ask/copy.ts";
import * as WANTS from "../src/ask/wants.ts";
import { capWords } from "../src/buyer/plan.ts";
import { RunLibrary } from "../src/buyer/library.ts";
import { localRun } from "../src/view/local.ts";
import { sha256Hex } from "../src/sha256.ts";

const SERVER = /server|live mode|isn.t answering|didn.t answer/i;
const src = (f: string) => readFileSync(join(import.meta.dirname, "../../web/src", f), "utf8");

/** A fresh copy of web/src/live.ts with its own navigator, window events and fetch. */
async function page(onLine: boolean, health: () => Promise<Response>) {
  vi.resetModules();
  const nav = { onLine };
  const on = new Map<string, (() => void)[]>();
  const fetches = vi.fn(health);
  vi.stubGlobal("navigator", nav);
  vi.stubGlobal("addEventListener", (t: string, f: () => void) => { on.set(t, [...(on.get(t) ?? []), f]); });
  vi.stubGlobal("fetch", fetches);
  // A path in a variable, so core's typecheck (no DOM lib) doesn't compile the browser module; its slice is typed here.
  const path = "../../web/src/live.ts";
  const live = (await import(path)) as { liveKnown(): Promise<string>; liveAway(): void };
  const fire = (t: "online" | "offline") => { nav.onLine = t === "online"; on.get(t)?.forEach((f) => f()); };
  return { live, nav, fire, fetches };
}
const up = () => Promise.resolve(new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } }));
const refused = () => Promise.reject(new TypeError("Failed to fetch"));

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("live mode's state while offline (web/src/live.ts)", () => {
  it("offline from the first ask: the state is offline and no probe runs, so nothing can call the server away", async () => {
    const p = await page(false, refused);
    expect(await p.live.liveKnown()).toBe("offline");
    expect(p.fetches).not.toHaveBeenCalled();
  });

  it("control: online with no server, the probe's failure is away (the code saw the server not answer)", async () => {
    const p = await page(true, refused);
    expect(await p.live.liveKnown()).toBe("away");
  });

  it("up, then offline: offline at once, over up; back online it asks again and is up", async () => {
    const p = await page(true, up);
    expect(await p.live.liveKnown()).toBe("up");
    p.fire("offline");
    expect(await p.live.liveKnown()).toBe("offline");
    p.fire("online");
    expect(await p.live.liveKnown()).toBe("up");
    expect(p.fetches).toHaveBeenCalledTimes(2);
  });

  it("a probe that fails while she goes offline (before the event) says offline, not away", async () => {
    const p = await page(true, () => { p.nav.onLine = false; return refused(); });
    expect(await p.live.liveKnown()).toBe("offline");
  });

  it("a call that failed offline (liveAway) says offline and asks nothing", async () => {
    const p = await page(true, up);
    expect(await p.live.liveKnown()).toBe("up");
    p.nav.onLine = false;
    p.live.liveAway();
    expect(await p.live.liveKnown()).toBe("offline");
    expect(p.fetches).toHaveBeenCalledTimes(1);
  });
});

describe("the offline words name no server (R-12)", () => {
  it("every OFFLINE_SAYS line, the judge's saved-order line and the studio's quiet note say offline, never the server", () => {
    for (const [k, line] of Object.entries(W.OFFLINE_SAYS)) expect(`${W.OFFLINE.title} ${line}`, k).not.toMatch(SERVER);
    expect(PAIR_WORDS.offline).toMatch(/^You're offline/);
    expect(rightOf({ kind: "unreached" }, false)).toEqual({ kind: "saved", why: PAIR_WORDS.offline });
    expect(rightOf({ kind: "unreached" }), "control: online, the call didn't reach the server").toEqual({ kind: "saved", why: PAIR_WORDS.unreached });
    expect(pairOutcome({ kind: "unreached" }, { kind: "unreached" }, false).right).toEqual({ kind: "saved", why: PAIR_WORDS.offline });
    expect(PAIR_WORDS.offline).not.toMatch(SERVER);
    expect(PAGE_RULE_OFFLINE).toBe(W.OFFLINE.title);
    expect(PAGE_RULE_NOTE, "control: online, the note the code saw stays").toBe("Goose's server didn't answer.");
  });

  it("the back-from-PayPal read never says nothing was bought (she has been to PayPal; a capture may have happened)", () => {
    expect(`${W.BACK_UNREAD.title} ${W.BACK_UNREAD.line} ${W.OFFLINE_SAYS.back}`).not.toMatch(/nothing was (bought|charged)/i);
  });

  it("each reader gates its server line on the cause it saw (a source check per call site; the probe checks them drawn)", () => {
    const store = src("StoreSync.tsx");
    expect(store, "the market's sentinel held a server claim as its text").not.toMatch(/const OFFLINE = "[^"]*server/);
    expect(store, "the return's read is read again in place, not by reloading the page (a reload is her tap)").not.toMatch(/location\.reload/);
    expect(src("Wants.tsx")).toMatch(/OFFLINE_SAYS\.wants/);
    expect(src("Wants.tsx")).toMatch(/OFFLINE_SAYS\.settings/);
    expect(src("AskGoose.tsx")).toMatch(/ASK_OFFLINE/);
    expect(src("AskGoose.tsx")).toMatch(/FORGET_OFFLINE/);
    expect(src("after/AfterPay.tsx")).toMatch(/OFFLINE_SAYS\.after/);
    expect(src("App.tsx").match(/OFFLINE_SAYS\.(run|aside|pay)/g)?.length).toBe(3);
    expect(src("Wallet.tsx")).toMatch(/OFFLINE_SAYS\.pay/);
    expect(src("JudgeBox.tsx")).toMatch(/OFFLINE_SAYS\.round/);
  });
});

// Track R-13 (the DD gate, Sat Oct 31 ~10:05): core's round labels still said "Live mode isn't answering" while she was
// offline: Go's run note, the Ask's "How Goose read this", the photo note and a want's save line. Each reason type has an
// "offline" beside "away", worded "You're offline, so …" (as PAIR_WORDS.offline), and the web callers pass it when the
// live state is offline or navigator.onLine is false. Controls: online with no server, "away" still names live mode or
// the server (the code saw it). The browser half is `pnpm probe:offline-strip` (checks i to l).
const ANSWERING = /isn.t answering/i;
// Typed loosely on purpose, so this file ran red (not uncompiled) on 1f279fb4, before "offline" existed.
const loose = <T,>(v: T) => v as unknown as Record<string, string>;
describe("the round labels while offline name her network (R-13)", () => {
  const go = (notLive: "away" | "offline", chips?: unknown) =>
    localRun({ library: new RunLibrary("x"), asked: null, maxPrice: 6000, hash: sha256Hex, now: () => 1_700_000_000_000, fresh: () => 77, pace: false, notLive, ...(chips ? { chips } : {}) });

  it("Go pressed offline: the run's note says offline, never live mode (the rule run and a posted run)", async () => {
    for (const r of [go("offline"), go("offline", [{ kind: "item", value: "marsh-lights-ticket" }])]) {
      expect(r.head.note).toMatch(/^You're offline/);
      expect(r.head.note).not.toMatch(SERVER);
      await r.done;
    }
    expect(capWords("offline", 0)).toBe("You're offline");
  });

  it("an ask read offline: How Goose read this says offline, and it was read in the browser", async () => {
    const r = await askInBrowser("a kettle", "offline");
    expect(r.source).toBe("rule-browser");
    expect(r.label).toMatch(/^You're offline, so a plain keyword rule read your words in your browser/);
    expect(r.label).not.toMatch(SERVER);
  });

  it("a photo offline and a want saved offline say offline, never the server", () => {
    const photo = loose(PHOTO_OFF).offline;
    expect(photo).toMatch(/^You're offline, so the camera can't read a photo/);
    expect(photo).not.toMatch(SERVER);
    const want = loose(WANTS).WANT_OFFLINE;
    expect(want).toMatch(/^You're offline/);
    expect(want).toMatch(/Nothing was saved|wasn't saved/);
    expect(want).not.toMatch(SERVER);
  });

  it("the web callers pass offline: Go, the ask, the photo and the want (a source check; the probe checks them drawn)", () => {
    const app = src("App.tsx");
    expect(app, "Go: a press while live mode is offline runs in the browser as offline").toMatch(/startInBrowser\(seed, [^;]*"offline"/);
    const ask = src("AskGoose.tsx");
    expect(ask, "the ask passes offline to the browser's rule").toMatch(/inBrowser\([^;]*"offline"/);
    expect(ask, "the photo says PHOTO_OFF.offline").toMatch(/PHOTO_OFF\.offline/);
    expect(ask, "a want asked offline says WANT_OFFLINE").toMatch(/WANT_OFFLINE/);
  });

  it("controls: online with no server, away still names live mode or the server (the code saw it), word for word", async () => {
    expect(go("away").head.note).toMatch(/^Live mode isn't answering/);
    expect((await askInBrowser("a kettle", "away")).label).toBe(ASK_LABEL.away);
    expect(ASK_LABEL.away).toMatch(ANSWERING);
    expect(PHOTO_OFF.away).toMatch(ANSWERING);
    expect(WANTS.WANT_NEEDS_SERVER).toMatch(/server/);
    expect(capWords("away", 0)).toBe("Live mode isn't answering");
  });

  it("every offline line exists and none says isn't answering", () => {
    const lines = { go: capWords("offline", 0), ask: loose(ASK_LABEL).offline, photo: loose(PHOTO_OFF).offline, want: loose(WANTS).WANT_OFFLINE };
    expect(Object.entries(lines).filter(([, l]) => l === undefined || ANSWERING.test(l)).map(([k]) => k), "missing, or isn't answering").toEqual([]);
  });

  it("nits: the PayPal return's read online always says BACK_UNREAD; a forget offline points at when she's back", () => {
    const store = src("StoreSync.tsx");
    const back = store.slice(store.indexOf('failed === "back"'), store.indexOf(": failed\n"));
    expect(back, "the return's read online never says it didn't go through (she might pay twice)").not.toMatch(/WAS_OFFLINE/);
    expect(back).toMatch(/BACK_UNREAD\.title/);
    expect(W.OFFLINE_SAYS.forget, "a forget offline names when the network action works").toMatch(/once you're back/);
  });
});

// Track R-14 (the DD gate, Sat Oct 31 ~10:20, lesson 47): the market re-sent the cart POST by itself on `online`, and
// that POST binds a cart, starts a run and spends one of her daily cart caps. Only a read retries by itself; a step that
// acts waits for her Try again. The browser half is `pnpm probe:offline-strip` (row m).
describe("R-14: on `online`, only a read is sent again by itself", () => {
  const store = src("StoreSync.tsx");
  /** Each `fail(() => step(...), reads?)` site: the step's name and whether it may run again by itself. */
  const sites = [...store.matchAll(/fail\(\(\) => (?:void )?(\w+)\([^)]*\)(?:, (true|false))?/g)].map((m) => ({ name: m[1]!, auto: m[2] !== "false" }));
  /** Whether the step's function sends a body (a POST, via json(path, body)). */
  const posts = (name: string) => {
    const at = store.search(new RegExp(`function ${name}\\(`));
    const body = store.slice(at, store.indexOf("\n  }\n", at));
    return /json<[^\n]*?>\((["`])[^"`]*\1,\s/.test(body);
  };

  it("every step that POSTs passes reads=false, so nothing but her press sends it again", () => {
    expect(sites.length, "the fail() sites were found").toBeGreaterThanOrEqual(4);
    expect(sites.filter((s) => posts(s.name) && s.auto).map((s) => s.name), "a POST that re-sends itself on online").toEqual([]);
  });

  it("control: the reads (search, the return's read) still run again by themselves", () => {
    expect(sites.filter((s) => !posts(s.name)).map((s) => `${s.name}:${s.auto}`).sort()).toEqual(["readBack:true", "search:true"]);
    expect(posts("putInCart") && posts("completePayment"), "control: the pattern sees both POSTs").toBe(true);
  });
});
