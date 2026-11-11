// 034 (Joshua's 12:15 queue, built inside the design freeze): the name greeting kept in this browser only, go-to
// commands that only navigate, and Goose's fixed lines from clips recorded offline with Kokoro.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GO_TO_HREF, goToIntent, voiceIntent, type GoTo } from "../src/ask/voice.ts";
import { NAME_FORGOT, NAME_HELLO, NAME_KEY, NAME_MAX, NameKeeper, hiName, nameCommand, tidyName, withName, type NameStorage } from "../src/view/name.ts";
import { CLIPS, CLIP_EXT, CLIP_MAX_BYTES, clipFor } from "../src/ask/clips.ts";
import { TAP_TO_BUY } from "../src/ask/copy.ts";

const root = new URL("../../", import.meta.url);
const read = (f: string) => readFileSync(new URL(f, root), "utf8");
/** The code alone: a comment saying what a file can't do mustn't trip a check. */
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");

// ── Go-to commands ─────────────────────────────────────────────────────────────────────────────────────────────────
const GOES: readonly (readonly [string, GoTo])[] = [
  ["show me the proof", "proof"], ["Show me the proof.", "proof"], ["go to proof", "proof"], ["go to the proof", "proof"], ["proof", "proof"],
  ["open the proof panel", "proof"], ["Hey Goose, show me the proof", "proof"], ["take me to the proof please", "proof"], ["can you show me the proof", "proof"],
  ["behind the scenes", "ledger"], ["Behind the scenes.", "ledger"], ["show me behind the scenes", "ledger"], ["go behind the scenes", "ledger"],
  ["what's behind the scenes", "ledger"], ["ledger", "ledger"], ["open the ledger", "ledger"], ["show me the ledger", "ledger"], ["go to the ledger", "ledger"],
  ["my wallet", "wallet"], ["go to my wallet", "wallet"], ["open the wallet", "wallet"], ["show me my wallet", "wallet"], ["take me to my wallet", "wallet"], ["go to wallet", "wallet"],
  ["market", "market"], ["the market", "market"], ["go to the market", "market"], ["open the market", "market"], ["show me the market", "market"], ["OK Goose, open the market!", "market"],
  ["home", "home"], ["Home.", "home"], ["go home", "home"], ["go back home", "home"], ["take me home", "home"], ["the home page", "home"], ["go to the home page", "home"],
];
// Ambiguous or an ask: these fall through to the Ask route as before.
const ASKS = [
  "wallet", "a wallet", "wallets under $30", "a black leather wallet", "show me a wallet", "show me wallets", "buy a wallet",
  "show me the market price of a kettle", "market price for a kettle", "farmers market tickets", "home decor", "a home speaker", "show me homes",
  "proof of purchase", "show me proof it works", "a ledger notebook", "the ledger book I saw", "behind the scenes tour tickets",
  "a black kettle like mine", "A Marsh Lights ticket under $90", "Running shoes", "I saw it for $55",
];
const BUY_OR_NO = ["buy this right now", "buy it", "get me one now", "not this one", "no", "cancel", "stop", "wait", "yes", "yes, buy it", "approve", "pay", "do it", "take it back"];

