import { quoteNote, type BoundCart, type Cart, type PaymentPort, type Want } from "@gilded-goose/trust";
import { createGuard } from "@gilded-goose/trust/node";

const guard = createGuard({ shopperId: "shopper-1", perPurchaseCap: 8000 }); // $80.00, in cents

// Your checkout handler: the agent proposed `cart` for the shopper's `want`. Plain code decides; the model never pays.
// `seller` comes from your own listing for the cart's seller: the note your agent read, word for word, and its completed
// sales (null if you keep no record). The Watcher reads that note, and the cart's store name and title, before anything is bound.
export async function checkout(want: Want, cart: Cart, seller: { note: string; sales: number | null }, paypal: PaymentPort, returnUrl: string) {
  const d = guard.decide(want, cart, [], { quoted: quoteNote(seller.note), history: seller.sales });
  if (d.kind === "refused") return { refused: d.reason };
  const { orderId, approveUrl } = await guard.place(d.bound, paypal, returnUrl); // send the shopper to approveUrl
  return { orderId, approveUrl, bound: d.bound };
}

// Your return handler: PayPal sent the shopper back after their tap. Re-read the order, then capture.
export const onReturn = (bound: BoundCart, orderId: string, paypal: PaymentPort) => guard.settle(bound, orderId, paypal);
