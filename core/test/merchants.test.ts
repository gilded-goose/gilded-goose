// Track F (Nov 6): For merchants on Behind the scenes (scorecard row 20). One line per PayPal order: the recorded sandbox
// order first, then this browser's own, each cell a field PayPal returned or a row the guard wrote.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MERCHANT_GRID, MERCHANT_WORDS, PAID_WHY, dayWords, markOf, merchantRows, readRecorded, recordedLine, whenWords, yourLines, type OrderEvent, type RecordedOrder } from "../src/view/merchants.ts";
import { CART_WORDS } from "../../trust/src/cart.ts";
import { listedCaptureEvent } from "../../scripts/merchant-event.ts";
import { cartMark } from "../src/view/trail.ts";
import { SHOT_HASH, SHOT_ROWS } from "./fixtures/merchant-shots.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const HASH = "0123456789abcdef0123456789abcdef";
const T0 = Date.UTC(2026, 10, 6, 16, 5);

const RECORDED: RecordedOrder = {
  recordedOn: "2026-11-06", orderId: "5O190127TN364715T", intent: "CAPTURE", status: "COMPLETED", captureId: "3C679366HH908993F",
  amount: "50.13", currency: "USD", cartHash: HASH, approvedSeenAt: "2026-11-06T16:05:00.000Z",
  event: { id: "WH-7Y7254563A4550640-11V2185806837105M", type: "PAYMENT.CAPTURE.COMPLETED", createTime: "2026-11-06T16:05:09.000Z" },
};

const created = (orderId: string, t = T0 - 60_000): OrderEvent => ({ t, actor: "paypal", action: "order-created", price: "50.13", currency: "USD", data: { orderId, hash: HASH } });
const row = (action: string, orderId: string, t: number, extra: Record<string, unknown> = {}, actor = "paypal"): OrderEvent => ({ t, actor, action, data: { orderId, hash: HASH, ...extra } });
const hook = (orderId: string, eventType: string, o: { verified?: boolean; matched?: boolean } = {}): OrderEvent =>
  ({ t: T0 + 9000, actor: "paypal", action: "webhook", data: { eventId: "WH-1", eventType, verified: o.verified ?? true, matched: o.matched ?? true, orderId } });

describe("the recorded sandbox order", () => {
  it("reads only a whole, well-formed record: a bent file draws nothing", () => {
    expect(readRecorded(RECORDED)).toEqual(RECORDED);
    expect(readRecorded({ ...RECORDED, event: null })).toEqual({ ...RECORDED, event: null });
    for (const bent of [null, [], "x", { ...RECORDED, orderId: "<script>" }, { ...RECORDED, amount: "50.1" }, { ...RECORDED, intent: "SALE" },
      { ...RECORDED, cartHash: "not-hex" }, { ...RECORDED, approvedSeenAt: "soon" }, { ...RECORDED, event: { ...RECORDED.event, type: "x<y" } },
      { ...RECORDED, event: undefined }, { ...RECORDED, recordedOn: "Nov 6" }]) expect(readRecorded(bent)).toBeNull();
  });

  it("is labelled with its day, and PayPal's list read is never called signed", () => {
    const line = recordedLine(RECORDED);
    expect(line.label).toBe("Recorded sandbox order, Nov 6, 2026");
    expect(line.word).toBe("PAYMENT.CAPTURE.COMPLETED, from PayPal's event list");
    expect(line.word).not.toMatch(/signed/i);
    expect([line.cart, line.orderId, line.status, line.amount, line.eventId]).toEqual([HASH, RECORDED.orderId, "COMPLETED", "$50.13", RECORDED.event!.id]);
    expect(line.approved).toBe("Nov 6, 4:05 PM");
    expect(MERCHANT_WORDS.cols.approved).toBe("Seen approved (UTC)");
    expect(recordedLine({ ...RECORDED, event: null }).word).toBe(MERCHANT_WORDS.waiting);
  });

  it("comes first, then this browser's own orders, oldest first", () => {
    const rows = merchantRows(RECORDED, [created("A1", T0), created("B2", T0 + 1)]);
    expect(rows.map((r) => [r.from, r.orderId])).toEqual([["recorded", RECORDED.orderId], ["yours", "A1"], ["yours", "B2"]]);
    expect(merchantRows(null, [])).toEqual([]);
  });

  it("the script writes it only after a passing settle, from PayPal's own read, matched by the server's own matcher", () => {
    const s = read("scripts/e2e-sandbox.ts");
    expect(s.indexOf("await recordForMerchants(saved, r.captureId, approvedSeenAt);")).toBeLessThan(s.indexOf('console.log("E2E SETTLE PASS");'));
    expect(s).toContain("listedCaptureEvent(list, { orderId: saved.orderId!, captureId, hash: saved.hash })");
    expect(read("scripts/merchant-event.ts")).toContain("webhookMatches(f, cart)");
    expect(s).toContain("readRecorded(");
    // The record holds ids and words PayPal returned, never a token: the script prints only the token call's status.
    expect(s).not.toMatch(/console\.log\([^)]*access_token/);
  });
});

