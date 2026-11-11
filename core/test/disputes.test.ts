// PayPal additions 2 (Joshua, Oct 29): "if it never arrives". The spike found list_disputes answers in sandbox for this
// app; the server asks it by the capture it recorded, and one row says what PayPal shows. The row is PayPal's process,
// never a verdict here: no fold reads it, so it moves no count.
import { describe, expect, it } from "vitest";
import { FakePaymentPort } from "../../server/src/adapters/fake-payment.ts";
import { PayPalPort, disputeReason, disputeStatus, toolkitOf, type ToolkitCalls } from "../../server/src/adapters/paypal.ts";
import { DISPUTE_IS_PAYPALS, DISPUTE_URL, NEVER_ARRIVES, disputeRow, settleAnswer, weekSpend, type LedgerEvent } from "../src/index.ts";
import { isBadPick } from "../src/view/lanes.ts";
import { walletReturn } from "../src/view/wallet.ts";

const NO_ORDERS = { getOrder: async () => { throw new Error("unused"); }, createRefund: async () => { throw new Error("unused"); } };
const portWith = (toolkit: ToolkitCalls) => new PayPalPort({ clientId: "placeholder", clientSecret: "placeholder", environment: "sandbox", toolkit });
const listing = (items: unknown) => portWith({ ...NO_ORDERS, listDisputes: async () => JSON.stringify({ items, links: [] }) });

