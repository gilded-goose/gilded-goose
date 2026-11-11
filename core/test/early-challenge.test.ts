// Track F (Nov 6): arriving at #challenge on a cold phone, the counter's two lines (the largest thing on the screen) came at
// 2.9 s on live, after the story's chunk, the Challenge's chunk and its own read. The head now asks for the public record
// and the room's cover draws the server's words; the Challenge starts from the same counts, and its feed adopts the answer.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { CHALLENGE_FILL, EARLY_CHALLENGE } from "../../web/src/desk/story/early-challenge.ts";
import { CH_COUNT_RULES, roomFirstCss } from "../../web/src/desk/room-heads.ts";
import { challengeWords } from "../src/judge/count-words.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const counts = (tried: number, setAside: number, paid: number) => ({ tried, setAside, paid, byPerson: tried, byAi: 0 });
const ok = (body: unknown) => () => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

/** The cover's counter, as first-paint.tsx draws it: p.ds-ch-line (two spans), then p.ds-ch-second. */
function cover() {
  const tries = { textContent: "" }, outcome = { textContent: "" }, second = { textContent: "" };
  const attrs: string[] = [];
  return { tries, outcome, second, attrs, el: { firstChild: { childNodes: [tries, outcome] }, lastChild: second, setAttribute: (a: string) => attrs.push(a) } };
}

function run(room: string, answer: () => Promise<unknown>, placed: ReturnType<typeof cover> | null) {
  const window: Record<string, unknown> = {};
  const asked: string[] = [];
  const seen: string[] = [];
  const sandbox = { window, N: room, fetch: (u: string) => { asked.push(u); return answer(); }, document: { querySelector: (s: string) => { seen.push(s); return placed?.el ?? null; } } };
  vm.runInNewContext(EARLY_CHALLENGE, sandbox);
  const place = () => vm.runInNewContext(`(function(){${CHALLENGE_FILL}})()`, sandbox);
  return { c: window.__chal as { v: unknown; p?: Promise<unknown> } | undefined, asked, seen, place };
}

