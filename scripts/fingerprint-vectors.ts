// The cart fingerprint's test vectors (docs/fingerprint-v0.md): each cart below is run through the guard's own
// `cartCanonical` and `bindingHash` (trust/src/cart.ts) with SHA-256 from node:crypto, and the answers are written to
// trust/test/vectors.json. Nothing here works a fingerprint out by itself, so the file can only ever say what the shipped
// code says. trust/test/vectors.test.ts recomputes every vector and fails if this script would write a different file.
//
//   node scripts/fingerprint-vectors.ts           rewrites trust/test/vectors.json
//   node scripts/fingerprint-vectors.ts --check   exits 1 if the file on disk differs

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { bindingHash, cartCanonical, type Cart } from "../trust/src/cart.ts";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface Vector {
  name: string;
  /** What this vector is for, in a sentence. */
  note: string;
  /** The cart as the guard holds it: `price` is whole cents. Key order here is part of two vectors' point. */
  cart: Cart;
  nonce: string;
  expiresAt: number;
  /** The exact text hashed. */
  canonical: string;
  /** What goes in PayPal's custom_id. */
  fingerprint: string;
  /** Another vector this one must equal, or must differ from. */
  sameAs?: string;
  differsFrom?: string;
}

/** The cart the guard held for the shopper's yes in recorded week 1 (docs/fixtures/tape-seed-1.json, the row with `data.hash`). */
const RECORDED: Cart = { item: "Goldfeather Kettle (fictional)", merchant: "Reedbank Outfitters (fictional)", sellerId: "reedbank", qty: 1, price: 4773, currency: "USD", shape: "one-off", catalogId: "kettle" };
const NONCE = "9ce301efb8829f5b6d01076ffeacb770";
const EXPIRES = 1760000900000;
const PLAIN: Cart = { item: "Blue mug", merchant: "Pondside Goods", sellerId: "pondside", qty: 2, price: 1850, currency: "USD", shape: "one-off" };
const PAID_TO: Cart = { ...RECORDED, payee: "MERCHANTA1B2C" };
const WITH_ATTRS: Cart = { ...RECORDED, attributes: { size: "1.7 L", colour: "gold", Finish: "matte" } };

