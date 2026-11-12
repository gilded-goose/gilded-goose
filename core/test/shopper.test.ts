// F1, one shopper ledger (018 N19, N6; 020 W8, W11, W12): every run of a session writes into one ledger, the week,
// the dial and the in-flight hold read it across runs, and one fold feeds every surface. Each check has a control
// that shows it can fail (project Lessons 16, 30).

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  DAY_MS, DEMO_SHOPPER, DEMO_T0, DemoShoppers, type SavedSession, MemoryLedger, NOT_THIS_ONE, SEEDED_PURCHASE, ShopperLedger, cancelledInPayPal, dayOf, demoCatalogItems, demoDeps,
  COUNTS_TOWARD_RECORD, STRONG_RECORD, badPickEnd, broughtBack, countsTowardRecord, setAside, demoGuard, demoPolicy, demoWant, dialPreview, settleAnswer, shopperFold, toCents, weekSpend,
  type BoundCart, type Cart, type Catalog, type LedgerEvent, type OrderSnapshot, type PaymentPort, type Policy, type Source,
} from "../src/index.ts";
import { sha256 } from "./helpers.ts";

const CAT = demoCatalogItems();
const want = demoWant({ deadline: Number.MAX_SAFE_INTEGER });
const cart = (price: string, extra: Partial<Cart> = {}): Cart => ({
  item: want.item, merchant: "Pondside Goods (fictional)", sellerId: "pondside", qty: 1, price: toCents(price), currency: "USD", shape: "one-off", catalogId: "kettle", ...extra,
});

/** A fake PayPal shared by every run of a session; `gate` holds the order read open, `fail` makes a capture throw. */
function fakePayPal() {
  const orders = new Map<string, OrderSnapshot>();
  let release: () => void = () => {};
  const p = {
    captured: 0,
    gate: null as Promise<void> | null,
    fail: null as string | null,
    hold() { p.gate = new Promise<void>((r) => { release = r; }); },
    open() { p.gate = null; release(); },
    async create(b: BoundCart) { const id = `o${orders.size + 1}`; orders.set(id, { id, status: "APPROVED", amount: b.cart.price, currency: "USD", customId: b.hash }); return { orderId: id, approveUrl: "" }; },
    async get(id: string) { if (p.gate) await p.gate; return { ...orders.get(id)! }; },
    async capture() { if (p.fail) throw new Error(p.fail); p.captured++; return { status: "COMPLETED", captureId: `c${p.captured}` }; },
  };
  return p satisfies PaymentPort;
}

/** One browser session: one shopper ledger, and a run (its own view and its own guard, as the server builds them) per call. */
function session(policy: Partial<Policy> = {}, shopper = new ShopperLedger()) {
  const deps = demoDeps(1, sha256);
  const pol = demoPolicy(policy);
  const port = fakePayPal();
  let n = 0;
  const run = (source: Source = "live") => {
    const ledger = shopper.run(`run${++n}`, source);
    const guard = demoGuard(deps, ledger, pol);
    const bind = async (price: string, extra: Partial<Cart> = {}) => {
      const d = guard.decide(want, cart(price, extra));
      if (d.kind === "refused") return d;
      const { orderId } = await guard.place(d.bound, port, "https://example.test/return");
      return { ...d, orderId };
    };
    const settle = (d: Awaited<ReturnType<typeof bind>>) => (d.kind === "refused" ? d : guard.settle(d.bound, d.orderId, port));
    return { ledger, guard, bind, settle, buy: async (price: string, extra: Partial<Cart> = {}) => settle(await bind(price, extra)) };
  };
  return { shopper, deps, policy: pol, port, run };
}

const fold = (rows: LedgerEvent[], policy = demoPolicy(), now = DEMO_T0) => shopperFold(rows, policy, CAT, now);

describe("W8: the week spans runs, never sessions", () => {
  it("weekly_total_spans_runs: three $59 buys in three runs, and a fourth in a new run of the same session is held by the week", async () => {
    const s = session();
    for (let i = 0; i < 3; i++) expect(await s.run().buy("59.00")).toMatchObject({ ok: true });
    expect(s.run().guard.decide(want, cart("59.00"))).toMatchObject({ kind: "refused", rule: "week", reason: expect.stringMatching(/to \$236\.00, over your weekly limit \$200\.00/) });
    expect(s.port.captured).toBe(3);
    // The wallet's week is the guard's number.
    expect(fold(s.shopper.read()).week.spent).toBe(toCents("177.00"));
    // Control: a run with a ledger of its own (the server before F1) would have let the fourth through.
    expect(demoGuard(s.deps, new MemoryLedger(), s.policy).decide(want, cart("59.00")).kind).toBe("ask");
  });

  it("two_sessions_never_share_the_week: another session token's first buy is unaffected", async () => {
    const shoppers = new DemoShoppers();
    const a = session({}, shoppers.for("token-a", DEMO_T0));
    for (let i = 0; i < 3; i++) await a.run().buy("59.00");
    expect(a.run().guard.decide(want, cart("59.00")).kind).toBe("refused");
    const b = session({}, shoppers.for("token-b", DEMO_T0));
    expect(await b.run().buy("59.00")).toMatchObject({ ok: true });
    expect(fold(b.shopper.read()).week.spent).toBe(toCents("59.00"));
    // Control: the same token gets the same ledger back, and its fourth buy is still held.
    expect(shoppers.for("token-a", DEMO_T0 + DAY_MS)).toBe(a.shopper);
    expect(session({}, shoppers.for("token-a", DEMO_T0)).run().guard.decide(want, cart("59.00")).kind).toBe("refused");
  });
});