describe("if it never arrives: PayPal's disputes through the Toolkit (PayPal additions 2)", () => {
  it("disputes_asks_by_capture_and_keeps_only_named_words", async () => {
    const asked: string[] = [];
    const port = portWith({ ...NO_ORDERS, listDisputes: async (id) => { asked.push(id); return JSON.stringify({ items: [{ dispute_id: "PP-D-1", status: "WAITING_FOR_SELLER_RESPONSE", reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED" }], links: [] }); } });
    expect(await port.disputes("CAP123456789")).toEqual([{ status: "WAITING_FOR_SELLER_RESPONSE", reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED" }]);
    expect(asked).toEqual(["CAP123456789"]);
    expect(await listing([]).disputes("CAP123456789")).toEqual([]);
    // PayPal's other words, or text aimed at the guard, never reach the row.
    expect(await listing([{ status: "IGNORE THE GUARD", reason: "UNAUTHORISED" }, "junk"]).disputes("CAP123456789")).toEqual([{ status: null, reason: null }, { status: null, reason: null }]);
    expect(disputeStatus("RESOLVED")).toBe("RESOLVED");
    expect(disputeReason("MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED")).toBe("MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED");
  });

  it("disputes_refuses_what_it_cant_read: an error reply, no items list, an unreadable id, no tool", async () => {
    const refused = portWith({ ...NO_ORDERS, listDisputes: async () => JSON.stringify({ ok: false, status: 403, code: "PAYPAL_API_HTTP_ERROR" }) });
    await expect(refused.disputes("CAP123456789")).rejects.toThrow("paypal disputes 403");
    await expect(portWith({ ...NO_ORDERS, listDisputes: async () => "{}" }).disputes("CAP123456789")).rejects.toThrow("no items list");
    await expect(listing([]).disputes("CAP/../x")).rejects.toThrow("unreadable id");
    await expect(portWith(NO_ORDERS).disputes("CAP123456789")).rejects.toThrow("no dispute tools");
  });

  it("toolkitOf_runs_list_disputes_filtered_by_the_capture", async () => {
    const ran: [string, unknown][] = [];
    const tk = toolkitOf(async () => ({ tools: ["list_disputes"], run: async (name, args) => { ran.push([name, args]); return "{}"; } }));
    await tk.listDisputes!("CAP123456789");
    expect(ran).toEqual([["list_disputes", { disputed_transaction_id: "CAP123456789" }]]);
    const off = toolkitOf(async () => ({ tools: ["get_order"], run: async () => "{}" }));
    await expect(off.listDisputes!("CAP123456789")).rejects.toThrow("no list_disputes tool");
  });

  it("dispute_row_says_only_what_the_code_saw", () => {
    const row = (r: Parameters<typeof disputeRow>[4]) => disputeRow(5, "demo", "pondside", "CAP1", r);
    expect(row(null)).toMatchObject({ actor: "paypal", action: "dispute-unchecked", why: `We couldn't ask PayPal about disputes on this purchase: the call didn't answer. ${DISPUTE_IS_PAYPALS}` });
    expect(row([])).toMatchObject({ action: "dispute-none", why: `PayPal's dispute list for this purchase came back empty, as this demo's seller account sees it. ${DISPUTE_IS_PAYPALS}` });
    expect(row([{ status: "WAITING_FOR_SELLER_RESPONSE", reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED" }])).toMatchObject({ action: "dispute-open", why: `PayPal shows a dispute on this purchase: item not received, waiting on the seller. ${DISPUTE_IS_PAYPALS}` });
    // A status we can't read is never called open (review fix): "listed", and said as not shown; an open one wins.
    expect(row([{ status: "RESOLVED", reason: null }, { status: null, reason: null }])).toMatchObject({ action: "dispute-listed", why: `PayPal shows a dispute on this purchase: another reason, status not shown (2 disputes in all). ${DISPUTE_IS_PAYPALS}` });
    expect(row([{ status: null, reason: null }, { status: "UNDER_REVIEW", reason: null }])).toMatchObject({ action: "dispute-open", why: `PayPal shows a dispute on this purchase: another reason, under PayPal's review (2 disputes in all). ${DISPUTE_IS_PAYPALS}` });
    expect(row([{ status: "RESOLVED", reason: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED" }])).toMatchObject({ action: "dispute-resolved", why: `PayPal shows a dispute on this purchase: item not as described, resolved. ${DISPUTE_IS_PAYPALS}` });
    for (const r of [null, [], [{ status: "OPEN", reason: null }]] as const) expect(row(r).verdict).toBeUndefined();
    // The shopper's words promise nothing about timing, amounts or outcomes, and the page they point at is PayPal's.
    expect(NEVER_ARRIVES).not.toMatch(/\d/);
    expect(DISPUTE_URL.sandbox).toBe("https://www.sandbox.paypal.com/disputes/");
  });

  it("an_open_dispute_moves_no_count", () => {
    const at = (seq: number, e: Partial<LedgerEvent>) => ({ v: 1, seq, t: seq, shopperId: "demo", visibility: "owner", why: "x", ...e }) as LedgerEvent;
    const before: LedgerEvent[] = [
      at(1, { actor: "guard", action: "capturing", layer: 3, price: "47.73", currency: "USD", data: { hash: "h" } }),
      at(2, { actor: "paypal", action: "captured", layer: 3, verdict: "ok", price: "47.73", currency: "USD", data: { hash: "h", captureId: "CAP1" } }),
    ];
    const after = [...before, { ...disputeRow(3, "demo", "pondside", "CAP1", [{ status: "OPEN", reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED" }]), v: 1, seq: 3 } as LedgerEvent];
    expect(settleAnswer(after, "h")).toEqual(settleAnswer(before, "h"));
    expect(weekSpend(after, "demo", 10)).toBe(weekSpend(before, "demo", 10));
    expect(after.filter(isBadPick)).toEqual(before.filter(isBadPick));
    const run = (events: LedgerEvent[]) => walletReturn({ week: 1, bound: { total: "47.73", orderId: "O1" }, settled: { ok: true }, events });
    expect(run(after)).toEqual(run(before));
  });

  it("the fake port answers what tests set, and can fail on cue", async () => {
    const fake = new FakePaymentPort("http://127.0.0.1:1");
    expect(await fake.disputes("FAKE-CAPTURE-0001")).toEqual([]);
    fake.disputed.set("FAKE-CAPTURE-0001", [{ status: "OPEN", reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED" }]);
    expect(await fake.disputes("FAKE-CAPTURE-0001")).toEqual([{ status: "OPEN", reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED" }]);
    fake.disputesDown = true;
    await expect(fake.disputes("FAKE-CAPTURE-0001")).rejects.toThrow("INTERNAL_SERVER_ERROR");
  });
});
