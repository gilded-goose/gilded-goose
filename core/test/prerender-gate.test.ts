// Track W (Fri Oct 30): the wallet's first-paint gate (web/prerender.ts) must open on the wallet exactly where main.tsx
// does. It used to miss the market: in the wallet build `?market=1` got the wallet's body class and stylesheet, so the
// market lost its nav row and the wallet's practice line sat on the market's eyebrow. This runs the gate's own
// condition, read from prerender.ts, against the addresses main.tsx routes elsewhere.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DESK_PAGES, ROUTE_PARAMS, deskByDefault, deskCanonical } from "../src/view/menu-hash.ts";

const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

/** The inline gate's `if (…)` condition as the browser gets it, for a wallet build (`${build}` = true). */
function gate(): (search: string, pathname?: string, cookie?: string) => boolean {
  const line = src("web/prerender.ts").split("\n").find((l) => l.trimStart().startsWith("`if(!q.has(\"desk\")"));
  if (!line) throw new Error("prerender.ts: the gate's if line moved");
  const cond = line.slice(line.indexOf("`if(") + 4, line.lastIndexOf("){`")).replaceAll("${build}", "true").replaceAll("\\\\", "\\");
  const f = new Function("q", "w", "location", "document", "R", `return (${cond});`) as (q: URLSearchParams, w: string | null, l: { search: string; pathname: string }, d: { cookie: string }, r: readonly string[]) => boolean;
  return (search, pathname = "/", cookie = "") => { const q = new URLSearchParams(search); return f(q, q.get("wallet"), { search, pathname }, { cookie }, ROUTE_PARAMS); };
}

describe("the wallet first-paint gate agrees with main.tsx (Track W)", () => {
  it("market_keeps_its_page: ?market=1 never gets the wallet's first paint, so its nav row stays", () => {
    const opens = gate();
    expect(opens("?market=1")).toBe(false);
    expect(opens("?market=1&wallet=1")).toBe(false);
    // main.tsx decides the market the same way, so the two can't drift apart unnoticed
    expect(src("web/src/main.tsx")).toContain(`get("market") === "1"`);
  });

  it("wallet_still_opens_where_it_did", () => {
    const opens = gate();
    expect(opens("?wallet=1")).toBe(true);
    expect(opens("?seed=1")).toBe(true); // the wallet build's default
    for (const off of ["?wallet=0", "?wallet=empty", "?desk=haggle", "?run=abc"]) expect([off, opens(off)]).toEqual([off, false]);
    expect(opens("", "/")).toBe(false); // the bare address is the Desk
    expect(opens("?wallet=1", "/", "goose_wallet_paid=1")).toBe(false);
    // S1-4: a query that names no page is the Desk at the root (deskByDefault), so no wallet paint there; the static
    // mirror (another path) still opens on the wallet in a wallet build
    for (const off of ["?utm_source=devpost", "?fbclid=abc", "?studio=force", "?studio=off"]) expect([off, opens(off)]).toEqual([off, false]);
    expect(opens("?utm_source=devpost", "/gilded-goose/")).toBe(true);
    expect(src("web/prerender.ts")).toContain("R=$R");
    expect(src("web/index.html")).toContain(`$R=${JSON.stringify(ROUTE_PARAMS)}`);
  });
});

/** Commit 7: the Desk preload's `if (…)` condition, read from prerender.ts as the browser gets it (the address as it
 *  arrived: it runs in <head>, before index.html's first script rewrites it). */
function deskPreload(): (search: string, pathname?: string) => boolean {
  const line = src("web/prerender.ts").split("\n").find((l) => l.trimStart().startsWith("`if(q.get(\"market\")!==\"1\"&&(d===\"1\""));
  if (!line) throw new Error("prerender.ts: the Desk preload's if line moved");
  const cond = line.slice(line.indexOf("`if(") + 4, line.lastIndexOf("){`"));
  const f = new Function("q", "d", "P", "R", "location", `return (${cond});`) as (q: URLSearchParams, d: string | null, p: readonly string[], r: readonly string[], l: { search: string; pathname: string }) => boolean;
  return (search, pathname = "/") => { const q = new URLSearchParams(search); return f(q, q.get("desk"), DESK_PAGES, ROUTE_PARAMS, { search, pathname }); };
}

