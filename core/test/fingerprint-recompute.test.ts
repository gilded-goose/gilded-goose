// "Recompute it yourself" (web/src/verify): the browser's own telling of the cart fingerprint, written from the recipe
// (docs/fingerprint-v0.md) with Web Crypto and no import, is held equal to the guard's `cartCanonical` and `bindingHash`
// here: on every vector in trust/test/vectors.json, on a seeded sweep of bent carts, and on the recorded cart Under the
// hood shows. Also held: the vectors file is what the generator writes, the recipe's worked example is the first vector,
// the part has no way to send or keep anything, and every value is drawn as text.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MemoryLedger, RecordedPort, bindingHash, cartCanonical, demoDeps, demoGuard, demoSellers, demoWant, isDemoWeek, runHaggle, seededRng, DEMO_ENTRY, DEMO_SHOPPER, type Cart, type Tape } from "@goose/core";
import { canonical, centsOf, dollars, fieldsOf, fingerprint, fingerprintOfText, type FingerprintFields } from "../../web/src/verify/recompute.ts";
import { draftOf, readDraft, rowsOf } from "../../web/src/verify/draft.ts";
import { RECORDED_FIELDS, RECORDED_FINGERPRINT } from "../../web/src/verify/recorded.ts";
import { MATCH_WORDS, RECIPE_FILE, RECOMPUTE_LABELS, RECOMPUTE_RECORDED, VECTORS_FILE, VECTORS_LINK } from "../../web/src/verify/words.ts";
import { fileText } from "../../scripts/fingerprint-vectors.ts";

interface Vector { name: string; cart: Cart; nonce: string; expiresAt: number; canonical: string; fingerprint: string }
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const { vectors } = JSON.parse(read("trust/test/vectors.json")) as { vectors: Vector[] };
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const named = (n: string) => vectors.find((v) => v.name === n)!;

describe("the browser's fingerprint equals the guard's", () => {
  it.each(vectors.map((v) => [v.name, v] as const))("%s: the same text and the same fingerprint, from Web Crypto and from bindingHash", async (_n, v) => {
    const fields = fieldsOf(v);
    expect(canonical(fields)).toBe(cartCanonical(v.cart, v.nonce, v.expiresAt));
    expect(canonical(fields)).toBe(v.canonical);
    const mine = await fingerprint(fields), guards = bindingHash(v.cart, v.nonce, v.expiresAt, sha256);
    expect(mine).toBe(guards);
    expect(mine).toBe(v.fingerprint);
  });

  it("a seeded sweep of 400 bent carts: quotes, controls, emoji, lone surrogates, every mix of the optional fields", async () => {
    const rng = seededRng(20261111);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rng.next() * xs.length)]!;
    const BITS = ["a", "Z", " ", "\"", "\\", "\n", "\t", "\u0000", "\u001f", "\u007f", " ", "é", "é", "急", "🫖", "\ud83e", "\udd16", "/", "<b>", "null", ",", "[", "]"];
    const word = () => Array.from({ length: Math.floor(rng.next() * 9) }, () => pick(BITS)).join("");
    let withNamed = 0, withAttrs = 0;
    for (let i = 0; i < 400; i++) {
      const cart: Cart = {
        item: word(), merchant: word(), sellerId: word(), qty: Math.floor(rng.next() * 50), price: Math.floor(rng.next() * 10 ** pick([1, 3, 6, 12])), currency: "USD", shape: pick(["one-off", "pay-later", "subscription", "free-trial"] as const),
        ...(rng.next() < 0.4 ? { catalogId: word() } : {}),
        ...(rng.next() < 0.4 ? { payee: word() } : {}),
        ...(rng.next() < 0.5 ? { attributes: Object.fromEntries(Array.from({ length: Math.floor(rng.next() * 5) }, () => [word(), word()])) } : {}),
      };
      const nonce = word(), expiresAt = Math.floor(rng.next() * 2e12);
      if (cart.catalogId !== undefined || cart.payee !== undefined) withNamed++;
      if (cart.attributes !== undefined) withAttrs++;
      const fields = fieldsOf({ cart, nonce, expiresAt });
      expect(canonical(fields), `cart ${i}`).toBe(cartCanonical(cart, nonce, expiresAt));
      expect(await fingerprint(fields), `cart ${i}`).toBe(bindingHash(cart, nonce, expiresAt, sha256));
    }
    // The sweep reached the optional places, so "equal" covers them.
    expect(withNamed).toBeGreaterThan(100);
    expect(withAttrs).toBeGreaterThan(100);
  });

  it("a total that isn't whole, non-negative cents has no fingerprint in either", () => {
    for (const price of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      const cart = { ...named("plain-cart").cart, price };
      expect(() => cartCanonical(cart, "n", 1), String(price)).toThrow();
      expect(() => canonical(fieldsOf({ cart, nonce: "n", expiresAt: 1 })), String(price)).toThrow();
    }
  });

  it("the hash is plain SHA-256 of the text, cut to 32: no key goes in", async () => {
    const text = named("recorded-week-1").canonical;
    expect(await fingerprintOfText(text)).toBe(sha256(text).slice(0, 32));
    expect(fingerprintOfText.length).toBe(1); // the text, and nothing else that isn't defaulted
  });
});

