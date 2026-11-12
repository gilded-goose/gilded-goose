// End-to-end against the PayPal sandbox, exit 1 on any failure.
//
//   pnpm e2e:sandbox            unattended: haggle → guard → real order; early-capture
//                               control; custom_id round-trip; mock INSTRUMENT_DECLINED
//                               (with a no-header control). Prints the approve URL and
//                               saves the bound cart to .goose/last-bound.json.
//   pnpm e2e:settle <orderId>   attended: after the shopper's tap, verify + capture, then write the order as PayPal
//                               returns it to docs/fixtures/merchant-order.json (Behind the scenes, For merchants).
//   pnpm e2e:settle-void <orderId>
//                               attended, AUTHORIZE only: after the tap, PayPal holds the money, the cart
//                               changes by one cent (the wallet's price swap, `swapAfterHold`), and the guard must void the hold. Passes only when PayPal shows the
//                               authorization VOIDED and no capture; a capture call stops the script first.
//   PAYMENT_INTENT              AUTHORIZE by default (021 §3 decision 1, flipped after both attended runs passed
//                               Oct 28): the early control is an authorize, the decline beat is skipped, and
//                               settle authorizes, re-checks, then captures the bound amount or voids.
//                               PAYMENT_INTENT=CAPTURE runs the one-step path.
//
// Wall clock and a fresh seed, like a live run: the 15-minute approval expiry is
// real and every run binds a new nonce and hash. The buyer is Claude (the shipping
// raced Haiku) when the key is set, like the server; BUYER=rule runs the rule engine.
// Sandbox only (the adapter refuses anything else). Keys from .env, never printed.

import { createHash, randomInt } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { MemoryLedger, RuleBuyer, demoDeps, demoGuard, demoSellers, demoWant, paymentIntent, runHaggle, swapAfterHold, fromCents, DEMO_ENTRY, DEMO_SHOPPER, DAY_MS, type BoundCart, type LlmPort } from "@goose/core";
import { readRecorded, type RecordedOrder } from "@goose/core/merchants";
import { PayPalPort } from "../server/src/adapters/paypal.ts";
import { listedCaptureEvent } from "./merchant-event.ts";
import { makeClaudeBuyer } from "../server/src/adapters/claude.ts";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const STATE = ".goose/last-bound.json";
/** The recorded sandbox order Behind the scenes shows for merchants: written by a passing `e2e:settle`. */
const MERCHANT_FILE = "docs/fixtures/merchant-order.json";
function fail(m: string): never { console.error(`E2E FAIL: ${m}`); process.exit(1); }
const ok = (m: string) => console.log(`ok  ${m}`);

const [mode, orderIdArg] = process.argv.slice(2);
const INTENT = paymentIntent(process.env.PAYMENT_INTENT);
const paypal = PayPalPort.fromEnv(process.env);
// A fresh seed per run, printed so a failure can be replayed: SEED=<n> pnpm e2e:sandbox.
const seed = process.env.SEED ? Number(process.env.SEED) : randomInt(1, 2 ** 31);
const deps = { ...demoDeps(seed, sha256), clock: { now: () => Date.now() } };
const ledger = new MemoryLedger();
// The guard the server ships (W6): its catalog, its Policy, and every cart naming the kettle's entry.
const guard = demoGuard(deps, ledger);