describe("034 go-to commands only navigate", () => {
  it("go_to_table: each phrase opens its page", () => {
    for (const [w, to] of GOES) expect([w, goToIntent(w)]).toEqual([w, to]);
  });

  it("go_to_ambiguous_falls_through: asks, and a bare \"wallet\" (something to shop for), are never a go-to", () => {
    for (const w of ASKS) expect([w, goToIntent(w)]).toEqual([w, null]);
  });

  it("go_to_never_buys_declines_or_approves: no go-to is a voice command, and no buy, no or yes is a go-to", () => {
    for (const [w] of GOES) expect([w, voiceIntent(w)]).toEqual([w, null]);
    for (const w of BUY_OR_NO) expect([w, goToIntent(w)]).toEqual([w, null]);
  });

  it("go_to_hrefs_are_pages_only: every address is one of the app's own pages, with nothing that pays, runs or posts", () => {
    expect(GO_TO_HREF).toEqual({ proof: "?desk=proof", ledger: "?desk=ledger", wallet: "?wallet=1", market: "?market=1", home: "", wants: "?desk=1#wants" });
    for (const h of Object.values(GO_TO_HREF)) expect(h).not.toMatch(/approve|pay|cart|run|api|order|capture|\/\//i);
  });

  it("the page answers go-to and name words before any request, and navigates only to GO_TO_HREF", () => {
    const cmds = code("web/src/commands.ts");
    // Track V (042): one `go` that only ever loads a GO_TO_HREF address (or offers a Desk room in place first).
    expect([...new Set(cmds.match(/location\.\w+/g))].sort()).toEqual(["location.assign", "location.href", "location.pathname", "location.reload", "location.search"]);
    expect(cmds).toMatch(/^    go\(GO_TO_HREF\[to\]\);$/m);
    expect(cmds.match(/(?<!function )\bgo\(/g)).toHaveLength(1);
    expect(cmds).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|["'`]\/api\/|console\.|approve|\.click\(|requestSubmit/);
    // AskGoose: the command is checked inside ask(), after the tap primes speech and before take-back, voice and read().
    const ag = read("web/src/AskGoose.tsx");
    const askFn = ag.slice(ag.indexOf("async function ask("), ag.indexOf("async function forgetChip("));
    const at = askFn.indexOf("pageCommand(words)");
    expect(at).toBeGreaterThan(0);
    for (const later of ["saidTakeBack(", "voiceIntent(", "await read(", "markTried("]) expect([later, askFn.indexOf(later) > at]).toEqual([later, true]);
    // The Desk: inside ask(), before the request that reads the words.
    const dk = read("web/src/desk/Desk.tsx");
    const dAsk = dk.slice(dk.indexOf("async function ask("), dk.indexOf("async function shop("));
    expect(dAsk.indexOf("pageCommand(w)")).toBeGreaterThan(0);
    expect(dAsk.indexOf("pageCommand(w)")).toBeLessThan(dAsk.indexOf("/api/runs/market/understand"));
  });
});

// ── The name ───────────────────────────────────────────────────────────────────────────────────────────────────────
const SETS: readonly (readonly [string, string])[] = [
  ["call me Sam", "Sam"], ["Call me sam.", "Sam"], ["my name is Sam", "Sam"], ["My name's Ana María", "Ana María"], ["hey Goose, call me Mary-Jane", "Mary-Jane"],
  ["my name is O’Neil", "O'Neil"], ["call me Sam please", "Sam"], ["please call me McKenzie!", "McKenzie"], ["my name is José", "José"],
];
const NOT_NAMES = [
  "call me when it drops", "call me back", "call me a cab", "call me when the kettle is under $50", "my name is not important", "call me",
  "my name is Sam and I want a kettle", "call me Sam123", "call me <b>Sam</b>", "call me https://x.y", "my name is Robert Paulson Junior", "I'm Sam",
  "call me maybe", "a kettle called Sam", "forget it", "forget my wants", `call me ${"A".repeat(NAME_MAX + 1)}`,
];
const FORGETS = ["forget my name", "Forget my name.", "please forget my name", "hey Goose, delete my name", "clear my name please"];

describe("034 the name stays in this browser", () => {
  it("name_command_table: call me / my name is keep a tidied name; forget my name forgets; anything else is an ask", () => {
    for (const [w, n] of SETS) expect([w, nameCommand(w)]).toEqual([w, { kind: "set", name: n }]);
    for (const w of FORGETS) expect([w, nameCommand(w)]).toEqual([w, { kind: "forget" }]);
    for (const w of NOT_NAMES) expect([w, nameCommand(w)]).toEqual([w, null]);
    // A name command is never a voice command or a go-to, and a voice command is never a name.
    for (const [w] of SETS) expect([w, voiceIntent(w), goToIntent(w)]).toEqual([w, null, null]);
    for (const w of BUY_OR_NO) expect([w, nameCommand(w)]).toEqual([w, null]);
  });

  it("greeting: the existing line with the name in it, and unchanged with none", () => {
    expect(withName("What should Goose find?", "Sam")).toBe("What should Goose find, Sam?");
    expect(withName("Want something else?", "Ana María")).toBe("Want something else, Ana María?");
    expect(withName("What should Goose find?", null)).toBe("What should Goose find?");
    expect(hiName("Tell Goose what you want.", "Sam")).toBe("Hi, Sam. Tell Goose what you want.");
    expect(hiName("Tell Goose what you want.", null)).toBe("Tell Goose what you want.");
  });

  it("keeper: kept in storage under its key, read back on a new page, and forgotten", () => {
    const store = new Map<string, string>();
    const s: NameStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) };
    const a = new NameKeeper(() => s);
    expect(a.read()).toBeNull();
    expect(a.set("sam")).toBe("Sam");
    expect([...store]).toEqual([[NAME_KEY, "Sam"]]);
    expect(new NameKeeper(() => s).read()).toBe("Sam"); // a reload
    a.forget();
    expect(store.size).toBe(0);
    expect(new NameKeeper(() => s).read()).toBeNull();
    // Not a name: nothing changes.
    a.set("Sam");
    expect(a.set("call me later")).toBe("Sam");
    // A hand-edited or junk value reads as no name.
    store.set(NAME_KEY, "<script>x</script>");
    expect(new NameKeeper(() => s).read()).toBeNull();
  });

  it("keeper_storage_blocked: every touch throws, and the page still works for this visit", () => {
    const boom = (): NameStorage => { throw new Error("SecurityError"); };
    const k = new NameKeeper(boom);
    expect(k.read()).toBeNull();
    expect(k.set("Sam")).toBe("Sam");
    expect(k.read()).toBe("Sam");
    k.forget();
    expect(k.read()).toBeNull();
    // Storage that reads but can't remove: this page shows no name after a forget.
    const store = new Map([[NAME_KEY, "Sam"]]);
    const stuck = new NameKeeper(() => ({ getItem: (x) => store.get(x) ?? null, setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("blocked"); } }));
    expect(stuck.read()).toBe("Sam");
    stuck.forget();
    expect(stuck.read()).toBeNull();
  });

  it("tidyName: one or two words of letters only", () => {
    for (const bad of ["", " ", "Sam1", "S@m", "a b c", "the", "Goose", "now"]) expect([bad, tidyName(bad)]).toEqual([bad, null]);
  });

  it("name_never_sent: the page's name code has no way out, and nothing puts it in a request, a URL or a log", () => {
    for (const f of ["web/src/name.ts", "web/src/commands.ts", "core/src/view/name.ts", "web/src/site/live/said.ts"]) {
      expect([f, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|["'`]\/api\/|console\.|history\.|searchParams|encodeURI/.test(code(f))]).toEqual([f, false]);
    }
    // Only the greeting reads it: the name module is imported by the commands, the Desk and the wallet, nothing else.
    const web = (d: string): string[] => readdirSync(new URL(d, root), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? web(`${d}${e.name}/`) : /\.tsx?$/.test(e.name) ? [`${d}${e.name}`] : []));
    const users = web("web/src/").filter((f) => /from "(?:\.\.?\/)+name\.ts"|@goose\/core\/name/.test(read(f))).sort();
    expect(users).toEqual(["web/src/Wallet.tsx", "web/src/commands.ts", "web/src/desk/Panes.tsx", "web/src/name.ts", "web/src/site/live/said.ts", "web/src/voice/Greeting.tsx"]);
    // Settings' voice rows (S1, for Track V): the name reaches only the row's text and its Forget button, never a request.
    const rows = code("web/src/desk/Panes.tsx").split("function VoiceRows()")[1]!;
    expect(rows).not.toMatch(/\bjson\s*\(|\bfetch\s*\(|useGet|console\.|searchParams|encodeURI/);
    expect(rows.match(/\bname\b(?=\s*[)?;&=}])/g)).toEqual(["name", "name", "name", "name"]);
    // Where it is read, it only reaches the greeting's text.
    expect(code("web/src/Wallet.tsx").match(/\bmyName\b.*/g)).toEqual(["myName = useName();", expect.stringMatching(/^myName\)\} market=/)]);
    // The Greeting (Track V; one short line since DK): the kept name feeds the greeting line, nothing else. The name row in Limits in code (NameField) reads it as `kept` from the pane, for the choice of button only.
    const g = code("web/src/voice/Greeting.tsx");
    expect(g.match(/\bname\b(?=\s*[)?=])/g)).toEqual(["name", "name"]);
    expect(g.match(/\bkept\b/g)).toEqual(["kept", "kept", "kept"]); // the prop, its type, the one choice
    expect(g).toMatch(/const name = useName\(\);/);
    expect(g).toMatch(/\{greeting\(hour, name\)\}/);
    // The spoken lines never carry the name: they are fixed, and the shown line adds it.
    for (const l of [NAME_HELLO, NAME_FORGOT]) expect(clipFor(l)).not.toBeNull();
  });
});

