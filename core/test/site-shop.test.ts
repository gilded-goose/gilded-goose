// The Shop's pure parts (plan Task 4): every PayPal return the server sends a shopper back to, the Under the hood rows
// mapped from what the ledger's events really carry, the receipt's headline in each of its states, and Approve that
// can't be pressed twice.
import { describe, expect, it } from "vitest";
import type { LedgerEvent } from "@goose/core";
import { builtKettle } from "../../web/kettle-data.ts";
import { receiptHref, returnOf } from "../../web/src/site/shop/returns.ts";
import { hoodRows, ownRows } from "../../web/src/site/hood/rows.ts";
import { receiptHead, receiptLede, receiptMine, receiptTitle } from "../../web/src/site/shop/receipt-words.ts";
import { RETURN_CANCELLED, RETURN_CHECKING, RETURN_UNKNOWN, RETURN_WRONG, returnCard } from "@goose/core/return";
import { approveOnce } from "../../web/src/site/shop/approve-once.ts";
import { compareRows } from "../../web/src/site/shop/compare-rows.ts";
import { kettleRows } from "../../web/src/site/shop/kettle-rows.ts";
import { gridRows } from "../../web/src/site/shop/compare-grid.ts";
import type { Back } from "../../web/src/goose/back.ts";

const RUN = "0123456789ab";

describe("returnOf: the five shapes back() redirects to", () => {
  // server/src/main.ts:2149-2160, back(): the run's own page for each kind of run, each carrying `run`.
  const shapes = [
    { pathname: "/goose.html", search: `?run=${RUN}` }, // run.line
    { pathname: "/", search: `?desk=1&run=${RUN}` }, // run.desk
    { pathname: "/", search: `?market=1&run=${RUN}` }, // run.store
    { pathname: "/", search: `?wallet=0&run=${RUN}` }, // a classic-page run
    { pathname: "/", search: `?wallet=1&run=${RUN}` }, // a wallet run
  ];

  it.each(shapes)("gives the run id for $pathname$search", (loc) => {
    expect(returnOf(loc)).toBe(RUN);
  });

  it("gives an unknown or malformed id back as it came, so the receipt can say it can't find it", () => {
    expect(returnOf({ pathname: "/goose.html", search: "?run=nope" })).toBe("nope");
    expect(returnOf({ pathname: "/", search: "?wallet=1&run=ffffffffffff" })).toBe("ffffffffffff");
  });

  it("is null for pages that are not a return", () => {
    expect(returnOf({ pathname: "/", search: "" })).toBeNull();
    expect(returnOf({ pathname: "/", search: "?desk=ledger" })).toBeNull();
    expect(returnOf({ pathname: "/", search: "?desk=ledger&run=" + RUN })).toBeNull();
    expect(returnOf({ pathname: "/", search: "?run=" + RUN })).toBeNull();
    expect(returnOf({ pathname: "/goose.html", search: "?run=" })).toBeNull();
    expect(returnOf({ pathname: "/safe.html", search: "?wallet=1&run=" + RUN })).toBeNull();
  });

  it("works under a base path", () => {
    expect(returnOf({ pathname: "/gg/goose.html", search: `?run=${RUN}` })).toBe(RUN);
    expect(returnOf({ pathname: "/gg/", search: `?market=1&run=${RUN}` })).toBe(RUN);
  });

  it("receiptHref keeps the return's query and opens the Shop route; null when it is not a return", () => {
    expect(receiptHref({ pathname: "/goose.html", search: `?run=${RUN}` })).toBe(`/goose.html?run=${RUN}#/shop`);
    expect(receiptHref({ pathname: "/", search: `?wallet=1&run=${RUN}` })).toBe(`/?wallet=1&run=${RUN}#/shop`);
    expect(receiptHref({ pathname: "/", search: "" })).toBeNull();
  });
});

describe("hoodRows: the recorded kettle week", () => {
  it("maps every row as recorded, with what the event says", async () => {
    const rows = hoodRows((await builtKettle()).events, "recorded");
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.every((r) => r.kind === "recorded")).toBe(true);
    expect(rows.some((r) => r.what.includes("47.73"))).toBe(true);
  });

  it("has a Code row on QuickQuack whose why names the gift card", async () => {
    const rows = hoodRows((await builtKettle()).events, "recorded");
    const aside = rows.find((r) => r.who === "Code" && r.what.includes("QuickQuack"));
    expect(aside?.why).toMatch(/gift card/);
  });

  it("names Claude Haiku as the buyer only where the row carries its model, and code's counter as Code", async () => {
    const rows = hoodRows((await builtKettle()).events, "recorded");
    const proposed = rows.find((r) => r.what.includes("49.50") && r.who === "Claude Haiku · buyer");
    expect(proposed).toBeDefined();
    const decided = rows.find((r) => r.who === "Code" && r.what.includes("47.73") && r.why?.includes("49.50"));
    expect(decided).toBeDefined();
    // The recorded week ends at your yes: no PayPal call is in it, so none is named.
    expect(rows.every((r) => r.call === null)).toBe(true);
  });

  it("keeps the ledger's own order", async () => {
    const rows = hoodRows((await builtKettle()).events, "recorded");
    const seqs = rows.map((r) => r.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
  });
});