if (mode === "settle") {
  if (!orderIdArg) fail("usage: e2e:settle <orderId>");
  const saved = JSON.parse(readFileSync(STATE, "utf8")) as BoundCart;
  if (saved.orderId !== orderIdArg) fail(`saved cart belongs to order ${saved.orderId}, not ${orderIdArg}`);
  // Before the settle, so a cart placed the other way is never captured by this run.
  if ((saved.intent ?? "CAPTURE") !== INTENT) fail(`saved cart was placed as ${saved.intent ?? "CAPTURE"}, not ${INTENT}`);
  // For merchants (scorecard row 20): PayPal's own word that the shopper approved, and the custom_id it carries, read
  // before the guard's settle (a read: the guard re-reads and re-checks it again before it captures anything).
  const approved = await paypal.get(orderIdArg!);
  if (approved.status !== "APPROVED") fail(`PayPal shows the order ${approved.status}, not APPROVED: tap Approve in PayPal first`);
  if (approved.customId !== saved.hash) fail("PayPal's custom_id isn't the bound cart's hash");
  const approvedSeenAt = new Date().toISOString();
  const r = await guard.settle(saved, orderIdArg!, paypal);
  if (!r.ok) fail(`settle refused: ${r.reason}`);
  if (INTENT === "AUTHORIZE" && !ledger.read().some((e) => e.action === "authorized")) fail("AUTHORIZE settle wrote no authorized row");
  ok(`captured ${r.captureId}; ledger: ${ledger.read().map((e) => e.action).join(" → ")}; ${ledger.read().at(-1)?.why}`);
  await recordForMerchants(saved, r.captureId, approvedSeenAt);
  console.log("E2E SETTLE PASS");
  process.exit(0);
}

/**
 * The recorded sandbox order Behind the scenes shows first (core/src/view/merchants.ts, docs/fixtures/merchant-order.json):
 * every field as PayPal returns it after the capture, and PayPal's own capture event, found in PayPal's event list and
 * kept only when the server's own `webhookMatches` ties it to this order and the event names this cart's hash. A list
 * read carries no signature, so the view never calls it signed. Reads only; nothing here can spend.
 */
async function recordForMerchants(saved: BoundCart, captureId: string, approvedSeenAt: string): Promise<void> {
  const after = await paypal.get(saved.orderId!);
  if (after.customId !== saved.hash) fail("after the capture, PayPal's custom_id isn't the bound cart's hash");
  const event = await captureEvent(saved, captureId, Date.parse(approvedSeenAt));
  const record: RecordedOrder = {
    recordedOn: new Date().toISOString().slice(0, 10), orderId: saved.orderId!, intent: INTENT, status: after.status, captureId,
    amount: fromCents(after.amount), currency: after.currency, cartHash: after.customId!, approvedSeenAt, event,
  };
  if (!readRecorded(record)) fail(`the record for Behind the scenes doesn't read back: ${JSON.stringify(record)}`);
  mkdirSync("docs/fixtures", { recursive: true });
  writeFileSync(MERCHANT_FILE, `${JSON.stringify(record, null, 2)}\n`);
  ok(`for merchants: ${MERCHANT_FILE} (order ${record.orderId}, ${record.status}, ${event ? `${event.type} ${event.id}` : "no capture event listed by PayPal yet"})`);
}

/** PayPal's capture event for this order, from its sandbox event list (GET /v1/notifications/webhooks-events), or null. */
async function captureEvent(saved: BoundCart, captureId: string, since: number): Promise<RecordedOrder["event"]> {
  const SANDBOX = "https://api-m.sandbox.paypal.com"; // sandbox only, as the adapter (trust/src/paypal.ts)
  if ((process.env.PAYPAL_ENVIRONMENT ?? "").toUpperCase() !== "SANDBOX") fail("hard rule: PayPal sandbox only");
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID ?? ""}:${process.env.PAYPAL_CLIENT_SECRET ?? ""}`).toString("base64");
  const tok = await fetch(`${SANDBOX}/v1/oauth2/token`, { method: "POST", headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  // The capture has passed by now: a list PayPal won't read out leaves the record without its event, never the run red.
  const none = (why: string) => { console.log(`for merchants: no capture event recorded (${why})`); return null; };
  if (!tok.ok) return none(`PayPal's token answered ${tok.status}`); // the status only: never the reply, never a key
  const token = ((await tok.json()) as { access_token?: string }).access_token;
  if (!token) return none("PayPal's token reply had no token");
  const start = new Date(since - 30 * 60_000).toISOString();
  // PayPal sends its events a few seconds after the capture: ask every 5 s for up to 2 minutes.
  for (let i = 0; i < 24; i++) {
    const end = new Date(Date.now() + 60_000).toISOString();
    const res = await fetch(`${SANDBOX}/v1/notifications/webhooks-events?page_size=50&start_time=${encodeURIComponent(start)}&end_time=${encodeURIComponent(end)}`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
    if (!res.ok) return none(`PayPal's event list answered ${res.status}`);
    const list = ((await res.json()) as { events?: unknown[] }).events ?? [];
    const found = listedCaptureEvent(list, { orderId: saved.orderId!, captureId, hash: saved.hash });
    if (found) return found;
    if (i === 0) console.log("…waiting for PayPal's capture event (up to 2 minutes)");
    await new Promise((y) => setTimeout(y, 5000));
  }
  return none("PayPal listed none for this capture within 2 minutes");
}