// ── The recorded voice ─────────────────────────────────────────────────────────────────────────────────────────────
describe("034 Goose's fixed lines play from Kokoro clips", () => {
  const dir = new URL("web/public/voice/", root);

  it("clips_exist_and_are_small: every fixed line has its file, each under the cap, and no stray file ships", () => {
    const want = Object.values(CLIPS).map((f) => `${f}${CLIP_EXT}`).sort();
    expect(readdirSync(dir).sort()).toEqual(want);
    for (const f of want) {
      const size = statSync(new URL(f, dir)).size;
      expect([f, size > 1000 && size <= CLIP_MAX_BYTES]).toEqual([f, true]);
    }
    expect(clipFor(TAP_TO_BUY)).toBe("voice/tap-approve.m4a");
    expect(clipFor("$47.73 at Reedbank. Tap Approve to buy.")).toBeNull(); // a cart line: the browser's voice
    expect(clipFor("toString")).toBeNull();
  });

  it("speech_loads_audio_only_after_a_tap_and_falls_back: no audio at import, and a failed clip uses the browser's voice", () => {
    const sp = code("web/src/speech.ts");
    // The one audio element is made inside a function only (never at import, so never at first paint).
    expect(sp.match(/new Audio\(/g)).toHaveLength(1);
    expect(sp).toMatch(/const audio = \(\): HTMLAudioElement \| null => \{[\s\S]*new Audio\(\)/);
    expect(sp).toMatch(/^let player: HTMLAudioElement \| null = null;$/m);
    // A clip that errors or is refused falls back to speechSynthesis, once, unless a newer line started.
    expect(sp).toMatch(/a\.onerror = fallback;/);
    expect(sp).toMatch(/a\.play\(\)\.catch\(fallback\);/);
    expect(sp).toMatch(/if \(!fellBack && mine === turn\) \{ fellBack = true; speak\(line, done\); \}/);
    expect(sp).not.toMatch(/\bfetch\s*\(|preload|\.load\(\)|location\.|approve|\.click\(/);
    // Nothing in the first paint's own files touches speech.
    for (const f of ["web/src/main.tsx", "web/src/first-paint.tsx", "web/index.html"]) expect([f, /speech|voice\//.test(read(f))]).toEqual([f, false]);
  });
});
