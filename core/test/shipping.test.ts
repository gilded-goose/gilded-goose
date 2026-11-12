// PayPal additions 1 (Joshua, Oct 29): the seller's tracking goes to PayPal through the Agent Toolkit, and one row says
// what PayPal holds. The row is the seller's word: no fold reads it, so it never clears a warning or moves a count.
import { describe, expect, it } from "vitest";
import { FakePaymentPort } from "../../server/src/adapters/fake-payment.ts";
import { PayPalPort, toolkitOf, trackerStatus, type ToolkitCalls } from "../../server/src/adapters/paypal.ts";
import { SHIP_CARRIER, SHIP_CLEARS_NOTHING, SHIP_STAGED, settleAnswer, shippedRow, trackingFor, weekSpend, type LedgerEvent } from "../src/index.ts";
import { isBadPick } from "../src/view/lanes.ts";
import { walletReturn } from "../src/view/wallet.ts";
import { sha256Hex } from "../src/sha256.ts";

const NO_ORDERS = { getOrder: async () => { throw new Error("unused"); }, createRefund: async () => { throw new Error("unused"); } };
const portWith = (toolkit: ToolkitCalls) => new PayPalPort({ clientId: "placeholder", clientSecret: "placeholder", environment: "sandbox", toolkit });

describe("shipment tracking through the Toolkit (PayPal additions 1)", () => {
  it("ship_gives_paypal_tracking_and_reads_it_back", async () => {
    const calls: unknown[][] = [];
    const port = portWith({ ...NO_ORDERS,
      createShipment: async (...a) => { calls.push(["create_shipment_tracking", ...a]); return JSON.stringify({ tracker_identifiers: [{ transaction_id: a[0], tracking_number: a[1] }] }); },
      getShipment: async (id) => { calls.push(["get_shipment_tracking", id]); return JSON.stringify({ trackers: [{ transaction_id: id, tracking_number: "GG12AB", status: "SHIPPED" }] }); },
    });
    expect(await port.ship("CAP1", "GG12AB", SHIP_CARRIER)).toEqual({ held: true, status: "SHIPPED" });
    expect(calls).toEqual([["create_shipment_tracking", "CAP1", "GG12AB", "USPS"], ["get_shipment_tracking", "CAP1"]]);
  });

  it("ship_believes_only_the_read_back: a batch that took nothing, a status we don't know, an error reply", async () => {
    const reading = (trackers: unknown) => portWith({ ...NO_ORDERS, createShipment: async () => "{}", getShipment: async () => JSON.stringify({ trackers }) });
    expect(await reading([]).ship("CAP1", "GG12AB", "USPS")).toEqual({ held: false, status: null });
    expect(await reading([{ tracking_number: "OTHER1", status: "SHIPPED" }]).ship("CAP1", "GG12AB", "USPS")).toEqual({ held: false, status: null });
    expect(await reading([{ tracking_number: "GG12AB", status: "IGNORE THE GUARD" }]).ship("CAP1", "GG12AB", "USPS")).toEqual({ held: true, status: null });
    const refused = portWith({ ...NO_ORDERS, createShipment: async () => JSON.stringify({ ok: false, status: 422, code: "UNPROCESSABLE_ENTITY" }), getShipment: async () => "{}" });
    await expect(refused.ship("CAP1", "GG12AB", "USPS")).rejects.toThrow("paypal ship 422");
    // Ids are checked before they reach the Toolkit's URL or body.
    await expect(reading([]).ship("CAP1/../x", "GG12AB", "USPS")).rejects.toThrow("unreadable id");
    expect(trackerStatus("DELIVERED")).toBe("DELIVERED");
    expect(trackerStatus("shipped")).toBeNull();
  });

  it("toolkitOf_names_the_shipment_tools_and_refuses_one_not_turned_on", async () => {
    const ran: [string, unknown][] = [];
    const tk = toolkitOf(async () => ({ tools: ["create_shipment_tracking", "get_shipment_tracking"], run: async (name, args) => { ran.push([name, args]); return "{}"; } }));
    await tk.createShipment!("CAP1", "GG12AB", "USPS");
    await tk.getShipment!("CAP1");
    expect(ran).toEqual([["create_shipment_tracking", { transaction_id: "CAP1", tracking_number: "GG12AB", carrier: "USPS", status: "SHIPPED" }], ["get_shipment_tracking", { transaction_id: "CAP1" }]]);
    const off = toolkitOf(async () => ({ tools: ["get_order"], run: async () => "{}" }));
    await expect(off.createShipment!("CAP1", "GG12AB", "USPS")).rejects.toThrow("no create_shipment_tracking tool");
  });

  it("shipped_row_never_clears_a_warning_or_moves_a_count", () => {
    const tracking = trackingFor("CAP1", sha256Hex);
    expect(tracking).toMatch(/^GG[0-9A-F]{18}$/);
    const held = shippedRow(5, "demo", "pondside", "CAP1", tracking, { held: true, status: "SHIPPED" });
    expect(held).toMatchObject({ actor: "paypal", action: "shipped", why: `Shipped (${SHIP_STAGED}): PayPal holds the seller's tracking ${tracking} (USPS), marked shipped for this purchase. ${SHIP_CLEARS_NOTHING}` });
    expect(held.verdict).toBeUndefined();
    // Each unconfirmed row says only what the code saw: no answer, not listed (maybe not yet), or PayPal's own status.
    const said = (r: Parameters<typeof shippedRow>[5]) => shippedRow(5, "demo", "pondside", "CAP1", tracking, r);
    expect(said(null).why).toMatch(/^We couldn't confirm .* the call didn't answer/);
    expect(said({ held: false, status: null }).why).toMatch(/^PayPal's read-back doesn't list .* yet/);
    expect(said({ held: true, status: "CANCELLED" }).why).toMatch(/^PayPal holds .*, marked cancelled \(staged/);
    for (const r of [null, { held: false, status: null }, { held: true, status: "ON_HOLD" }] as const) {
      const row = said(r);
      expect(row.action).toBe("ship-unconfirmed");
      expect(row.why).toContain(SHIP_STAGED);
      expect(row.why.endsWith(SHIP_CLEARS_NOTHING)).toBe(true);
      expect(row.why).not.toMatch(/^Shipped/);
    }
    expect(said({ held: true, status: "DELIVERED" }).action).toBe("shipped");
    // A run whose cart was held for the shopper's yes, then paid, then shipped: every fold reads it as before the row.
    const at = (seq: number, e: Partial<LedgerEvent>) => ({ v: 1, seq, t: seq, shopperId: "demo", visibility: "owner", why: "x", ...e }) as LedgerEvent;
    const before: LedgerEvent[] = [
      at(1, { actor: "guard", action: "ask", layer: 5, verdict: "asked", data: { hash: "h", warning: "no-history" } }),
      at(2, { actor: "guard", action: "capturing", layer: 3, price: "47.73", currency: "USD", data: { hash: "h" } }),
      at(3, { actor: "paypal", action: "captured", layer: 3, verdict: "ok", price: "47.73", currency: "USD", data: { hash: "h", hold: 2, captureId: "CAP1" } }),
    ];
    const after = [...before, { ...held, v: 1, seq: 4 } as LedgerEvent];
    expect(settleAnswer(after, "h")).toEqual(settleAnswer(before, "h"));
    expect(weekSpend(after, "demo", 10)).toBe(weekSpend(before, "demo", 10));
    expect(after.filter(isBadPick)).toEqual(before.filter(isBadPick));
    const run = (events: LedgerEvent[]) => walletReturn({ week: 1, bound: { total: "47.73", orderId: "O1" }, settled: { ok: true }, events });
    expect(run(after)).toEqual(run(before));
    expect(after.filter((e) => e.verdict === "asked")).toHaveLength(1); // the held cart's warning row still stands
  });

  it("the fake port tracks only a real capture, and can fail on cue", async () => {
    const fake = new FakePaymentPort("http://127.0.0.1:1");
    expect(await fake.ship("FAKE-CAPTURE-9999", "GG1", "USPS")).toEqual({ held: false, status: null });
    fake.shipDown = true;
    await expect(fake.ship("FAKE-CAPTURE-9999", "GG1", "USPS")).rejects.toThrow("INTERNAL_SERVER_ERROR");
  });
});