describe("W11: the strong record is per category", () => {
  // The code's catalog plus a garden entry, so a second category has captures of its own.
  const two: Catalog = new Map([...CAT, ["trowel", { item: "Fernhollow Trowel (fictional)", category: "garden" }]]);
  const policy = demoPolicy({ categoryLimit: { kitchen: toCents("60.00"), garden: toCents("40.00") } });
  const ledger = new ShopperLedger();
  const view = ledger.run("r1", "live");
  const capture = (catalogId: string | undefined, price = "25.00") => view.append({ t: DEMO_T0, shopperId: DEMO_SHOPPER, visibility: "owner", actor: "paypal", action: "captured", verdict: "ok", price, why: "Captured.", data: catalogId ? { catalogId } : {} });

  it("strong_record_counts_its_category_only: settle rows carry catalogId, and each category counts only its own captures", async () => {
    const s = session();
    await s.run().buy("25.00");
    expect(s.shopper.read().filter((e) => e.action === "capturing" || e.action === "captured").map((e) => e.data?.catalogId)).toEqual(["kettle", "kettle"]);

    capture("kettle"); capture("kettle"); capture("trowel"); capture(undefined); capture("no-such-entry");
    const rows = ledger.read();
    expect(dialPreview(rows, policy, "kitchen", two).clean).toBe(2);
    // Control: the second category counts its one capture, and a row naming no entry, or one the catalog lacks, counts nowhere.
    expect(dialPreview(rows, policy, "garden", two).clean).toBe(1);
    expect(dialPreview(rows, policy, "electronics", two).clean).toBe(0);
    expect(shopperFold(rows, policy, two, DEMO_T0).counts).toMatchObject({ kitchen: { clean: 2 }, garden: { clean: 1 } });
  });
});

describe("answer 2 (021): replay captures never count toward the dial's clean carts", () => {
  const capture = (view: ReturnType<ShopperLedger["run"]>, t: number) => view.append({ t, shopperId: DEMO_SHOPPER, visibility: "owner", actor: "paypal", action: "captured", verdict: "ok", price: "25.00", why: "Captured.", data: { catalogId: "kettle" } });

  it("replay_capture_never_a_clean_cart: three paid replays and one own purchase are one clean cart, and all four are money out", () => {
    const ledger = new ShopperLedger();
    const replays = ledger.run("r1", "recorded");
    capture(replays, DEMO_T0); capture(replays, DEMO_T0 + 1); capture(replays, DEMO_T0 + 2);
    expect(dialPreview(ledger.read(), demoPolicy(), "kitchen", CAT).clean).toBe(0);
    capture(ledger.run("r2", "live"), DEMO_T0 + 3);
    expect(dialPreview(ledger.read(), demoPolicy(), "kitchen", CAT).clean).toBe(1);
    expect(shopperFold(ledger.read(), demoPolicy(), CAT, DEMO_T0 + 3).counts.kitchen!.clean).toBe(1);
    // Still the shopper's money: the week counts every capture, replays included.
    expect(weekSpend(ledger.read(), DEMO_SHOPPER, DEMO_T0 + 3)).toBe(4 * toCents("25.00"));
    // Control: the same four captures as live purchases reach the strong record, so the 1 above isn't a dial that can't count.
    const live = new ShopperLedger();
    for (let i = 0; i < 4; i++) capture(live.run(`l${i}`, "live"), DEMO_T0 + i);
    expect(dialPreview(live.read(), demoPolicy(), "kitchen", CAT).clean).toBe(STRONG_RECORD);
  });

  it("record_sources_are_decided_one_by_one: only live counts; a new source must be decided here", () => {
    // Desk-B: an Ask (its checked chips only) is no purchase, so never a clean cart.
    expect(COUNTS_TOWARD_RECORD).toEqual({ seeded: false, recorded: false, live: true, market: false, attack: false, ask: false });
    expect([countsTowardRecord(undefined), countsTowardRecord("live"), countsTowardRecord("recorded"), countsTowardRecord("seeded"), countsTowardRecord("attack"), countsTowardRecord("ask")]).toEqual([true, true, false, false, false, false]);
  });
});