describe("the recorded order's event, picked from PayPal's list", () => {
  const cart = { orderId: "O1", captureId: "C1", hash: HASH };
  const listed = (o: { id?: string; order?: string; capture?: string; custom?: string | null; type?: string } = {}) => ({
    id: o.id ?? "WH-1", event_type: o.type ?? "PAYMENT.CAPTURE.COMPLETED", create_time: "2026-11-06T16:05:09Z",
    resource: { id: o.capture ?? "C1", ...(o.custom === null ? {} : { custom_id: o.custom ?? HASH }), supplementary_data: { related_ids: { order_id: o.order ?? "O1" } } },
  });
  it("takes only this capture of this cart: another cart's, another order's, another capture's or a hash-less event is never it", () => {
    expect(listedCaptureEvent([listed()], cart)).toEqual({ id: "WH-1", type: "PAYMENT.CAPTURE.COMPLETED", createTime: "2026-11-06T16:05:09Z" });
    for (const bad of [{ custom: "f".repeat(32) }, { order: "O2" }, { capture: "C2" }, { custom: null }, { type: "PAYMENT.CAPTURE.DENIED" }]) expect(listedCaptureEvent([listed(bad)], cart), JSON.stringify(bad)).toBeNull();
    // The right one is found past a wrong-cart one listed first.
    expect(listedCaptureEvent([listed({ id: "WH-0", custom: "f".repeat(32) }), listed()], cart)?.id).toBe("WH-1");
  });
});

