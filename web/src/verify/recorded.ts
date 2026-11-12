// The cart "Recompute it yourself" starts from on Under the hood: the one the guard held for the shopper's yes in
// recorded week 1. Its fingerprint is the `data.hash` of that row in docs/fixtures/tape-seed-1.json, and
// core/test/fingerprint-recompute.test.ts replays the week through the shipped guard and holds every field here to
// the text the guard hashed. A practice run: no PayPal order was made for it.
import type { FingerprintFields } from "./recompute.ts";

export const RECORDED_FIELDS: FingerprintFields = {
  item: "Goldfeather Kettle (fictional)",
  merchant: "Reedbank Outfitters (fictional)",
  sellerId: "reedbank",
  qty: 1,
  price: 4773,
  currency: "USD",
  shape: "one-off",
  catalogId: "kettle",
  nonce: "9ce301efb8829f5b6d01076ffeacb770",
  expiresAt: 1760000900000,
};

/** The fingerprint the recorded week's file holds for that cart. */
export const RECORDED_FINGERPRINT = "79bb57798eb7360767778c2bd795f0c3";