describe("the edit boxes", () => {
  it("one cent on the total breaks the match, and Reset's fields give it back", async () => {
    const start = draftOf(RECORDED_FIELDS);
    expect(start.price).toBe("47.73");
    const same = readDraft(RECORDED_FIELDS, start);
    expect("fields" in same && await fingerprint(same.fields)).toBe(RECORDED_FINGERPRINT);
    const bumped = readDraft(RECORDED_FIELDS, { ...start, price: dollars(centsOf(start.price!)! + 1) });
    expect("fields" in bumped && bumped.fields.price).toBe(4774);
    const moved = "fields" in bumped ? await fingerprint(bumped.fields) : "";
    expect(moved).toBe(named("one-cent-more").fingerprint);
    expect(moved).not.toBe(RECORDED_FINGERPRINT);
  });

  it("a box that can't be read gives no fingerprint and says why", () => {
    const start = draftOf(RECORDED_FIELDS);
    for (const price of ["", "abc", "47.733", "-1", "4 7", "1e3"]) expect(readDraft(RECORDED_FIELDS, { ...start, price })).toEqual({ error: RECOMPUTE_LABELS.badTotal });
    for (const qty of ["", "one", "1.5", "-2"]) expect(readDraft(RECORDED_FIELDS, { ...start, qty })).toEqual({ error: RECOMPUTE_LABELS.badQty });
    expect(centsOf(" 47.7 ")).toBe(4770);
  });

  it("the rows are the text's own places, in its order", () => {
    for (const v of vectors) {
      const f = fieldsOf(v), places = JSON.parse(canonical(f)) as unknown[];
      expect(rowsOf(f).length, v.name).toBe(places.length);
    }
    expect(rowsOf(RECORDED_FIELDS).map((r) => r.key)).toEqual(["item", "merchant", "sellerId", "qty", "price", "currency", "shape", "catalogId", "payee", "nonce", "expiresAt"]);
    expect(rowsOf(RECORDED_FIELDS).find((r) => r.key === "payee")).toMatchObject({ value: RECOMPUTE_LABELS.none });
  });
});

describe("the recorded cart is the recorded week's own", () => {
  it("replayed through the shipped guard, week 1 hashes exactly this text, and the tape holds this fingerprint", async () => {
    const tape = JSON.parse(read("docs/fixtures/tape-seed-1.json")) as Tape;
    if (!isDemoWeek(tape.meta.week)) throw new Error("tape-seed-1 is not a demo week");
    const hashed: string[] = [];
    const deps = demoDeps(tape.meta.seed, (s) => { hashed.push(s); return sha256(s); });
    const ledger = new MemoryLedger();
    await runHaggle({ want: demoWant(), sellers: demoSellers(tape.meta.week), buyer: new RecordedPort(tape, sha256), guard: demoGuard(deps, ledger), deps, ledger, shopperId: DEMO_SHOPPER, catalogId: DEMO_ENTRY });
    expect(hashed).toContain(canonical(RECORDED_FIELDS));
    const held = (tape.ledger ?? []).filter((e) => typeof e.data?.hash === "string");
    expect(held.map((e) => [e.actor, e.action, e.price, e.data?.hash])).toEqual([["guard", "ask", "47.73", RECORDED_FINGERPRINT]]);
    expect(await fingerprint(RECORDED_FIELDS)).toBe(RECORDED_FINGERPRINT);
    expect(fieldsOf(named("recorded-week-1"))).toEqual(RECORDED_FIELDS);
    // What the screen says of it: a practice run, and no PayPal order.
    expect((tape.ledger ?? []).filter((e) => e.actor === "paypal")).toEqual([]);
    expect(RECOMPUTE_RECORDED).toContain("No PayPal order was made for this cart");
  });
});

