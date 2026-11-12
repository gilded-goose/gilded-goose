import { readSeller } from "@gilded-goose/trust";

// Your listing handler: read a seller's note before your agent acts on it. Plain code, no model and no network.
export function screenSeller(note: string) {
  const { verdict, rule, reason, cantSee } = readSeller(note);
  if (verdict === "refuse") return { show: false, rule, reason }; // leave this seller out of what your agent may buy
  return { show: true, askShopperFirst: verdict === "hold", reason, cantSee }; // clear isn't safe: keep your limit and the shopper's tap
}
