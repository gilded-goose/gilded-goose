// "After you pay" says only what the run view holds (S1, docs/guild/038-tour-glass.md): tracking from the shipping row
// (staged, said so), Undo from the run's undo state and this tab's key, and PayPal's disputes words from disputes.ts.
import { describe, expect, it } from "vitest";
import { AFTER_PARTS, afterView, refundWords, statusWords } from "../src/view/after.ts";
import { NEVER_ARRIVES } from "../src/disputes.ts";
import { SHIP_STAGED, shippedRow } from "../src/shipping.ts";

const paid = { settled: { ok: true, captureId: "CAP1" }, bound: { total: "42.00", item: "A kettle", merchant: "Cattail Market (fictional)" }, undo: { state: "open", until: 1_000 }, payment: "sandbox" };
const ship = (reply: Parameters<typeof shippedRow>[5]) => shippedRow(1, "shopper", "s1", "CAP1", "GGABC123", reply);

describe("After you pay", () => {
  it("is nothing for a run that isn't paid (no settle, a refusal, or a view it can't read)", () => {
    expect(afterView(null, true)).toBeNull();
    expect(afterView({ settled: null }, true)).toBeNull();
    expect(afterView({ ...paid, settled: { ok: false, reason: "refused" } }, true)).toBeNull();
    expect(afterView({ ...paid, settled: { ok: "yes" } }, true)).toBeNull();
    expect(afterView(paid, true)).not.toBeNull(); // control
  });

  it("tracking: waiting until the shipping row lands, then what PayPal holds, never more", () => {
    expect(afterView({ ...paid, events: [] }, true)!.tracking).toEqual({ kind: "waiting" });
    const held = afterView({ ...paid, events: [ship({ held: true, status: "SHIPPED" })] }, true)!.tracking;
    expect(held).toEqual({ kind: "held", number: "GGABC123", carrier: "USPS", status: "SHIPPED" });
    // Not held, or PayPal didn't answer: the row's own words, never "shipped".
    for (const reply of [{ held: false, status: null }, null] as const) {
      const t = afterView({ ...paid, events: [ship(reply)] }, true)!.tracking;
      expect(t.kind).toBe("unconfirmed");
      expect(t.kind === "unconfirmed" && t.why).toContain(SHIP_STAGED);
    }
    // The latest row wins: a later confirmation replaces an earlier "not yet".
    expect(afterView({ ...paid, events: [ship({ held: false, status: null }), ship({ held: true, status: "DELIVERED" })] }, true)!.tracking.kind).toBe("held");
    expect(statusWords("DELIVERED")).toBe("delivered");
    expect(statusWords("SOMETHING_NEW")).toBeNull();
    expect(statusWords(null)).toBeNull();
  });

  it("says the tracking is staged, every time it is described", () => {
    expect(AFTER_PARTS.tracking.does).toMatch(/staged/i);
    expect(AFTER_PARTS.tracking.does).toMatch(/nothing physical ships/i);
  });

  it("Undo: open only from the tab with the key, refunded, or closed; the words never promise more", () => {
    expect(afterView(paid, true)!.refund).toEqual({ kind: "open", until: 1_000, here: true });
    expect(afterView(paid, false)!.refund).toEqual({ kind: "open", until: 1_000, here: false });
    expect(afterView({ ...paid, undo: { state: "refunded" } }, true)!.refund).toEqual({ kind: "refunded" });
    expect(afterView({ ...paid, undo: { state: "none" } }, true)!.refund).toEqual({ kind: "closed" });
    expect(afterView({ ...paid, undo: "open" }, true)!.refund).toEqual({ kind: "closed" }); // malformed reads as closed, never open
    expect(refundWords({ kind: "open", until: 1, here: true }, "42.00", "4:12 PM")).toBe("Open until 4:12 PM, from this tab.");
    expect(refundWords({ kind: "open", until: 1, here: false }, "42.00", "4:12 PM")).toMatch(/only from the tab that approved/);
    expect(refundWords({ kind: "refunded" }, "42.00", null)).toBe("Refunded: $42.00 back through PayPal.");
    expect(refundWords({ kind: "closed" }, "42.00", null)).toMatch(/closed.*Nothing was refunded/);
  });

  it("if it never arrives: PayPal's words and PayPal's page (the sandbox's only on a sandbox server)", () => {
    expect(AFTER_PARTS.never.does).toBe(NEVER_ARRIVES);
    expect(afterView(paid, true)!.sandbox).toBe(true);
    expect(afterView({ ...paid, payment: "fake" }, true)!.sandbox).toBe(false);
  });
});
