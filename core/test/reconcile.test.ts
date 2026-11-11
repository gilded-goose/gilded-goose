// PayPal additions 3 (Joshua, Oct 29): reconcile. PayPal's transaction report, read through the Toolkit by dates (never
// by transaction_id, where the Toolkit swallows errors), against what this ledger recorded: "PayPal agrees", or a red row.
import { describe, expect, it } from "vitest";
import { FakePaymentPort } from "../../server/src/adapters/fake-payment.ts";
import { PayPalPort, toolkitOf, type ToolkitCalls } from "../../server/src/adapters/paypal.ts";
import { RECONCILE_READS, reconcileRow, settleAnswer, weekSpend, type LedgerEvent } from "../src/index.ts";
import { gridRows } from "../src/view/grid.ts";
import { isBadPick } from "../src/view/lanes.ts";
import { walletReturn } from "../src/view/wallet.ts";

const NO_ORDERS = { getOrder: async () => { throw new Error("unused"); }, createRefund: async () => { throw new Error("unused"); } };
const portWith = (toolkit: ToolkitCalls) => new PayPalPort({ clientId: "placeholder", clientSecret: "placeholder", environment: "sandbox", toolkit });
const tx = (id: string, value: unknown, currency_code: unknown = "USD") => ({ transaction_info: { transaction_id: id, transaction_amount: { value, currency_code } } });
const report = (body: object) => portWith({ ...NO_ORDERS, listTransactions: async () => JSON.stringify(body) });
const DAY = 86_400_000;

