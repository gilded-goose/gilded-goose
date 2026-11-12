// The cart fingerprint's test vectors (docs/fingerprint-v0.md): every cart in vectors.json, run again through the shipped
// `cartCanonical` and `bindingHash` with SHA-256 from node:crypto. The file was written by scripts/fingerprint-vectors.ts
// from the same two functions, so a change to the recipe in trust/src/cart.ts fails here until the vectors, the recipe's
// page and its version are changed with it. The browser's own telling is held to these vectors in
// core/test/fingerprint-recompute.test.ts.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bindingHash, cartCanonical, checkBoundCart, type BoundCart, type Cart, type OrderSnapshot } from "../src/cart.ts";

interface Vector { name: string; note: string; cart: Cart; nonce: string; expiresAt: number; canonical: string; fingerprint: string; sameAs?: string; differsFrom?: string }
const { vectors } = JSON.parse(readFileSync(new URL("./vectors.json", import.meta.url), "utf8")) as { vectors: Vector[] };
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const named = (n: string) => { const v = vectors.find((x) => x.name === n); if (!v) throw new Error(`no vector named ${n}`); return v; };

describe("cart fingerprint v0: the test vectors", () => {
  it("there are at least ten, each with its own name and a note", () => {
    expect(vectors.length).toBeGreaterThanOrEqual(10);
    expect(new Set(vectors.map((v) => v.name)).size).toBe(vectors.length);
    for (const v of vectors) expect(v.note.length).toBeGreaterThan(20);
  });

  it.each(vectors.map((v) => [v.name, v] as const))("%s: the guard gives this text and this fingerprint", (_name, v) => {
    expect(cartCanonical(v.cart, v.nonce, v.expiresAt)).toBe(v.canonical);
    expect(bindingHash(v.cart, v.nonce, v.expiresAt, sha256)).toBe(v.fingerprint);
    // The recipe's three steps, spelled out: the text's UTF-8 bytes, SHA-256, the first 32 hex characters.
    expect(createHash("sha256").update(Buffer.from(v.canonical, "utf8")).digest("hex").slice(0, 32)).toBe(v.fingerprint);
    expect(v.fingerprint).toMatch(/^[0-9a-f]{32}$/);
  });

  it("the edge cases the recipe names are among them", () => {
    for (const n of ["one-cent-more", "different-payee", "unicode-item", "reordered-fields", "escaped-characters", "attributes-reordered", "empty-attributes"]) named(n);
    expect(named("one-cent-more").cart.price - named("recorded-week-1").cart.price).toBe(1);
    expect(Object.keys(named("reordered-fields").cart)).not.toEqual(Object.keys(named("recorded-week-1").cart));
    expect(named("reordered-fields").cart).toEqual(named("recorded-week-1").cart);
    expect(named("different-payee").cart.payee).not.toBe(named("with-payee").cart.payee);
    expect(Object.keys(named("attributes-reordered").cart.attributes!)).not.toEqual(Object.keys(named("with-attributes").cart.attributes!));
    expect(/[^\u0000-￿]/u.test(named("unicode-item").cart.item)).toBe(true);
  });

  it("a vector marked the same as another has its fingerprint, and one marked different does not", () => {
    const same = vectors.filter((v) => v.sameAs !== undefined), differ = vectors.filter((v) => v.differsFrom !== undefined);
    expect(same.length).toBeGreaterThanOrEqual(2);
    expect(differ.length).toBeGreaterThanOrEqual(8);
    for (const v of same) expect(v.fingerprint).toBe(named(v.sameAs!).fingerprint);
    for (const v of differ) expect(v.fingerprint).not.toBe(named(v.differsFrom!).fingerprint);
  });

  it("what binds: the re-check before capture passes an order that holds the cart's fingerprint, and refuses every other vector's", () => {
    for (const v of vectors) {
      const bound: BoundCart = { cart: v.cart, nonce: v.nonce, expiresAt: v.expiresAt, hash: v.fingerprint, orderId: "ORDER-1", spent: false };
      const order = (customId: string | undefined): OrderSnapshot => ({ id: "ORDER-1", status: "APPROVED", amount: v.cart.price, currency: v.cart.currency, customId, ...(v.cart.payee === undefined ? {} : { payee: v.cart.payee }) });
      expect(checkBoundCart(bound, order(v.fingerprint), v.expiresAt)).toEqual({ ok: true });
      expect(checkBoundCart(bound, order(undefined), v.expiresAt)).toMatchObject({ ok: false, code: "hash" });
      for (const other of vectors.filter((o) => o.fingerprint !== v.fingerprint)) expect(checkBoundCart(bound, order(other.fingerprint), v.expiresAt)).toMatchObject({ ok: false, code: "hash" });
    }
  });
});
