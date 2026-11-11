// Track F: the pages whose first paint is a file of their own (web/prerender-routes.ts). The gate decides in <head>, before
// any module, so it runs here as it runs in the page: the script itself, in a context with only what a browser gives it.
// The browser half (React adopts the file, no second largest paint, no shift) is scripts/first-routes-probe.ts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { DESK_PAGES } from "../src/view/menu-hash.ts";
import { FIRST_ROUTES, LIST_EARLY, STUDIO_FORCED, STUDIO_PHONE, dropLayout, ledgerTest, routeGate, routePlace, routeSheets, safeGate, studioLive } from "../../web/prerender-routes.ts";
import { NO_LICENCE, STUDIO_DEFAULT, studioAllowed, studioUntil } from "../src/view/studio-gate.ts";
import { FIT_SAFE, fitSafeCss } from "../../web/first-fit.ts";
import { listView } from "../src/view/list.ts";
import { demoCatalogItems, demoPolicy } from "../src/scenario.ts";

const repo = (p: string) => readFileSync(join(import.meta.dirname, "../..", p), "utf8");
const body = (s: string) => s.replace(/^<script>/, "").replace(/<\/script>$/, "");
const ROWS = FIRST_ROUTES.map((r) => ({ id: r.id, address: r.address, css: [`assets/${r.id}.css`], ...(r.phone ? { phone: r.phone } : {}) }));
const TICKS = "ticks-key";
const NOW = Date.UTC(2026, 10, 20);
const END = Date.UTC(2026, 11, 23) - 1;

describe("what every route downloads", () => {
  it("drops the page's source layout, and never a space that could be a word gap", () => {
    expect(dropLayout("<head>\n    <meta>\n  <title>x</title>\r\n</head>")).toBe("<head><meta><title>x</title></head>");
    expect(dropLayout("<b>Gilded</b> <span>Goose</span>")).toBe("<b>Gilded</b> <span>Goose</span>");
    expect(dropLayout("<p>one\ntwo</p>")).toBe("<p>one\ntwo</p>"); // words and inline scripts keep their own lines
  });
  it("the first paint's Approve is only its box: an icon and a label nobody sees would be on every route's bill", () => {
    const paint = readFileSync(join(import.meta.dirname, "../../web/src/first-paint.tsx"), "utf8");
    expect(paint).toContain('<div className="approve" />');
    expect(paint).not.toMatch(/acts-held[\s\S]{0,120}LockGlyph/);
  });
});

type Run = { asked: string[]; written: string[]; attrs: Record<string, string>; win: Record<string, unknown> };
function gate(search: string, { hash = "", ticks = null as string | null, throws = false, base = "/", until = 0, forced = 0, now = NOW, phone = false, hostname = "localhost" } = {}): Run {
  const asked: string[] = [], written: string[] = [], attrs: Record<string, string> = {};
  const win: Record<string, unknown> = {};
  // In the page the ledger's gate runs first and leaves its answer; this is its condition, from the one copy.
  const ledgerFirst = `(function(){var q=new URLSearchParams(location.search),d=q.get("desk");if(q.get("market")!=="1"&&(d==="ledger"||d==="studio")&&${ledgerTest(until, forced)})$h.setAttribute("data-first-ledger","")})();`;
  vm.runInNewContext(ledgerFirst + body(routeGate(ROWS, base, TICKS, until, forced)), {
    URLSearchParams, window: win, location: { search, hash, hostname }, Date: { now: () => now }, matchMedia: (q: string) => ({ matches: phone && q === STUDIO_PHONE }),
    localStorage: { getItem: (k: string) => { if (throws) throw new Error("blocked"); return k === TICKS ? ticks : null; } },
    fetch: (u: string) => { asked.push(u); return Promise.resolve({ ok: true, text: () => Promise.resolve("page") }); },
    $h: { setAttribute: (k: string, v: string) => { attrs[k] = v; }, hasAttribute: (k: string) => k in attrs },
    document: { write: (w: string) => { written.push(w); } },
  });
  const { "data-first-ledger": _ledger, ...route } = attrs; // the ledger's gate's own; `attrs` here is what the route gate set
  return { asked, written, attrs: route, win };
}

