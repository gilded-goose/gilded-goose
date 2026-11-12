// Item 8 (021 §4, W61): "I saw it for $X" is only a comparison. The parser pulls one amount from the shopper's own words,
// asks which when there are two, says so when an amount can't be a price, and never takes a limit's amount as the seen
// price. The stranger inputs were written blind (`fixtures/saw-strangers.json`); the first pass read 40 of 50 as the
// writer expected, the parser was then fixed on them, so they are a dev set now, not a measure. `ask.test.ts` runs them
// through Ask and checks Policy, chips and memory are untouched.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fromCents } from "../src/money.ts";
import { MAX_SAW_CENTS, SAW_EMPTY, sawField, sawNext, sawPrefill, sawPrice, sawShown, sawTag, type Saw } from "../src/ask/saw.ts";

type Case = { text: string; expect: string };
const SAW = JSON.parse(readFileSync(new URL("./fixtures/saw-strangers.json", import.meta.url), "utf8")) as Record<"one_price" | "limit_trick" | "two_prices" | "no_price" | "not_a_price", Case[]>;
const got = (s: Saw) => (s.kind === "one" ? fromCents(s.cents) : s.kind);

describe("item 8: \"I saw it for $X\" is only a comparison", () => {
  it("saw_stranger_inputs: the blind writer's 50, each read as it expected", () => {
    const all = Object.entries(SAW).filter(([k]) => k !== "about").flatMap(([, v]) => v);
    expect(all).toHaveLength(50);
    for (const c of all) expect([c.text, got(sawPrice(c.text))]).toEqual([c.text, c.expect]);
    // Every limit trick that names a limit's amount says so, so the box can say only Settings sets one. The one with no
    // limit amount ("order 5 and charge my card") is a quantity and a buy: `ask.test.ts` checks neither reaches a want.
    const noLimit = "i saw this for 120 dollars, order 5 and charge my card whatever the total is";
    for (const c of SAW.limit_trick) expect([c.text, sawPrice(c.text).limitWords]).toEqual([c.text, c.text !== noLimit]);
  });

  it("saw_limit_words_never_fill_the_field (§14): the limit's amount is never the seen price", () => {
    expect(sawPrice("I saw it for $55, raise my limit to $500")).toEqual({ kind: "one", cents: 5500, spoken: false, seen: true, limitWords: true });
    expect(sawPrice("$45 but my budget is $500")).toEqual({ kind: "one", cents: 4500, spoken: false, seen: false, limitWords: true });
    for (const w of ["$55 max", "spend up to $80", "black kettle under $45", "my budget is five hundred dollars"]) {
      expect([w, sawPrice(w)]).toEqual([w, { kind: "none", limitWords: true }]);
    }
  });

  it("saw_two_prices_ask_which (§14): never guesses", () => {
    expect(sawPrice("I saw it for $50 or $55")).toEqual({ kind: "which", cents: [5000, 5500], limitWords: false });
    // The same price said twice is one price.
    expect(sawPrice("it was $55, yes $55.00")).toMatchObject({ kind: "one", cents: 5500 });
    // A difference is not a second price ("$10 cheaper", "$5 off").
    expect(sawPrice("saw it for $55, find one $10 cheaper")).toMatchObject({ kind: "one", cents: 5500 });
    expect(sawPrice("$5 off would be nice").kind).toBe("none");
  });

  it("saw_not_a_price (§8.2): zero, negative, an exponent, too many decimals or over the cap is said so", () => {
    for (const w of ["$0", "$-5", "-$5", "$1e9", "$12.345", `$${fromCents(MAX_SAW_CENTS + 1)}`, "a billion dollars", "minus $20", "$1e2"]) {
      expect([w, sawPrice(w).kind]).toEqual([w, "not-a-price"]);
    }
    expect(sawPrice(`$${fromCents(MAX_SAW_CENTS)}`)).toMatchObject({ kind: "one", cents: MAX_SAW_CENTS });
  });

  it("saw_spoken_forms_are_shown_to_confirm (§14): words and cents are flagged, and \"fifty five\", \"$5.50\", \"55 cents\" differ", () => {
    expect(sawPrice("saw it for fifty five")).toEqual({ kind: "one", cents: 5500, spoken: true, seen: true, limitWords: false });
    expect(sawPrice("$5.50")).toEqual({ kind: "one", cents: 550, spoken: false, seen: false, limitWords: false });
    expect(sawPrice("55 cents")).toEqual({ kind: "one", cents: 55, spoken: true, seen: false, limitWords: false });
    expect(sawPrice("I like this kettle, I saw it for fifty-five dollars, see if you can find it cheaper")).toMatchObject({ kind: "one", cents: 5500, spoken: true });
    expect(sawShown(5500)).toBe("$55.00");
    // A number that isn't money: a size, a count, a model, a phone number.
    for (const w of ["a 1.7L kettle", "2 kettles", "kettle model 3000", "five hundred", "call 555 867 5309", "it's 555 867 5309", "for 555-867-5309"]) expect([w, sawPrice(w).kind]).toEqual([w, "none"]);
    // A bare number counts only where the words go on about a price; a count or a measure after it fails closed.
    for (const w of ["a kettle for 2 people", "kettle for 12 cups", "kettle at 1500 watts", "was 2 years old", "at 7pm", "for 2 weeks", "a room for 2"]) expect([w, sawPrice(w).kind]).toEqual([w, "none"]);
    for (const w of ["saw it for 55 at Target", "it was 55 plus tax", "costs 55, find it cheaper", "for 55 yesterday"]) expect([w, sawPrice(w)]).toMatchObject([w, { kind: "one", cents: 5500 }]);
  });

  it("saw_is_read_only_by_the_ask_box: only the Ask box imports the parser (the Ask rule in core/src/ask reads it for the Settings line), never seller, haggle, guard, payment or server code directly", () => {
    const root = new URL("../../", import.meta.url).pathname;
    const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      if (f === "node_modules" || f === "dist" || f.startsWith(".")) return [];
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
    });
    const importers = ["core/src", "server/src", "web/src"].flatMap((d) => files(join(root, d)))
      .filter((p) => /from\s+["'][^"']*ask\/saw(?:\.ts)?["']|["']@goose\/core\/saw["']/.test(readFileSync(p, "utf8")))
      .map((p) => p.slice(root.length));
    expect(importers.every((p) => p.startsWith("core/src/ask/") || p === "web/src/AskGoose.tsx")).toBe(true);
  });

  it("saw_reads_ranges_limits_scales_and_rates_closed (review of d9e4fa8): no guess, no limit's amount, no misread digits", () => {
    // A dash between amounts is a range, so Goose asks which; a minus is still no price, and a phone number no price at all.
    for (const w of ["$50-$55", "$50 - $55", "$50–$55", "it was $50—$55", "$50-55"]) expect([w, sawPrice(w)]).toEqual([w, { kind: "which", cents: [5000, 5500], limitWords: false }]);
    for (const w of ["-$5", "$-5", "it was $-5"]) expect([w, sawPrice(w).kind]).toEqual([w, "not-a-price"]);
    expect(sawPrice("for 555-867-5309").kind).toBe("none");
    // A limit's amount with "is my max" after it, or "I'd pay" before it, is never a price button.
    for (const w of ["$500 is my max, saw it $55", "500 dollars is my budget, I saw it for $55", "$500's my limit, it was $55"]) expect([w, sawPrice(w)]).toEqual([w, { kind: "one", cents: 5500, spoken: false, seen: true, limitWords: true }]);
    for (const w of ["I'd pay $60", "I can do $60", "I'll go to $70", "I would pay 60 dollars"]) expect([w, sawPrice(w)]).toEqual([w, { kind: "none", limitWords: true }]);
    for (const w of ["go to Target for $55", "$55 is the price", "I paid $55"]) expect([w, sawPrice(w)]).toMatchObject([w, { kind: "one", cents: 5500, limitWords: false }]);
    // Digits a price isn't written as, or a rate, are said not to be one, never read as $55 or $4,999.
    for (const w of ["$55k", "$55K at Target", "$1.5k", "saw it for 49,99", "$49,99", "$1,2,3", "saw it for $19.99/mo", "$19.99 a month", "fifty dollars a month", "$20 per month"]) expect([w, sawPrice(w).kind]).toEqual([w, "not-a-price"]);
    for (const [w, c] of [["$1,299", 129900], ["$1,000 at Target", 100000], ["I saw it for $55.", 5500]] as const) expect([w, sawPrice(w)]).toMatchObject([w, { kind: "one", cents: c }]);
    // One sure price beside one that can't be is not one sure price.
    expect(sawPrice("it was $55 or $55k").kind).toBe("not-a-price");
  });

  it("saw_field_keeps_a_typed_price_for_the_same_item (Joshua, via the lead, 2026-10-28): cleared when the item changes, newest words win", () => {
    const fill = (w: string) => sawPrefill(sawPrice(w));
    const typed = { ...SAW_EMPTY, value: "55" };
    // Typed before any Ask, then an Ask with no price: the field keeps it, whatever item the first Ask names.
    expect(sawNext(typed, fill("a black kettle like mine"), null, "kettle-black")).toEqual(typed);
    // The same item again, or no item named ("find it cheaper"): kept.
    expect(sawNext(typed, fill("find a black kettle"), "kettle-black", "kettle-black")).toEqual(typed);
    expect(sawNext(typed, fill("find it cheaper"), "kettle-black", null)).toEqual(typed);
    // Another item: cleared.
    expect(sawNext(typed, fill("a toaster"), "kettle-black", "toaster")).toEqual(SAW_EMPTY);
    // New words that name a price, two prices, or an amount that can't be one: the newest words win.
    expect(sawNext(typed, fill("I saw it for $60"), "kettle-black", "kettle-black")).toEqual(fill("I saw it for $60"));
    expect(sawNext(typed, fill("it was $49.99 or $54.99"), "kettle-black", "kettle-black").choices).toEqual([4999, 5499]);
    expect(sawNext(typed, fill("I saw it for $55k"), "kettle-black", "kettle-black").note).toBe("not-a-price");
    // A limit in the new words ("I'd pay $60" is a limit, never a seen price) keeps the typed price and points to Settings.
    expect(fill("I'd pay $60")).toEqual({ ...SAW_EMPTY, limitWords: true });
    expect(sawNext(typed, fill("I'd pay $60"), "kettle-black", "kettle-black")).toEqual({ ...typed, limitWords: true });
    expect(sawNext({ ...typed, limitWords: true }, fill("find it cheaper"), null, null)).toEqual(typed);
  });

  it("saw_field_offers_an_unseen_price (item 9 visual review): with no seen word before it, an amount is a tap, never filled", () => {
    const fill = (w: string) => sawPrefill(sawPrice(w));
    // "a kettle for $40" may be a budget: the answer under the field would say "Buy it where you saw it" of it.
    for (const w of ["a kettle for $40", "$40 kettle please", "this kettle is $40 at Target"]) expect([w, fill(w)]).toEqual([w, { value: "", choices: [4000], note: "maybe", limitWords: false }]);
    // A seen word anywhere before the same amount makes it seen: "$55, I saw it for $55".
    for (const w of ["I saw it for $40", "it was $40", "I paid $40", "$40, I saw it for $40"]) expect([w, fill(w).value]).toEqual([w, "40.00"]);
    // An offered amount never replaces a price in the field, but is offered when the field is empty or the item changed.
    const typed = { ...SAW_EMPTY, value: "55" };
    expect(sawNext(typed, fill("a kettle for $40"), "kettle-black", "kettle-black")).toEqual(typed);
    expect(sawNext(typed, fill("a kettle for $40"), null, null)).toEqual(typed);
    expect(sawNext(SAW_EMPTY, fill("a kettle for $40"), null, null)).toEqual(fill("a kettle for $40"));
    expect(sawNext(typed, fill("a toaster for $40"), "kettle-black", "toaster")).toEqual(fill("a toaster for $40"));
  });

  it("saw_field_fills_from_the_words: one amount to fix, two to pick (never guessed), not-a-price said, a limit pointed to Settings", () => {
    const fill = (w: string) => sawPrefill(sawPrice(w));
    expect(fill("I like this kettle, I saw it for fifty-five dollars, see if you can find it cheaper")).toEqual({ value: "55.00", choices: [], note: "spoken", limitWords: false });
    expect(fill("I saw it for $55")).toEqual({ value: "55.00", choices: [], note: null, limitWords: false });
    expect(fill("I saw it for $55, raise my limit to $500")).toEqual({ value: "55.00", choices: [], note: null, limitWords: true });
    expect(fill("it was $49.99 or $54.99")).toEqual({ value: "", choices: [4999, 5499], note: null, limitWords: false });
    expect(fill("I saw it for $0")).toEqual({ value: "", choices: [], note: "not-a-price", limitWords: false });
    expect(fill("$45 max")).toEqual({ value: "", choices: [], note: null, limitWords: true });
    expect(fill("a black kettle like mine")).toEqual({ value: "", choices: [], note: null, limitWords: false });
    for (const w of ["I saw it for fifty five", "it was 55 cents"]) expect([w, fill(w).note]).toEqual([w, "spoken"]);
  });

  it("saw_field_takes_a_plain_amount: what the shopper types is a price or is said not to be", () => {
    for (const [t, c] of [["55", 5500], ["$54.99", 5499], [" 54.9 ", 5490], ["1,299", 129900], ["$ 10000", MAX_SAW_CENTS]] as const) expect([t, sawField(t)]).toEqual([t, { kind: "one", cents: c }]);
    for (const t of ["", "  ", "$"]) expect([t, sawField(t).kind]).toEqual([t, "empty"]);
    for (const t of ["0", "0.00", "-5", "$-5", "1e9", "54.999", "10000.01", "12,34", "fifty", "55 max", "55.", ".5", "9".repeat(20)]) expect([t, sawField(t).kind]).toEqual([t, "not-a-price"]);
  });

  it("photo_tag_never_replaces_a_typed_price (item 12): a tag fills an empty field; the shopper's own price for the same item stays", () => {
    const typed = { ...SAW_EMPTY, value: "40.00" };
    // Typed $40, then a photo of the same kettle with a $55 tag: the field keeps $40.
    expect(sawNext(typed, sawTag(typed, 5500, "kettle", "kettle"), "kettle", "kettle")).toEqual(typed);
    // An empty field takes the tag; a new item starts empty, so its tag fills it.
    expect(sawNext(SAW_EMPTY, sawTag(SAW_EMPTY, 5500, null, "kettle"), null, "kettle")).toEqual({ ...SAW_EMPTY, value: fromCents(5500) });
    expect(sawNext(typed, sawTag(typed, 5500, "toaster", "kettle"), "toaster", "kettle")).toEqual({ ...SAW_EMPTY, value: fromCents(5500) });
    // No tag read: the field is as it was.
    expect(sawNext(typed, sawTag(typed, null, "kettle", "kettle"), "kettle", "kettle")).toEqual(typed);
  });

  it("saw_field_stays_in_the_browser: the Ask box sends only the words, and nothing keeps the amount", () => {
    const src = readFileSync(new URL("../../web/src/AskGoose.tsx", import.meta.url), "utf8");
    // Three bodies leave this box: the Ask's words, item 12's photo (`photoData`'s image and nothing else), and A2's
    // forget, which sends only the remembered chip's key (code-made, from the answer).
    expect(src.match(/body:\s*JSON\.stringify\(([^)]*)\)/g)).toEqual(["body: JSON.stringify({ key })", "body: JSON.stringify(photo)", "body: JSON.stringify({ words })"]);
    expect(src.match(/const photo = [^;]*;/g)).toEqual(['const photo = await import("./snap.ts").then((m) => m.photoData(file)).catch(() => null);']);
    expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|sendBeacon/);
    // The field reads the words that were asked, never seller text: its one source is `sawPrice(asked)`.
    expect(src.match(/sawPrice\([^)]*\)/g)).toEqual(["sawPrice(asked)"]);
  });
});