type Seed = Omit<Vector, "canonical" | "fingerprint">;
const SEEDS: Seed[] = [
  { name: "recorded-week-1", note: "The recorded demo week's cart. Its fingerprint is the one in docs/fixtures/tape-seed-1.json. It names a catalog entry and no payee, so the payee's place holds null.", cart: RECORDED, nonce: NONCE, expiresAt: EXPIRES },
  { name: "one-cent-more", note: "The same cart at $47.74: one cent changes the fingerprint.", cart: { ...RECORDED, price: 4774 }, nonce: NONCE, expiresAt: EXPIRES, differsFrom: "recorded-week-1" },
  { name: "reordered-fields", note: "The same cart with its fields written in another order. The recipe fixes the order, so the fingerprint is the same.", cart: { shape: "one-off", catalogId: "kettle", currency: "USD", price: 4773, qty: 1, sellerId: "reedbank", merchant: "Reedbank Outfitters (fictional)", item: "Goldfeather Kettle (fictional)" }, nonce: NONCE, expiresAt: EXPIRES, sameAs: "recorded-week-1" },
  { name: "different-nonce", note: "The same cart bound a second time: a new nonce, a new fingerprint.", cart: RECORDED, nonce: "00000000000000000000000000000001", expiresAt: EXPIRES, differsFrom: "recorded-week-1" },
  { name: "one-millisecond-later", note: "The same cart with an expiry one millisecond later.", cart: RECORDED, nonce: NONCE, expiresAt: EXPIRES + 1, differsFrom: "recorded-week-1" },
  { name: "plain-cart", note: "A cart that names no catalog entry, no payee and no attributes: seven fields, then the nonce and the expiry.", cart: PLAIN, nonce: "0123456789abcdef0123456789abcdef", expiresAt: 1790000000000 },
  { name: "with-payee", note: "The recorded cart, paid to a named PayPal merchant id.", cart: PAID_TO, nonce: NONCE, expiresAt: EXPIRES, differsFrom: "recorded-week-1" },
  { name: "different-payee", note: "The same cart paid to another merchant id.", cart: { ...RECORDED, payee: "MERCHANTZ9Y8X" }, nonce: NONCE, expiresAt: EXPIRES, differsFrom: "with-payee" },
  { name: "payee-without-catalog", note: "A payee and no catalog entry: the catalog entry's place holds null.", cart: { ...PLAIN, payee: "MERCHANTA1B2C" }, nonce: "0123456789abcdef0123456789abcdef", expiresAt: 1790000000000, differsFrom: "plain-cart" },
  { name: "unicode-item", note: "Accents, curly quotes, Japanese and an emoji outside the Basic Multilingual Plane. JSON.stringify leaves them as they are; the hash reads their UTF-8 bytes.", cart: { ...PLAIN, item: "Café “Zoë” teapot 急須 🫖", merchant: "Señor Té" }, nonce: "0123456789abcdef0123456789abcdef", expiresAt: 1790000000000, differsFrom: "plain-cart" },
  { name: "escaped-characters", note: "A double quote, a backslash, a newline, a tab and a control character: each is written the way JSON.stringify escapes it.", cart: { ...PLAIN, item: "12\" pan \\ lid\nline two\tend\u0001" }, nonce: "0123456789abcdef0123456789abcdef", expiresAt: 1790000000000, differsFrom: "plain-cart" },
  { name: "with-attributes", note: "Attributes join the text as [key, value] pairs sorted by key, by UTF-16 code unit, so \"Finish\" sorts before \"colour\".", cart: WITH_ATTRS, nonce: NONCE, expiresAt: EXPIRES, differsFrom: "recorded-week-1" },
  { name: "attributes-reordered", note: "The same attributes written in another order: the same fingerprint.", cart: { ...RECORDED, attributes: { Finish: "matte", colour: "gold", size: "1.7 L" } }, nonce: NONCE, expiresAt: EXPIRES, sameAs: "with-attributes" },
  { name: "empty-attributes", note: "An attributes object with nothing in it still adds an empty list, so it is not the cart without attributes.", cart: { ...RECORDED, attributes: {} }, nonce: NONCE, expiresAt: EXPIRES, differsFrom: "recorded-week-1" },
  { name: "free-trial-zero", note: "A $0.00 free trial: the total is written \"0.00\".", cart: { ...PLAIN, qty: 1, price: 0, shape: "free-trial" }, nonce: "0123456789abcdef0123456789abcdef", expiresAt: 1790000000000, differsFrom: "plain-cart" },
  { name: "large-total", note: "$1,234,567.05: no thousands separator, and five cents is written \"05\".", cart: { ...PLAIN, price: 123456705 }, nonce: "0123456789abcdef0123456789abcdef", expiresAt: 1790000000000, differsFrom: "plain-cart" },
];

export function build(): { about: string; hash: string; vectors: Vector[] } {
  return {
    about: "Test vectors for the Gilded Goose cart fingerprint, v0 (docs/fingerprint-v0.md). Written by scripts/fingerprint-vectors.ts from the shipped guard (trust/src/cart.ts); do not edit by hand.",
    hash: "SHA-256 over the canonical text's UTF-8 bytes, lowercase hex, first 32 characters. No key.",
    vectors: SEEDS.map((s) => ({ ...s, canonical: cartCanonical(s.cart, s.nonce, s.expiresAt), fingerprint: bindingHash(s.cart, s.nonce, s.expiresAt, sha256) })),
  };
}

export const VECTORS_FILE = new URL("../trust/test/vectors.json", import.meta.url);
export const fileText = (): string => `${JSON.stringify(build(), null, 2)}\n`;

if (process.argv[1]?.endsWith("fingerprint-vectors.ts")) {
  if (process.argv.includes("--check")) {
    if (readFileSync(VECTORS_FILE, "utf8") !== fileText()) { console.error("fingerprint-vectors FAIL: trust/test/vectors.json is not what the guard gives now. Run node scripts/fingerprint-vectors.ts and read the diff."); process.exit(1); }
    console.log(`fingerprint-vectors: ${build().vectors.length} vectors match the guard`);
  } else {
    writeFileSync(VECTORS_FILE, fileText());
    console.log(`fingerprint-vectors: wrote ${build().vectors.length} vectors`);
  }
}
