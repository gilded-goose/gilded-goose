// S1-11 (after H-6 and POL-3): the deal card's "Rather wait? Keep watching" saves the want at what the cart is held to,
// the same `held` the No deal card's keep-watching sends: the lower of her own cap and the category's limit. So the chip
// "A Marsh Lights ticket, nothing over $85" waits for $85.00 or less, not the $90.00 Events limit.

import { describe, expect, it } from "vitest";
import { understand } from "../src/ask/understood.ts";
import { recordedMarket } from "../src/ask/recorded-market.ts";
import { DemoShoppers, demoCatalogItems, toCents } from "../src/index.ts";
import { demoPolicy } from "../src/scenario.ts";
import { watchWant } from "../src/view/desk.ts";

const T = 1_760_000_000_000;

describe("keep_watching_saves_at_her_cap", () => {
  it("sends max = held: her $85 cap under the $90 limit, and the server keeps the want at $85.00", () => {
    const words = "A Marsh Lights ticket, nothing over $85";
    const read = understand(words, demoPolicy());
    expect(read.limit).toBe("90.00");
    expect(read.held).toBe("85.00");
    const id = recordedMarket(words)!.catalogId;
    expect(demoCatalogItems().has(id)).toBe(true);
    const body = watchWant(id, toCents(read.held));
    expect(body).toEqual({ catalogId: id, priority: "really", max: 8500 });
    const s = new DemoShoppers();
    expect(s.setWant("a", body, T).ok).toBe(true);
    expect(s.session("a", T + 1).wants[0]!.max).toBe(8500);
  });

  it("with no cap of hers, held is the limit; with no max sent the server also waits at the limit", () => {
    const read = understand("A Marsh Lights ticket under $90", demoPolicy());
    expect(read.held).toBe("90.00");
    expect(watchWant("kettle")).toEqual({ catalogId: "kettle", priority: "really" });
    expect(watchWant("kettle", null)).not.toHaveProperty("max");
    const t = new DemoShoppers();
    t.setWant("b", watchWant("kettle"), T);
    expect(t.session("b", T + 1).wants[0]!.max).toBe(6000);
  });
});
