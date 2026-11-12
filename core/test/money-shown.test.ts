// Every shown price goes through the one formatter (C's panel, Nov 6: Channel3's backpack read "$1218.00"). A "$" glued
// to a value by hand skips the thousands comma, so the whole kind is banned in core, server and web, not just that line.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fromCents, usd, usdOf, usdWhole } from "../src/money.ts";
import { usdSpan, usdSpanEnds } from "../src/money-span.ts";
import { capUsd } from "../src/ask/cap.ts";
import { usdWide } from "../src/ask/real-watch.ts";
import { spokenUsd } from "../src/ask/voice.ts";
import { boundLine, watchingLine } from "../src/view/desk.ts";
import { wantLine } from "../src/ask/wants.ts";
import { moneySites, moneySitesIn } from "./money-sites.ts";
import { parseSearch } from "../../server/src/adapters/channel3.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

describe("the one formatter", () => {
  it("puts the comma in at a thousand and keeps two cents", () => {
    expect(usd(121800)).toBe("$1,218.00");
    expect(usd(8400)).toBe("$84.00");
    expect(usd(99999)).toBe("$999.99");
    expect(usd(100000)).toBe("$1,000.00");
    expect(usd(1234567890)).toBe("$12,345,678.90");
    expect(usd(0)).toBe("$0.00");
    expect(usd(-500)).toBe("-$5.00");
  });
  it("refuses cents a number can't hold", () => {
    expect(() => usd(Number.NaN)).toThrow();
    expect(() => usd(Number.MAX_SAFE_INTEGER * 4)).toThrow();
  });
  it("reads a wire amount with commas and its digits as they came", () => {
    expect(usdOf("1218.00")).toBe("$1,218.00");
    expect(usdOf("84.00")).toBe("$84.00");
    expect(usdOf("90")).toBe("$90");
    expect(usdOf(1200)).toBe("$1,200");
    expect(usdOf("1000000.5")).toBe("$1,000,000.5");
    // never throws on a screen: what isn't plain digits shows as the hand-glued "$" showed it
    expect(usdOf("")).toBe("$");
    expect(usdOf(null)).toBe("$null");
  });
  it("leaves the wire alone: fromCents stays PayPal's comma-free amount", () => {
    expect(fromCents(121800)).toBe("1218.00");
  });
  it("drops only whole cents", () => {
    expect(usdWhole(121800)).toBe("$1,218");
    expect(usdWhole(8450)).toBe("$84.50");
  });
  it("is the formatter behind every older name", () => {
    for (const f of [capUsd, usdWide]) expect(f(121800)).toBe("$1,218.00");
    expect(spokenUsd(121800)).toBe("$1,218");
  });
  it("reaches the sentences a person reads", () => {
    expect(boundLine("1218.00")).toContain("exactly $1,218.00:");
    expect(watchingLine("1500.00")).toContain("$1,500.00 or less");
    expect(wantLine("1218.00", "1500.00")).toBe("Your max: $1,218.00, under your $1,500.00 limit.");
  });
});

describe("no price is glued to a $ by hand", () => {
  it("finds the kind it bans (red control)", () => {
    const src = [
      "const a = `Paid $${total}`;",
      "const b = <p>Your limit: ${limit}</p>;",
      'const c = "it costs $1218.00";',
      'const d = "$" + price;',
      "const ok = `Paid ${usdOf(total)}, ${n} items, $1,218.00`;",
    ].join("\n");
    expect(moneySitesIn("x.tsx", src).map((s) => `${s.line} ${s.kind} ${s.text}`)).toEqual(["1 template total", "2 jsx limit", "3 literal $1218", "4 concat price"]);
  });
  // Each allowed site by file, kind and text, with why it can't call the formatter; one that's gone fails too.
  const ALLOWED: Record<string, string> = {
    "server/src/adapters/channel3.ts template commas(was)": "imports nothing (claims row c3-flag-note), so it carries its own comma, tested below",
    // The split-flap board prints a price in a fixed number of cells, so a comma would cost a cell and push a digit off
    // (goose-board.test.ts: "$12500" in six cells, "$1K" past that). It never shows cents or a total the shopper pays.
    "web/src/goose/board/layout.ts template Math.round(cents / 100)": "fixed-width board cells, tested in goose-board.test.ts",
    "web/src/goose/board/layout.ts template Math.round(cents / 100000)": "fixed-width board cells, tested in goose-board.test.ts",
  };
  it("has none left in core, server or web but the ones allowed by name", () => {
    const found = moneySites(ROOT).map((s) => `${s.file} ${s.kind} ${s.text}`);
    expect(found.filter((s) => !(s in ALLOWED))).toEqual([]);
    expect(Object.keys(ALLOWED).filter((k) => !found.includes(k))).toEqual([]);
  });
  it("the allowed adapter's own comma reads like the formatter (its flag sentence, through its real parser)", () => {
    const flagged = (was: number) => parseSearch({ products: [{ id: "bag", title: "Bag", brands: [], images: [], offers: [
      { url: "https://a.example/p/1", domain: "a.example", price: { price: was / 10, compare_at_price: was, currency: "USD" }, availability: "InStock", condition: "new" },
    ] }] })!.flagged[0]!.reason;
    for (const was of [72, 1500, 1749, 99999.5]) expect(flagged(was)).toBe(`Marked 90% off its own list price of ${usdOf(was.toFixed(2))}.`);
  });
});