const ev = (seq: number, e: Partial<LedgerEvent> & Pick<LedgerEvent, "actor" | "action" | "why">): LedgerEvent =>
  ({ v: 1, seq, t: 0, shopperId: "s", visibility: "owner", ...e }) as LedgerEvent;

describe("hoodRows: a live run's PayPal calls by their real names", () => {
  const live = [
    ev(1, { actor: "seller", action: "offer", price: "42.00", sellerId: "fm-cattail", why: "Cattail Market (fictional) asks $42.00.", data: { merchant: "Cattail Market (fictional)" } }),
    ev(2, { actor: "watcher", action: "ask", sellerId: "fm-new", why: "Watcher held a seller: the AI reader flagged it, so a cart from it waits for your yes.", data: { rule: "ai-reader", sign: "pressure" } }),
    ev(3, { actor: "paypal", action: "order-created", price: "42.00", why: "Order FAKE-0001 created for the bound cart 1234abcd…; waiting for your tap.", data: { orderId: "FAKE-0001" } }),
    ev(4, { actor: "paypal", action: "authorized", price: "42.00", why: "The money is held for this cart: $42.00, not charged yet.", data: { authorizationId: "AUTH-1" } }),
    ev(5, { actor: "paypal", action: "captured", price: "42.00", why: "Captured CAP-1: $42.00 for A kettle.", data: { captureId: "CAP-1", authorizationId: "AUTH-1" } }),
    ev(6, { actor: "paypal", action: "voided", price: "42.00", why: "The cart changed after the hold, so it was released.", data: { code: "price-changed", authorizationId: "AUTH-2" } }),
    ev(7, { actor: "paypal", action: "refunded", price: "42.00", why: "Undone: refund R-1 sent for capture CAP-1, $42.00 back.", data: { refundId: "R-1" } }),
    ev(8, { actor: "paypal", action: "webhook", why: "PayPal says the capture completed.", data: { verified: true, eventType: "PAYMENT.CAPTURE.COMPLETED" } }),
    ev(9, { actor: "seller", action: "price-swap", price: "49.00", why: "The seller changed the price after the hold.", data: { attack: "price-swap" } }),
    ev(10, { actor: "buyer", action: "counter", price: "40.00", why: "Countering at $40.00.", data: {} }),
    ev(11, { actor: "shopper", action: "cancel", why: "Cancel was pressed on PayPal's page." }),
  ];
  const rows = hoodRows(live, "live");
  const at = (seq: number) => rows.find((r) => r.seq === seq)!;

  it("tags every row live", () => expect(rows.every((r) => r.kind === "live")).toBe(true));

  it("names each PayPal call", () => {
    expect(at(3).call).toBe("Orders v2 · create order");
    expect(at(4).call).toMatch(/get_order/);
    expect(at(4).call).toMatch(/authorize/);
    expect(at(5).call).toMatch(/get_order re-check/);
    expect(at(5).call).toMatch(/capture authorization/);
    expect(at(6).call).toMatch(/void authorization/);
    expect(at(7).call).toMatch(/create_refund/);
    expect(at(8).call).toBe("Webhook verified · PAYMENT.CAPTURE.COMPLETED");
    for (const r of [at(1), at(2), at(9), at(10), at(11)]) expect(r.call).toBeNull();
  });

  it("says who proposed each row from the row itself", () => {
    expect(at(1).who).toBe("Seller");
    expect(at(1).what).toContain("Cattail Market (fictional)");
    expect(at(2).who).toBe("Claude Haiku · reader");
    expect(at(3).who).toBe("PayPal");
    expect(at(9).who).toBe("Seller");
    expect(at(9).what).toMatch(/price after the hold/i);
    // A buyer row with no model on it is the rule buyer, never Claude.
    expect(at(10).who).toBe("Rule");
    expect(at(11).who).toBe("You");
  });

  it("ownRows drops the seeded week (simulated history) and keeps the visit's rows", () => {
    const seeded = ev(0, { actor: "paypal", action: "captured", why: "Seeded week (simulated, no money moved).", source: "seeded" });
    const mine = ev(1, { actor: "seller", action: "offer", why: "x", source: "market" });
    expect(ownRows([seeded, mine])).toEqual([mine]);
  });
});