if (mode === "settle-void") {
  // The void path, live: PayPal really holds the money, then the cart changes before the guard re-checks it (the
  // window `recheckAuthorized` guards), so the guard must release the hold and take nothing.
  if (!orderIdArg) fail("usage: e2e:settle-void <orderId>");
  if (INTENT !== "AUTHORIZE") fail("settle-void needs PAYMENT_INTENT=AUTHORIZE (the default)");
  const saved = JSON.parse(readFileSync(STATE, "utf8")) as BoundCart;
  if (saved.orderId !== orderIdArg) fail(`saved cart belongs to order ${saved.orderId}, not ${orderIdArg}`);
  if (saved.intent !== "AUTHORIZE") fail(`saved cart was placed as ${saved.intent ?? "CAPTURE"}, not AUTHORIZE`);
  // Never capture in this mode: a capture call stops the script before it reaches PayPal.
  paypal.captureAuthorization = async () => fail("settle-void asked PayPal to capture");
  // Attack corpus 12 as the wallet runs it: the shipped `swapAfterHold` over the real PayPalPort adds one cent once
  // PayPal holds the money, so this run also proves the Proxy against the real adapter.
  const r = await guard.settle(saved, orderIdArg!, swapAfterHold(paypal, saved, ledger, DEMO_SHOPPER, Date.now));
  const swapRow = ledger.read().find((e) => e.action === "price-swap");
  if (!swapRow) fail("no price-swap row: the swap never ran");
  ok(`PayPal held the money; ${swapRow.why}`);
  const rows = ledger.read();
  if (r.ok) fail(`settle-void captured ${r.captureId}`);
  const voided = rows.find((e) => e.action === "voided");
  if (!voided) fail(`no voided row: ${rows.map((e) => e.action).join(" → ")}; ${r.reason}`);
  if (voided.data?.code !== "changed") fail(`voided for ${String(voided.data?.code)}, not "changed"`);
  // PayPal's own word, read back: the hold is voided and no capture exists on the order.
  const after = await paypal.get(orderIdArg!);
  if (after.authorization?.status !== "VOIDED") fail(`PayPal shows the hold as ${after.authorization?.status ?? "missing"}, not VOIDED`);
  if (after.captureId !== undefined) fail(`PayPal shows a capture ${after.captureId}`);
  ok(`voided ${after.authorization.id}; order ${after.status}, no capture; ledger: ${rows.map((e) => e.action).join(" → ")}; ${voided.why}`);
  console.log("E2E VOID PASS");
  process.exit(0);
}

// 1. The engine ends in a bound cart under the max.
// Asked for Claude but no key: fail rather than quietly run the rule engine (Lesson 9).
if (process.env.BUYER === "claude" && !process.env.ANTHROPIC_API_KEY) fail("BUYER=claude but ANTHROPIC_API_KEY is not set");
const buyer: LlmPort = process.env.BUYER !== "rule" && process.env.ANTHROPIC_API_KEY
  ? makeClaudeBuyer(process.env.ANTHROPIC_API_KEY, readFileSync("server/prompts/buyer.honest.md", "utf8"), { onRacerError: (e, port) => console.warn(`warn racer ${port} failed: ${e.message}`) })
  : new RuleBuyer();