describe("a set of real prices is said as a range (C's panel nit 5: the backpack set ran $75 to $1,218)", () => {
  const rec = JSON.parse(readFileSync(`${ROOT}docs/fixtures/channel3-recorded.json`, "utf8")) as { queries: Record<string, { items: { price: string }[] }> };
  const panel = readFileSync(`${ROOT}web/src/desk/RealPrices.tsx`, "utf8");
  it("says the span with the one formatter", () => {
    expect(usdSpan(rec.queries.backpack!.items.map((i) => i.price))).toBe("$75.00–$1,218.00");
    expect(usdSpan(["84.00"])).toBeNull();
    expect(usdSpan(["84.00", "84"])).toBeNull();
    expect(usdSpan(["84.00", "oops", "90.5"])).toBe("$84.00–$90.50");
    // An en dash, cheapest first, nothing around it (Lead-12, Nov 6: "from … to …" cost the landing 3 words).
    expect(usdSpan(["90.50", "84.00"])).toBe("$84.00–$90.50");
    expect(usdSpan(["1218.00", "75.00"])).not.toMatch(/from|to|-|—/);
  });
  it("puts the span in every lead line (landing, recorded, live) and lists the cheapest first", () => {
    const leads = panel.split("\n").filter((l) => /“\{(got\.query|Q)\}” (costs? )?at real stores/.test(l));
    expect(leads).toHaveLength(3);
    for (const l of leads) expect(l).toContain("{span}");
    expect(panel).toContain("const ends = usdSpanEnds(items.map((it) => it.price));");
    expect(panel).toMatch(/const items = \[\.\.\.got\.items\]\.sort\(\(a, b\) => Number\(a\.price\) - Number\(b\.price\)\)/);
    expect(panel).not.toContain("got.items.map(");
  });
  // Lead-12 and R, Nov 6: the landing's range adds no word to the page the walk counts (body.innerText, split on spaces),
  // and a screen reader hears "to" between the prices. The dash is CSS generated content, which innerText leaves out and
  // Chromium's accessibility tree reads as its alternative text (proven on Chromium's own tree: "$75.00", " to ",
  // "$1,218.00"; R walks the real page).
  it("draws the range's dash as CSS that reads \"to\", so the landing line is shorter than before it had a range", () => {
    const css = readFileSync(`${ROOT}web/src/desk/realprices.css`, "utf8");
    expect(css).toContain('.c3-to::before { content: "\\2013"; content: "\\2013" / " to "; }');
    expect(panel).toContain('const span = ends && <span className="c3-span">{ends[0]}<span className="c3-to" />{ends[1]}</span>;');
    const words = (t: string) => t.split(/\s+/).filter((x) => /[\p{L}\d]/u.test(x)).length;
    // The landing's line is the bridge under its headline now (a fresh DD, Nov 6), the range still its one price word.
    expect(panel).toContain("{span ? <>{C3_BRIDGE} “{Q}” at real stores: {span}.</> : `${C3_BRIDGE} What “${got.query}” cost at real stores.`}");
    // As innerText reads it: the CSS dash isn't text, so the two prices are one word.
    const ends = usdSpanEnds(rec.queries.backpack!.items.map((i) => i.price))!;
    expect(words(`“backpack” at real stores: ${ends[0]}${ends[1]}.`)).toBeLessThanOrEqual(words("What “backpack” cost at real stores."));
    expect(ends).toEqual(["$75.00", "$1,218.00"]);
    for (const v of Object.values(rec.queries)) {
      const e = usdSpanEnds(v.items.map((i) => i.price));
      expect(e && `${e[0]}–${e[1]}`).toBe(usdSpan(v.items.map((i) => i.price)));
    }
  });
  it("gives every recorded set of two or more prices its span", () => {
    for (const [q, v] of Object.entries(rec.queries)) {
      const distinct = new Set(v.items.map((i) => i.price)).size;
      expect(usdSpan(v.items.map((i) => i.price)) === null, q).toBe(distinct < 2);
    }
  });
});

// The same rule for the text people paste or read outside the app (Lead-12, Nov 6): the README, the npm package's
// README, Devpost, every launch doc (the FAQ is docs/launch/faq.md) and the video kit. Scripts and internal notes aren't read.
const PUBLIC_TEXT = ["README.md", "trust/README.md", "docs/devpost.md", "docs/launch/*.md", "docs/video-kit/*.md"];
/** "file:line $1218" for each price of four or more digits with no comma, in each committed public text file. */
const barePricesIn = (file: string, text: string) =>
  text.split("\n").flatMap((l, i) => [...l.matchAll(/\$\d{4,}(?![\d,])/g)].map((m) => `${file}:${i + 1} ${m[0]}`));

describe("public text writes a price of $1,000 or more with its comma", () => {
  it("finds the kind it bans (red control)", () => {
    expect(barePricesIn("x.md", "a $1218.00 bag\nup to $90 or $1,218.00\n$100000 cap")).toEqual(["x.md:1 $1218", "x.md:3 $100000"]);
  });
  it("has none in the README, Devpost, the launch docs or the video kit", () => {
    const files = execFileSync("git", ["ls-files", ...PUBLIC_TEXT], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
    expect(files).toEqual(expect.arrayContaining(["README.md", "docs/devpost.md", "docs/launch/faq.md", "docs/launch/press-release.md"]));
    expect(files.flatMap((f) => barePricesIn(f, readFileSync(`${ROOT}${f}`, "utf8")))).toEqual([]);
  });
});