describe("compareRows: the ranked list against your limit", () => {
  const r = (id: string, price: string, watcher: "clear" | "hold" | "refuse", over?: string) =>
    ({ id, merchant: `${id} (fictional)`, item: "A kettle", price, currency: "USD", history: 1, quoted: "", watcher, said: watcher === "clear" ? [] : ["its note tries to instruct the agent", "it asks to be paid by gift card"], ...(over ? { over } : {}) });

  it("ranks by price, stamps each from the Watcher and the limit, and marks the cheapest Clear seller under the limit", () => {
    const rows = compareRows([r("c", "54.00", "clear"), r("a", "34.99", "refuse"), r("b", "42.00", "clear"), r("d", "61.00", "clear"), r("e", "44.00", "hold")], 6000);
    expect(rows.map((x) => x.id)).toEqual(["a", "b", "e", "c", "d"]);
    expect(rows.map((x) => x.verdict)).toEqual(["aside", "clear", "held", "clear", "over"]);
    expect(rows.filter((x) => x.best).map((x) => x.id)).toEqual(["b"]);
    expect(rows.find((x) => x.id === "a")?.reason).toBe("its note tries to instruct the agent and it asks to be paid by gift card");
    expect(rows.find((x) => x.id === "d")?.underLimit).toBe(false);
    expect(rows.find((x) => x.id === "c")?.underLimit).toBe(true);
  });

  it("a seller the server marks over is over even under the number", () => {
    const rows = compareRows([r("x", "40.00", "clear", "Over your Kitchen limit")], 6000);
    expect(rows[0]?.verdict).toBe("over");
    expect(rows[0]?.best).toBe(false);
  });

  it("the recorded kettle week: QuickQuack set aside, Reedbank the best at $47.73", async () => {
    const rows = kettleRows((await builtKettle()).events, 6000);
    const quick = rows.find((x) => x.name.includes("QuickQuack"));
    expect(quick?.verdict).toBe("aside");
    expect(quick?.reason).toMatch(/gift card/);
    const best = rows.find((x) => x.best);
    expect(best?.name).toContain("Reedbank");
    expect(best?.price).toBe("47.73");
  });
});