const result = await runHaggle({ want: demoWant({ deadline: Date.now() + 7 * DAY_MS }), sellers: demoSellers(), buyer, guard, deps, ledger, shopperId: DEMO_SHOPPER, catalogId: DEMO_ENTRY });
if (result.outcome !== "cart") fail(`haggle did not end in a cart: ${result.outcome}`);
const bound = result.decision.bound;
const moves = ledger.read().filter((e) => e.actor === "buyer" && e.data && "source" in e.data).map((e) => (e.data as { source: string }).source);
ok(`haggle (seed ${seed}, buyer ${buyer.name}): ${result.rounds} rounds → $${(bound.cart.price / 100).toFixed(2)} from ${bound.cart.sellerId}, guard says "${result.decision.kind}"; moves by ${moves.join(", ")}`);
if (ledger.read().some((e) => e.why.trim() === "")) fail("a ledger row has no why");
// A fallback still passes (the rule engine is the safety net), but it is never silent: print why it happened.
for (const e of ledger.read()) if (e.data && (e.data as { source?: string }).source === "rule-fallback") console.warn(`warn round ${e.round} fell back: ${e.why}`);
// Reached-state check (Lesson 3): M1's "the Claude buyer completes a haggle live" needs at least one move by Claude.
if (buyer.name !== "rule" && !moves.includes(buyer.name)) fail(`buyer ${buyer.name} made none of the ${moves.length} moves (all fell back)`);

// 2. A real sandbox order for exactly that cart.
const placed = await guard.place(bound, paypal, "https://example.com/goose/return", INTENT);
ok(`order ${placed.orderId} created (intent ${INTENT})`);

// 3. Control: capture (AUTHORIZE: authorize, under its own request id) before the tap must be refused (if this passed, "one tap" would be false).
try {
  if (INTENT === "AUTHORIZE") await paypal.authorize(placed.orderId, `goose-e2e-early-${bound.hash}`);
  else await paypal.capture(placed.orderId);
  fail("captured with no buyer approval");
} catch (e) {
  const issue = (e as Error).message;
  if (issue !== "ORDER_NOT_APPROVED") fail(`early capture failed for the wrong reason: ${issue}`);
  ok(`control: early capture refused (${issue})`);
}

// 4. Round-trip: the cart hash came back unchanged.
const snap = await paypal.get(placed.orderId);
if (snap.customId !== bound.hash) fail(`custom_id mismatch: ${snap.customId} != ${bound.hash}`);
if (snap.amount !== bound.cart.price) fail(`amount mismatch: ${snap.amount} != ${bound.cart.price}`);
ok(`custom_id and amount round-trip`);

// 5. Decline, with its control: the same unapproved order, without the header, says ORDER_NOT_APPROVED (step 3);
//    with the mock header it must say INSTRUMENT_DECLINED, so the decline came from the header.
const mocked = PayPalPort.fromEnv(process.env, { mockOnCapture: "INSTRUMENT_DECLINED" });
if (INTENT === "CAPTURE") try {
  await mocked.capture(placed.orderId);
  fail("mock decline did not decline");
} catch (e) {
  if ((e as Error).message !== "INSTRUMENT_DECLINED") fail(`mock decline gave ${(e as Error).message}`);
  ok("mock INSTRUMENT_DECLINED honoured (control: same order without the header → ORDER_NOT_APPROVED)");
}

mkdirSync(".goose", { recursive: true });
writeFileSync(STATE, JSON.stringify(bound, null, 2));
console.log(`\nE2E SANDBOX PASS (unattended part). To finish: approve with a sandbox buyer, then: pnpm e2e:settle ${placed.orderId}`);
console.log(`APPROVE_URL=${placed.approveUrl}`);
console.log(`The approval expires at ${new Date(bound.expiresAt).toISOString()} (15 minutes); after that, settle refuses by design.`);
