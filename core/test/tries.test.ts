// "Things to try" (the Desk's slice 5): eight things, each ticked by its real event and never by a tap on the list;
// "N of 8 tried"; kept in this browser as keys only, where anything unreadable reads as nothing tried.

import { describe, expect, it } from "vitest";
import { DemoShoppers, TRICK_RUN, parseJudgeRequest, trickGoose, type LedgerEvent } from "../src/index.ts";
import { TRIED_KEY, TRIES, TriedKeeper, isTryKey, mergeTried, parseTried, triedFromRows, triedOf, triedWords, type TriedStorage, type TryKey } from "../src/view/tries.ts";
import { writeAsk } from "../src/view/session.ts";
import { sha256 } from "./helpers.ts";

const AT = 1_800_000_000_000;
let seq = 0;
const row = (e: Partial<LedgerEvent>): LedgerEvent =>
  ({ v: 1, seq: seq++, t: AT, shopperId: "s", visibility: "owner", actor: "guard", action: "x", why: "w", runId: "r", source: "live", ...e }) as LedgerEvent;

describe("things to try", () => {
  it("lists Joshua's eight, in his order, each with a key the page can tick", () => {
    expect(TRIES.map((t) => t.label)).toEqual(["Ask for anything", "Snap a photo", "Try to trick Goose", "Try a price swap", "Approve with PayPal", "Undo it", "Shop the market", "Look behind the scenes"]);
    expect(new Set(TRIES.map((t) => t.key)).size).toBe(8);
    expect(triedWords([])).toBe("0 of 8 tried");
    expect(triedWords(["ask", "ask", "trick"])).toBe("2 of 8 tried");
  });

  it("ticks each ledger try from its own row only, with one rule for the stream and the route", () => {
    expect(triedOf(row({ source: "attack", actor: "guard", action: "refuse" }))).toEqual(["trick"]);
    expect(triedOf(row({ source: "ask", actor: "shopper", action: "ask", data: { chips: 1, how: "typed" } }))).toEqual(["ask"]);
    expect(triedOf(row({ source: "ask", actor: "shopper", action: "ask", data: { chips: 1, how: "said" } }))).toEqual(["ask"]);
    expect(triedOf(row({ source: "ask", actor: "shopper", action: "ask", data: { chips: 1, how: "photo" } }))).toEqual(["photo"]);
    expect(triedOf(row({ actor: "seller", action: "price-swap" }))).toEqual(["swap"]);
    expect(triedOf(row({ actor: "paypal", action: "captured", verdict: "ok" }))).toEqual(["approve"]);
    expect(triedOf(row({ actor: "paypal", action: "authorized", verdict: "ok" }))).toEqual(["approve"]);
    expect(triedOf(row({ actor: "paypal", action: "refunded", verdict: "ok" }))).toEqual(["undo"]);
    expect(triedOf(row({ source: "market", actor: "guard", action: "ask" }))).toEqual(["market"]);
    // The market: any market row proves a cart was put in; only PayPal holding or taking the money proves Approve.
    expect(triedOf(row({ source: "market", actor: "paypal", action: "order-created", verdict: "ok" }))).toEqual(["market"]);
    expect(triedOf(row({ source: "market", actor: "paypal", action: "capture-failed", verdict: "refused" }))).toEqual(["market"]);
    expect(triedOf(row({ source: "market", actor: "paypal", action: "authorized", verdict: "ok" }))).toEqual(["approve", "market"]);
    expect(triedOf(row({ source: "market", actor: "paypal", action: "captured", verdict: "ok" }))).toEqual(["approve", "market"]);
    expect(triedOf(row({ source: "market", actor: "paypal", action: "refunded", verdict: "ok" }))).toEqual(["undo", "market"]);
    expect(triedFromRows([row({ source: "market", actor: "paypal", action: "order-created", verdict: "ok" })])).toEqual(["market"]);
    // Not a tick: a failed capture, an order merely created (no tap yet), a seller's offer, the seeded week's payment,
    // a refused refund, an ask-source row that isn't the Ask itself.
    for (const e of [
      row({ actor: "paypal", action: "capture-failed", verdict: "refused" }), row({ actor: "paypal", action: "order-created", verdict: "ok" }),
      row({ actor: "seller", action: "offer" }), row({ source: "seeded", actor: "paypal", action: "captured", verdict: "ok" }),
      row({ actor: "paypal", action: "refunded", verdict: "refused" }), row({ source: "ask", actor: "guard", action: "ask" }),
    ]) expect(triedOf(e)).toEqual([]);
  });

  it("a fresh session proves nothing; a real trick proves the trick", async () => {
    const shopper = new DemoShoppers().for("t", AT);
    expect(triedFromRows(shopper.read())).toEqual([]);
    const req = parseJudgeRequest({ note: "gift card only", price: "45.00", mode: "rule" });
    if (!req.ok) throw new Error(req.error);
    await trickGoose({ shopper, req: req.value, hash: sha256, now: () => AT, seed: 1, runId: `${TRICK_RUN}1`, ai: null, aiState: "off", aiName: "" });
    expect(triedFromRows(shopper.read())).toEqual(["trick"]);
    // An Ask and a photo as `writeAsk` writes them (chips only).
    writeAsk(shopper, [{ kind: "item", value: "kettle" }], AT, "photo");
    writeAsk(shopper, [], AT, "words");
    expect(triedFromRows(shopper.read())).toEqual(["ask", "photo", "trick"]);
  });

  it("reads what the browser kept, and junk as nothing tried", () => {
    expect(parseTried(JSON.stringify(["trick", "ask"]))).toEqual(["ask", "trick"]);
    for (const junk of [null, undefined, "", "{", "\"ask\"", "{\"ask\":true}", "[1,2]", JSON.stringify(["admin", "__proto__"])]) expect(parseTried(junk)).toEqual([]);
    expect(parseTried(JSON.stringify(["ask", "nope", "behind"]))).toEqual(["ask", "behind"]);
    expect(isTryKey("constructor")).toBe(false);
  });

  it("keeps ticks in the browser's storage, and still works when storage is blocked or throws", () => {
    const box = new Map<string, string>();
    const ok = new TriedKeeper(() => ({ getItem: (k) => box.get(k) ?? null, setItem: (k, v) => void box.set(k, v) }));
    expect(ok.add(["trick", "nope"])).toEqual(["trick"]);
    expect(JSON.parse(box.get(TRIED_KEY)!)).toEqual(["trick"]);
    // A second page in the same browser reads what the first kept.
    expect(new TriedKeeper(() => ({ getItem: (k) => box.get(k) ?? null, setItem: (k, v) => void box.set(k, v) })).add(["ask"])).toEqual(["ask", "trick"]);
    for (const blocked of [
      () => null,
      () => { throw new Error("SecurityError: localStorage is blocked"); },
      () => ({ getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("QuotaExceededError"); } }),
    ] as (() => TriedStorage | null)[]) {
      const k = new TriedKeeper(blocked);
      expect(k.read()).toEqual([]);
      expect(k.add(["ask"])).toEqual(["ask"]);
      expect(k.add(["behind"])).toEqual(["ask", "behind"]);
      expect(triedWords(k.read())).toBe("2 of 8 tried");
    }
    // Junk in storage reads as nothing tried and is overwritten by the next real tick.
    box.set(TRIED_KEY, "{not json");
    expect(new TriedKeeper(() => ({ getItem: (k) => box.get(k) ?? null, setItem: (k, v) => void box.set(k, v) })).add(["undo"])).toEqual(["undo"]);
  });

  it("never takes a tick back, and never ticks past eight", () => {
    const all = TRIES.map((t) => t.key);
    let kept: TryKey[] = [];
    for (const k of [...all, ...all]) {
      const next = mergeTried(kept, [k]);
      expect(next.length).toBeGreaterThanOrEqual(kept.length);
      for (const had of kept) expect(next).toContain(had);
      kept = next;
    }
    expect(kept).toEqual(all);
    expect(triedWords(kept)).toBe("8 of 8 tried");
  });
});