describe("this browser's own orders", () => {
  it("each outcome reads as itself, with PayPal's signed word only from a verified, matched event of the kind it expects", () => {
    const at = (n: number) => T0 + n * 1000;
    const lines = yourLines([
      created("CAP"), row("captured", "CAP", at(1), { captureId: "C1" }), hook("CAP", "PAYMENT.CAPTURE.COMPLETED"),
      created("REF"), row("captured", "REF", at(2), { captureId: "C2" }), { t: at(3), actor: "paypal", action: "refunded", data: { captureId: "C2", refundId: "R1" } },
      created("VOID"), row("authorized", "VOID", at(4)), row("voided", "VOID", at(5)), hook("VOID", "PAYMENT.AUTHORIZATION.VOIDED"),
      created("HOLD"), row("authorized", "HOLD", at(6)),
      created("NOPE"), row("refuse", "NOPE", at(7), { code: "hash" }, "cart"),
      created("WHO"), row("capture-mismatch", "WHO", at(8)),
      created("VF"), row("authorized", "VF", at(9)), row("void-failed", "VF", at(10)),
      created("UNK"), row("capture-failed", "UNK", at(11), { code: "unknown" }),
      created("WAIT"),
    ]);
    const by = Object.fromEntries(lines.map((l) => [l.orderId, [l.status, l.word]]));
    expect(by).toEqual({
      CAP: ["Captured", "PAYMENT.CAPTURE.COMPLETED, signed by PayPal"],
      REF: ["Refunded", MERCHANT_WORDS.waiting],
      VOID: ["Voided (hold released)", "PAYMENT.AUTHORIZATION.VOIDED, signed by PayPal"],
      HOLD: ["Held", MERCHANT_WORDS.waiting],
      NOPE: ["Not captured", MERCHANT_WORDS.nothing],
      WHO: ["Stopped: check it in PayPal", MERCHANT_WORDS.waiting],
      VF: ["Stopped: check it in PayPal", MERCHANT_WORDS.waiting],
      UNK: ["Stopped: check it in PayPal", MERCHANT_WORDS.waiting],
      WAIT: ["Waiting for the tap", MERCHANT_WORDS.waiting],
    });
    // "Nothing taken" only where the guard can say no money moved.
    for (const l of lines) if (l.status.startsWith("Stopped")) expect(l.word).not.toBe(MERCHANT_WORDS.nothing);
  });

  it("seen approved only from a row the guard writes after its re-read passed: a refusal (order not approved) has no time", () => {
    const refusedStatus = { t: T0 + 4000, actor: "cart", action: "refuse", why: `Not capturing: ${CART_WORDS.status}.`, quoted: "PAYER_ACTION_REQUIRED", data: { orderId: "S1", hash: HASH } };
    const capturing = { t: T0 + 3000, actor: "guard", action: "capturing", data: { orderId: "S1", hash: HASH } };
    const [l] = yourLines([created("S1"), capturing, refusedStatus]);
    // A dash, never a blank cell: a blank reads as lost data (the DD, Nov 6), where this one means "never seen approved".
    expect([l!.status, l!.approved, l!.word]).toEqual(["Not captured", MERCHANT_WORDS.dash, MERCHANT_WORDS.nothing]);
    // A capture that failed after the re-read passed was seen approved; its time is that row's.
    const [f] = yourLines([created("F1"), { ...capturing, data: { orderId: "F1" } }, row("capture-failed", "F1", T0 + 6000, { code: "INSTRUMENT_DECLINED" })]);
    expect(f!.approved).toBe(whenWords(T0 + 6000));
  });

  it("a second settle that finds the order already paid never says nothing was taken", () => {
    expect(PAID_WHY).toBe(`Not capturing: ${CART_WORDS.paid}.`);
    const [l] = yourLines([created("P1"), { t: T0 + 4000, actor: "cart", action: "refuse", why: PAID_WHY, data: { orderId: "P1", hash: HASH } }]);
    expect([l!.status, l!.approved, l!.word]).toEqual([MERCHANT_WORDS.paid, MERCHANT_WORDS.dash, MERCHANT_WORDS.dash]);
    // Never "Not yet" beside "Already paid": the capture's own signed word when this browser has it, else a dash.
    const withHook = yourLines([created("P1"), { t: T0 + 4000, actor: "cart", action: "refuse", why: PAID_WHY, data: { orderId: "P1", hash: HASH } }, hook("P1", "PAYMENT.CAPTURE.COMPLETED")]);
    expect([withHook[0]!.status, withHook[0]!.word]).toEqual([MERCHANT_WORDS.paid, MERCHANT_WORDS.signed("PAYMENT.CAPTURE.COMPLETED")]);
    // The same order, captured on its first settle, reads "Captured" again after a second settle refuses it as paid.
    const again = yourLines([created("P2"), row("captured", "P2", T0 + 2000, { captureId: "C9" }), hook("P2", "PAYMENT.CAPTURE.COMPLETED"), { t: T0 + 9000, actor: "cart", action: "refuse", why: PAID_WHY, data: { orderId: "P2", hash: HASH } }]);
    expect([again[0]!.status, again[0]!.approved, again[0]!.word]).toEqual(["Captured", whenWords(T0 + 2000), MERCHANT_WORDS.signed("PAYMENT.CAPTURE.COMPLETED")]);
  });

  it("an unverified, unmatched or wrong-kind event is never shown as PayPal's word", () => {
    for (const bad of [hook("CAP", "PAYMENT.CAPTURE.COMPLETED", { verified: false }), hook("CAP", "PAYMENT.CAPTURE.COMPLETED", { matched: false }), hook("CAP", "PAYMENT.CAPTURE.DENIED"), hook("OTHER", "PAYMENT.CAPTURE.COMPLETED")]) {
      const [l] = yourLines([created("CAP"), row("captured", "CAP", T0, { captureId: "C1" }), bad]);
      expect([l!.word, l!.eventId]).toEqual([MERCHANT_WORDS.waiting, null]);
    }
  });

  it("the cart is the hash the guard sent as custom_id, the tap time the settle's first row, and nothing typed is trusted", () => {
    const [l] = yourLines([created("A1"), row("authorized", "A1", T0 + 5000), row("captured", "A1", T0 + 7000, { captureId: "C" })]);
    expect([l!.cart, l!.approved, l!.amount, l!.label]).toEqual([HASH, whenWords(T0 + 5000), "$50.13", MERCHANT_WORDS.yours]);
    expect(read("trust/src/paypal.ts")).toContain("custom_id: b.hash");
    expect(read("trust/src/cart.ts")).toContain('if (snap.customId !== b.hash) return refused("hash"');
    // A bent order id or price draws no line, or no amount.
    expect(yourLines([{ ...created("x"), data: { orderId: "<img>", hash: HASH } }])).toEqual([]);
    expect(yourLines([{ ...created("A2"), price: "fifty" }])[0]!.amount).toBe("");
    expect(yourLines([created("A3"), created("A3")])).toHaveLength(1);
  });

  it("dates read in UTC words", () => {
    expect(dayWords("2026-11-06")).toBe("Nov 6, 2026");
    expect(whenWords(Date.UTC(2026, 10, 6, 0, 7))).toBe("Nov 6, 12:07 AM");
    expect(whenWords(Number.NaN)).toBe("");
  });
});

