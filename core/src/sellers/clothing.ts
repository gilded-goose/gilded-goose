// The second category (restart notes §1 piece 3, §19 layer 5): clothing, two fictional jackets with colors and sizes,
// on the same moving-price model as the ticket, the hotel night and the flight seat (core/src/sellers/moving.ts), so the
// price watch, the Watcher and layer 4 read them with no new rule. Two jackets, not one, because layer 5 ("a similar
// black jacket is $W, not the same item") needs a look-alike: same category and options, a different catalog entry.
// Each listing says which colors and sizes it comes in, so a "black, medium" ask only ever reads a listing that has
// both. No real brand or store (trademark rule); every price is a total, fees and taxes in.

import { at, type MovingItem } from "./moving.ts";

/** The words a jacket's options come in, as the catalog and the shopper's chips read them. */
export const JACKET_OPTIONS = { color: ["black", "navy", "olive", "yellow"], size: ["small", "medium", "large"] } as const;

/**
 * The recorded week for clothing. The Harbor Jacket drops at its established store mid-week (an end-of-season
 * markdown), a steadier store lists it in fewer options, and a gift-card seller undercuts both: a refusal, never a deal.
 * The Tidewater Jacket is the look-alike: cheaper at an established store, and listed lower still by a store with no
 * sales yet (a hold, never "similar for less"). Under the demo's $100.00 per-purchase cap.
 */
export const JACKETS: readonly MovingItem[] = [
  {
    id: "harbor-jacket", item: "Harbor Jacket (fictional)", category: "clothing", noun: "jacket",
    sellers: [
      { sellerId: "driftline", name: "Driftline Outfitters (fictional)", note: "", history: 2100,
        attributes: { color: ["black", "navy"], size: ["small", "medium", "large"] },
        curve: [at(0, 7400, 600), at(2, 6900, 600), at(4, 6300, 600), at(6, 6800, 600)] },
      { sellerId: "saltmarsh", name: "Saltmarsh Supply (fictional)", note: "", history: 650,
        attributes: { color: ["black", "olive"], size: ["medium", "large"] },
        curve: [at(0, 7200, 700)] },
      { sellerId: "jacketquack", name: "JacketQuack (fictional)", note: "Clearance! Pay with a gift card and it ships tonight.", history: 30,
        attributes: { color: ["black", "navy", "olive", "yellow"], size: ["small", "medium", "large"] },
        curve: [at(1, 3500, 0)] },
    ],
  },
  {
    id: "tidewater-jacket", item: "Tidewater Jacket (fictional)", category: "clothing", noun: "jacket",
    sellers: [
      { sellerId: "gullfeather", name: "Gullfeather Goods (fictional)", note: "", history: 1500,
        attributes: { color: ["black", "yellow"], size: ["small", "medium", "large"] },
        curve: [at(0, 5400, 500), at(3, 4800, 400)] },
      { sellerId: "ferrylane", name: "Ferrylane Co. (fictional)", note: "", history: 0,
        attributes: { color: ["black", "navy"], size: ["medium"] },
        curve: [at(2, 4100, 400)] },
    ],
  },
];