describe("W12: the in-flight hold lives in the shopper's ledger", () => {
  it("concurrent_runs_never_both_fit_the_week: two runs settling at once, only one fits; a failed capture releases its hold", async () => {
    const s = session({ weeklyLimit: toCents("100.00") });
    const [a, b] = [s.run(), s.run()];
    const [ca, cb] = [await a.bind("59.00"), await b.bind("59.00")];
    expect([ca.kind, cb.kind]).toEqual(["ask", "ask"]);
    const results = await Promise.all([a.settle(ca), b.settle(cb)]);
    expect(results.filter((r) => (r as { ok?: boolean }).ok)).toHaveLength(1);
    expect(s.port.captured).toBe(1);
    expect(s.shopper.read().filter((e) => e.data?.code === "week")).toMatchObject([{ actor: "cart", runId: "run2" }]);
    // Every hold was answered: the week is the one capture, nothing left in flight.
    expect(weekSpend(s.shopper.read(), DEMO_SHOPPER, DEMO_T0)).toBe(toCents("59.00"));
  });

  it("a declined or unpaid capture releases the hold; one PayPal never confirmed keeps it, as money that may be gone", async () => {
    // Declined, and a capture that threw while PayPal still shows the order unpaid.
    for (const fail of ["INSTRUMENT_DECLINED", "boom"]) {
      const s = session({ weeklyLimit: toCents("100.00") });
      const [a, b] = [s.run(), s.run()];
      s.port.fail = fail;
      expect(await a.buy("59.00")).toMatchObject({ ok: false });
      s.port.fail = null;
      expect(await b.buy("59.00")).toMatchObject({ ok: true });
    }
    // Control: a capture that threw and whose order can't be read again counts (code "unknown"), so the next run is held.
    const s = session({ weeklyLimit: toCents("100.00") });
    const [a, b] = [s.run(), s.run()];
    const ca = await a.bind("59.00");
    s.port.fail = "boom";
    const readAgain = s.port.get;
    let reads = 0;
    s.port.get = async (id: string) => { if (++reads > 1) throw new Error("down"); return readAgain(id); };
    expect(await a.settle(ca)).toMatchObject({ ok: false });
    s.port.fail = null; s.port.get = readAgain;
    expect(await b.buy("59.00")).toMatchObject({ kind: "refused", rule: "week" });
  });

  it("probe (Lesson 30): a second settle of the same cart can't end the first one's hold while PayPal is still answering", async () => {
    const s = session({ weeklyLimit: toCents("100.00") });
    const [a, b] = [s.run(), s.run()];
    const ca = await a.bind("59.00");
    const cb = await b.bind("59.00");
    s.port.hold();
    const first = a.settle(ca);
    // The replayed return: refused "cart already used", a row for the same cart that must not answer the first's hold.
    expect(await a.settle(ca)).toMatchObject({ ok: false, reason: "cart already used" });
    expect(await b.settle(cb)).toMatchObject({ ok: false });
    expect(s.shopper.read().at(-1)).toMatchObject({ runId: "run2", data: { code: "week" } });
    s.port.open();
    expect(await first).toMatchObject({ ok: true });
    expect(s.port.captured).toBe(1);
  });

  it("hung_order_read_times_out_and_answers_its_hold: the real adapter gives up on a read that never answers, and the refusal releases the hold", async () => {
    // The real PayPal adapter, loaded at run time so server code stays out of core's typecheck. The order is read through
    // the Agent Toolkit (ADR 0010), whose HTTP client has no timeout of its own, so the adapter's 10 s timer is what ends a
    // hung read. Nothing leaves this process: the Toolkit is a stand-in whose read never answers, and the timer is faked.
    const { PayPalPort, PAYPAL_TIMEOUT_MS } = (await import(new URL("../../server/src/adapters/paypal.ts", import.meta.url).href)) as { PayPalPort: new (cfg: { clientId: string; clientSecret: string; environment: string; toolkit: unknown }) => PaymentPort; PAYPAL_TIMEOUT_MS: number };
    const asked: string[] = [];
    const toolkit = { getOrder: (id: string) => { asked.push(id); return new Promise<string>(() => {}); }, createRefund: async () => { throw new Error("no refund here"); } };
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const s = session({ weeklyLimit: toCents("100.00") });
      const [a, b] = [s.run(), s.run()];
      const ca = await a.bind("59.00");
      if (ca.kind === "refused") throw new Error("the cart should bind");
      const settling = a.guard.settle(ca.bound, ca.orderId, new PayPalPort({ clientId: "test", clientSecret: "test", environment: "sandbox", toolkit }));
      for (let i = 0; i < 50 && asked.length === 0; i++) await new Promise((r) => setImmediate(r));
      expect(asked).toEqual([ca.orderId]);
      // Control: while the read hangs, the hold counts, so another run's cart doesn't fit the week; one ms short of the
      // timer it still hangs.
      expect(b.guard.decide(want, cart("59.00"))).toMatchObject({ kind: "refused", rule: "week" });
      await vi.advanceTimersByTimeAsync(PAYPAL_TIMEOUT_MS - 1);
      expect(b.guard.decide(want, cart("59.00"))).toMatchObject({ kind: "refused", rule: "week" });
      await vi.advanceTimersByTimeAsync(1);
      expect(await settling).toMatchObject({ ok: false, reason: expect.stringMatching(/didn't answer/) });
      const hold = s.shopper.read().find((e) => e.action === "capturing")!.seq;
      expect(s.shopper.read().filter((e) => e.data?.hold === hold)).toMatchObject([{ actor: "cart", data: { code: "get-failed" } }]);
      expect(weekSpend(s.shopper.read(), DEMO_SHOPPER, DEMO_T0)).toBe(0);
      expect(await b.buy("59.00")).toMatchObject({ ok: true });
      expect(PAYPAL_TIMEOUT_MS).toBe(10_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("thrown_settle_still_names_its_hold: a throw nothing expects answers the hold, then surfaces; before the capture call it releases it", async () => {
    // Before the capture call: the order read answers with something that isn't an order, and the re-check throws on it.
    const s = session({ weeklyLimit: toCents("100.00") });
    const [a, b] = [s.run(), s.run()];
    const ca = await a.bind("59.00");
    s.port.get = async () => null as unknown as OrderSnapshot;
    await expect(a.settle(ca)).rejects.toThrow(TypeError);
    const hold = s.shopper.read().find((e) => e.action === "capturing")!.seq;
    expect(s.shopper.read().filter((e) => e.data?.hold === hold)).toMatchObject([{ actor: "cart", action: "refuse", data: { code: "settle-failed" } }]);
    expect(weekSpend(s.shopper.read(), DEMO_SHOPPER, DEMO_T0)).toBe(0);
    expect(s.port.captured).toBe(0);
    // Control: after the capture call the money may have moved, so the answer (a capture that threw, then a re-read that
    // threw outside its promise) still counts, and the next run's cart is held by the week.
    const t = session({ weeklyLimit: toCents("100.00") });
    const [c, d] = [t.run(), t.run()];
    const cc = await c.bind("59.00");
    const read = t.port.get;
    let reads = 0;
    t.port.fail = "boom";
    t.port.get = ((id: string) => { if (++reads > 1) throw new Error("port bug"); return read(id); }) as typeof read;
    await expect(c.settle(cc)).rejects.toThrow("port bug");
    const held = t.shopper.read().find((e) => e.action === "capturing")!.seq;
    expect(t.shopper.read().filter((e) => e.data?.hold === held)).toMatchObject([{ actor: "paypal", action: "capture-failed", data: { code: "unknown" } }]);
    t.port.fail = null; t.port.get = read;
    expect(await d.buy("59.00")).toMatchObject({ kind: "refused", rule: "week" });
  });

  it("settle_throw_reason_matches_row: a settle that threw reports its hold's answer, released before the capture call and \"can't say\" after it", async () => {
    // Before the capture call: the re-check throws on a read that isn't an order.
    const s = session();
    const a = s.run();
    const ca = await a.bind("59.00");
    if (ca.kind === "refused") throw new Error("the cart should bind");
    s.port.get = async () => null as unknown as OrderSnapshot;
    await expect(a.settle(ca)).rejects.toThrow(TypeError);
    expect(settleAnswer(a.ledger.read(), ca.bound.hash)).toEqual({ ok: false, reason: a.ledger.read().find((e) => e.data?.code === "settle-failed")!.why });
    expect(settleAnswer(a.ledger.read(), ca.bound.hash)).toMatchObject({ reason: expect.stringMatching(/before the capture; nothing was captured/) });
    // After it: the capture threw and the re-read threw outside its promise, so the money may have moved.
    const t = session();
    const c = t.run();
    const cc = await c.bind("59.00");
    if (cc.kind === "refused") throw new Error("the cart should bind");
    const read = t.port.get;
    let reads = 0;
    t.port.fail = "boom";
    t.port.get = ((id: string) => { if (++reads > 1) throw new Error("port bug"); return read(id); }) as typeof read;
    await expect(c.settle(cc)).rejects.toThrow("port bug");
    expect(settleAnswer(c.ledger.read(), cc.bound.hash)).toMatchObject({ ok: false, reason: expect.stringMatching(/can't say whether it was charged/) });
    // Control: a cart with no hold has no answer, and the server says so in its own fallback, never "before capture".
    expect(settleAnswer(c.ledger.read(), "no-such-hash")).toBeNull();
    const main = readFileSync(new URL("../../server/src/main.ts", import.meta.url), "utf8");
    expect(main).toMatch(/run\.settled = settleAnswer\(run\.ledger\.read\(\), hash\) \?\?/);
    expect(main).not.toMatch(/failed before capture/);
  });

  it("hold_is_answered_once: a listener that throws on the captured row adds no second answer, and the week counts the capture once", async () => {
    for (const after of ["COMPLETED", "APPROVED"]) {
      const s = session({ weeklyLimit: toCents("100.00") });
      const a = s.run();
      const ca = await a.bind("59.00");
      if (ca.kind === "refused") throw new Error("the cart should bind");
      // The re-read a failed capture would make: paid (a second captured row) or unpaid (a release after the capture).
      const read = s.port.get;
      let reads = 0;
      s.port.get = async (id: string) => ({ ...(await read(id)), ...(++reads > 1 ? { status: after } : {}) });
      const off = s.shopper.on((e) => { if (e.action === "captured") throw new Error("listener bug"); });
      await expect(a.settle(ca)).rejects.toThrow("listener bug");
      off();
      const hold = s.shopper.read().find((e) => e.action === "capturing")!.seq;
      expect(s.shopper.read().filter((e) => e.data?.hold === hold)).toMatchObject([{ actor: "paypal", action: "captured", data: { captureId: "c1" } }]);
      expect(weekSpend(s.shopper.read(), DEMO_SHOPPER, DEMO_T0)).toBe(toCents("59.00"));
      expect(s.port.captured).toBe(1);
      // The server's answer is the row's: paid.
      expect(settleAnswer(a.ledger.read(), ca.bound.hash)).toEqual({ ok: true, captureId: "c1" });
    }
  });
});

describe("020 default: backing out in PayPal is not a bad pick", () => {
  it("paypal_cancel_is_not_a_bad_pick: the server's cancel row keeps the record; control: \"Not this one\" resets it", () => {
    const record = (middle: (t: number) => Omit<LedgerEvent, "v" | "seq">) => {
      const view = new ShopperLedger().run("r1", "live");
      const capture = (t: number) => view.append({ t, shopperId: DEMO_SHOPPER, visibility: "owner", actor: "paypal", action: "captured", verdict: "ok", price: "25.00", why: "Captured.", data: { catalogId: "kettle" } });
      capture(1); view.append(middle(2)); capture(3);
      return dialPreview(view.shopper.read(), demoPolicy(), "kitchen", CAT).clean;
    };
    expect(record((t) => cancelledInPayPal(t, DEMO_SHOPPER))).toBe(2);
    expect(record((t) => ({ ...cancelledInPayPal(t, DEMO_SHOPPER), action: NOT_THIS_ONE, why: "Not this one." }))).toBe(1);
    expect(record((t) => ({ t, shopperId: DEMO_SHOPPER, visibility: "owner", actor: "auditor", action: "veto", verdict: "refused", why: "Vetoed." }))).toBe(1);
    // The row the server writes is this one, not a copy of its own.
    const main = readFileSync(new URL("../../server/src/main.ts", import.meta.url), "utf8");
    expect(main).toMatch(/run\.ledger\.append\(cancelledInPayPal\(/);
    expect(main).not.toMatch(/You cancelled in PayPal/);
  });

  it("dial_copy_promises_only_what_code_writes: the Dial says \"Not this one\" resets it (the server writes it) and a veto only will", () => {
    const root = new URL("../../", import.meta.url);
    const src = (dir: string) => readdirSync(new URL(dir, root), { recursive: true, encoding: "utf8" }).filter((f) => /\.tsx?$/.test(f)).map((f) => readFileSync(new URL(`${dir}${f}`, root), "utf8")).join("\n");
    const writesVeto = /actor: "auditor"/;
    const shipped = src("core/src/") + src("server/src/") + src("web/src/");
    const dial = readFileSync(new URL("web/src/App.tsx", root), "utf8").match(/function Dial\b[\s\S]*?\n}\n/)![0];
    // 025: the server writes "Not this one" (setAside), so the Dial says it resets the record now.
    expect(setAside(1, DEMO_SHOPPER)).toMatchObject({ actor: "shopper", action: NOT_THIS_ONE, verdict: "refused" });
    expect(readFileSync(new URL("server/src/main.ts", root), "utf8")).toMatch(/run\.ledger\.append\(\(aside \? setAside : broughtBack\)\(/);
    expect(dial).toMatch(/“Not this one” resets it;/);
    // Nothing shipped writes a veto, so the Dial may only say it is coming, never that one resets it now.
    expect(shipped).not.toMatch(writesVeto);
    expect(dial).not.toMatch(/One bad pick resets it|veto resets/);
    expect(dial).toMatch(/an Auditor veto will once the Auditor ships/);
    // Control: the scan finds such a write where one exists (this file writes one), so the empty match is not a blind grep.
    expect(readFileSync(new URL(import.meta.url), "utf8")).toMatch(writesVeto);
  });

  it("withdrawn_reject_keeps_the_record (025): \"Bring it back\" takes that run's \"Not this one\" back; another run's doesn't", () => {
    const shopper = new ShopperLedger();
    const a = shopper.run("a", "live"), b = shopper.run("b", "live");
    const capture = (t: number) => a.append({ t, shopperId: DEMO_SHOPPER, visibility: "owner", actor: "paypal", action: "captured", verdict: "ok", price: "25.00", why: "Captured.", data: { catalogId: "kettle" } });
    const clean = () => dialPreview(shopper.read(), demoPolicy(), "kitchen", CAT).clean;
    capture(1); a.append(setAside(2, DEMO_SHOPPER)); capture(3);
    expect(clean()).toBe(1);
    b.append(broughtBack(4, DEMO_SHOPPER)); // another run's "Bring it back" leaves a's rejection standing
    expect(clean()).toBe(1);
    a.append(broughtBack(5, DEMO_SHOPPER));
    expect(clean()).toBe(2);
    a.append(setAside(6, DEMO_SHOPPER)); // said again after it came back: it stands again
    expect(clean()).toBe(0);
    expect(badPickEnd(shopper.read())).toBe(shopper.read().length);
  });
});

describe("N13/H1/W18: a session's week in the store", () => {
  it("only_a_session_with_its_own_rows_is_saved: a seeded-only session never reaches the store (cookie-dropping can't fill it); one with a run is saved and restored row for row", () => {
    const saved = new Map<string, SavedSession>();
    // Through JSON, as the server's store keeps it, so nothing a session needs is lost on the way.
    const store = { load: (t: string) => saved.get(t), save: (t: string, v: SavedSession) => { saved.set(t, JSON.parse(JSON.stringify(v)) as SavedSession); } };
    const a = new DemoShoppers({ store });
    // A script dropping its cookie and changing Settings each time: a new seeded session every call, none written.
    for (let i = 0; i < 5; i++) a.setLimit(`drop-${i}`, "kitchen", 5000, DEMO_T0);
    a.flush();
    expect(saved.size).toBe(0);
    const r1 = a.for("me", DEMO_T0).run("r1", "live");
    for (const price of ["25.00", "26.00", "27.00"]) r1.append({ t: DEMO_T0, shopperId: DEMO_SHOPPER, visibility: "owner", actor: "paypal", action: "captured", verdict: "ok", price, why: "Captured.", data: { catalogId: "kettle" } });
    a.setLimit("me", "kitchen", 4000, DEMO_T0);
    expect(saved.size).toBe(0); // a burst of rows waits, then is one write
    a.flush();
    expect([...saved.keys()]).toEqual(["me"]);
    expect(saved.get("me")!.policy.categoryLimit.kitchen).toBe(4000);
    // A new process with the same store: the same rows, same seqs; control: an unknown token gets the seeded week only.
    const b = new DemoShoppers({ store });
    expect(b.for("me", DEMO_T0 + 1).read()).toEqual(a.for("me", DEMO_T0 + 1).read());
    expect(b.for("other", DEMO_T0).read().every((e) => e.source === "seeded")).toBe(true);
    expect(b.for("me", DEMO_T0 + 1).read().filter((e) => e.action === "captured" && e.source === "live")).toHaveLength(3);
  });

  it("a_session_dropped_before_its_write_comes_back_whole (security review): evicted inside SAVE_WAIT_MS, its next use keeps its newest rows, not the store's older copy", () => {
    const saved = new Map<string, SavedSession>();
    const store = { load: (t: string) => saved.get(t), save: (t: string, v: SavedSession) => { saved.set(t, JSON.parse(JSON.stringify(v)) as SavedSession); } };
    const a = new DemoShoppers({ store, max: 1 });
    const pay = (price: string) => a.for("me", DEMO_T0).run(`r${price}`, "live").append({ t: DEMO_T0, shopperId: DEMO_SHOPPER, visibility: "owner", actor: "paypal", action: "captured", verdict: "ok", price, why: "Captured.", data: { catalogId: "kettle" } });
    pay("25.00");
    a.flush(); // the store holds one purchase
    pay("26.00"); // the second waits for its write
    a.for("other", DEMO_T0); // max 1: "me" leaves memory before its write
    const paid = () => a.for("me", DEMO_T0).read().filter((e) => e.action === "captured" && e.source === "live").length;
    expect(paid()).toBe(2);
    a.flush();
    expect(paid()).toBe(2);
    expect(saved.get("me")!.rows.filter((e) => e.action === "captured" && e.source === "live")).toHaveLength(2);
  });

  it("a_saved_week_that_doesnt_read_starts_fresh: a broken record never breaks a browser's week, and a planted policy holds only what Settings writes", () => {
    const real = new DemoShoppers().for("x", DEMO_T0);
    real.run("r1", "live").append({ t: DEMO_T0, shopperId: DEMO_SHOPPER, visibility: "owner", actor: "paypal", action: "captured", verdict: "ok", price: "25.00", why: "Captured.", data: { catalogId: "kettle" } });
    const rows = real.read();
    const saved = new Map<string, unknown>([
      ["no-rows", { policy: demoPolicy(), chips: [], seen: DEMO_T0 }],
      ["bad-row", { rows: [{ nonsense: true }], policy: demoPolicy(), chips: [], seen: DEMO_T0 }],
      // A record written by a store's key holder, not by Settings: the dial on, a limit for no catalog category, a
      // weekly limit raised, a chip with a number. Only the kitchen limit (a whole number of cents) is Settings' own.
      ["planted", { rows, policy: { ...demoPolicy(), dial: { kitchen: "auto" }, weeklyLimit: 99_999_999, categoryLimit: { kitchen: 7000, guns: 500 } }, chips: [{ kind: "limit", value: "$5,000" }], seen: DEMO_T0 }],
    ]);
    const store = { load: (t: string) => saved.get(t) as SavedSession | undefined, save: () => {} };
    const s = new DemoShoppers({ store });
    for (const t of ["no-rows", "bad-row"]) expect(s.for(t, DEMO_T0 + 1).read().every((e) => e.source === "seeded")).toBe(true);
    const p = s.session("planted", DEMO_T0 + 1);
    expect(p.shopper.read().some((e) => e.source === "live")).toBe(true); // the rows still restore
    expect(p.policy).toEqual(demoPolicy({ categoryLimit: { ...demoPolicy().categoryLimit, kitchen: 7000 } })); // the demo's events limit stays
    expect(p.chips).toEqual([]);
  });
});

describe("N19: one fold, every surface", () => {
  const at = DEMO_T0 + 10 * DAY_MS;

  it("every_surface_reads_the_one_fold: the week is the guard's number, the dial is dialPreview's, the grid holds every row", async () => {
    const s = session({ weeklyLimit: toCents("100.00") }, new DemoShoppers().for("t", at));
    s.deps.clock.advance(10 * DAY_MS);
    await s.run().buy("40.00");
    await s.run("recorded").buy("45.00");
    const rows = s.shopper.read();
    const f = fold(rows, s.policy, at);
    expect(f.week).toMatchObject({ spent: toCents("85.00"), limit: toCents("100.00") });
    expect(f.counts.kitchen).toEqual(dialPreview(rows, s.policy, "kitchen", CAT));
    // Both are money out (above); only the live one is a clean cart: a replayed recording earns no trust (answer 2).
    expect(f.counts.kitchen!.clean).toBe(1);
    expect(f.grid.reduce((n, g) => n + g.count, 0)).toBe(rows.length);
    // What the fold says is left is what the guard lets through, to the cent.
    expect(f.week.limit - f.week.spent).toBe(toCents("15.00"));
    expect(s.run().guard.decide(want, cart("15.01"))).toMatchObject({ kind: "refused", rule: "week" });
    expect(s.run().guard.decide(want, cart("15.00")).kind).toBe("ask");

    // The surfaces: the server sends the fold, and the screen draws the dial from it, never from rows of its own.
    const root = new URL("../../", import.meta.url);
    const src = (dir: string) => readdirSync(new URL(dir, root), { recursive: true, encoding: "utf8" }).filter((f) => /\.tsx?$/.test(f)).map((f) => readFileSync(new URL(`${dir}${f}`, root), "utf8")).join("\n");
    const web = src("web/src/"), server = src("server/src/");
    const ownCount = /\b(dialPreview|weekSpend)\(/;
    expect(web).not.toMatch(ownCount);
    expect(server).not.toMatch(ownCount);
    expect(server).toMatch(/shopperFold\(run\.shopper\.read\(\)/);
    // `?.`: another browser's view of a run carries no fold (020 W20), so the Dial draws nothing for it.
    expect(web).toMatch(/run\.shopper\??\.counts\[run\.category\]/);
    // Every run and the judge box write into a shopper ledger, never a ledger of their own.
    expect(server).not.toMatch(/new MemoryLedger\(/);
    // Control: the scan finds these calls where they do exist, so the empty matches above are not a blind grep.
    expect(src("core/src/view/")).toMatch(ownCount);
  });

  it("seeded_rows_keep_their_label: on the week and the receipt as seeded, never in the spend or the dial", () => {
    const shopper = new DemoShoppers().for("t", at);
    const f = fold(shopper.read(), demoPolicy(), at);
    const seeded = { source: "seeded", catalogId: SEEDED_PURCHASE.catalogId, color: "black", price: toCents(SEEDED_PURCHASE.price), counts: false };
    expect(f.receipt).toMatchObject(seeded);
    expect(f.week.purchases).toMatchObject([seeded]);
    expect(f.grid.map((g) => g.e.source)).toEqual(["seeded"]);
    expect(f.week.spent).toBe(0);
    expect(f.counts.kitchen!.clean).toBe(0);
    // Control: the same row as the shopper's own would count toward both.
    const own = shopper.read().map((e) => ({ ...e, source: "live" as const }));
    expect(fold(own, demoPolicy(), at)).toMatchObject({ week: { spent: toCents(SEEDED_PURCHASE.price) }, counts: { kitchen: { clean: 1 } }, receipt: { source: "live", counts: true } });
  });

  it("attack_rows_never_reach_the_week_or_the_dial: only the grid shows them", () => {
    const write = (source: Source) => {
      const shopper = new ShopperLedger();
      const live = shopper.run("r1", "live");
      const capture = (v: typeof live, t: number) => v.append({ t, shopperId: DEMO_SHOPPER, visibility: "owner", actor: "paypal", action: "captured", verdict: "ok", price: "30.00", why: "Captured.", data: { catalogId: "kettle" } });
      capture(live, at - 2);
      const attack = shopper.run("judge", source);
      capture(attack, at - 1);
      attack.append({ t: at, shopperId: DEMO_SHOPPER, visibility: "owner", actor: "shopper", action: NOT_THIS_ONE, verdict: "refused", why: "Not this one." });
      capture(live, at);
      return fold(shopper.read(), demoPolicy(), at);
    };
    const f = write("attack");
    expect(f.week).toMatchObject({ spent: toCents("60.00"), purchases: [{ source: "live" }, { source: "live" }] });
    expect(f.counts.kitchen!.clean).toBe(2);
    expect(f.receipt).toMatchObject({ source: "live" });
    expect(f.grid.filter((g) => g.e.source === "attack")).toHaveLength(2);
    // Control: the same rows from a live run spend, count and reset the record.
    expect(write("live")).toMatchObject({ week: { spent: toCents("90.00") }, counts: { kitchen: { clean: 1 } } });
  });

  it("no_date_the_fold_didnt_produce: every day it gives is a row's clock day or the week's own, and the seeded one moves with the session", () => {
    const days = (start: number) => {
      const shopper = new DemoShoppers().for("t", start);
      const f = fold(shopper.read(), demoPolicy(), start);
      const made = new Set([...shopper.read().map((e) => dayOf(e.t)), dayOf(start), dayOf(start - 7 * DAY_MS + 1)]);
      const given = [f.receipt!.day, ...f.week.purchases.map((p) => p.day), f.week.from, f.week.to];
      expect(given.filter((d) => !made.has(d))).toEqual([]);
      return f.receipt!.day;
    };
    expect(days(at)).toBe(dayOf(at) - SEEDED_PURCHASE.daysBefore);
    // Control: a session a day later shows the seeded purchase a day later; a typed date would stay put.
    expect(days(at + DAY_MS)).toBe(days(at) + 1);
  });

  it("the shopper ledger stamps run, source and day last, so no caller can forge them; a run's own ledger stamps nothing (old bytes)", () => {
    const shopper = new ShopperLedger();
    const e = shopper.run("r1", "attack").append({ t: at, shopperId: DEMO_SHOPPER, visibility: "owner", actor: "paypal", action: "captured", verdict: "ok", price: "1.00", why: "w", runId: "r2", source: "live", day: 0 });
    expect(e).toMatchObject({ runId: "r1", source: "attack", day: dayOf(at) });
    expect(shopper.run("r2", "live").read()).toEqual([]);
    expect(weekSpend(shopper.read(), DEMO_SHOPPER, at)).toBe(0);
    const plain = new MemoryLedger().append({ t: at, shopperId: DEMO_SHOPPER, visibility: "owner", actor: "guard", action: "done", why: "w" });
    expect(["runId", "source", "day"].filter((k) => k in plain)).toEqual([]);
  });

  it("shopper_ledger_refuses_unstamped_rows: a row with no run, source or clock day can't be written straight in; a run's view still writes", () => {
    const shopper = new ShopperLedger();
    const row = { t: at, shopperId: DEMO_SHOPPER, visibility: "owner" as const, actor: "paypal" as const, action: "captured", verdict: "ok" as const, price: "99.00", why: "Captured." };
    for (const stamps of [{}, { runId: "r1" }, { source: "live" as const }, { runId: "r1", source: "live" as const }, { runId: "r1", source: "live" as const, day: 0 }]) {
      expect(() => shopper.append({ ...row, ...stamps })).toThrow(/write through a run/);
    }
    expect(shopper.read()).toEqual([]);
    expect(weekSpend(shopper.read(), DEMO_SHOPPER, at)).toBe(0);
    // Control: the same row through a run's view is written, stamped, and counts; a run's own ledger keeps its old bytes.
    expect(shopper.run("r1", "live").append(row)).toMatchObject({ runId: "r1", source: "live", day: dayOf(at) });
    expect(weekSpend(shopper.read(), DEMO_SHOPPER, at)).toBe(toCents("99.00"));
    expect(new MemoryLedger().append(row)).not.toHaveProperty("runId");
  });
});