/** main.tsx's own Desk rule: its `const market` and `const desk` lines run as written, with the real deskByDefault, on
 *  the address after its canonical rewrite (deskCanonical), so a change to main.tsx's rule is tested, not pinned. */
function mainOpensDesk(): (search: string, pathname?: string) => boolean {
  const main = src("web/src/main.tsx").split("\n");
  const expr = (name: string) => {
    const line = main.find((l) => l.startsWith(`const ${name} = `));
    if (!line) throw new Error(`main.tsx: no one-line const ${name}`);
    return line.slice(`const ${name} = `.length, line.lastIndexOf(";"));
  };
  const f = new Function("location", "deskByDefault", `const market = ${expr("market")}; return ${expr("desk")};`) as (l: { search: string; pathname: string }, d: typeof deskByDefault) => boolean;
  return (search, pathname = "/") => f({ search: deskCanonical(search, pathname) ?? search, pathname }, deskByDefault);
}

describe("the Desk's preloads start only where main.tsx opens the Desk (Track W, commit 7)", () => {
  it("desk_preload_matches_main: the bare root, ?desk=1 and queries naming no page; never the wallet, the classic page, the market or the back room", () => {
    const starts = deskPreload();
    const opens = mainOpensDesk();
    const on = ["", "?desk=1", "?utm_source=devpost", "?utm_source=devpost&utm_medium=social", "?fbclid=abc", "?x=1", "?studio=off",
      "?desk=nope", "?desk=", "?desk=nope&run=0123456789ab", "?desk=1&run=0123456789ab", "?studio=force&desk=nope"];
    const off = ["?wallet=1", "?wallet=0", "?wallet=empty", "?market=1", "?desk=1&market=1", "?market=1&desk=nope", "?desk=ledger",
      "?desk=studio", "?desk=proof", "?desk=haggle", "?desk=tour", "?seed=1", "?run=0123456789ab", "?ledger=full&row=3", "?studio=force",
      "?studio=force&utm_source=x", "?wallet=1&desk=nope", "?wallet=1&utm_source=x"];
    for (const s of on) expect([s, starts(s), opens(s)]).toEqual([s, true, true]);
    for (const s of off) expect([s, starts(s), opens(s)]).toEqual([s, false, false]);
    // the static mirror keeps the wallet; only an explicit ?desk=1 opens the Desk there (main.tsx opens it anywhere)
    for (const s of ["", "?utm_source=devpost", "?desk=nope", "?seed=1"]) expect([s, starts(s, "/gilded-goose/"), opens(s, "/gilded-goose/")]).toEqual([s, false, false]);
    expect([starts("?desk=1", "/gilded-goose/"), opens("?desk=1", "/gilded-goose/")]).toEqual([true, true]);
  });
});

// Q's dedupe: every first-paint script reads one copy of these. A script that runs before the definer throws, and a
// script that changes $q would hand the next one an address the page never had.
describe("the first script's shared values", () => {
  const html = src("web/index.html");
  const sources = [src("web/prerender.ts"), src("web/prerender-routes.ts"), src("web/src/brand/title.ts"), html];

  it("is the first script on the page, before the viewport meta the build's gates go after", () => {
    const definer = html.indexOf("<script>var $q=new URLSearchParams(location.search),$h=document.documentElement,");
    expect(definer).toBeGreaterThan(0);
    expect(html.indexOf("<script")).toBe(definer);
    expect(definer).toBeLessThan(html.indexOf('name="viewport"'));
    expect(src("web/prerender.ts")).toContain("html.replace(viewport, (m) => m + gate + ");
  });

  it("nothing changes $q, and the router that rewrites the address keeps its own", () => {
    for (const s of sources) expect(s).not.toMatch(/\$q\.(?:set|append|delete|sort)\(/);
    expect(html).toMatch(/\(function\(\)\{var q=new URLSearchParams\(location\.search\),d=q\.get\("desk"\)[^\n]*q\.set\("desk"/);
    for (const s of [sources[0]!, sources[1]!, sources[2]!]) expect(s).not.toMatch(/\bq\.(?:set|append|delete|sort)\(/);
  });

  it("safe.html has no definer, so its gate never reads one", () => {
    expect(src("web/safe.html")).not.toContain("$q=");
    expect(src("web/prerender-routes.ts").match(/export const safeGate[\s\S]*?\n\n/)?.[0]).not.toMatch(/\$[qhPR]\b/);
  });
});
