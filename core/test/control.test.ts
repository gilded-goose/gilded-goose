// The guard-off control card (M2 step 4): live when allowed, the saved order otherwise, always said in fixed words.

import { describe, expect, it } from "vitest";
import { CONTROL_SAYS, controlOrder, toCents, type BoundCart, type OrderSnapshot, type PaymentPort, type CapHit, type RecordedControl } from "../src/index.ts";
import { sha256 } from "./helpers.ts";

const RECORDED: RecordedControl = { orderId: "821193914R209014J", status: "PAYER_ACTION_REQUIRED", amount: "500.00", currency: "USD", ranAt: "2026-10-23T07:40:18.765Z" };

class Port implements PaymentPort {
  created: BoundCart[] = [];
  private readonly fail: boolean;
  private readonly skew: number;
  constructor(fail = false, skew = 0) { this.fail = fail; this.skew = skew; }
  async create(b: BoundCart) { if (this.fail) throw new Error("UNPROCESSABLE_ENTITY: secret provider words"); this.created.push(b); return { orderId: "ORDER1", approveUrl: "x" }; }
  async get(): Promise<OrderSnapshot> { const b = this.created[0]!; return { id: "ORDER1", status: "PAYER_ACTION_REQUIRED", amount: b.cart.price + this.skew, currency: "USD", customId: b.hash }; }
  async capture(): Promise<{ status: string; captureId: string }> { throw new Error("never"); }
}

const opts = (port: PaymentPort | null, take = (): CapHit | null => null) => ({ price: toCents("500.00"), port, fake: false, take, left: () => 2, recorded: RECORDED, hash: sha256, now: Date.UTC(2026, 9, 23, 12), nonce: "n", returnUrl: "http://localhost/x" });

describe("controlOrder: the judge's price with no guard", () => {
  it("creates the order for exactly the judge's price, from the judge's shop, with no max in the way", async () => {
    const port = new Port();
    const card = await controlOrder(opts(port));
    expect(card).toEqual({ state: "landed", orderId: "ORDER1", status: "PAYER_ACTION_REQUIRED", amount: "500.00", currency: "USD", at: "2026-10-23T12:00:00.000Z", left: 2, fake: false });
    expect(port.created[0]!.cart).toMatchObject({ price: 50000, sellerId: "your-shop" });
  });

  it("over the cap, no order is made and the saved one is shown with the fixed sentence", async () => {
    const port = new Port();
    expect(await controlOrder(opts(port, () => "token"))).toEqual({ state: "capped", sentence: CONTROL_SAYS.token, recorded: RECORDED, left: 2 });
    expect(port.created).toEqual([]);
  });

  it("the sentence names the cap that is full: a network's or everyone's is never called this browser's", async () => {
    for (const hit of ["token", "ip", "global"] as const) expect(await controlOrder(opts(new Port(), () => hit))).toMatchObject({ state: "capped", sentence: CONTROL_SAYS[hit] });
    expect(CONTROL_SAYS.ip).not.toMatch(/browser/);
    expect(CONTROL_SAYS.global).not.toMatch(/browser/);
  });

  it("no port: off; the cap is never taken", async () => {
    let took = 0;
    expect((await controlOrder(opts(null, () => { took++; return null; }))).state).toBe("off");
    expect(took).toBe(0);
  });

  it("PayPal's error text never reaches the card, and a changed amount is a failure", async () => {
    const failed = await controlOrder(opts(new Port(true)));
    expect(failed).toMatchObject({ state: "failed", sentence: CONTROL_SAYS.failed });
    expect(JSON.stringify(failed)).not.toMatch(/UNPROCESSABLE|secret provider/);
    expect((await controlOrder(opts(new Port(false, 1)))).state).toBe("failed");
  });
});