describe("the Challenge's early answer", () => {
  it("asks once, only on a #challenge arrival, and keeps the answer for the page", async () => {
    const body = { counts: counts(0, 0, 0), attempts: [], cut: false, words: challengeWords(counts(0, 0, 0)) };
    const { c, asked } = run("challenge", ok(body), null);
    await settle();
    expect(asked).toEqual(["/api/challenge"]);
    expect(c!.v).toEqual(body);
    expect(await c!.p).toEqual(body);
    for (const room of ["wants", "week", "after", "settings", "kept"]) {
      const other = run(room, ok(body), null);
      expect([room, other.asked, other.c]).toEqual([room, [], undefined]);
    }
  });

  it("a failed answer is null, never a throw: no network, a 503, broken JSON", async () => {
    for (const answer of [() => Promise.reject(new Error("offline")), () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }), () => Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError("x")) })]) {
      const { c } = run("challenge", answer, null);
      expect(await c!.p).toBeNull();
      expect(c!.v).toBeNull();
    }
  });

  it("the fill writes the server's words into the cover, split as the Counter splits them, with the alarm", async () => {
    for (const fold of [counts(0, 0, 0), counts(3, 1, 0), counts(3, 1, 1)]) {
      const words = challengeWords(fold);
      const p = cover();
      const { place, seen } = run("challenge", ok({ counts: fold, words }), p);
      place();
      await settle();
      expect(seen).toEqual(["#dk-room-first .ds-ch-count"]);
      expect(p.tries.textContent).toBe(words.tries);
      expect(p.outcome.textContent).toBe(words.outcome ?? "");
      expect(p.second.textContent).toBe(words.second);
      expect(p.attrs).toEqual(words.alarm ? ["data-alarm"] : []);
    }
  });

  it("the fill leaves a lifted cover and a wordless answer alone", async () => {
    const lifted = run("challenge", ok({ words: challengeWords(counts(1, 1, 0)) }), null);
    lifted.place();
    await settle();
    expect(lifted.seen).toEqual(["#dk-room-first .ds-ch-count"]);
    const p = cover();
    const empty = run("challenge", ok({ counts: null, words: null }), p);
    empty.place();
    await settle();
    expect([p.tries.textContent, p.second.textContent, p.attrs]).toEqual(["", "", []]);
    // Not a #challenge arrival: there's no answer to wait on.
    const none = run("wants", ok({}), p);
    expect(() => none.place()).not.toThrow();
  });

  it("the cover's words are the Counter's words: both are challengeWords on the same fold, scammer by its rows", () => {
    expect(read("server/src/main.ts")).toMatch(/app\.get\("\/api\/challenge"[\s\S]{0,400}words: counts && challengeWords\(counts, counts\.byAi > 0\)/);
    expect(read("web/src/desk/story/Challenge.tsx")).toContain("const words = challengeWords(counts, counts.byAi > 0);");
    // And the boxes the fill walks are the ones the cover draws.
    expect(read("web/src/desk/first-paint.tsx")).toContain('<div className="ds-ch-count"><p className="ds-ch-line"><span /><span className="ds-ch-outcome" /></p><p className="ds-ch-second" /></div>');
  });

  it("the Challenge starts from the early counts (never while away), and the feed's first read is the head's", () => {
    const ch = read("web/src/desk/story/Challenge.tsx");
    expect(ch).toContain("useState<ChallengeCounts | null>(() => readBoard(window.__chal?.v)?.counts ?? null)");
    expect(ch).toContain("<Counter counts={status?.challenge ?? (away ? null : early)} ");
    expect(read("web/src/desk/story/ChallengeFeed.tsx")).toMatch(/const early = await takeEarlyChallenge\(\);\s+const r = early \? null : await fetch\("\/api\/challenge"/);
  });

  it("the gate asks in the room's branch, and the fill runs where the cover goes in", () => {
    const prerender = read("web/prerender.ts");
    expect(prerender).toMatch(/window\.__room=fetch\([^`]*\$\{EARLY_CHALLENGE\}\$\{EARLY_WANTS\}\$\{fillAsk\(JSON\.stringify\(base \+ ROOM_FILL_FILE\)\)\}\}`/);
    // The fill itself is in its own file now, met by the placer's mark (room-fill.ts; room-fill.test.ts runs the meeting).
    expect(prerender).toContain("document.body.append(x.content);${FILL_PLACED}}});return}");
    expect(prerender).toContain("writeFileSync(join(dist, ROOM_FILL_FILE), roomFillFile(CHALLENGE_FILL + WANTS_FILL));");
  });
});

describe("nothing under a room's cover outbids it", () => {
  it("the landing's hero is hidden while the cover is up, by a rule in the cover's own file, so it goes when the cover goes", () => {
    // The browser counts a covered paint: the hero's headline (16,071 px²) beat the counter (15,268 px²) at 2.3 s.
    expect(roomFirstCss()).toContain("#root .dk-hero{visibility:hidden}");
    expect(read("web/prerender.ts")).toContain("`${m}<style>${roomFirstCss()}</style>${links}`");
    expect(read("web/src/desk/room-first.ts")).toContain('document.getElementById("dk-room-first")?.remove();');
    // The headline and the egg are the hero's (story/index.tsx Landing), and focus goes to the room's head, never the hero's.
    expect(read("web/src/desk/story/index.tsx")).toMatch(/className=\{?["`]dk-hero/);
  });
});

describe("the Challenge's cover draws its counter as the Challenge does", () => {
  /** challenge.css's rules for a selector, in source order, with `.ds-ch ` in front taken off (the cover has no section). */
  const sheet = (sel: string) => {
    const out: Record<string, string> = {};
    for (const m of top().matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!m[1]!.split(",").map((s) => s.trim().replace(/^\.ds-ch /, "")).includes(sel)) continue;
      for (const d of m[2]!.split(";")) { const [k, ...v] = d.split(":"); if (k?.trim()) out[k.trim()] = v.join(":").trim(); }
    }
    return out;
  };
  const css = () => read("web/src/desk/story/challenge.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const MEDIA = /@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g;
  /** The sheet's rules at every width: its @media blocks taken out (none of them may touch the counter, below). */
  const top = () => css().replace(MEDIA, "");
  it("no width the cover draws its counter at changes the counter, so one set of rules is the cover's", () => {
    const media = css().match(MEDIA) ?? [];
    expect(media.length).toBeGreaterThan(0);
    // Up to 960 px the room moves its tally under the form (push 17): the cover draws no counter at those widths.
    const narrow = /^@media \(max-width: 960px\)/;
    for (const block of media.filter((b) => !narrow.test(b))) expect(block).not.toMatch(/\.ds-ch-(count|line|outcome|second)\b/);
    expect(media.some((b) => narrow.test(b) && /\.ds-ch-tally \{ order: 3; \}/.test(b))).toBe(true);
    expect(roomFirstCss()).toContain("@media (max-width:960px){#dk-room-first .ds-ch-count{display:none}}");
  });
  it("each of the cover's rules is challenge.css's own, as it ends up", () => {
    const css = roomFirstCss();
    for (const rule of CH_COUNT_RULES) {
      const [, sel, body] = /^([^{]+)\{(.*)\}$/.exec(rule)!;
      const mine = Object.fromEntries(body!.split(";").map((d) => { const [k, ...v] = d.split(":"); return [k!.trim(), v.join(":").trim()]; }));
      expect([sel, mine]).toEqual([sel, sheet(sel!)]);
      expect(css).toContain(`#dk-room-first ${rule}`);
    }
    // The line's balance comes from a later rule; reading only the first would have kept "pretty".
    expect(sheet(".ds-ch-line")["text-wrap"]).toBe("balance");
  });
  it("from 961 px its width is hero.css's first column", () => {
    const hero = read("web/src/desk/story/hero.css");
    expect(hero).toContain(".ds-ch { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); column-gap: var(--s-8);");
    expect(hero).toContain("@media (max-width: 960px) {\n  .ds-ch { grid-template-columns: minmax(0, 1fr);");
    expect(roomFirstCss()).toContain("@media (min-width:961px){#dk-room-first [data-room-head=challenge]{max-width:calc((100% - var(--s-8)) / 2.25)}}");
  });
});
