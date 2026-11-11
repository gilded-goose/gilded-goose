// Track F (Nov 6): arriving at #wants on a cold phone, the list's closing line (its largest paint) came about 2 s in, once
// the Desk's code, the pane's chunk and its two reads had come one after another. The head now asks for both reads, the
// room's cover draws a new visitor's empty list and shows it only when the answers say the room will draw exactly that,
// and the pane starts from the same answers.
import { readFileSync, readdirSync, statSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { EARLY_WANTS, WANTS_FILL, WANTS_HERO, WANTS_READS, dropEarlyGet, earlyGet } from "../../web/src/desk/early-wants.ts";
import { CHALLENGE_FILL, EARLY_CHALLENGE } from "../../web/src/desk/story/early-challenge.ts";
import { WANTS_SUB, roomFirstCss } from "../../web/src/desk/room-heads.ts";
import { demoCatalogItems, demoPolicy } from "../src/index.ts";
import { SHELF_SAID, shelfFor } from "../src/view/shelf.ts";
import { PINGS_HERE } from "../src/view/watching-words.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };
const ok = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
const SHELF = shelfFor([], demoCatalogItems(), demoPolicy());
const HERO = SHELF.cards.find((c) => c.catalogId === WANTS_HERO)!;
const NEW = { wants: [], watching: [], real: [] };

/** The cover's empty list as first-paint.tsx draws it, and the room's sheets in the head. */
function cover(o: { title?: string; price?: string; said?: string; sheets?: { sheet: unknown; onload?: () => void }[] } = {}) {
  const attrs: string[] = [];
  const f = { getAttribute: (a: string) => (a === "data-id" ? WANTS_HERO : null), firstChild: { textContent: o.title ?? HERO.title }, querySelector: () => ({ value: o.price ?? String(HERO.max / 100) }) };
  const t = { textContent: `${PINGS_HERE} ${o.said ?? SHELF_SAID}` };
  return { attrs, sheets: o.sheets ?? [{ sheet: {} }, { sheet: {} }], el: { querySelector: (s: string) => (s === ".dk-watch-first" ? f : s === ".dk-watch-said" ? t : null), setAttribute: (a: string) => attrs.push(a) } };
}

function run(room: string, answers: Record<string, () => Promise<unknown>>, placed: ReturnType<typeof cover> | null) {
  const window: Record<string, unknown> = {};
  const asked: { u: string; init: unknown }[] = [];
  const sandbox = {
    window, N: room, Promise,
    fetch: (u: string, init?: unknown) => { asked.push({ u, init }); return answers[u]!(); },
    document: { getElementById: (id: string) => (id === "dk-room-first" ? placed?.el ?? null : null), querySelectorAll: () => placed?.sheets ?? [] },
  };
  vm.runInNewContext(EARLY_WANTS, sandbox);
  const place = () => vm.runInNewContext(`(function(){${WANTS_FILL}})()`, sandbox);
  return { e: window.__wants as Record<string, { v: unknown; p: Promise<unknown> }> | undefined, asked, place };
}
const both = (w: unknown, s: unknown) => ({ [WANTS_READS[0]]: () => ok(w), [WANTS_READS[1]]: () => ok(s) });

describe("the head's snippets, joined as the build joins them", () => {
  it("parse as one script: each one parsing alone isn't enough", () => {
    // The build joined the Challenge's fill and this one with nothing between, and its minifier refused the page.
    const pre = read("web/prerender.ts");
    const joins: [string, string, string][] = [["${EARLY_CHALLENGE}${EARLY_WANTS}", EARLY_CHALLENGE, EARLY_WANTS], ["roomFillFile(CHALLENGE_FILL + WANTS_FILL)", CHALLENGE_FILL, WANTS_FILL]];
    for (const [at, a, b] of joins) {
      expect(pre).toContain(at);
      expect(() => new Function("N", "x", a + b)).not.toThrow();
      // And after whatever comes before them in their script.
      expect(() => new Function("N", "x", `x.y();${a}${b}`)).not.toThrow();
    }
  });
});

describe("Your wants' early answers", () => {
  it("asks for the pane's two reads once each, only on a #wants arrival, with the browser's own cookie", async () => {
    const { e, asked } = run("wants", both(NEW, SHELF), null);
    await settle();
    expect(asked).toEqual([{ u: "/api/runs/wants", init: undefined }, { u: "/api/runs/shelf", init: undefined }]);
    expect(e!["/api/runs/wants"]!.v).toEqual(NEW);
    expect(e!["/api/runs/shelf"]!.v).toEqual(SHELF);
    for (const room of ["challenge", "week", "after", "settings", "kept"]) {
      const other = run(room, both(NEW, SHELF), null);
      expect([room, other.asked, other.e]).toEqual([room, [], undefined]);
    }
    // The pane's reads are these two, in this order: a third read in the pane would be asked late again.
    expect(read("web/src/desk/Panes.tsx")).toContain('useGet<Wants>("/api/runs/wants", true);\n  // Each want');
    expect(read("web/src/desk/Panes.tsx")).toContain('const [shelf] = useGet<Shelf>("/api/runs/shelf", true);\n  const sceneOf');
    // Only Your wants takes them: Settings reads the same wants for itself.
    expect(read("web/src/desk/Panes.tsx").match(/useGet<\w+>\("[^"]+", true\)/g)).toHaveLength(2);
  });

  it("a failed answer is null, never a throw: no network, a 503, broken JSON", async () => {
    for (const bad of [() => Promise.reject(new Error("offline")), () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }), () => Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError("x")) })]) {
      const { e } = run("wants", { [WANTS_READS[0]]: bad, [WANTS_READS[1]]: bad }, null);
      for (const u of WANTS_READS) { expect(await e![u]!.p).toBeNull(); expect(e![u]!.v).toBeNull(); }
    }
  });

  it("a render looks, the mounted pane drops: a render React throws away can't lose the answer, a later mount asks for itself", () => {
    const g = globalThis as { __wants?: Record<string, unknown> };
    const one = { v: NEW, p: Promise.resolve(NEW) };
    g.__wants = { "/api/runs/wants": one };
    // The bug: the first render took it, React kept the second, and the page asked twice.
    expect(earlyGet("/api/runs/wants")).toBe(one);
    expect(earlyGet("/api/runs/wants")).toBe(one);
    dropEarlyGet("/api/runs/wants");
    expect(earlyGet("/api/runs/wants")).toBeUndefined();
    expect(earlyGet("/api/runs/shelf")).toBeUndefined();
    delete g.__wants;
    expect(earlyGet("/api/runs/wants")).toBeUndefined();
    expect(() => dropEarlyGet("/api/runs/wants")).not.toThrow();
    const panes = read("web/src/desk/Panes.tsx");
    expect(panes).toContain("const [head] = useState(() => (early ? earlyGet(path) : undefined));");
    expect(panes).toContain("if (head && tries === 0) {\n      dropEarlyGet(path);");
    expect(panes).toContain("if (head.v) { setGot(head.v as T); return; }");
  });

  it("no render anywhere in the web app takes or clears a shared value: renders can run twice and be thrown away", () => {
    // The whole kind: a useState or useMemo initializer, or useRef's start, that calls a take, drop, clear or shift.
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(new URL(`../../${d}`, import.meta.url))) { const p = `${d}/${f}`; if (statSync(new URL(`../../${p}`, import.meta.url)).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) files.push(p); } };
    walk("web/src");
    const bad = files.flatMap((f) => [...read(f).matchAll(/use(?:State|Memo|Ref)\(\s*\(\)\s*=>[^;\n]*\b(take\w*|drop\w*|clear\w*|\.shift|\.splice|\.delete)\(/g)].map((m) => `${f}: ${m[0].slice(0, 80)}`));
    expect(bad).toEqual([]);
  });
});