describe("the vectors file and the recipe's page", () => {
  it("trust/test/vectors.json is byte for byte what scripts/fingerprint-vectors.ts writes from the guard", () => {
    expect(read("trust/test/vectors.json")).toBe(fileText());
  });

  it("the page's worked example is the first vector, and its counts are the file's", () => {
    const doc = read("docs/fingerprint-v0.md"), v = named("recorded-week-1");
    expect(doc).toContain(v.canonical);
    expect(doc).toContain(sha256(v.canonical));
    expect(doc).toContain(`\n${v.fingerprint}\n`);
    expect(doc).toContain(`(${Buffer.byteLength(v.canonical)} bytes, one line)`);
    expect(doc).toContain(`becomes \`${named("one-cent-more").fingerprint}\``);
    expect(doc.match(/\b(\d+) carts\b/g)).toEqual([`${vectors.length} carts`, `${vectors.length} carts`]);
    expect(VECTORS_LINK).toBe(`${vectors.length} test vectors`);
  });

  it("it is our recipe: no line here or on screen calls it a standard, a signature we make, or keyed", () => {
    const texts = ["docs/fingerprint-v0.md", "web/src/verify/words.ts"].map((f) => [f, read(f)] as const);
    for (const [f, t] of texts) {
      const lines = t.split("\n").filter((l) => /\bstandard\b/i.test(l) && !/not a standard/i.test(l));
      expect(lines, f).toEqual([]);
      expect(t, f).not.toMatch(/\b(?:signed fingerprint|HMAC|tamper-proof|cryptographically (?:signed|bound))\b/i);
    }
    expect(read("docs/fingerprint-v0.md")).toContain("**This is our recipe, not a standard.**");
    expect(read("docs/fingerprint-v0.md")).toContain("the hash has no key");
  });
});

