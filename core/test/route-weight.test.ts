// Track F: what keeps a light page light. The ratchet says a route got heavier, after the fact and for the whole stack;
// these name the two ways it happened. Lesson: a menu page reached `export *` barrels and a module with top-level calls,
// so 109 KB of the Watcher, the guard and the recorded scenario sat on every page that needed one constant from them.
import { WEEK_MS } from "../src/trust/guard.ts";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { leanHtml, leanScripts } from "../../web/lean-html.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const text = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** Every module a file really loads: relative value imports, followed. `import type` loads nothing. */
function reach(start: string): Set<string> {
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = text(file);
    for (const m of src.matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^"';]*?\sfrom\s+)?["'](\.[^"']+)["']/gm)) {
      const next = join(dirname(file), m[1]!);
      if (existsSync(join(ROOT, next))) walk(next);
    }
  };
  walk(start);
  return seen;
}

describe("the light modules stay light", () => {
  it("both packages say they have no side effects, or Rollup keeps a whole module for one constant", () => {
    for (const p of ["core/package.json", "trust/package.json"]) expect(JSON.parse(text(p)).sideEffects, p).toBe(false);
  });

  // Each is what a menu, proof, market or haggle page reads on its first screen. The heavy modules they were split from
  // call functions at their top level (building the recorded week), and that runs on any import of them.
  const HEAVY = /(^|\/)(scenario|watch|notes|guard|engine|storesync|judge)\.ts$/;
  it.each(["core/src/view/menu.ts", "core/src/view/band.ts", "core/src/storesync-claim.ts", "core/src/haggle/words.ts", "core/src/demo-limits.ts"])("%s reaches no heavy module", (file) => {
    expect([...reach(file)].filter((f) => HEAVY.test(f))).toEqual([]);
  });

  it("the walker sees a heavy reach when there is one (a control)", () => {
    expect([...reach("core/src/scenario.ts")].filter((f) => HEAVY.test(f))).toContain("core/src/scenario.ts");
  });

  it("the pages that use the light modules import them, not the heavy ones they came from", () => {
    expect(text("web/src/Proof.tsx")).toContain('from "@goose/core/band"');
    expect(text("web/src/StoreSync.tsx")).toMatch(/import \{ STORE_SYNC_CLAIM \} from "@goose\/core\/storesync-claim"/);
    expect(text("web/src/StoreSync.tsx")).not.toMatch(/^import \{[^}]*\} from "@goose\/core\/storesync";/m);
    expect(text("web/src/offline.ts")).not.toMatch(/^import \{[^}]*\} from "@goose\/core\/judge";/m);
  });

  it("the ledger's grid reaches no haggle engine for one sentence (DD seat 4: 31 KB of the classic page's first load)", () => {
    expect([...reach("core/src/view/grid.ts")]).not.toContain("core/src/view/local.ts");
    expect(text("core/src/view/local-done.ts").match(/^import /gm)).toBeNull();
    expect(text("core/src/view/local.ts")).toContain('import { LOCAL_DONE } from "./local-done.ts";');
  });
});

