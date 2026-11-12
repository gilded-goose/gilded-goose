// The edit boxes of "Recompute it yourself", as plain functions: a cart's fields to the text in its boxes, the boxes read
// back as fields (or the one line saying why they give no fingerprint), and the rows in the recipe's order. No React and
// nothing but this folder's own files, so core/test/fingerprint-recompute.test.ts runs them as they are.
import { centsOf, dollars, type FingerprintFields } from "./recompute.ts";
import { FIELD_WORDS, RECOMPUTE_LABELS as L } from "./words.ts";

/** The fields a reader may change, as the text in their boxes. The rest are shown as they are. */
export type Editable = "item" | "merchant" | "sellerId" | "qty" | "price" | "catalogId" | "payee";
export type Draft = Partial<Record<Editable, string>>;

export const draftOf = (f: FingerprintFields): Draft => ({
  item: f.item, merchant: f.merchant, sellerId: f.sellerId, qty: String(f.qty), price: safeDollars(f.price),
  ...(f.catalogId === undefined ? {} : { catalogId: f.catalogId }),
  ...(f.payee === undefined ? {} : { payee: f.payee }),
});

export function safeDollars(cents: number): string {
  try { return dollars(cents); } catch { return String(cents); }
}

/** The boxes read back as fields, or the one line saying why they give no fingerprint. */
export function readDraft(from: FingerprintFields, d: Draft): { fields: FingerprintFields } | { error: string } {
  const qty = (d.qty ?? "").trim();
  if (!/^\d{1,9}$/.test(qty)) return { error: L.badQty };
  const price = centsOf(d.price ?? "");
  if (price === null) return { error: L.badTotal };
  return {
    fields: {
      ...from, item: d.item ?? from.item, merchant: d.merchant ?? from.merchant, sellerId: d.sellerId ?? from.sellerId, qty: Number(qty), price,
      ...(d.catalogId === undefined ? {} : { catalogId: d.catalogId }),
      ...(d.payee === undefined ? {} : { payee: d.payee }),
    },
  };
}

export type Row = { key: keyof typeof FIELD_WORDS; edit?: Editable; value: string; quiet?: boolean };

/** The rows in the recipe's order: only the places this cart's text has. */
export function rowsOf(f: FingerprintFields): Row[] {
  const named = f.catalogId !== undefined || f.payee !== undefined;
  return [
    { key: "item", edit: "item", value: f.item },
    { key: "merchant", edit: "merchant", value: f.merchant },
    { key: "sellerId", edit: "sellerId", value: f.sellerId },
    { key: "qty", edit: "qty", value: String(f.qty) },
    { key: "price", edit: "price", value: safeDollars(f.price) },
    { key: "currency", value: f.currency },
    { key: "shape", value: f.shape },
    ...(named ? [
      f.catalogId === undefined ? { key: "catalogId" as const, value: L.none, quiet: true } : { key: "catalogId" as const, edit: "catalogId" as const, value: f.catalogId },
      f.payee === undefined ? { key: "payee" as const, value: L.none, quiet: true } : { key: "payee" as const, edit: "payee" as const, value: f.payee },
    ] : []),
    ...(f.attributes === undefined ? [] : [{ key: "attributes" as const, value: JSON.stringify(Object.entries(f.attributes).sort(([a], [b]) => (a < b ? -1 : 1))) }]),
    { key: "nonce", value: f.nonce },
    { key: "expiresAt", value: String(f.expiresAt) },
  ];
}