describe("reconcile: PayPal's transaction report against this ledger (PayPal additions 3)", () => {
  it("reported_reads_by_dates_and_finds_the_capture_itself", async () => {
    const asked: [string, string][] = [];
    const now = Date.UTC(2026, 9, 29, 12);
    const port = portWith({ ...NO_ORDERS, listTransactions: async (a, b) => { asked.push([a, b]); return JSON.stringify({ transaction_details: [tx("OTHER0000001", "9.99"), tx("CAP123456789", "47.73")], total_pages: 1 }); } });
    expect(await port.reported("CAP123456789", now - DAY, now)).toEqual({ listed: true, amount: "47.73", currency: "USD", complete: true });
    // From an hour before the capture to now; never more than the report's 31 days.
    expect(asked[0]).toEqual(["2026-10-28T11:00:00Z", "2026-10-29T12:00:00Z"]);
    await port.reported("CAP123456789", now - 90 * DAY, now);
    expect(asked[1]![0]).toBe("2026-09-28T11:00:00Z");
  });

  it("reported_never_says_more_than_the_page: not listed, a partial page, a malformed amount, an error", async () => {
    expect(await report({ transaction_details: [], total_pages: 1 }).reported("CAP123456789", 0, DAY)).toEqual({ listed: false, amount: null, currency: null, complete: true });
    expect(await report({ transaction_details: [tx("OTHER0000001", "1.00")], total_pages: 3 }).reported("CAP123456789", 0, DAY)).toEqual({ listed: false, amount: null, currency: null, complete: false });
    expect(await report({ transaction_details: [tx("CAP123456789", "47.7", "usd")] }).reported("CAP123456789", 0, DAY)).toEqual({ listed: true, amount: null, currency: null, complete: true });
    await expect(report({ ok: false, status: 403, code: "PAYPAL_API_HTTP_ERROR" }).reported("CAP123456789", 0, DAY)).rejects.toThrow("paypal report 403");
    await expect(report({}).reported("CAP123456789", 0, DAY)).rejects.toThrow("no transaction list");
    await expect(report({ transaction_details: [] }).reported("CAP/../x", 0, DAY)).rejects.toThrow("unreadable id");
    await expect(portWith(NO_ORDERS).reported("CAP123456789", 0, DAY)).rejects.toThrow("no transaction report tool");
  });

  it("toolkitOf_asks_list_transactions_by_dates_never_by_id", async () => {
    const ran: [string, unknown][] = [];
    const tk = toolkitOf(async () => ({ tools: ["list_transactions"], run: async (name, args) => { ran.push([name, args]); return "{}"; } }));
    await tk.listTransactions!("2026-10-28T11:00:00Z", "2026-10-29T12:00:00Z");
    expect(ran).toEqual([["list_transactions", { start_date: "2026-10-28T11:00:00Z", end_date: "2026-10-29T12:00:00Z", transaction_status: "S", page_size: 500 }]]);
    await expect(toolkitOf(async () => ({ tools: [], run: async () => "{}" })).listTransactions!("a", "b")).rejects.toThrow("no list_transactions tool");
  });

  it("reconcile_row_agrees_only_on_both_amount_and_currency", () => {
    const ours = { price: "47.73", currency: "USD" };
    const row = (r: Parameters<typeof reconcileRow>[5]) => reconcileRow(5, "demo", "pondside", "CAP1", ours, r);
    expect(row({ listed: true, amount: "47.73", currency: "USD", complete: true })).toMatchObject({ action: "reconcile-agrees", why: `PayPal agrees: its transaction report lists capture CAP1 for $47.73 USD, the amount this ledger recorded. ${RECONCILE_READS}` });
    expect(row({ listed: true, amount: "47.74", currency: "USD", complete: true })).toMatchObject({ action: "reconcile-differs", why: `PayPal's record differs: its transaction report lists capture CAP1 for $47.74 USD; this ledger recorded $47.73 USD. ${RECONCILE_READS}`, data: { matched: false } });
    expect(row({ listed: true, amount: "47.73", currency: "EUR", complete: true }).action).toBe("reconcile-differs");
    // Review fixes: an unreadable amount is no answer (unchecked, never red); euros never get a dollar sign.
    expect(row({ listed: true, amount: null, currency: null, complete: true }).action).toBe("reconcile-unchecked");
    expect(row({ listed: true, amount: "47.73", currency: null, complete: true }).action).toBe("reconcile-unchecked");
    expect(row({ listed: true, amount: "47.73", currency: "EUR", complete: true }).why).toContain("for 47.73 EUR;");
    expect(row({ listed: true, amount: "47.73", currency: "USD", complete: true })).not.toHaveProperty("price");
    expect(row({ listed: false, amount: null, currency: null, complete: true })).toMatchObject({ action: "reconcile-pending" });
    for (const r of [null, { listed: false, amount: null, currency: null, complete: false }] as const) expect(row(r).action).toBe("reconcile-unchecked");
    for (const r of [null, { listed: true, amount: "1.00", currency: "USD", complete: true }] as const) expect(row(r).verdict).toBeUndefined();
  });

  it("a_differs_row_is_red_and_moves_no_count", () => {
    const at = (seq: number, e: Partial<LedgerEvent>) => ({ v: 1, seq, t: seq, shopperId: "demo", visibility: "owner", why: "x", ...e }) as LedgerEvent;
    const before: LedgerEvent[] = [
      at(1, { actor: "guard", action: "capturing", layer: 3, price: "47.73", currency: "USD", data: { hash: "h" } }),
      at(2, { actor: "paypal", action: "captured", layer: 3, verdict: "ok", price: "47.73", currency: "USD", data: { hash: "h", captureId: "CAP1" } }),
    ];
    const differs = { ...reconcileRow(3, "demo", "pondside", "CAP1", { price: "47.73", currency: "USD" }, { listed: true, amount: "99.00", currency: "USD", complete: true }), v: 1, seq: 3 } as LedgerEvent;
    const after = [...before, differs];
    expect(gridRows(after).find((r) => r.seq === 3)).toMatchObject({ tone: "differs", did: "PayPal's record differs" });
    expect(settleAnswer(after, "h")).toEqual(settleAnswer(before, "h"));
    expect(weekSpend(after, "demo", 10)).toBe(weekSpend(before, "demo", 10));
    expect(after.filter(isBadPick)).toEqual(before.filter(isBadPick));
    const run = (events: LedgerEvent[]) => walletReturn({ week: 1, bound: { total: "47.73", orderId: "O1" }, settled: { ok: true }, events });
    expect(run(after)).toEqual(run(before));
  });

  it("the fake report lists what the fake took, or what a test sets, and can fail on cue", async () => {
    const fake = new FakePaymentPort("http://127.0.0.1:1");
    expect(await fake.reported("FAKE-CAPTURE-0001")).toEqual({ listed: false, amount: null, currency: null, complete: true });
    fake.reports.set("FAKE-CAPTURE-0001", { listed: true, amount: "1.00", currency: "USD", complete: true });
    expect((await fake.reported("FAKE-CAPTURE-0001")).amount).toBe("1.00");
    fake.reportDown = true;
    await expect(fake.reported("FAKE-CAPTURE-0001")).rejects.toThrow("INTERNAL_SERVER_ERROR");
  });
});