describe("the first sheet only carries what the first screen can show", () => {
  // run.css is in main.css, on every route. A rule belongs to whichever file renders its class: these only Ledger.tsx
  // renders, and classic loads Ledger lazily. A coverage tool can't decide this: it only sees what rendered on load.
  const run = text("web/src/run.css");
  const ledger = text("web/src/run-ledger.css");

  it.each([".lg-paper", ".lg-chip", ".lg-receipt", ".ltable", ".spine", ".moment-lanes", "details.ledger", "code.rule"])("run.css doesn't carry the ledger's %s", (rule) => {
    expect(run).not.toContain(rule);
    expect(ledger).toContain(rule);
  });

  it("App's own rules stayed App's: its dial and its moment line ship with App, in run-cv.css", () => {
    const cv = text("web/src/run-cv.css");
    expect(cv).toContain(".cv .dial");
    expect(cv).toContain(".cv .lg-moment-line");
    expect(text("web/src/App.tsx")).toContain("lg-moment-line");
    expect(text("web/src/App.tsx")).toContain('import "./run-cv.css"');
  });

  it("no route but classic pays for .cv: run.css names none, and only App imports its sheet (gate seat 7)", () => {
    expect(run.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/\.cv(?![\w-])/);
    expect(text("web/src/main.tsx")).not.toContain('import "./run-cv.css"');
  });

  it("the moved rules still come ahead of ledger.css, so the same rule wins as before", () => {
    const src = text("web/src/Ledger.tsx");
    expect(src.indexOf('import "./run-ledger.css"')).toBeGreaterThan(-1);
    expect(src.indexOf('import "./run-ledger.css"')).toBeLessThan(src.indexOf('import "./ledger.css"'));
  });

  it("the old header's rules stay gone: no source renders those classes", () => {
    for (const dead of [".wbrand", ".wbreak ", ".whome", ".page > .wtop"]) expect(run).not.toContain(dead);
    for (const file of ["web/src/Wants.tsx", "web/src/App.tsx"]) expect(text(file)).not.toMatch(/\b(wbrand|whome)\b/);
  });

  it("what classic reads from lanes and memory never reaches the guard: one import put 112 KB of rules on its first load", () => {
    for (const file of ["core/src/view/lanes.ts", "core/src/ask/memory.ts"]) {
      expect([...reach(file)], file).not.toContain("core/src/trust/guard.ts");
    }
    // Memory keeps its own copy of the week, and it stays the guard's week.
    expect(text("core/src/ask/memory.ts")).toContain(`const WEEK_MS = 7 * 24 * 60 * 60 * 1000;`);
    expect(WEEK_MS).toBe(7 * 24 * 60 * 60 * 1000);
    // The fold still reads the guard's own number: no second count of the week.
    expect(text("core/src/view/shopper-fold.ts")).toContain('import { WEEK_MS, weekSpend } from "../trust/guard.ts";');
  });

  it("the wants list isn't on the wallet's first load: it sits under the week and reads the server on its own", () => {
    const wallet = text("web/src/Wallet.tsx");
    expect(wallet).not.toMatch(/^import [^;]*from "\.\/Wants\.tsx"/m);
    expect(wallet).toContain('import("./Wants.tsx")');
  });

  // Nov 5: drawn first, the voice card was pushed off a phone's screen when the limits above it landed (0.61); the walk
  // that measures it is in scripts/desk-walk.ts. A Wants chunk that fails says so where the list would be (Q).
  it("Settings holds a screen's room until its limits are read and draws the voice card with them; a lost list says so", () => {
    const wallet = text("web/src/Wallet.tsx");
    expect(wallet).toContain('<div className="settings" data-reading={settingsRead ? undefined : ""}>');
    expect(wallet).toMatch(/\{settingsRead && \(\s*<section className="scard svoice"/);
    expect(wallet).toContain('import("./Wants.tsx").then((m) => ({ default: m.Wants })), WantsLost);');
    expect(text("web/src/Wants.tsx")).toContain("useEffect(() => { if (read) onRead?.(); }, [read, onRead]);");
    expect(text("web/src/wallet.css")).toContain(".wallet .settings[data-reading] { min-height: 100vh; align-content: start; }");
    expect(text("scripts/desk-walk.ts")).toContain("Settings moved under the eyes when its limits landed at 390");
  });

  it("the first screen reads the ladder's words, not the ladder: one constant pulled 4.6 KB onto classic and the wallet", () => {
    for (const file of ["core/src/ask/watching.ts", "core/src/view/shelf.ts", "core/src/ask/ladder-words.ts"]) {
      expect([...reach(file)], file).not.toContain("core/src/ask/ladder.ts");
    }
  });
});

// Gate seat 6, Nov 4: the ratchet counts wallet-week's chunk, so a later import of offline.ts would add bytes it doesn't see.
describe("what the wallet measures is what the wallet loads", () => {
  const namesOffline = /(?:from\s+|import\(\s*)["'][^"']*\boffline(?:\.ts)?["']/;

  it("the wallet, its week and the first-screen chunk never load offline.ts", () => {
    for (const f of ["web/src/Wallet.tsx", "web/src/wallet-week.ts", "web/src/main.tsx"]) expect(text(f), f).not.toMatch(namesOffline);
    // A file the wallet imports counts too: it lands in the same load, whatever it's called.
    for (const f of [...reach("web/src/Wallet.tsx"), ...reach("web/src/wallet-week.ts")]) expect(text(f), f).not.toMatch(namesOffline);
  });

  it("the wallet's week carries week 1's tape and no other", () => {
    const tapes = [...text("web/src/wallet-week.ts").matchAll(/from\s+["']([^"']*\.json)["']/g)].map((m) => m[1]);
    expect(tapes).toEqual(["../../docs/fixtures/tape-seed-1.json"]);
  });

  it("the wallet's limit comes from the small module, never through local.ts", () => {
    const src = text("web/src/wallet-week.ts");
    expect(src).toMatch(/from "@goose\/core\/entry-limit"/);
    expect(src).not.toMatch(/@goose\/core\/local"/);
  });
});

describe("lazy code fails in words", () => {
  it("offline.ts's lazy rounds catch a chunk that can't load, so the Challenge's button is never stuck offline", () => {
    const src = text("web/src/offline.ts");
    for (const m of src.matchAll(/import\("@goose\/core\/[\w-]+"\)(.{0,20})/g)) expect(m[0]).toContain(".catch(");
  });
});

describe("leanHtml: the page's notes and spaces stay home", () => {
  it("drops comments, shortens inline sheets, keeps every rule and attribute", async () => {
    const out = await leanHtml(`<head><!-- a note --><style data-gg>
/* a note */
.a { color: red; }
@media (max-width: 720px) { .a { color: blue; } }
</style></head>`);
    expect(out).not.toContain("note");
    expect(out).toContain("<style data-gg>");
    expect(out).toMatch(/\.a\{color:red\}/);
    expect(out).toMatch(/@media ?\(max-width: ?720px\)\{\.a\{color:#?\w+\}\}/);
  });

  it("leaves a script alone, even one holding what looks like a comment or a sheet", async () => {
    const script = `<script>var a="<!-- keep -->",b="<style>.x { top: 0 }</style>";</script>`;
    expect(await leanHtml(`<!-- gone -->${script}`)).toBe(script);
  });
  // Nov 5: the built page's inline scripts are minified after prerender puts its gates in (306 B off every route). The
  // parser guard above still holds there: a script's strings keep a `<!--` and a `<style>`, and the page around it keeps
  // its own notes and React's markers.
  it("minifies each inline script after prerender, keeping the page's globals, its strings and everything around it", async () => {
    const page = `<template id="t"><p>a<!-- -->b</p></template><script>var $q = new URLSearchParams(location.search);
function __pl(files) { files.forEach(function (file) { var link = document.createElement("link"); link.href = file; }); }
(function () { var wallet = $q.get("wallet"), note = "<!-- keep -->", sheet = "<style>.x { top: 0 }</style>", end = "</scr" + "ipt>"; if (wallet) __pl([note, sheet, end]); })();</script>`
      + `<script type="application/ld+json">{ "a": 1 }</script><script type="module" src="/m.js"></script>`;
    const out = await leanScripts(page);
    expect(out.length).toBeLessThan(page.length);
    expect(out).toContain('<template id="t"><p>a<!-- -->b</p></template>');
    expect(out).toContain('<script type="application/ld+json">{ "a": 1 }</script><script type="module" src="/m.js"></script>');
    const js = out.match(/<script>([\s\S]*?)<\/script>/)![1]!;
    expect(js).toMatch(/var \$q=/);
    expect(js).toMatch(/function __pl\(/);
    expect(js).not.toMatch(/\bwallet=|\bfiles\b/);
    for (const s of ["<!-- keep -->", "<style>.x { top: 0 }</style>"]) expect(js).toContain(s);
    expect(js).not.toMatch(/<\/script/i);
  });
  it("the built page goes through leanScripts last, so every inline script the browser runs is the minified one", () => {
    const prerender = text("web/prerender.ts");
    expect(prerender).toContain("writeFileSync(file, await leanScripts(dropLayout(html)));");
    expect(prerender).toMatch(/writeFileSync\(safeFile, await leanScripts\(/);
  });
  it("the classic page reads the count's words from their own small module, never the Challenge's whole vocabulary", () => {
    for (const f of ["web/src/JudgeBox.tsx", "web/src/Safe.tsx"]) expect(text(f), f).not.toMatch(/from "@goose\/core\/attempts"/);
    expect(text("core/src/judge/count-words.ts")).not.toMatch(/^import /m);
  });
});