describe("the table on Behind the scenes", () => {
  it("is AG Grid Community in Studio and on the Community ledger, read only, with the recorded order from its file", () => {
    const frame = read("web/src/ledger/MerchantOrders.tsx"), grid = read("web/src/ledger/MerchantGrid.tsx");
    expect(grid).toContain('import { AgGridReact } from "ag-grid-react";');
    for (const t of [frame, grid]) expect(t).not.toMatch(/ag-grid-enterprise|onClick|fetch\(/);
    // The frame carries no AG code: the grid is its own lazy chunk, so the Community ledger's first files stay AG-free.
    expect(frame).not.toMatch(/from "ag-grid/);
    expect(frame).toContain('const MerchantGrid = lazyOr(() => import("./MerchantGrid.tsx"), () => <p className="mo-none mo-lost">{MERCHANT_WORDS.lost}</p>);');
    expect(frame).toContain('import.meta.glob<unknown>("../../../docs/fixtures/merchant-order.json"');
    // One height for both: the frame holds the grid's exact place, so the page doesn't move when the chunk lands.
    expect(frame).toContain("height: MERCHANT_GRID.head + Math.min(rows.length, MERCHANT_GRID.most) * MERCHANT_GRID.row + 2");
    expect(grid).toContain("ledgerTheme.withParams({ rowHeight: MERCHANT_GRID.row, headerHeight: MERCHANT_GRID.head })");
    // Every fixed width plus the word's floor fits the 1440 page's 1134 px column: no sideways scroll on a desk.
    const widths = [...grid.slice(grid.indexOf("const COLUMNS"), grid.indexOf("];", grid.indexOf("const COLUMNS"))).matchAll(/(?:\bwidth|minWidth): (\d+)/g)].map((m) => Number(m[1]));
    expect(widths).toHaveLength(6);
    // The grid draws only where the column holds every width, borders in (MERCHANT_GRID.min); a narrower one draws cards.
    expect(widths.reduce((a, b) => a + b, 0) + 2).toBe(MERCHANT_GRID.min);
    expect(MERCHANT_GRID.min).toBeLessThanOrEqual(1136);
    expect(frame).toContain("const fit = () => setWide(el.clientWidth >= MERCHANT_GRID.min);");
    expect(frame).toContain(") : wide === null ? null : !wide ? (\n        <MerchantCards rows={rows} labelledBy=\"mo-h\" />");
    // No "Order" column (the DD: "Your sandbox order" on every row), no resize handles on a read-only table.
    expect(grid).not.toContain('field: "label"');
    expect(grid).toContain("defaultColDef={{ wrapHeaderText: true, resizable: false }}");
    expect(read("web/src/studio/Studio.tsx")).toContain("<MerchantOrders events={has ? events : NO_EVENTS} />");
    expect(read("web/src/SessionLedger.tsx")).toContain("<MerchantOrders events={ownEvents} />");
  });
});

describe("what each line says, and how", () => {
  it("never leaves a cell blank: no approval, no amount or no hash is a dash", () => {
    const lines = merchantRows(RECORDED, SHOT_ROWS as OrderEvent[]);
    for (const l of lines) for (const k of ["approved", "status", "word", "orderId"] as const) expect(l[k], `${l.orderId} ${k}`).not.toBe("");
    expect(lines.filter((l) => l.approved === MERCHANT_WORDS.dash).map((l) => l.orderId)).toEqual(["LOCAL-B2", "LOCAL-C3", "LOCAL-D4"]);
    expect(read("web/src/ledger/merchant-cells.tsx")).toContain("{r.amount || MERCHANT_WORDS.dash}");
    // The grid's own: every cell that can be empty (a bent price, a hash-less order) draws the same dash.
    const grid = read("web/src/ledger/MerchantGrid.tsx");
    expect(grid).toContain('field: "amount", width: 92, cellClass: "lx-num", type: "rightAligned", valueFormatter: (p) => p.value || MERCHANT_WORDS.dash }');
    expect(grid).toContain("valueFormatter: (p) => p.value ?? MERCHANT_WORDS.dash");
    // The time is read in full ink, not the dim one (the re-check, Nov 6: AA), and the phone's webhook value has a line of its own.
    expect(grid).toContain('{ headerName: W.approved, field: "approved", width: 150, cellClass: `lx-num ${wrap}` }');
    expect(read("web/src/ledger/merchant-cells.tsx")).toContain('<div className="mo-stack"><dt>{W.word}</dt><dd><Word r={r} /></dd></div>');
  });
  it("marks the money that moved and stayed, and a signed event, for the page to draw as a token and a badge", () => {
    const by = Object.fromEntries(merchantRows(RECORDED, SHOT_ROWS as OrderEvent[]).map((l) => [l.orderId, [l.status, l.done, l.signed]]));
    expect(by).toEqual({ [RECORDED.orderId]: ["COMPLETED", true, false], "LOCAL-A1": ["Captured", true, true], "LOCAL-B2": ["Waiting for the tap", false, false], "LOCAL-C3": ["Not captured", false, false], "LOCAL-D4": [MERCHANT_WORDS.paid, false, false] });
    const refunded = yourLines([created("R1"), row("captured", "R1", T0, { captureId: "C2" }), { t: T0 + 1, actor: "paypal", action: "refunded", data: { captureId: "C2" } }]);
    expect(refunded[0]!.done).toBe(false);
    // The badge's words are the claim's (mo-signed): the cell splits the event type from them, never rewrites them.
    expect(MERCHANT_WORDS.signed("X.Y")).toBe(`X.Y, ${MERCHANT_WORDS.signedBy}`);
    expect(read("web/src/ledger/merchant-cells.tsx")).toContain("{r.signed && <span className=\"mo-badge\">{CHECK}{MERCHANT_WORDS.signedBy}</span>}");
  });
  it("draws the cart's mark exactly as the ledger's trail does, without taking the trail module into the ledger's first files", () => {
    for (const h of [HASH, "ABCDEF0123456789ABCD", "short", "", null, "zz".repeat(10)]) expect(markOf(h), String(h)).toBe(cartMark(h));
  });
});

describe("the stills' own orders (core/test/fixtures/merchant-shots.ts)", () => {
  it("give each order its own cart hash, as bindCart's nonce makes every real one: never one hash at two amounts", () => {
    const made = SHOT_ROWS.filter((r) => r.actor === "paypal" && r.action === "order-created").map((r) => ({ id: String(r.data.orderId), hash: String(r.data.hash), price: String((r as { price?: string }).price) }));
    expect(new Set(made.map((m) => m.hash)).size).toBe(made.length);
    for (const a of made) for (const b of made) if (a.hash === b.hash) expect(a.price, `${a.id} and ${b.id} share ${a.hash}`).toBe(b.price);
    // Every row naming an order carries that order's own hash.
    for (const r of SHOT_ROWS) if (typeof r.data.hash === "string") expect(made.find((m) => m.id === r.data.orderId)?.hash).toBe(r.data.hash);
    expect(Object.values(SHOT_HASH).every((h) => /^[0-9a-f]{32}$/.test(h))).toBe(true);
    // And the reason a real table never repeats one: the binding's hash takes a per-binding nonce.
    expect(read("trust/src/cart.ts")).toContain("return { cart: c, nonce, hash: bindingHash(c, nonce, expiresAt, hash), expiresAt, spent: false };");
  });
});