describe("gridRows: Compare's AG Grid rows", () => {
  const r = (id: string, price: string, watcher: "clear" | "hold" | "refuse") =>
    ({ id, merchant: id, item: "A kettle", price, currency: "USD", history: 1, quoted: "", watcher, said: watcher === "clear" ? [] : ["it asks to be paid by gift card"] });

  it("numbers each seller in rank order, fills its bar by price against the limit, and rules the limit above the first seller over it", () => {
    const rows = gridRows(compareRows([r("a", "34.99", "refuse"), r("b", "42.00", "clear"), r("c", "61.00", "clear"), r("d", "75.00", "clear")], 6000), 6000);
    expect(rows.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
    expect(rows.map((x) => x.lineAbove)).toEqual([false, false, true, false]);
    expect(rows[1]?.fill).toBeCloseTo(0.7);
    expect(rows[3]?.fill).toBe(1);
  });

  it("with every seller under the limit, no row carries the line", () => {
    const rows = gridRows(compareRows([r("a", "20.00", "clear")], 6000), 6000);
    expect(rows.some((x) => x.lineAbove)).toBe(false);
  });
});

describe("receiptHead: what the receipt's headline says", () => {
  const base: Back = { total: null, merchant: null, item: null, orderId: null, ok: null, reason: null };
  it("checking", () => expect(receiptHead(null)).toBe("Checking with the server…"));
  it("an unknown or expired run (Review Focus 4)", () => expect(receiptHead({ ...base, gone: true })).toBe("Goose can't find that payment."));
  it("paid, with the server's total and merchant, never the (fictional) suffix in the sentence", () =>
    expect(receiptHead({ ...base, ok: true, total: "47.73", merchant: "Reedbank Outfitters (fictional)" })).toBe("Paid $47.73 to Reedbank Outfitters."));
  it("not paid: the server's card, word for word", () =>
    expect(receiptHead({ ...base, ok: false, reason: "approval expired", card: { head: "Not paid", line: null } })).toBe("Not paid"));
  it("waiting on PayPal", () => expect(receiptHead({ ...base })).toBe("PayPal hasn't confirmed this yet."));
  it("a lost answer names Goose, never PayPal, as the one who couldn't check (Q, Nov 10, SHOULD 6)", () =>
    expect(receiptHead({ ...base, lost: true, reason: "Goose couldn't reach the server to check this payment." })).toBe("Goose couldn't check this payment."));
  it("never says Paid for a gone run, even with a total", () =>
    expect(receiptHead({ ...base, gone: true, ok: true, total: "47.73" })).not.toMatch(/Paid/));
});

describe("approveOnce (Review Focus 5)", () => {
  it("ignores a second press while the first is pending, and allows one after it settles", async () => {
    let calls = 0;
    let release!: () => void;
    const tap = approveOnce(() => { calls++; return new Promise<void>((r) => { release = r; }); });
    const first = tap();
    const second = tap();
    expect(calls).toBe(1);
    expect(tap.pending()).toBe(true);
    release();
    await Promise.all([first, second]);
    expect(tap.pending()).toBe(false);
    void tap();
    expect(calls).toBe(2);
    release();
  });

  it("frees the button after a failure too", async () => {
    let calls = 0;
    const tap = approveOnce(async () => { calls++; throw new Error("PayPal didn't open"); });
    await expect(tap()).rejects.toThrow();
    expect(tap.pending()).toBe(false);
    await expect(tap()).rejects.toThrow();
    expect(calls).toBe(2);
  });
});

describe("receiptTitle: the stand-in never says Paid", () => {
  const paid = { ok: true, total: "42.00", merchant: "Cattail Market (fictional)" } as Parameters<typeof receiptHead>[0];
  it("practice mode says Approved", () => expect(receiptTitle(paid, "practice")).toBe("Approved: $42.00 to Cattail Market."));
  it("sandbox mode keeps the server's headline", () => expect(receiptTitle(paid, "sandbox")).toBe("Paid $42.00 to Cattail Market."));
  it("an unpaid practice run is still Not paid", () => expect(receiptTitle({ ok: false } as Parameters<typeof receiptHead>[0], "practice")).toBe("Not paid."));
});

// Q (Nov 10, the `line` return's MUSTs 1-4): the receipt prints the server's own card (`returnCard`, sent as `card` with
// `mine` on GET /api/runs/:id), never words of its own, in every state that isn't simply Paid to this browser.
describe("the receipt prints the server's card, never its own money words", () => {
  const base: Back = { total: "47.73", merchant: "Reedbank Outfitters (fictional)", item: "Kettle", orderId: "ORDER1", ok: null, reason: null, mine: true };
  const run = { week: null, bound: { total: "47.73", orderId: "ORDER1" }, events: [] as LedgerEvent[], mine: true };
  const ev = (actor: string, action: string, data?: Record<string, unknown>) => ({ seq: 1, t: 0, shopperId: "s", visibility: "owner", actor, action, ...(data ? { data } : {}) }) as unknown as LedgerEvent;
  const states: [string, Back][] = [
    ["PENDING capture", { ...base, ok: false, reason: "PayPal says the capture is pending", card: returnCard({ ...run, settled: { ok: false, reason: "pending" }, events: [ev("paypal", "capture-failed", { code: "unknown" })] }) }],
    ["wrong amount", { ...base, ok: false, reason: "PayPal captured a different amount; check the order", card: returnCard({ ...run, settled: { ok: false, reason: "mismatch" }, events: [ev("paypal", "capture-mismatch")] }) }],
    ["refunded", { ...base, ok: true, card: returnCard({ ...run, settled: { ok: true }, refunded: true }) }],
    ["cancelled", { ...base, ok: null, card: returnCard({ ...run, settled: null, events: [ev("shopper", "cancel")] }) }],
  ];
  it("each state has a card from the server", () => { for (const [, b] of states) expect(b.card).toBeTruthy(); });
  for (const [name, b] of states) {
    it(`${name}: the headline and lede are the card's`, () => {
      for (const mode of ["sandbox", "practice"] as const) {
        expect(receiptTitle(b, mode)).toBe(b.card!.head);
        const lede = receiptLede(b);
        expect(lede).toBe(b.card!.line ?? `${b.reason!.replace(/^./, (c) => c.toUpperCase())}.`);
        for (const said of [receiptTitle(b, mode), lede ?? ""]) expect(said).not.toMatch(/^Not paid\.$|^Paid |Your tap/);
      }
    });
  }
  it("pins the cards' words: PENDING can't tell, mismatch says so, refunded says Refunded, cancel says nothing was paid", () => {
    expect(states.map(([, b]) => b.card!.head)).toEqual([RETURN_CHECKING, RETURN_WRONG, "Refunded $47.73", "Not paid"]);
    expect(receiptLede(states[0]![1])).toBe(RETURN_UNKNOWN);
    expect(receiptLede(states[3]![1])).toBe(RETURN_CANCELLED);
  });
  it("another browser on the return link: never Your tap, no AfterPay or Undo (mine false)", () => {
    const elsewhere: Back = { ...base, ok: true, mine: false, card: returnCard({ ...run, mine: false, settled: { ok: true } }) };
    expect(receiptMine(elsewhere)).toBe(false);
    expect(receiptMine({ ...base, ok: true, card: null })).toBe(true);
    expect(receiptLede(elsewhere)).toBe("Paid from another browser.");
    expect(receiptLede(elsewhere)).not.toMatch(/Your tap/);
  });
});