describe("the part sends nothing, keeps nothing, and draws every value as text", () => {
  const FILES = ["recompute.ts", "draft.ts", "recorded.ts", "words.ts", "Recompute.tsx"];
  const code = (f: string) => read(`web/src/verify/${f}`).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

  it("recompute.ts imports nothing: it is the recipe told a second time, not the guard's code", () => {
    expect(code("recompute.ts")).not.toMatch(/\bimport\b|\brequire\(/);
  });

  it("no file of the part has a way out or a place to keep anything", () => {
    for (const f of FILES) {
      expect(code(f), f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|\bimport\s*\(|localStorage|sessionStorage|indexedDB|document\.cookie|\bnavigator\.|\blocation\b|postMessage|<img|<iframe|<form|target=/);
      expect(code(f), f).not.toMatch(/dangerouslySetInnerHTML|innerHTML|\beval\(|new Function/);
    }
    // Its only links are the two copies this site serves itself: no address typed in, nothing off the site.
    for (const link of ["href={`${import.meta.env.BASE_URL}${RECIPE_FILE}`}", "href={`${import.meta.env.BASE_URL}${VECTORS_FILE}`}"]) expect(code("Recompute.tsx")).toContain(link);
    expect(code("Recompute.tsx").match(/href=/g)).toHaveLength(2);
    for (const f of FILES) expect(code(f), f).not.toMatch(/https?:\/\//);
    // The part's own imports stay in its folder, but for the site's button and tag.
    const imports = [...code("Recompute.tsx").matchAll(/from "([^"]+)"|import "([^"]+)"/g)].map((m) => m[1] ?? m[2]);
    expect(imports.sort()).toEqual(["../site/ui/Button.tsx", "../site/ui/Provenance.tsx", "./draft.ts", "./recompute.css", "./recompute.ts", "./recorded.ts", "./words.ts", "react"].sort());
  });

  it("rendered: a cart whose fields carry markup shows it as text, with each input, the value compared and the words for where it came from", async () => {
    const fromWeb = createRequire(new URL("../../web/package.json", import.meta.url));
    const { createElement } = fromWeb("react") as { createElement: (c: unknown, p: unknown) => unknown };
    const { renderToStaticMarkup } = fromWeb("react-dom/server") as { renderToStaticMarkup: (el: unknown) => string };
    // Loaded at run time: core's typecheck has no JSX, so it must not follow a static import into a .tsx.
    const PART = fileURLToPath(new URL("../../web/src/verify/Recompute.tsx", import.meta.url));
    const { Recompute, default: RecordedRecompute } = await import(PART) as { Recompute: (p: { fields: FingerprintFields; customId: string | null; witness: "paypal" | "stored" | "recorded" }) => unknown; default: () => unknown };
    const bent: FingerprintFields = { ...RECORDED_FIELDS, item: "<img src=x onerror=alert(1)>", payee: "\"><script>alert(2)</script>", attributes: { "<b>": "</pre><i>" } };
    const html = renderToStaticMarkup(createElement(Recompute, { fields: bent, customId: "<u>abc</u>", witness: "paypal" }));
    expect(html).not.toMatch(/<img|<script|<u>|<i>|<b>/);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;u&gt;abc&lt;/u&gt;");
    expect(html).toContain("PayPal&#x27;s custom_id");
    expect(html).not.toContain("Recorded");

    const recorded = renderToStaticMarkup(createElement(RecordedRecompute, {}));
    const text = recorded.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
    for (const shown of [RECORDED_FINGERPRINT, RECORDED_FIELDS.nonce, String(RECORDED_FIELDS.expiresAt), "USD", "one-off", RECOMPUTE_RECORDED, canonical(RECORDED_FIELDS), "The recipe, step by step", "16 test vectors"]) expect(text).toContain(shown);
    expect(recorded).toContain(`href="/${RECIPE_FILE}"`);
    expect(recorded).toContain(`href="/${VECTORS_FILE}"`);
    // The page names no repo file: the public copy may not hold it yet, and the site's own copies are the ones linked.
    expect(text).not.toMatch(/docs\/|trust\/test/);
    for (const boxed of ["Goldfeather Kettle (fictional)", "Reedbank Outfitters (fictional)", "reedbank", "47.73", "kettle"]) expect(recorded).toContain(`value="${boxed}"`);
    expect(recorded.match(/<input /g)).toHaveLength(6);
    expect(recorded.match(/<label /g)).toHaveLength(6);
    // Before the browser has hashed, it claims no match: the words wait for the answer.
    expect(text).not.toContain(MATCH_WORDS.recorded.match);
    expect(text).toContain(RECOMPUTE_LABELS.working);
  });
});

describe("where the part is mounted, and what the site serves beside it", () => {
  it("only Under the hood mounts it, by its default export: the recorded cart, never the PayPal words", () => {
    const walk = (dir: string): string[] => readdirSync(new URL(`../../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []);
    const mounts = walk("web/src").filter((f) => !f.startsWith("web/src/verify/") && /verify\/Recompute\.tsx/.test(read(f)));
    // When the Verify page mounts `Recompute` with a real order's fields and custom_id, its file joins this list, with the
    // check that it passes "paypal" only for an order PayPal answered for.
    expect(mounts).toEqual(["web/src/site/hood/Below.tsx"]);
    const below = read("web/src/site/hood/Below.tsx");
    expect(below).toContain('lazyPage(() => import("../../verify/Recompute.tsx"), RecomputeLost)');
    expect(below).not.toMatch(/witness|customId/);
    expect(below).toContain('aria-labelledby="hood-recompute-h"');
    // The page itself pays nothing for it: the section rides the ledger's chunk.
    const page = read("web/src/site/hood/Page.tsx");
    expect(page.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n")).not.toMatch(/verify\/|[Rr]ecompute/);
    expect(page).toContain('lazyPage(() => import("./Below.tsx"))');
  });

  it("the build writes the recipe and the vectors into the site from their own files, and no page imports them", () => {
    const plugin = read("web/fingerprint-recipe.ts");
    expect(plugin).toContain('fileName: RECIPE_FILE, source: readFileSync(new URL("../docs/fingerprint-v0.md", import.meta.url))');
    expect(plugin).toContain('fileName: VECTORS_FILE, source: readFileSync(new URL("../trust/test/vectors.json", import.meta.url))');
    expect(read("web/vite.config.ts")).toContain("fingerprintRecipe(), ");
    expect([RECIPE_FILE, VECTORS_FILE]).toEqual(["fingerprint-v0.txt", "fingerprint-vectors.json"]);
    // Shown as plain text in a tab, whatever charset the host names: the page is ASCII only.
    expect(/^[\n\x20-\x7e]*$/.test(read("docs/fingerprint-v0.md"))).toBe(true);
  });
});
