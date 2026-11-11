// For builders (Joshua, Nov 4, 2a): the page says only what the code backs, and its code is the example file itself.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HOLDING_RULES } from "../../trust/src/notes.ts";
import { MENU_ITEMS } from "../src/view/menu.ts";
import { readSeller } from "../../trust/src/seller.ts";
import { BUILDERS_LEAD, BUILDERS_TITLE, BUILDERS_WORDS, GET_INSTALL, GET_NOT_YET, GET_VERSION, GUARD_CHECKS, NOT_PROMISED, NPM_PUBLISHED, POSTMAN_LINE, RENDER_LINK, SELLER_CLEAR, SELLER_READS, WATCHER_REFUSES, WHO } from "../../web/src/builders/builders.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const page = read("web/src/builders/Builders.tsx");

describe("For builders", () => {
  it("is on the menu, under its own title", () => {
    expect(MENU_ITEMS.find((i) => i.id === "builders")).toMatchObject({ name: BUILDERS_TITLE, href: "?desk=builders" });
    expect(read("web/src/main.tsx")).toContain('["builders", [() => import("./builders/Builders.tsx"), "For builders"]]');
  });
  it("says who it's for: stores, marketplaces, agent builders, PayPal", () => {
    const who = WHO.map((w) => w.who).join(" ");
    for (const w of ["Stores", "marketplaces", "Agent builders", "PayPal"]) expect(who).toContain(w);
  });
  it("draws the example file itself, imported as text, and never retypes it", () => {
    expect(page).toContain('import tenLines from "../../../trust/examples/ten-lines.ts?raw"');
    const file = read("trust/examples/ten-lines.ts");
    for (const line of file.split("\n").filter((l) => l.length > 20)) expect(BUILDERS_WORDS.join("\n")).not.toContain(line);
    expect(page).not.toContain("createGuard");
  });
  it("hangs a wrapped code line under its own indent, so a phone never shows a piece of a line as a line", () => {
    expect(page).toContain('style={{ "--i": l.length - l.trimStart().length } as CSSProperties}');
    expect(page).toContain('className={l.trim().startsWith("//") ? "bd-ln bd-note" : "bd-ln"}');
    const css = read("web/src/builders/builders.css");
    expect(css).toContain(".bd-ln { display: block; padding-left: calc((var(--i, 0) + 2) * 1ch); text-indent: calc((var(--i, 0) + 2) * -1ch); }");
    expect(css).toMatch(/\.bd-code \{[^}]*white-space: pre-wrap;/);
    // And the walk measures it in a browser, at 390, where lines do wrap.
    expect(read("scripts/builders-walk.ts")).toContain("wraps hang under their line");
  });
  it("draws readSeller's example the same way, and its three notes read what the page says", () => {
    expect(page).toContain('import readSellerFile from "../../../trust/examples/read-seller.ts?raw"');
    for (const line of read("trust/examples/read-seller.ts").split("\n").filter((l) => l.length > 20)) expect(BUILDERS_WORDS.join("\n")).not.toContain(line);
    expect(SELLER_READS.map((r) => r.verdict)).toEqual(["refuse", "hold", "clear"]);
    for (const r of SELLER_READS) expect(readSeller(r.note)).toMatchObject({ verdict: r.verdict, rule: r.rule });
    expect(SELLER_CLEAR).toContain("not that the seller is safe");
    expect(readSeller(SELLER_READS[2]!.note).reason).toContain("No rule matched");
  });
  it("has a line for every rule the guard refuses on, and every rule the Watcher refuses on", () => {
    const guard = /export type GuardRule = ([^;]+);/.exec(read("trust/src/guard.ts"))![1]!.split("|").map((s) => s.trim().replace(/"/g, ""));
    expect(Object.keys(GUARD_CHECKS).sort()).toEqual([...guard].sort());
    const notes = /export type EvidenceRule = ([^;]+);/.exec(read("trust/src/notes.ts"))![1]!.split("|").map((s) => s.trim()).filter((s) => s.startsWith('"')).map((s) => s.replace(/"/g, ""));
    expect(Object.keys(WATCHER_REFUSES).sort()).toEqual(notes.filter((r) => !HOLDING_RULES.has(r as never)).sort());
    expect(notes).toContain("instructs-agent"); // Control: the parse found the union.
  });
  it("says what it doesn't promise, plainly, and quotes no rate", () => {
    const not = NOT_PROMISED.map((n) => n.line).join(" ");
    for (const must of ["Some scams get past the Watcher", "isn't a safe seller", "can't see where a link really goes", "poor buy", "lives in memory", "real money"]) expect(not).toContain(must);
    const rate = /\d\s*%|percent|catch rate/i;
    expect(BUILDERS_WORDS.join(" ")).not.toMatch(rate);
    expect("82% set aside").toMatch(rate); // Control.
  });
  it("says how to get it, and only what's true today", () => {
    const pkg = JSON.parse(read("trust/package.json")) as { name: string; version: string; license: string };
    expect(GET_VERSION).toBe(`Get it: ${pkg.version} · ${pkg.license}.`);
    expect(GET_INSTALL).toBe(`npm install ${pkg.name}`);
    // Until Joshua publishes (Wed Nov 11), the page says so and draws no install line; the switch is the one thing to flip.
    expect(NPM_PUBLISHED).toBe(false);
    expect(BUILDERS_WORDS).toContain(GET_NOT_YET);
    expect(BUILDERS_WORDS.join(" ")).not.toContain("npm install");
    expect(page).toContain("{NPM_PUBLISHED ? <code>{GET_INSTALL}</code> : GET_NOT_YET}");
    // The Postman file the site serves is docs/builders' file, and the line's counts are that file's.
    const c = JSON.parse(read("docs/builders/gilded-goose.postman_collection.json")) as { item: { item: unknown[] }[] };
    expect(POSTMAN_LINE).toContain(`${c.item.flatMap((f) => f.item).length} requests in ${c.item.length} folders`);
    expect(read("web/vite.config.ts")).toContain("postman()]");
    expect(page).toContain("<a href={`${import.meta.env.BASE_URL}gilded-goose.postman_collection.json`} download>");
    expect(RENDER_LINK).toBe("/api/health");
    expect(page).toContain("<a href={`${__GOOSE_SITE__}/api/health`}>");
  });
  it("never says the agent or Goose pays", () => {
    expect(BUILDERS_WORDS.join(" ")).not.toMatch(/\bGoose (?:pays|paid|buys|bought)\b|\bagent (?:can |may )?(?:pays?|spends?)\b/i);
    expect(BUILDERS_LEAD).toContain("only the shopper's tap pays");
  });
});