describe("the cover shows the empty list only when the room will draw exactly it", () => {
  it("a new visitor's answers, the sheets loaded: shown", async () => {
    const c = cover();
    run("wants", both(NEW, SHELF), c).place();
    await settle();
    expect(c.attrs).toEqual(["data-empty"]);
  });

  it("waits for the room's sheets: unstyled, it would be a different picture", async () => {
    const sheets: { sheet: unknown; onload?: () => void }[] = [{ sheet: {} }, { sheet: null }];
    const c = cover({ sheets });
    run("wants", both(NEW, SHELF), c).place();
    await settle();
    expect(c.attrs).toEqual([]);
    sheets[1]!.onload!();
    await settle();
    expect(c.attrs).toEqual(["data-empty"]);
  });

  it("anything else keeps the head alone: her wants, real rows, another hero or price or words, a lost answer, a lifted cover", async () => {
    const want = { catalogId: WANTS_HERO, item: "x", label: "x", max: "90.00", line: "x" };
    const cases: [string, ReturnType<typeof run>, ReturnType<typeof cover>][] = [];
    const add = (name: string, answers: Record<string, () => Promise<unknown>>, c = cover()) => cases.push([name, run("wants", answers, c), c]);
    add("her wants", both({ ...NEW, wants: [want] }, SHELF));
    add("real rows", both({ ...NEW, real: [{ productId: "p", domain: "d" }] }, SHELF));
    add("another title", both(NEW, SHELF), cover({ title: "Something else" }));
    add("another price", both(NEW, SHELF), cover({ price: "80" }));
    add("other closing words", both(NEW, { ...SHELF, said: "Different words." }));
    add("no hero", both(NEW, { ...SHELF, cards: SHELF.cards.filter((k) => k.catalogId !== WANTS_HERO) }));
    add("wants lost", { [WANTS_READS[0]]: () => Promise.reject(new Error("x")), [WANTS_READS[1]]: () => ok(SHELF) });
    add("shelf lost", { [WANTS_READS[0]]: () => ok(NEW), [WANTS_READS[1]]: () => Promise.resolve({ ok: false }) });
    for (const [, r] of cases) r.place();
    await settle();
    expect(cases.map(([n, , c]) => [n, c.attrs])).toEqual(cases.map(([n]) => [n, []]));
    // Lifted before it was placed: nothing to show, nothing thrown.
    expect(() => run("wants", both(NEW, SHELF), null).place()).not.toThrow();
  });

  it("the cover's values are the server's own answer for no wants, and the room's words", () => {
    expect(HERO.title).toBe("Marsh Lights ticket");
    expect(SHELF.said).toBe(SHELF_SAID);
    // The server's /api/runs/shelf for a browser with no session is this same call.
    expect(read("server/src/main.ts")).toContain("return c.json(shelfFor(session?.wants ?? [], CATALOG, session?.policy ?? demoPolicy()));");
    expect(read("server/src/main.ts")).toContain("const CATALOG = demoCatalogItems();");
    const fp = read("web/src/desk/first-paint.tsx");
    expect(fp).toContain("shelfFor([], demoCatalogItems(), demoPolicy()).cards.find((c) => c.catalogId === WANTS_HERO)");
    expect(fp).toContain('<DeskEmpty title={WANTS_EMPTY.title} line={WANTS_EMPTY.line} action={WANTS_EMPTY.action} onAction={noop} />');
    expect(fp).toContain('<div className="dk-scene dk-watch-first" data-id={hero.catalogId}><h2>{hero.title}</h2><SetPrice catalogId={hero.catalogId} priority="really" now={hero.max} ping /></div>');
    expect(fp).toContain('<p className="dk-watch-said">{PINGS_HERE} {SHELF_SAID}</p>');
    // The pane's empty list, piece for piece: the same note, scene and closing line (with the shelf's words once it's in).
    const panes = read("web/src/desk/Panes.tsx");
    expect(panes).toContain('<DeskEmpty title={WANTS_EMPTY.title} line={WANTS_EMPTY.line} action={WANTS_EMPTY.action} onAction={onAsk} />');
    expect(panes).toContain('{hero && <div className="dk-scene dk-watch-first"><h2>{hero.title}</h2><SetPrice catalogId={hero.catalogId} priority="really" now={hero.max} onSaved={saved(hero.catalogId)} ping /></div>}');
    expect(panes).toContain('<p className="dk-watch-said">{PINGS_HERE}{shelf && shelf !== "away" ? ` ${shelf.said}` : ""}</p>');
    expect(panes).toContain('<p className="dk-pane-sub">{WANTS_SUB}</p>');
    expect(WANTS_SUB).toBe("Goose watches these prices for you and says what it set aside.");
  });

  it("is hidden until shown, and its sheets go to the head before it's placed, so Vite reuses them and they outlive the cover", () => {
    expect(roomFirstCss()).toContain("#dk-room-first .dk-room-empty{display:none}#dk-room-first[data-empty] .dk-room-empty{display:contents}");
    // The cover's heading face goes where the room's sheets give theirs: a title in the words' face is 4 px shorter.
    expect(roomFirstCss()).toContain('#dk-room-first :is(h1,h2,h3,.dk-pane-h,.st-note-title){font-family:"Hanken Fallback",');
    expect(read("web/src/desk/desk.css")).toContain(":where(.dk) h1, :where(.dk) h2, :where(.dk) h3 { font-family: var(--display);");
    expect(read("web/src/states/states.css")).toMatch(/\.st-note-title \{[^}]*font-family: var\(--display/);
    const pre = read("web/prerender.ts");
    expect(pre).toContain('[].forEach.call(x.content.querySelectorAll("link[data-room-sheet]"),function(l){document.head.append(l)});document.body.append(x.content);${FILL_PLACED}');
    expect(pre).toContain("${EARLY_CHALLENGE}${EARLY_WANTS}${fillAsk(");
    expect(pre).toContain('wants: roomFiles(panesKey, "src/desk/DeskState.tsx")');
    expect(pre).toContain('`<link rel="stylesheet" crossorigin data-room-sheet href="${base}${f}">`');
    // The lift waits for the room to draw the whole list, the kit's note included, when the cover shows it.
    expect(read("web/src/desk/Desk.tsx")).toContain('const whole = !document.querySelector("#dk-room-first[data-empty]") || !!document.querySelector("#root .dk-work .st-note ~ .dk-watch-first ~ .dk-watch-said");');
  });
});
