// Track F: the board's early answer. A shopper on a cold phone looked at an empty space under the hero for 2.1 s while the
// counter's two lines waited for React, the board's chunk and this one answer, none of which their words need.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { BOARD_PAINT, EARLY_BOARD } from "../../web/src/studio/early-board.ts";
import { challengeWords } from "../src/judge/count-words.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const text = (p: string) => readFileSync(join(ROOT, p), "utf8");
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

/** The first paint's counter, as much of it as the script touches. */
function paint() {
  const span = () => ({ textContent: "" });
  const classes: string[] = [];
  const h = { children: [span(), span()], classList: { add: (c: string) => classes.push(c) } };
  const second = { textContent: "" };
  return { h, second, classes, root: { querySelector: (s: string) => (s === "#tb-h" ? h : s === ".tb-second" ? second : null) } };
}

function boot(answer: () => Promise<unknown>, placed: ReturnType<typeof paint> | null) {
  const window: Record<string, unknown> = {};
  const asked: string[] = [];
  const seen: string[] = [];
  const box = { place: placed };
  const sandbox = {
    window,
    document: { querySelector: (s: string) => { seen.push(s); return box.place?.root ?? null; } },
    fetch: (u: string) => { asked.push(u); return answer(); },
  };
  vm.runInNewContext(EARLY_BOARD, sandbox);
  return { b: window.__board as { v: unknown; p: Promise<unknown>; f: () => void }, asked, seen, box };
}
const ok = (body: unknown) => () => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
const counts = (tried: number, setAside: number, paid: number) => ({ tried, setAside, paid, byPerson: tried, byAi: 0 });

describe("the board's early answer", () => {
  it("writes the server's words into the first paint, and asks once", async () => {
    const words = challengeWords(counts(0, 0, 0));
    const p = paint();
    const { asked } = boot(ok({ counts: counts(0, 0, 0), words }), p);
    await settle();
    expect(asked).toEqual(["/api/challenge"]);
    expect(p.h.children[0]!.textContent).toBe("No tries yet.");
    expect(p.h.children[1]!.textContent).toBe("");
    expect(p.second.textContent).toBe(words.second);
    expect(p.classes).toEqual([]);
  });

  it("splits the line as the board does, and a try that paid is the alarm from the first paint", async () => {
    const words = challengeWords(counts(3, 1, 1));
    const p = paint();
    boot(ok({ words }), p);
    await settle();
    expect(`${p.h.children[0]!.textContent}${p.h.children[1]!.textContent}`).toBe(words.line);
    expect(p.h.children[1]!.textContent).toBe("1 got it to pay.");
    expect(p.classes).toEqual(["alarm"]);
    expect(p.second.textContent).toBe(words.second);
  });

  it("an answer that beats the page waits, and the placing script writes it", async () => {
    const { b, box } = boot(ok({ words: challengeWords(counts(1, 1, 0)) }), null);
    await settle();
    const p = paint();
    box.place = p;
    b.f();
    expect(`${p.h.children[0]!.textContent}${p.h.children[1]!.textContent}`).toBe(challengeWords(counts(1, 1, 0)).line);
  });

  it.each([
    ["a refusal", () => Promise.resolve({ ok: false })],
    ["no network", () => Promise.reject(new Error("offline"))],
    ["a body that isn't JSON", () => Promise.resolve({ ok: true, json: () => Promise.reject(new Error("junk")) })],
    ["an unreadable record", ok({ counts: null, words: null })],
  ])("%s leaves the board's own words, and the page asks for itself", async (_what, answer) => {
    const p = paint();
    const { b } = boot(answer, p);
    await settle();
    expect(p.second.textContent).toBe("");
    expect(p.h.children[0]!.textContent).toBe("");
    expect((await b.p) ?? null).toEqual(_what === "an unreadable record" ? { counts: null, words: null } : null);
  });

  it("only ever writes to the first paint's own copy: React owns the one it draws", async () => {
    const { seen, b } = boot(ok({ words: challengeWords(counts(0, 0, 0)) }), paint());
    await settle();
    b.f();
    expect(new Set(seen)).toEqual(new Set([`[data-board="${BOARD_PAINT}"]`]));
    expect(text("web/src/studio/ThreatSlot.tsx")).not.toContain("BOARD_PAINT");
    expect(text("web/src/studio/ThreatSlot.tsx")).toContain('mark="room"');
  });
});

describe("what keeps it one board", () => {
  it("the server's words are the board's sentences, on the same fold", () => {
    expect(text("server/src/main.ts")).toMatch(/words: counts && challengeWords\(counts, counts\.byAi > 0\)/);
  });

  it("the page adopts the answer, so one moment costs one request", () => {
    const src = text("web/src/studio/threat-state.tsx");
    expect(src).toContain("window.__board?.p");
    expect(src).toContain("readBoard(window.__board?.v)");
  });

  it("before an answer the first lines claim nothing: no count and no promise", () => {
    const src = text("web/src/studio/BoardFirst.tsx");
    expect(src).toContain("BOARD_LOADING");
    expect(src).toContain('{words?.second ?? ""}');
    expect(src).not.toMatch(/Watcher|your tap|No tries/);
  });

  it("the first lines' rules land with the page, not with the board's chunk", () => {
    const first = text("web/src/studio/threat-first.css");
    const rest = text("web/src/studio/threat.css");
    for (const rule of [".tb-card {", ".tb-line {", ".tb-second {", ".tb-try {", ".tb-eye {"]) {
      expect(first, rule).toContain(rule);
      expect(rest, rule).not.toContain(`\n${rule}`);
    }
  });

  it("the ledger's first chunk reads the first lines' words alone, never the board's whole vocabulary", () => {
    expect(text("web/src/studio/BoardFirst.tsx")).not.toContain("threat-words");
    expect(text("web/src/studio/board-first-words.ts")).not.toMatch(/^import /m);
  });

  it("the status line sits out of flow, so the board doesn't move when it goes", () => {
    expect(text("web/src/ledger/ledger.css")).toMatch(/\.lx-status \{ position: absolute;/);
  });
});
