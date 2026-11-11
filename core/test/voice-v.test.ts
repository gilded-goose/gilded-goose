// Track V (042, Joshua's mandate item 4): the greeting with her name, the name that never leaves this browser, "show me
// my priorities list" opening Your wants, voice that only ever navigates, and the captions and mute toggle.
//
// The name test runs the page's real name, command and speech code (web/src/name.ts, commands.ts, speech.ts) with every
// way out of a browser replaced by a recorder (fetch, XHR, beacons, sockets, event streams, image pings, location,
// history, the console) and fails if the name reaches any of them. A planted leak shows the recorder catches one.

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GO_TO_HREF, goToIntent, voiceIntent, saidTakeBack } from "../src/ask/voice.ts";
import { NAME_FORGOT, NAME_HELLO, NAME_KEY, dayPart, greeting, nameCommand } from "../src/view/name.ts";
import { CLIPS, CLIP_TAKES, clipFor } from "../src/ask/clips.ts";
import { understand } from "../src/ask/understood.ts";
import { demoPolicy } from "../src/scenario.ts";
import { fromCents } from "../src/money.ts";

// The browser globals this file stubs with vi.stubGlobal (core typechecks without the DOM library).
declare const location: { assign(url: string): void; search: string; href: string };
declare const Image: new () => { src: string };
declare function addEventListener(type: string, fn: (e: Event) => void): void;

const root = new URL("../../", import.meta.url);
const read = (f: string) => readFileSync(new URL(f, root), "utf8");
/** The code alone: a comment saying what a file can't do mustn't trip a check. */
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");

// Paths in variables: core's typecheck has no DOM types, so it mustn't follow these imports into the page's code.
const COMMANDS = "../../web/src/commands.ts";
const NAME = "../../web/src/name.ts";
const SPEECH = "../../web/src/speech.ts";
type Commands = { pageCommand(w: string): { kind: string; line: string | null } | null; GO_ROOM_EVENT: string };
type NameMod = { readName(): string | null; keepName(raw: string): string | null; forgetName(): void };
type SpeechMod = { say(line: string): void; primeSpeech(): void; isMuted(): boolean; setMuted(on: boolean): void; MUTE_KEY: string };

// ── A browser whose every exit is recorded ─────────────────────────────────────────────────────────────────────────
let out: string[];
let store: Map<string, string>;
let events: EventTarget;
let played: string[];
let spoken: string[];
const rec = (where: string) => (...a: unknown[]) => { out.push(`${where} ${a.map((x) => (typeof x === "string" ? x : JSON.stringify(x) ?? String(x))).join(" ")}`); };

beforeEach(() => {
  vi.resetModules();
  out = []; store = new Map(); events = new EventTarget(); played = []; spoken = [];
  const loc = { href: "http://localhost/?desk=1", origin: "http://localhost", pathname: "/", search: "?desk=1", hash: "", assign: rec("location.assign"), replace: rec("location.replace"), reload: rec("location.reload") };
  vi.stubGlobal("location", loc);
  vi.stubGlobal("history", { pushState: rec("history.pushState"), replaceState: rec("history.replaceState") });
  vi.stubGlobal("fetch", (...a: unknown[]) => { rec("fetch")(...a); return Promise.resolve(new Response("{}")); });
  vi.stubGlobal("XMLHttpRequest", class { open(...a: unknown[]) { rec("xhr.open")(...a); } setRequestHeader(...a: unknown[]) { rec("xhr.header")(...a); } send(...a: unknown[]) { rec("xhr.send")(...a); } });
  vi.stubGlobal("navigator", { sendBeacon: (...a: unknown[]) => { rec("beacon")(...a); return true; }, userAgent: "test" });
  vi.stubGlobal("WebSocket", class { constructor(...a: unknown[]) { rec("websocket")(...a); } send(...a: unknown[]) { rec("websocket.send")(...a); } });
  vi.stubGlobal("EventSource", class { constructor(...a: unknown[]) { rec("eventsource")(...a); } });
  vi.stubGlobal("Image", class { set src(v: string) { rec("image")(v); } });
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k) });
  vi.stubGlobal("addEventListener", events.addEventListener.bind(events));
  vi.stubGlobal("removeEventListener", events.removeEventListener.bind(events));
  vi.stubGlobal("dispatchEvent", events.dispatchEvent.bind(events));
  vi.stubGlobal("Audio", function FakeAudio(this: { src: string; muted: boolean; play(): Promise<void>; pause(): void }) {
    this.src = ""; this.muted = false;
    this.play = () => { if (!this.muted) played.push(this.src); return Promise.resolve(); };
    this.pause = () => {};
  });
  vi.stubGlobal("SpeechSynthesisUtterance", function U(this: { text: string }, t: string) { this.text = t; });
  vi.stubGlobal("window", { speechSynthesis: { cancel() {}, speak(u: { text: string }) { if (u.text) spoken.push(u.text); } }, setTimeout });
  for (const m of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, m).mockImplementation(rec(`console.${m}`));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const load = async () => ({
  cmds: (await import(/* @vite-ignore */ COMMANDS)) as Commands,
  name: (await import(/* @vite-ignore */ NAME)) as NameMod,
  speech: (await import(/* @vite-ignore */ SPEECH)) as SpeechMod,
});
const NEEDLE = "Zephyrine";
const leaks = () => out.filter((o) => o.toLowerCase().includes(NEEDLE.toLowerCase()));

