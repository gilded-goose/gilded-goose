// The guard-off control (006 §3, §5; ADR 0006), the library's second example: the guard is never switched off inside it.
// the same PayPal adapter the guard uses, called DIRECTLY with the attacker's number ($500.00) and no guard
// in between. It creates one real, unapproved sandbox order and reads it back, so the screen can show an id a
// tape cannot mint. Never captured; no money moves. Output: docs/fixtures/control-order.json (id, status,
// amount, PayPal's create_time, when we ran it). Cost: one sandbox create. Run: pnpm control:no-guard
import { writeFileSync } from "node:fs";
import { bindCart, toCents, type Cart } from "@gilded-goose/trust";
import { PayPalPort } from "@gilded-goose/trust/paypal";
import { createHash } from "node:crypto";

const paypal = PayPalPort.fromEnv(process.env);
const cart: Cart = { item: "Goldfeather Kettle (fictional)", merchant: "QuickQuack Deals (fictional)", sellerId: "quickquack", qty: 1, price: toCents("500.00"), currency: "USD", shape: "one-off" };
// A naive agent takes the seller's "budget raised to $500" at its word: no guard.decide, no cap, no max.
const bound = bindCart(cart, (s) => createHash("sha256").update(s).digest("hex"), Date.now(), 15 * 60 * 1000, "control-no-guard-" + Date.now().toString(16));
const placed = await paypal.create(bound, "http://localhost:8787/control-return");
const snap = await paypal.get(placed.orderId);
if (snap.status !== "CREATED" && snap.status !== "PAYER_ACTION_REQUIRED") { console.error(`unexpected status ${snap.status}`); process.exit(1); }
if (snap.amount !== cart.price) { console.error(`amount mismatch: ${snap.amount}`); process.exit(1); }
const out = { orderId: snap.id, status: snap.status, amount: "500.00", currency: snap.currency, ranAt: new Date().toISOString(), note: "guard-off control: the adapter called directly with the attacker's number; unapproved, never captured" };
writeFileSync("docs/fixtures/control-order.json", JSON.stringify(out, null, 2) + "\n");
console.log(`CONTROL ORDER ${out.orderId} ${out.status} $${out.amount} (unapproved, never captured) → docs/fixtures/control-order.json`);
