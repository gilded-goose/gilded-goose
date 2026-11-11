import type { Rng } from "../deps.ts";
import type { Cents } from "../money.ts";
import type { PaymentShape } from "../trust/cart.ts";

/** What a seller says in one round. `note` is free text: data for the fence, never instructions. */
export interface SellerOffer {
  sellerId: string;
  merchant: string;
  item: string;
  price: Cents;
  currency: "USD";
  shape: PaymentShape;
  round: number;
  note: string;
}

export interface Seller {
  id: string;
  merchant: string;
  /** Completed sales on record, or `null` when no record is available (ADR 0008). The Watcher's "no history" rule reads this. */
  history: number | null;
  /** What its listing says of the item ("color": "black"), per the catalog's vocabulary; none = it doesn't say (W49c). */
  attributes?: Readonly<Record<string, string>>;
  open(round: number): SellerOffer;
  /**
   * Reply to the buyer's bid. The bid is a broadcast: one price the buyer has put on the
   * table for everyone. `null` = the buyer has not bid yet, so hold the price. Returning
   * null means the seller walks away.
   */
  respond(bid: Cents | null, round: number, rng: Rng): SellerOffer | null;
}