describe("the route gate", () => {
  it("each page's exact address asks for its own file and its own sheets, and nothing else", () => {
    for (const r of FIRST_ROUTES) {
      const g = gate(r.address, { base: "/goose/", forced: END });
      // The list alone also asks for its answer, by the path List.tsx asks it (LIST_EARLY).
      expect(g.asked, r.address).toEqual(r.id === "list" ? [`/goose/first/${r.id}.html`, "/api/runs/wants"] : [`/goose/first/${r.id}.html`]);
      expect(g.attrs["data-first-route"]).toBe(r.id);
      expect(g.written.join("")).toBe(`<link rel="preload" as="style" href="/goose/assets/${r.id}.css">`);
    }
  });

  it("any other address takes today's path: no file, no attribute, no sheets", () => {
    for (const q of ["", "?desk=1", "?desk=how&x=1", "?x=1&desk=how", "?desk=How", "?desk=ledger", "?desk=studio", "?wallet=1", "?market=1&desk=how", "?market=0", "?desk=constructor", "?constructor", "constructor", "__proto__", "hasOwnProperty"]) {
      const g = gate(q);
      expect(g.asked, q || "/").toEqual([]);
      expect(g.attrs, q || "/").toEqual({});
      expect(g.written, q || "/").toEqual([]);
      expect(g.win.__first, q || "/").toBeUndefined();
    }
  });

  // AG Grid item 4: Studio has its own first paint, and the flip must never take a page's first paint away.
  it("Studio's file: on a licensed build its forced address, the phone's own file on a phone", () => {
    expect(gate(STUDIO_FORCED, { forced: END }).asked).toEqual(["/first/studio.html"]);
    expect(gate(STUDIO_FORCED, { forced: END, phone: true }).asked).toEqual(["/first/studio-phone.html"]);
  });
  // bundle.desk (Round 5, Q's ruling): index.html is what every route downloads, and with no good licence no visitor can reach this.
  it("with no good licence the page carries none of Studio's route: no address, no sheets, no host, no phone test", () => {
    const keyless = routeGate(ROWS, "/", TICKS, studioUntil(NO_LICENCE, true), studioUntil(NO_LICENCE, true));
    for (const gone of ["studio", "localhost", "matchMedia", "Date.now"]) expect(keyless, gone).not.toContain(gone);
    for (const hostname of ["localhost", "goose.example"]) expect(gate(STUDIO_FORCED, { hostname }).asked, hostname).toEqual([]);
  });
  it("with no good key the plain addresses stay the ledger's, whatever the flip says", () => {
    expect(studioUntil(NO_LICENCE, true)).toBe(0);
    for (const q of ["?desk=studio", "?desk=ledger"]) expect(gate(q, { until: studioUntil(NO_LICENCE, true) }).asked).toEqual([]);
    // With the flip off, a good key's page is the keyless page. It's on (Joshua, Nov 5), so a good key brings its own gate.
    expect(STUDIO_DEFAULT).toBe(true);
    const good = { valid: true, missing: false, expiry: "22 December 2026", expired: false, isTrial: true };
    expect(routeGate(ROWS, "/", TICKS, studioUntil(good, false))).toBe(routeGate(ROWS, "/", TICKS));
    expect(routeGate(ROWS, "/", TICKS, studioUntil(good))).not.toBe(routeGate(ROWS, "/", TICKS));
  });
  // bundle.classic and bundle.wallet (Round 5): the flip's bytes are on every route, so the host and the clock are written once.
  it("the ledger's gate holds the only copy of the host and the clock, and runs ahead of what reads its answer", () => {
    const lit = routeGate(ROWS, "/", TICKS, END, END);
    for (const once of ["location.hostname", "Date.now"]) expect(lit, once).not.toContain(once);
    expect(lit).toContain(`$h.hasAttribute("data-first-ledger")`);
    const src = repo("web/prerender.ts");
    expect(src).toContain("const notStudio = ledgerTest(studioEnds, forcedEnds);");
    expect(src).toContain("ledgerGate + deskGate + routeFirstGate");
    expect(src.indexOf("${preloader}")).toBeGreaterThan(src.indexOf("ledgerGate + deskGate"));
    expect(src).toMatch(/const ledgerPreload = `<script>if\(\$h\.hasAttribute\("data-first-ledger"\)\)__pl\(/);
  });
  it("the landing's Studio link stands by the clock, in the ledger's gate, and a build with no flip carries none of it", () => {
    expect(studioLive(0)).toBe("");
    expect(studioLive(END)).toBe(`if(Date.now()<=${END})$h.setAttribute("data-st","");`);
    expect(repo("web/prerender.ts")).toContain("const ledgerGate = `<script>${studioLive(studioEnds)}");
  });
  it("the forced address paints Studio on a public host only while a good key lasts, as pick.ts decides, so a keyless site paints no Studio for it", () => {
    expect(gate(STUDIO_FORCED, { hostname: "goose.example" }).asked).toEqual([]);
    expect(gate(STUDIO_FORCED, { hostname: "goose.example" }).attrs).toEqual({});
    expect(gate(STUDIO_FORCED, { hostname: "goose.example", forced: END }).asked).toEqual(["/first/studio.html"]);
    expect(gate(STUDIO_FORCED, { hostname: "goose.example", forced: END, now: END + 1 }).asked).toEqual([]);
    for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) expect(gate(STUDIO_FORCED, { hostname, forced: END, now: END + 1 }).asked).toEqual(["/first/studio.html"]);
    // Every other page's gate reads no host.
    expect(gate("?desk=how", { hostname: "goose.example" }).asked).toEqual(["/first/how.html"]);
  });
  it("with a good key and the flip on, the plain addresses take Studio's file until the key's last day, then the ledger's own paint", () => {
    expect(gate("?desk=studio", { until: END }).asked).toEqual(["/first/studio.html"]);
    expect(gate("?desk=ledger", { until: END, phone: true }).asked).toEqual(["/first/studio-phone.html"]);
    expect(gate("?desk=ledger", { until: END, now: END }).asked).toEqual(["/first/studio.html"]);
    expect(gate("?desk=ledger", { until: END, now: END + 1 }).asked).toEqual([]);
    expect(gate(STUDIO_FORCED, { until: END, now: END + 1 }).asked).toEqual(["/first/studio.html"]);
    expect(gate(STUDIO_FORCED, { until: END, forced: END, now: END + 1, hostname: "goose.example" }).asked).toEqual([]);
    expect(gate("?desk=ledger&x=1", { until: END }).asked).toEqual([]);
  });
  it("the head's moment is the page's own decision, for every kind of licence", () => {
    const good = { valid: true, missing: false, expiry: "22 December 2026", expired: false, isTrial: true };
    for (const f of [NO_LICENCE, good, { ...good, expired: true }, { ...good, expiry: "soon" }, { ...good, expiry: null }, { ...good, valid: false }]) {
      for (const now of [Date.UTC(2026, 11, 22), Date.UTC(2026, 11, 22, 23, 59, 59), Date.UTC(2026, 11, 23)]) {
        const until = studioUntil(f, true);
        expect(now <= until, JSON.stringify(f)).toBe(studioAllowed(f, now, "?desk=ledger", true).studio);
        expect(studioUntil(f, false)).toBe(0);
      }
    }
  });
  it("a hash takes today's path: only the page knows where it lands", () => {
    expect(gate("?desk=proof", { hash: "#receipt" }).asked).toEqual([]);
  });

  it("a judge part-way through the tour opens on their own stop, which only the page can draw", () => {
    expect(gate("?desk=tour", { ticks: '["one"]' }).asked).toEqual([]);
    expect(gate("?desk=tour", { ticks: "[]" }).asked).toEqual(["/first/tour.html"]);
    expect(gate("?desk=tour", { ticks: null }).asked).toEqual(["/first/tour.html"]);
    // Blocked storage has no ticks to honour, and must never throw out of a head script.
    expect(gate("?desk=tour", { throws: true }).asked).toEqual(["/first/tour.html"]);
    // Ticks belong to the tour alone.
    expect(gate("?desk=how", { ticks: '["one"]' }).asked).toEqual(["/first/how.html"]);
  });

  it("a lost or refused file answers \"\", so the placing script does nothing and the page draws as it always did", async () => {
    for (const fetch of [() => Promise.resolve({ ok: false, text: () => Promise.resolve("<h1>404</h1>") }), () => Promise.reject(new Error("offline"))]) {
      const win: Record<string, unknown> = {};
      vm.runInNewContext(body(routeGate(ROWS, "/", TICKS)), { window: win, location: { search: "?desk=how", hash: "" }, localStorage: {}, fetch, $h: { setAttribute() {} }, document: { write() {} } });
      await expect(win.__first).resolves.toBe("");
    }
  });

  it("the sheets go in only where the gate chose a page", () => {
    const run = (css?: string[]) => { const out: string[] = []; vm.runInNewContext(body(routeSheets), { window: { __firstCss: css }, document: { write: (w: string) => out.push(w) } }); return out; };
    expect(run()).toEqual([]);
    expect(run(["/a.css"])).toEqual(['<link rel="stylesheet" href="/a.css">']);
  });

  it("every address is one main.tsx opens as that page, and each chunk rule finds that page's chunk", () => {
    expect(repo("web/src/main.tsx")).toMatch(/mount\(rootEl,/);
    for (const r of FIRST_ROUTES) {
      const desk = /^\?desk=(\w+)$/.exec(r.address)?.[1];
      if (desk) expect(DESK_PAGES as readonly string[], r.address).toContain(desk);
      else expect(["?market=1", STUDIO_FORCED]).toContain(r.address);
      expect(`assets/${r.src.split("/").pop()!.replace(".tsx", "")}-AbCd1234.js`, r.id).toMatch(r.chunk);
    }
  });
});

describe("the placing script", () => {
  const place = async (html: string, firstChild: unknown) => {
    const root: { firstChild: unknown; innerHTML: string } = { firstChild, innerHTML: "" };
    const win: Record<string, unknown> = { __first: Promise.resolve(html) };
    vm.runInNewContext(body(routePlace), { window: win, document: { getElementById: () => root } });
    await win.__first;
    await Promise.resolve();
    return { root, win };
  };

  it("puts the file in an empty #root and says so, which is what tells main.tsx to hydrate", async () => {
    const { root, win } = await place("<h1>page</h1>", null);
    expect(root.innerHTML).toBe("<h1>page</h1>");
    expect(win.__firstIn).toBe(1);
  });

  it("never touches a page the chunk already drew (a slow file on a fast chunk)", async () => {
    const { root, win } = await place("<h1>page</h1>", {});
    expect(root.innerHTML).toBe("");
    expect(win.__firstIn).toBeUndefined();
  });

  it("does nothing with no file", async () => {
    const { win } = await place("", null);
    expect(win.__firstIn).toBeUndefined();
  });

  // Track F, Nov 5: live's cold phone read Studio's count at 2.4 s, after React and the board's chunk, because Studio's file
  // had no counter lines for the head's early answer to fill. The answer can come before the file, so placing it asks again.
  it("writes the board's early answer into a file placed after it came, and never on a page that has none", async () => {
    let asked = 0;
    const root: { firstChild: unknown; innerHTML: string } = { firstChild: null, innerHTML: "" };
    const win: Record<string, unknown> = { __first: Promise.resolve("<p>studio</p>"), __board: { f: () => { asked++; } } };
    vm.runInNewContext(body(routePlace), { window: win, document: { getElementById: () => root } });
    await win.__first; await Promise.resolve();
    expect(root.innerHTML).toBe("<p>studio</p>");
    expect(asked).toBe(1);
    const { win: plain } = await place("<h1>page</h1>", null); // no __board: the other pages, and safe.html
    expect(plain.__firstIn).toBe(1);
  });
});

describe("Studio's file carries the board's first lines (Track F, Nov 5)", () => {
  const shell = readFileSync(new URL("../../web/src/studio/Shell.tsx", import.meta.url), "utf8");
  it("the counter's frame draws them before React and until the board's chunk lands, in the frame's own size", () => {
    expect(shell).toContain('const first = key === "threat-counter" ? <FirstCounter /> : null;');
    expect(shell).toContain("{Board ? <Suspense fallback={first}><Board onLanded={hereNow} /></Suspense> : first}");
    // The paint copy is the early script's to fill, and only until React has it; no data-shell-card, so the fit never shrinks the frame to it.
    expect(shell).toContain('<div className="st-card tb-w-counter" data-board={BOARD_PAINT}><BoardCounter words={words} /></div>');
    expect(shell).toMatch(/b\.f = \(\) => \{\};/);
  });
  it("the build stops if either file loses them", () => {
    expect(readFileSync(new URL("../../web/prerender.ts", import.meta.url), "utf8")).toContain('for (const id of ["studio", "studio-phone"]) if (!routePaints.get(id)?.includes(`data-board="${BOARD_PAINT}"`)');
  });
});

describe("safe.html's gate", () => {
  const run = (search: string, hash: string, phone: boolean, face: string[] = ["face"]) => {
    const asked: string[] = [], attrs = new Set<string>();
    const win: Record<string, unknown> = {};
    const loaded = Promise.resolve(face);
    vm.runInNewContext(body(safeGate("/", "(max-width: 899px)")), {
      window: win, location: { search, hash }, matchMedia: () => ({ matches: phone }),
      fetch: (u: string) => { asked.push(u); return Promise.resolve({ ok: true, text: () => Promise.resolve("page") }); },
      document: { fonts: { load: () => loaded }, documentElement: { setAttribute: (k: string) => attrs.add(k), removeAttribute: (k: string) => attrs.delete(k) } },
    });
    return { asked, attrs, loaded };
  };

  it("asks for the form this screen draws, on the bare address only", () => {
    expect(run("", "", true).asked).toEqual(["/first/safe-phone.html"]);
    expect(run("", "", false).asked).toEqual(["/first/safe-wide.html"]);
    expect(run("?x=1", "", true).asked).toEqual([]);
    expect(run("", "#limits", false).asked).toEqual([]);
  });

  it("holds the fallback's fit until the real face is in, and keeps it if the face never comes", async () => {
    const came = run("", "", true);
    expect(came.attrs.has("data-first-fit-display")).toBe(true);
    await came.loaded;
    await Promise.resolve();
    expect(came.attrs.has("data-first-fit-display")).toBe(false);
    const never = run("", "", true, []);
    await never.loaded;
    await Promise.resolve();
    expect(never.attrs.has("data-first-fit-display")).toBe(true);
  });

  it("the fit is measured on the words the page says", () => {
    expect(repo("web/src/Safe.tsx")).toContain(`<p className="if">${FIT_SAFE.line} `);
    expect(fitSafeCss()).toContain(`.if{letter-spacing:calc(-.012em + ${FIT_SAFE.em})}`);
    // The rule's base has to be the sheet's, or the fit adds to the wrong number.
    expect(repo("web/src/safe.css")).toMatch(/\.if \{[^}]*letter-spacing: -\.012em;/);
  });
});

describe("the build keeps them", () => {
  it("web/package.json compresses after the prerender, so the first files get their copies too", () => {
    // site-paint.ts writes goose.html's first paint after the prerender; compress stays last so the painted file gets its copies.
    expect(repo("web/package.json")).toContain(`vite build && node prerender.ts && node site-paint.ts && node compress.ts`);
  });

  it("the practice line waits for the page: it is #root's next sibling, hidden while #root is empty, and the probe holds a file back to read it", () => {
    const page = repo("web/index.html");
    expect(page).toMatch(/<div id="root"><\/div>\s*(<!--[\s\S]*?-->\s*)?<footer class="gn-footer">/);
    expect(page).toContain("#root:empty + .gn-footer { visibility: hidden; }");
    expect(repo("scripts/first-routes-probe.ts")).toContain("the practice line jumped");
  });

  it("the classic page holds the room of what the server adds later, and the probe holds the answers back to read it", () => {
    const box = repo("web/src/JudgeBox.tsx");
    expect(box).toContain(`const room = <p className="tally" />;`);
    expect(box).toMatch(/if \(count\.tried === 0\) return room;/);
    expect(box).toContain(`.join(" ") || "\\u00a0"}</p>`);
    expect(repo("web/src/run-cv.css")).toMatch(/\.tally:empty \{[^}]*min-height: 3lh/);
    expect(repo("scripts/first-routes-probe.ts")).toContain("the server's answers moved the page");
  });

  it("a redraw over a template gets caught: hydrate records it, the probe reads it", () => {
    expect(repo("web/src/hydrate.ts")).toMatch(/onRecoverableError/);
    expect(repo("web/src/hydrate.ts")).toContain("__firstMiss");
    expect(repo("scripts/first-routes-probe.ts")).toContain("__firstMiss");
  });
});

describe("the list's answer starts with its file (Track F, Nov 6: list was 1.9 s on a cold phone)", () => {
  type Answer = { ok: boolean; json: () => Promise<unknown> } | "offline";
  const run = (search: string, answer: Answer, hash = "") => {
    const asked: string[] = [], attrs: Record<string, string> = {}, win: { __list?: Promise<unknown> } = {};
    vm.runInNewContext(body(routeGate(ROWS, "/", TICKS)), {
      window: win, location: { search, hash }, localStorage: {}, document: { write() {} },
      $h: { setAttribute: (k: string, v: string) => { attrs[k] = v; }, hasAttribute: (k: string) => k in attrs },
      fetch: (u: string) => { asked.push(u); if (!u.startsWith("/api/")) return Promise.resolve({ ok: true, text: () => Promise.resolve("page") }); return answer === "offline" ? Promise.reject(new Error("offline")) : Promise.resolve(answer); },
    });
    return { asked, attrs, win };
  };
  const ok = (j: unknown): Answer => ({ ok: true, json: () => Promise.resolve(j) });
  // The server's own answer for a visitor with no list (wantsBody(undefined), server/src/main.ts): what every new visitor gets.
  const empty = { list: listView([], [], demoPolicy(), demoCatalogItems(), NOW), reads: {} };

  it("a new visitor's empty list is shown with the file, and the answer is kept for React to take", async () => {
    expect(empty.list.total).toBeNull();
    expect(empty.list.gifts).toEqual([]);
    const g = run("?desk=list", ok(empty));
    expect(g.asked).toEqual(["/first/list.html", "/api/runs/wants"]);
    await expect(g.win.__list).resolves.toEqual(empty);
    expect(g.attrs["data-list-empty"]).toBe("");
  });

  it("any other list keeps \"Reading\" until React draws it, and a lost or refused answer is null, so List asks again", async () => {
    const total = { ...empty, list: { ...empty.list, total: { cents: 30000, said: "$300" } } };
    const gifts = { ...empty, list: { ...empty.list, gifts: [{ catalogId: "x" }] } };
    for (const [answer, want] of [[ok(total), total], [ok(gifts), gifts], [ok({ list: { total: null } }), { list: { total: null } }], [{ ok: false, json: () => Promise.resolve({}) }, null], [{ ok: true, json: () => Promise.reject(new Error("bad json")) }, null], ["offline", null]] as const) {
      const g = run("?desk=list", answer as Answer);
      await expect(g.win.__list).resolves.toEqual(want);
      expect(g.attrs["data-list-empty"]).toBeUndefined();
    }
  });

  it("no other page asks, and the list with a hash (no file) doesn't either", () => {
    for (const r of FIRST_ROUTES.filter((x) => x.id !== "list")) expect(run(r.address, ok(empty)).win.__list, r.address).toBeUndefined();
    expect(run("?desk=list", ok(empty), "#x").asked).toEqual([]);
  });

  it("List takes the head's answer once, by the same path, and draws the file's empty view in the same elements", () => {
    const list = readFileSync(new URL("../../web/src/list/List.tsx", import.meta.url), "utf8");
    expect(LIST_EARLY).toContain('fetch("/api/runs/wants")');
    expect(list).toContain('await fetch("/api/runs/wants")');
    expect(list).toMatch(/const early = window\.__list;\s*window\.__list = undefined;\s*void load\(early\);/);
    expect(list).toContain("const body = (early ? await early.catch(() => null) : null) ?? await ask();");
    expect(list).toContain('FIRST_LIST: ListView = { total: null,');
    expect(list).toMatch(/FIRST_LIST[^\n]*gifts: \[\]/);
    expect(list).toContain('<div className="xl-body" data-list-first={list === null ? "" : undefined}>');
    expect(readFileSync(new URL("../../web/prerender.ts", import.meta.url), "utf8")).toContain('throw new Error("prerender: first/list.html lost its empty view or its reading line")');
  });
});