describe("042 the greeting", () => {
  it("greeting_by_the_clock: one short line, morning, afternoon or evening, with her name or gracefully without", () => {
    expect(greeting(19, "Joshua")).toBe("Good evening, Joshua.");
    expect(greeting(19, null)).toBe("Good evening.");
    expect(greeting(8, "Ana María")).toBe("Good morning, Ana María.");
    expect(greeting(13, null)).toBe("Good afternoon.");
    const parts = Array.from({ length: 24 }, (_, h) => dayPart(h));
    expect(parts).toEqual([...Array(5).fill("night"), ...Array(7).fill("morning"), ...Array(6).fill("afternoon"), ...Array(6).fill("evening")]);
  });

  it("greeting_after_midnight (DK, Joshua Sat 3:30 AM): every hour 0–23, and 00:00–04:59 says Hello, never Good evening", () => {
    const want = (h: number) => (h < 5 ? "Hello" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
    for (let h = 0; h < 24; h++) {
      expect([h, greeting(h, "Joshua")]).toEqual([h, `${want(h)}, Joshua.`]);
      expect([h, greeting(h, null)]).toEqual([h, `${want(h)}.`]);
    }
    // The edges, read the way the Greeting reads them (new Date().getHours()): 4:59 is hour 4, 5:00 is hour 5.
    const at = (hh: number, mm: number) => new Date(2026, 9, 31, hh, mm).getHours();
    expect(greeting(at(0, 0), "Joshua")).toBe("Hello, Joshua.");
    expect(greeting(at(4, 59), "Joshua")).toBe("Hello, Joshua.");
    expect(greeting(at(5, 0), "Joshua")).toBe("Good morning, Joshua.");
    expect(greeting(at(23, 59), null)).toBe("Good evening.");
    // Control: the old rule (5 AM's evening) would fail the 4:59 edge.
    const old = (h: number) => `Good ${h >= 5 && h < 12 ? "morning" : h >= 12 && h < 18 ? "afternoon" : "evening"}, Joshua.`;
    expect(old(at(4, 59))).not.toBe(greeting(at(4, 59), "Joshua"));
    // One short line: one sentence, at most four words (a two-word name), at every hour.
    for (let h = 0; h < 24; h++) expect(greeting(h, "Ana María").split(/\s+/).length).toBeLessThanOrEqual(4);
    for (let h = 0; h < 24; h++) expect(greeting(h, null)).not.toMatch(/\?|begin/);
  });

  it("greeting_in_the_desk: one hunk, above the Ask box, and the hero line no longer carries the name", () => {
    const dk = code("web/src/desk/Desk.tsx");
    expect(dk).toMatch(/<Kept><Greeting \/><\/Kept>\s*\{askBox\}/);
    expect(dk).not.toMatch(/\bmyName\b|hiName|useName/);
    const g = code("web/src/voice/Greeting.tsx");
    expect(g).toMatch(/greeting\(hour, name\)/);
    expect(g).toMatch(/Forget my name/);
    expect(g).toMatch(/new Date\(\)\.getHours\(\)/); // the shopper's own clock, never the server's
  });
});

describe("042 the name never leaves this browser", () => {
  it("the recorder catches a planted leak (so a pass below means something)", async () => {
    await load();
    void fetch(`/api/hello?n=${NEEDLE}`);
    location.assign(`?who=${NEEDLE}`);
    console.log(NEEDLE);
    new Image().src = `https://x.example/p?${NEEDLE}`;
    expect(leaks()).toHaveLength(4);
  });

  it("name_never_sent: set by command and by the field, shown, used through every go-to, forgotten; no exit carries it", async () => {
    const { cmds, name, speech } = await load();
    // Said or typed into the Ask box.
    expect(cmds.pageCommand(`call me ${NEEDLE}`)).toEqual({ kind: "name", line: `Hi, ${NEEDLE}. ${NAME_HELLO}` });
    expect(name.readName()).toBe(NEEDLE);
    expect(greeting(20, name.readName())).toBe(`Good evening, ${NEEDLE}.`);
    // Every go-to, with the name kept: the addresses are fixed, so none can carry it.
    for (const w of ["show me my priorities list", "show me the proof", "behind the scenes", "my wallet", "the market", "go home"]) cmds.pageCommand(w);
    expect(out.filter((o) => o.startsWith("location.assign")).length).toBeGreaterThanOrEqual(5);
    // An ordinary ask isn't answered by the page (it goes to the server without the name, which only the greeting reads).
    expect(cmds.pageCommand("a kettle under $60")).toBeNull();
    // The Greeting's own field, and Goose's lines (fixed; the name is never spoken).
    name.keepName(NEEDLE.toLowerCase());
    speech.say(NAME_HELLO);
    expect(spoken.concat(played).join(" ")).not.toContain(NEEDLE);
    // Kept only under its key.
    expect([...store.keys()]).toEqual([NAME_KEY]);
    expect(cmds.pageCommand("forget my name")).toEqual({ kind: "name", line: NAME_FORGOT });
    expect(name.readName()).toBeNull();
    expect(store.has(NAME_KEY)).toBe(false);
    expect(leaks()).toEqual([]);
  });

  it("name_code_has_no_way_out: the greeting, the name and the commands carry no request, URL write or log", () => {
    for (const f of ["web/src/voice/Greeting.tsx", "web/src/name.ts", "web/src/commands.ts", "web/src/voice/captions.ts"]) {
      expect([f, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|new Image|["'`]\/api\/|console\.|history\.|searchParams|encodeURI|\.src\s*=/.test(code(f))]).toEqual([f, false]);
    }
    // The name field asks the browser not to remember it either (autofill can sync off the device).
    expect(code("web/src/voice/Greeting.tsx")).toMatch(/autoComplete="off"/);
  });
});

// ── "Show me my priorities list" ───────────────────────────────────────────────────────────────────────────────────
const WANTS = [
  "show me my priorities list", "Show me my priorities list.", "show me my priority list", "Hey Goose, show me my priorities list", "OK Goose, show me my priorities list please",
  "my priorities", "my priorities list", "priorities list", "the priorities list", "open my priorities", "go to my priorities list", "take me to my priorities", "can you show me my priorities list",
  "show me my list of priorities", "what's on my priorities list", "what are my priorities", "my wants", "show me my wants", "open your wants", "go to my wish list", "my wishlist",
];
const NOT_WANTS = ["priority", "priorities", "wants", "priority mail", "show me priority mail boxes", "a wish list notebook", "my priorities are price and speed", "I want a kettle", "what I want is a kettle", "priority shipping on a kettle", "a priority pass lounge"];

describe("042 'show me my priorities list' opens Your wants, typed or said", () => {
  it("wants_go_to_table: the phrase and its close variants open Wants; near misses stay asks", () => {
    for (const w of WANTS) expect([w, goToIntent(w)]).toEqual([w, "wants"]);
    for (const w of NOT_WANTS) expect([w, goToIntent(w)]).toEqual([w, null]);
    expect(GO_TO_HREF.wants).toBe("?desk=1#wants");
  });

  it("wants_from_another_page_loads_the_desk_room; on the Desk the room is offered in place first, else the page reloads there", async () => {
    // From the wallet: a plain navigation to the Desk's Wants address.
    let { cmds } = await load();
    Object.assign(location, { search: "?wallet=1", href: "http://localhost/?wallet=1" });
    expect(cmds.pageCommand("show me my priorities list")).toEqual({ kind: "go", line: null });
    expect(out).toEqual(["location.assign http://localhost/?desk=1#wants"]);
    // On the Desk, nobody takes the room: load the address (only the hash changes, so reload).
    out = [];
    Object.assign(location, { search: "?desk=1", href: "http://localhost/?desk=1" });
    cmds.pageCommand("show me my priorities list");
    expect(out).toEqual(["location.assign http://localhost/?desk=1#wants", "location.reload "]);
    // On the Desk with a listener that opens the room in place: no navigation at all.
    vi.resetModules();
    ({ cmds } = await load());
    out = [];
    const rooms: string[] = [];
    addEventListener(cmds.GO_ROOM_EVENT, (e) => { rooms.push((e as CustomEvent<string>).detail); e.preventDefault(); });
    cmds.pageCommand("my priorities");
    expect([rooms, out]).toEqual([["wants"], []]);
  });

  it("the mic's words reach the go-to the same way typed words do: the Desk and the wallet check pageCommand before any request", () => {
    const dk = read("web/src/desk/Desk.tsx");
    const dAsk = dk.slice(dk.indexOf("async function ask("), dk.indexOf("async function shop("));
    expect(dAsk.indexOf("pageCommand(w)")).toBeGreaterThan(0);
    expect(dAsk.indexOf("pageCommand(w)")).toBeLessThan(dAsk.indexOf("/api/"));
    // The Desk's mic only fills the box (HoldToTalk → onText → setWords), so a spoken go-to runs on the same Ask tap.
    expect(dk).toMatch(/onText=\{\(said\) => setWords\(/);
  });
});

// ── Voice is navigation only ───────────────────────────────────────────────────────────────────────────────────────
const NEVER = [
  "approve it", "pay now", "yes buy it", "raise my limit to 500", "raise my limit to $500", "approve", "Approve.", "yes", "yes please", "yes, approve it", "OK Goose, approve it",
  "approve the order", "approve the cart", "I approve", "confirm", "confirm it", "confirm the purchase", "confirm my order", "pay", "pay for it", "pay it now", "go ahead and pay",
  "tap approve", "press approve", "click approve", "complete the payment", "check out", "checkout now", "yes buy it now", "pay $500", "set my limit to $500", "increase my limit to 1000",
  "raise the limit", "remove my limit", "no limit", "approve and pay", "send the money", "capture the payment", "take my money",
];

describe("042 voice never approves, pays, raises a limit or confirms", () => {
  it("voice_never_approves: no spoken phrase is a go-to, a name, a buy, or a take-back", () => {
    for (const w of NEVER) {
      expect([w, goToIntent(w), nameCommand(w), voiceIntent(w), saidTakeBack(w)]).toEqual([w, null, null, null, false]);
    }
  });

  it("voice_never_approves_in_the_page: each phrase, said into the box, does nothing on the page (no navigation, no storage, no request)", async () => {
    const { cmds } = await load();
    for (const w of NEVER) expect([w, cmds.pageCommand(w)]).toEqual([w, null]);
    expect(out).toEqual([]);
    expect(store.size).toBe(0);
  });

  it("a spoken 'raise my limit' can't move the limit: the card's limit is code's, whatever the words say", () => {
    const strict = demoPolicy();
    const most = Math.max(...Object.values(strict.categoryLimit), strict.perPurchaseCap);
    for (const w of ["raise my limit to 500", "raise my limit to $500", "a kettle, raise my limit to $500", "increase my limit to 1000"]) {
      const card = understand(w, strict);
      expect([w, Number(card.limit) <= Number(fromCents(most)), Number(card.limit) < 500]).toEqual([w, true, true]);
    }
  });

  it("nothing the voice touches can reach Approve: the mic, captions, speech and commands have no pay, approve or limit path", () => {
    for (const f of ["web/src/voice/mic.ts", "web/src/voice/HoldToTalk.tsx", "web/src/voice/captions.ts", "web/src/voice/Greeting.tsx", "web/src/speech.ts", "web/src/commands.ts"]) {
      expect([f, /approve\(|complete_payment|\/cart|\/capture|capture_?payment|requestSubmit|\.submit\(|\.click\(\)|limit\s*[:=]/i.test(code(f))]).toEqual([f, false]);
    }
    // Every go-to address is a page of this app, with nothing that pays, runs or posts.
    for (const h of Object.values(GO_TO_HREF)) expect(h).not.toMatch(/approve|pay|cart|run|api|order|capture|\/\//i);
  });
});

// ── Captions and mute ──────────────────────────────────────────────────────────────────────────────────────────────
describe("042 captions always, and a mute toggle kept in this browser", () => {
  it("muted: no clip and no browser voice play, the choice is kept under its key, and unmuting plays again", async () => {
    const { speech } = await load();
    expect(speech.isMuted()).toBe(false);
    speech.setMuted(true);
    expect([...store]).toEqual([[speech.MUTE_KEY, "1"]]);
    speech.say(NAME_HELLO);
    speech.say("$47.73 at Reedbank. Tap Approve to buy.");
    await new Promise((r) => setTimeout(r, 0));
    expect([played, spoken]).toEqual([[], []]);
    vi.resetModules();
    const again = (await load()).speech; // a reload: still muted
    expect(again.isMuted()).toBe(true);
    again.setMuted(false);
    expect(store.size).toBe(0);
    again.say(NAME_HELLO);
    await new Promise((r) => setTimeout(r, 0));
    expect(played).toEqual(["voice/name-hello.m4a"]);
  });

  it("muted with storage blocked: muted for this page, nothing throws", async () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("SecurityError"); }, removeItem: () => { throw new Error("SecurityError"); } });
    const { speech } = await load();
    speech.setMuted(true);
    expect(speech.isMuted()).toBe(true);
    speech.say(NAME_HELLO);
    await new Promise((r) => setTimeout(r, 0));
    expect(played).toEqual([]);
  });

  it("captions: every line said shows its words (the caption module is told each line), muted or not, from its own chunk", () => {
    const sp = code("web/src/speech.ts");
    // The caption is shown before the muted check, so it shows either way.
    expect(sp.indexOf("caption(mine, (c) => c.show(line))")).toBeGreaterThan(0);
    expect(sp.indexOf("caption(mine, (c) => c.show(line))")).toBeLessThan(sp.indexOf("if (isMuted()) return;"));
    expect(sp).toMatch(/import\("\.\/voice\/captions\.ts"\)/); // a lazy chunk, loaded with the first line
    const cap = code("web/src/voice/captions.ts");
    expect(cap).toMatch(/setAttribute\("role", "status"\)/); // announced
    expect(cap).toMatch(/setAttribute\("aria-pressed", String\(m\)\)/); // a real toggle
    expect(cap).toMatch(/btn\.type = "button"/);
    const css = read("web/src/voice/captions.css");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*transition: none/);
    expect(css).toMatch(/min-height: 44px/);
    // Nothing on the first paint loads it.
    for (const f of ["web/src/main.tsx", "web/src/first-paint.tsx", "web/index.html"]) expect([f, /captions/.test(read(f))]).toEqual([f, false]);
  });

  it("every clip has a take, and the takes say the screen's words (only stops may differ)", () => {
    expect(Object.keys(CLIP_TAKES).sort()).toEqual(Object.values(CLIPS).sort());
    const words = (s: string) => s.toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter(Boolean);
    for (const [line, file] of Object.entries(CLIPS)) {
      const t = CLIP_TAKES[file]!;
      expect([file, t.speed >= 0.8 && t.speed <= 1.1]).toEqual([file, true]);
      if (t.say) expect([file, words(t.say)]).toEqual([file, words(line)]);
      expect(clipFor(line)).toBe(`voice/${file}.m4a`);
    }
  });
});

// ── Lead-9's additions after Joshua's iPhone re-test (A–C) ─────────────────────────────────────────────────────────
const MIC = "../../web/src/voice/mic.ts";
const ENGINE = "../../web/src/voice/engine.ts";
const DEBUG = "../../web/src/voice/debug.ts";
type MicMod = {
  createMic(o: { onState: (s: { kind: string }) => void; onText: (w: string) => void }): { press(): void; release(): void; state(): { kind: string } };
  micWords(s: unknown): string;
};
const IPHONE = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1", platform: "iPhone", maxTouchPoints: 5 };
const IPAD_DESKTOP = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15", platform: "MacIntel", maxTouchPoints: 5 };
const MAC = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36", platform: "MacIntel", maxTouchPoints: 0 };

/** The Desk mic, run for real against a fake browser and a fake engine: which backend it asks for, and the words it hands on. */
async function runMic(nav: object, heard = " Air plane tickets.") {
  const asked: (string | undefined)[] = [];
  vi.doMock(ENGINE, () => ({
    startEngine: (backend?: string) => {
      asked.push(backend);
      return {
        load: async () => ({ backend: backend ?? "webgpu", made: 1 }),
        transcribe: async () => ({ text: heard, ms: 1, seconds: 1, backend: backend ?? "webgpu", made: 1 }),
        dispose() {},
      };
    },
  }));
  let now = 0;
  vi.stubGlobal("performance", { now: () => now });
  const stream = { getTracks: () => [{ stop() {} }] };
  vi.stubGlobal("navigator", { ...nav, mediaDevices: { getUserMedia: async () => stream } });
  vi.stubGlobal("AudioContext", class {});
  vi.stubGlobal("MediaRecorder", class {
    static isTypeSupported() { return false; }
    mimeType = "audio/mp4"; onstop: (() => void) | null = null; ondataavailable: ((e: { data: Blob }) => void) | null = null;
    start() {} stop() { this.ondataavailable?.({ data: new Blob(["x"]) }); this.onstop?.(); }
  });
  const mic = (await import(/* @vite-ignore */ MIC)) as MicMod;
  const said: string[] = [];
  const m = mic.createMic({ onState: () => {}, onText: (w) => said.push(w) });
  const settle = () => new Promise((r) => setTimeout(r, 0));
  m.press(); m.release(); // the first press gets the mic ready
  for (let i = 0; i < 20 && m.state().kind !== "ready"; i++) await settle();
  m.press(); // hold…
  for (let i = 0; i < 20 && m.state().kind !== "listening"; i++) await settle();
  now = 1200; m.release(); // …and let go after 1.2 s
  for (let i = 0; i < 20 && said.length === 0; i++) await settle();
  return { asked, said, micWords: mic.micWords };
}

describe("042 A: the Desk mic takes the iPhone's WebAssembly-only path, pinned", () => {
  it("desk_mic_wasm_on_ios: on an iPhone and an iPad in desktop mode the Desk mic asks for WebAssembly; on a Mac, WebGPU first", async () => {
    expect((await runMic(IPHONE)).asked).toEqual(["wasm"]);
    vi.resetModules();
    expect((await runMic(IPAD_DESKTOP)).asked).toEqual(["wasm"]);
    vi.resetModules();
    expect((await runMic(MAC)).asked).toEqual([undefined]);
  });

  it("decided: the Desk shares no `diedDuring` (it keeps no log), and on iOS that choice can't matter", async () => {
    const { speechBackend } = await import("../src/ask/ondevice.ts");
    for (const died of [null, "webgpu", "wasm", "loading"] as const) {
      expect(speechBackend(IPHONE, died), String(died)).toBe("wasm");
      expect(speechBackend(IPAD_DESKTOP, died), String(died)).toBe("wasm");
    }
    const mic = code("web/src/voice/mic.ts");
    expect(mic).toMatch(/startEngine\(speechBackend\(navigator\)\)/);
    expect(mic).not.toMatch(/pageOpened|markBusy|readLog|addRun|localStorage|sessionStorage/);
  });

  it("?debug=voice: shows 'wasm · tiny.en' only with the param, and is handed the backend, never the words", async () => {
    const d = (await import(/* @vite-ignore */ DEBUG)) as { voiceDebugOn(s: string): boolean; debugLine(b: string): string };
    expect(d.debugLine("wasm")).toBe("wasm · tiny.en");
    expect(d.debugLine("webgpu")).toBe("webgpu · tiny.en");
    for (const s of ["?debug=voice", "?desk=1&debug=voice", "?debug=net,voice"]) expect(d.voiceDebugOn(s), s).toBe(true);
    for (const s of ["", "?desk=1", "?debug=voices", "?voice=debug", "?debug="]) expect(d.voiceDebugOn(s), s).toBe(false);
    // Every call in the mic passes a backend: the load's or the hold's, never `out.text` or the words.
    const calls = code("web/src/voice/mic.ts").match(/showVoiceDebug\([^;]*;/g) ?? [];
    expect(calls.length).toBe(2);
    for (const c of calls) { expect(c).toMatch(/\.backend\);$/); expect(c).not.toMatch(/\.text|words/); }
    // It writes only its own line's text, and reads only the address bar's search.
    expect(code("web/src/voice/debug.ts")).not.toMatch(/fetch|sendBeacon|localStorage|console\./);
  });
});

describe("042 B: the mic's line and the privacy line read as two sentences", () => {
  it("every mic state is a whole sentence, and the Desk shows the privacy line on its own line after it", async () => {
    const { micWords } = await runMic(MAC);
    for (const s of [{ kind: "off" }, { kind: "loading", pct: null }, { kind: "ready" }, { kind: "starting" }, { kind: "listening", tap: true }, { kind: "listening", tap: false }, { kind: "working" }]) {
      expect(micWords(s), JSON.stringify(s)).toMatch(/[.…]$/);
    }
    expect(micWords({ kind: "ready" })).toBe("Hold to talk, or tap to start.");
    const desk = code("web/src/desk/Desk.tsx");
    expect(desk).toMatch(/\{micLine\}<br \/><span>\{VOICE_LINE\}<\/span>/);
    expect(read("core/src/view/desk.ts")).toMatch(/VOICE_LINE = "[^"]+\.";/);
  });
});

describe("042 C: Whisper's words land in the Ask box as typed words would", () => {
  it("askWords: one trailing '.', '!' or '…' goes, a '?' stays, 'air plane' is one word", async () => {
    const { askWords, cleanHeard } = await import("../src/ask/ondevice.ts");
    const cases: [string, string][] = [
      [" Air plane tickets.", "Airplane tickets"],
      ["Find me a toaster that fits my kitchen.", "Find me a toaster that fits my kitchen"],
      ["Show me my priorities list!", "Show me my priorities list"],
      ["two air planes...", "two airplanes"],
      ["Find me headphones…", "Find me headphones"],
      ["Is this a scam?", "Is this a scam?"],
      ["Mossbell Inn. One night.", "Mossbell Inn. One night"],
      ["St. Louis", "St. Louis"],
      ["Thank you.", ""],
      [" [BLANK_AUDIO]", ""],
    ];
    for (const [heard, box] of cases) expect(askWords(heard), heard).toBe(box);
    // /voice-test-2 keeps Whisper's own words for its log.
    expect(cleanHeard(" Air plane tickets.")).toBe("Air plane tickets.");
  });

  it("the Desk mic hands the Ask box 'Airplane tickets', not 'Air plane tickets.'", async () => {
    expect((await runMic(IPHONE)).said).toEqual(["Airplane tickets"]);
  });
});

describe("042 review fixes (accessibility and voice reviewers)", () => {
  it("a Mute that is always there: Limits in code's toggle (DK: out of the hero, two taps from it) and the caption's share one choice", async () => {
    const g = code("web/src/desk/Panes.tsx");
    expect(g).toMatch(/onClick=\{\(\) => setMuted\(!muted\)\}>\{muted \? "Unmute Goose" : "Mute Goose"\}/);
    expect(g).toMatch(/onMuted\(now\)/);
    expect(code("web/src/voice/captions.ts")).toMatch(/onMuted\(paint\);/);
    const { speech } = await load();
    const seen: boolean[] = [];
    const stop = (speech as SpeechMod & { onMuted(fn: () => void): () => void }).onMuted(() => seen.push(speech.isMuted()));
    speech.setMuted(true); speech.setMuted(false); stop(); speech.setMuted(true);
    expect(seen).toEqual([true, false]);
  });

  it("the first line is heard: the live region is put on the page at the first tap and filled after it settles, once", () => {
    expect(code("web/src/speech.ts")).toMatch(/caption\(turn, \(c\) => c\.ready\(\)\)/);
    const c = code("web/src/voice/captions.ts");
    expect(c).toMatch(/export function ready\(\): void \{ if \(!bar\) build\(\); \}/);
    expect(c).toMatch(/FRESH_MS - \(performance\.now\(\) - builtAt\)/);
    expect(c).toMatch(/!saidElsewhere\(line\)/);
  });

  it("the caption bar lets taps through to the header and steps aside for keyboard focus it would cover", () => {
    const css = read("web/src/voice/captions.css");
    expect(css).toMatch(/\.gv-cap \{[^}]*pointer-events: none;/);
    expect(css).toMatch(/\.gv-mute \{\s*pointer-events: auto;/);
    expect(code("web/src/voice/captions.ts")).toMatch(/document\.addEventListener\("focusin"[\s\S]*?hide\(\);/);
  });

  it("the privacy line is read with the mic button; the name field's edge is visible; the error region is always there", () => {
    const h = code("web/src/voice/HoldToTalk.tsx");
    expect(h).toMatch(/aria-describedby=\{noteId\}/);
    expect(h).toMatch(/<span id=\{noteId\} style=\{HIDDEN\}>\{VOICE_LINE\}<\/span>/);
    expect(read("web/src/voice/greeting.css")).toMatch(/\.vg-input \{[^}]*border: 1px solid var\(--ink-3\)/);
    const g = code("web/src/voice/Greeting.tsx");
    expect(g).toMatch(/<p id="vg-err" className="vg-note vg-bad" role="alert">\{bad && said \? BAD_NAME : ""\}<\/p>/);
    // A second bad Save empties the alert and refills it on the next frame, so it is read out again.
    expect(g).toMatch(/setSaid\(false\); requestAnimationFrame\(\(\) => setSaid\(true\)\)/);
  });

  it("at every width the caption sits under the page's top header, so no header link is under its Mute", () => {
    const cap = code("web/src/voice/captions.ts");
    expect(cap).toMatch(/function place\(\): void \{\s*let top = "";\s*for \(const h of document\.querySelectorAll\("header"\)\)/);
    expect(cap).not.toMatch(/innerWidth <= 720/);
    expect(cap).toMatch(/if \(bar!\.hidden\) \{\s*place\(\);/);
  });

  it("the caption bar wears the Desk's tokens and glass, as the menu does: no colour or glass recipe of its own", () => {
    const css = read("web/src/voice/captions.css");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|blur\(/i);
    expect(css).toMatch(/background: var\(--glass-bg\)/);
    expect(css).toMatch(/backdrop-filter: var\(--glass-blur\)/);
    const tokens = read("web/src/desk/tokens.css");
    expect(tokens).toMatch(/^\.dk, \.gm-root, \.gv-cap(, #dk-case)? \{/m); // Track B lists the first-paint case here too
    expect(tokens).toMatch(/^\.dk\[data-palette(="v")?\], \.gm-root, \.gv-cap \{/m); // B's solid fallback covers every palette
    // It takes them from main.css, once: run.css @imports tokens.css for every page captions.ts can load on (speech.ts, the
    // main entry), and no chunk brings a second copy (Track F, Nov 5; core/test/tokens-once.test.ts holds the whole rule).
    expect(read("web/src/run.css")).toMatch(/^@import "\.\/desk\/tokens\.css";/m);
    expect(code("web/src/voice/captions.ts")).not.toMatch(/tokens\.css/);
    expect(read("web/src/voice/greeting.css")).not.toMatch(/font-size: \d+px/);
  });
});
