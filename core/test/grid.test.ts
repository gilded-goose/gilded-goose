// The "Every decision" ledger (Track C, docs/guild/022-ag-grid-ledger.md): grid rows are the fold's rows, the refusal
// is red, the chips and search only hide rows, PayPal's webhook rows land labeled, and a row click lands on its seq.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bundledLibrary, localRun, serializeLedger, type LedgerEvent, type Tape } from "../src/index.ts";
import { fold, laneModel } from "../src/view/lanes.ts";
import {
  ACTOR_CHIPS, ACTOR_GROUP, LAYER_CHIPS, NO_CHIPS, PAYPAL_EVENTS, cartCardShown, chipCounts, gridRows, momentAt, passesChips, passesSearch, type GridRow,
} from "../src/view/grid.ts";

const FIXTURES = new URL("../../docs/fixtures/", import.meta.url);
const TAPES = [1, 2, 3].map((n) => JSON.parse(readFileSync(new URL(`tape-seed-${n}.json`, FIXTURES), "utf8")) as Tape);
const LIB = bundledLibrary(TAPES, TAPES[0]!.meta.promptSha256);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** A run exactly as the browser plays it (recorded weeks 1–3, or a fresh rule-buyer market), pacing off. */
async function run(seed: number): Promise<LedgerEvent[]> {
  const r = localRun({ library: LIB, asked: seed, maxPrice: 6000, hash: sha, now: () => 1_800_000_000_000, fresh: () => seed, pace: false, onRow: () => {} });
  if ("error" in r) throw new Error(String(r.error));
  return (await r.done).events;
}

/** Every ledger seq is a grid row or folded into one, exactly once. */
function covered(rows: Pick<GridRow, "seq" | "also">[], events: LedgerEvent[]): string | null {
  const seen = rows.flatMap((r) => [r.seq, ...r.also]).sort((a, b) => a - b);
  const want = events.map((e) => e.seq).sort((a, b) => a - b);
  return JSON.stringify(seen) === JSON.stringify(want) ? null : `rows cover ${seen.length} seqs, ledger has ${want.length}`;
}

describe("grid rows are the fold's rows", () => {
  for (const seed of [1, 2, 3, 77, 4242]) {
    it(`seed ${seed}: one grid row per folded row, every seq once, counts sum, ledger unchanged`, async () => {
      const events = await run(seed);
      const before = serializeLedger(events);
      const rows = gridRows(events);
      expect(rows.map((r) => r.seq)).toEqual(fold(events).map((f) => f.e.seq));
      expect(rows.map((r) => r.count)).toEqual(fold(events).map((f) => f.count));
      expect(covered(rows, events)).toBeNull();
      expect(rows.reduce((n, r) => n + r.count, 0)).toBe(events.length);
      expect(serializeLedger(events)).toBe(before);
    });
  }

  it("a dropped-row mutant fails the coverage check (control for the check itself)", async () => {
    const events = await run(1);
    const rows = gridRows(events);
    const dropped = rows.filter((r) => r.actor !== "watcher");
    expect(dropped.length).toBe(rows.length - 1);
    expect(covered(dropped, events)).not.toBeNull();
  });

  it("every actor has a chip group, every layer a chip", () => {
    for (const g of Object.values(ACTOR_GROUP)) expect(ACTOR_CHIPS.some((c) => c.key === g)).toBe(true);
    expect(LAYER_CHIPS.map((c) => c.key)).toEqual(["haggle", "1", "2", "3", "4", "5"]);
  });

  it("who is a store's name or a role, never a seller id (Lesson 17); the rule column is the row's data.rule", async () => {
    const events = await run(1);
    const rows = gridRows(events);
    const ids = new Set(events.flatMap((e) => (e.sellerId ? [e.sellerId] : [])));
    for (const r of rows) for (const id of ids) expect(r.who).not.toContain(id);
    const code = rows.find((r) => r.actor === "code" && r.did === "counter")!;
    expect(code.rule).toBe("over-ask");
    expect(code.price).toBe("$47.73");
    // Control: a row with no rule shows none.
    expect(rows.find((r) => r.actor === "seller")!.rule).toBeNull();
  });
});

describe("the scam row is red", () => {
  it("the Watcher's refusal is red; the refused seller's offers point at it; honest sellers' rows are plain", async () => {
    const events = await run(1);
    const rows = gridRows(events);
    const refusal = rows.filter((r) => r.tone === "refused");
    expect(refusal).toHaveLength(1);
    expect(refusal[0]!.actor).toBe("watcher");
    expect(refusal[0]!.who).toBe("Watcher → QuickQuack Deals");
    expect(refusal[0]!.rule).toBe("instructs-agent, gift-card");
    const scam = rows.filter((r) => r.tone === "scam");
    expect(scam.length).toBeGreaterThan(0);
    for (const r of scam) { expect(r.who).toBe("QuickQuack Deals"); expect(r.refusedAt).toBe(refusal[0]!.seq); expect(r.quoted).toContain("SYSTEM"); }
    // Control: the honest sellers' offers are never red.
    for (const r of rows.filter((x) => x.who === "Reedbank Outfitters" || x.who === "Pondside Goods")) expect(r.tone).toBe("plain");
    // The guard's ask is amber, not red.
    expect(rows.find((r) => r.actor === "code" && r.did === "asked you")!.tone).toBe("asked");
  });

  it("the repeated scam offers fold into one row, so the grid shows the attack once with its count", async () => {
    const events = await run(1);
    const scam = gridRows(events).filter((r) => r.tone === "scam");
    expect(scam).toHaveLength(1);
    expect(scam[0]!.count).toBe(events.filter((e) => e.actor === "seller" && e.sellerId === events.find((x) => x.actor === "watcher")!.sellerId).length);
  });
});

describe("chips and search only hide rows", () => {
  it("each chip's count is the rows it shows; all of one kind sum to the ledger", async () => {
    const events = await run(1);
    const rows = gridRows(events);
    const c = chipCounts(rows);
    expect(Object.values(c.layers).reduce((a, b) => a + b, 0)).toBe(events.length);
    expect(Object.values(c.actors).reduce((a, b) => a + b, 0)).toBe(events.length);
    for (const chip of LAYER_CHIPS) {
      const shown = rows.filter((r) => passesChips(r, { layers: new Set([chip.key]), actors: new Set() }));
      expect(shown.reduce((n, r) => n + r.count, 0)).toBe(c.layers[chip.key]);
      for (const r of shown) expect(r.layer).toBe(chip.key);
    }
    // Layer 4 is the Watcher's row alone; layer and actor chips combine (AND).
    expect(rows.filter((r) => passesChips(r, { layers: new Set(["4"]), actors: new Set() })).map((r) => r.tone)).toEqual(["refused"]);
    expect(rows.filter((r) => passesChips(r, { layers: new Set(["4"]), actors: new Set(["seller"]) }))).toHaveLength(0);
    expect(rows.filter((r) => passesChips(r, NO_CHIPS))).toHaveLength(rows.length);
  });

  it("search finds the injected note and a rule by name; every word must match", async () => {
    const rows = gridRows(await run(1));
    expect(rows.filter((r) => passesSearch(r, "system budget")).every((r) => r.who.includes("QuickQuack"))).toBe(true);
    expect(rows.filter((r) => passesSearch(r, "system budget")).length).toBeGreaterThan(0);
    expect(rows.filter((r) => passesSearch(r, "over-ask")).map((r) => r.actor)).toEqual(["code"]);
    expect(rows.filter((r) => passesSearch(r, "over-ask nonsenseword"))).toHaveLength(0);
    expect(rows.filter((r) => passesSearch(r, ""))).toHaveLength(rows.length);
  });
});

describe("PayPal webhook rows (the seam for Track A+B)", () => {
  const base = { v: 1 as const, t: 1_800_000_000_000, shopperId: "demo", visibility: "owner" as const, actor: "paypal" as const, layer: 3 as const };
  const rows = gridRows([
    { ...base, seq: 0, action: "webhook", price: "47.73", why: "PayPal says the authorization was created.", data: { eventId: "WH-1AB", eventType: "PAYMENT.AUTHORIZATION.CREATED", verified: true, matched: true } },
    { ...base, seq: 1, action: "webhook", why: "PayPal says the authorization was voided.", data: { eventId: "WH-2CD", eventType: "PAYMENT.AUTHORIZATION.VOIDED", verified: true, matched: true } },
    { ...base, seq: 2, action: "webhook", why: "PayPal sent an event for an order this ledger never made.", data: { eventId: "WH-3EF", eventType: "PAYMENT.CAPTURE.COMPLETED", verified: true, matched: false } },
    { ...base, seq: 3, action: "webhook", why: "PayPal sent an event type the ledger has no words for.", data: { eventId: "WH-4GH", eventType: "CHECKOUT.ORDER.SOMETHING", verified: true, matched: true } },
    { ...base, seq: 4, action: "captured", price: "47.73", why: "Paid.", data: {} },
  ]);

  it("each known event type reads in words, with PayPal's event id; an unknown type shows PayPal's own name", () => {
    expect(rows.map((r) => r.did)).toEqual(["authorization created", "authorization voided", "capture completed", "CHECKOUT.ORDER.SOMETHING", "captured"]);
    expect(rows.map((r) => r.eventId)).toEqual(["WH-1AB", "WH-2CD", "WH-3EF", "WH-4GH", null]);
    expect(rows.slice(0, 4).every((r) => r.who === "PayPal (webhook)" && r.actor === "paypal" && r.layer === "3")).toBe(true);
    expect(Object.keys(PAYPAL_EVENTS)).toHaveLength(4);
  });

  it("an unmatched event is labeled, a matched one is not, and a non-webhook PayPal row is plain", () => {
    expect(rows.map((r) => r.tone)).toEqual(["plain", "plain", "unmatched", "plain", "plain"]);
    expect(rows[4]!.who).toBe("PayPal");
    expect(passesSearch(rows[2]!, "WH-3EF")).toBe(true);
  });
});

describe("row click jumps to that moment", () => {
  it("the moment is the ledger up to the clicked seq: its lanes are laneModel of those rows, and the clicked row's own mark is drawn", async () => {
    const events = await run(1);
    for (const r of gridRows(events)) {
      const m = momentAt(events, r.seq)!;
      expect(m.seq).toBe(r.seq);
      expect(m.row.seq).toBe(r.seq);
      expect(m.events.every((e) => e.seq <= r.seq)).toBe(true);
      expect(m.events.at(-1)!.seq).toBe(r.seq);
      expect(m.model).toEqual(laneModel(events.filter((e) => e.seq <= r.seq)));
      const marks = m.model.lanes.flatMap((l) => l.marks.map((k) => k.seq));
      for (const s of marks) expect(s).toBeLessThanOrEqual(r.seq);
      // A seller's offer or a sent counter is drawn at its own moment (an off-by-one prefix would miss it).
      const e = events.find((x) => x.seq === r.seq)!;
      if ((e.actor === "seller" && e.action === "offer") || e.action === "counter") expect(marks).toContain(r.seq);
    }
  });

  it("the card state follows the ledger: starting, haggling, then the deal, and the refusal row reads as refused", async () => {
    const events = await run(1);
    const first = events[0]!;
    expect(momentAt(events, first.seq)!.phase).toBe("starting");
    const refusal = events.find((e) => e.actor === "watcher" && e.verdict === "refused")!;
    expect(momentAt(events, refusal.seq)!.phase).toBe("refused");
    const counter = events.find((e) => e.actor === "code" && e.action === "counter")!;
    const atCounter = momentAt(events, counter.seq)!;
    expect(atCounter.phase).toBe("haggling");
    expect(atCounter.round).toBe(counter.round ?? atCounter.round);
    expect(atCounter.model.deal).toBeNull();
    const accept = events.find((e) => e.actor === "buyer" && e.action === "accept")!;
    expect(momentAt(events, accept.seq)!.phase).toBe("deal");
    expect(momentAt(events, accept.seq - 1)!.phase).not.toBe("deal");
    // Week 3 walks away.
    const w3 = await run(3);
    expect(momentAt(w3, w3.find((e) => e.action === "walk")!.seq)!.phase).toBe("walked");
  });

  it("after the deal the heading follows the money: asked, approved, ordered, paid; never 'your yes' once money moved", async () => {
    const events = await run(1);
    const accept = events.find((e) => e.actor === "buyer" && e.action === "accept")!;
    const ask = events.find((e) => e.actor === "guard" && e.action === "ask")!;
    const done = events.find((e) => e.actor === "guard" && e.action === "done")!;
    // Control: the accept itself is a deal code hasn't checked yet; the guard's ask is "waiting for your yes".
    expect(momentAt(events, accept.seq)!.phase).toBe("deal");
    expect(momentAt(events, ask.seq)!.phase).toBe("asked");
    // The browser replay's done can't be paid: the run ended, nothing paid.
    expect(momentAt(events, done.seq)!.phase).toBe("finished");
    // A server run after the ask: the order, then PayPal's capture.
    const upTo = events.filter((e) => e.seq <= ask.seq);
    const next = (n: number, e: Partial<LedgerEvent>): LedgerEvent => ({ ...ask, seq: ask.seq + n, verdict: "ok", data: {}, ...e });
    const ordered = [...upTo, next(1, { actor: "paypal", action: "order-created", why: "Order created." })];
    expect(momentAt(ordered, ask.seq + 1)!.phase).toBe("ordered");
    const serverDone = [...ordered, next(2, { actor: "guard", action: "done", why: "Waiting for your approval in PayPal." })];
    expect(momentAt(serverDone, ask.seq + 2)!.phase).toBe("ordered");
    const paid = [...ordered, next(2, { actor: "paypal", action: "captured", why: "Captured." })];
    expect(momentAt(paid, ask.seq + 2)!.phase).toBe("paid");
    // The dial's path: code buys without asking.
    const bought = [...events.filter((e) => e.seq < ask.seq), { ...ask, action: "buy", verdict: "ok" as const }];
    expect(momentAt(bought, ask.seq)!.phase).toBe("approved");
  });

  it("a run that ends with no deal reads finished, and code undoing an accept stays refused", async () => {
    const events = await run(1);
    const accept = events.find((e) => e.actor === "buyer" && e.action === "accept")!;
    const upTo = events.filter((e) => e.seq <= accept.seq);
    const no: LedgerEvent = { ...accept, seq: accept.seq + 1, actor: "guard", action: "refuse", verdict: "refused", why: "Refused.", data: { rule: "over-max" } };
    const { price: _p, verdict: _v, ...bare } = accept;
    const after: LedgerEvent = { ...bare, seq: accept.seq + 2, actor: "code", action: "wait", why: "…" };
    const fin: LedgerEvent = { ...bare, seq: accept.seq + 3, actor: "guard", action: "done", why: "Run finished." };
    const rows = [...upTo, no, after, fin];
    expect(momentAt(rows, no.seq)!.phase).toBe("refused");
    expect(momentAt(rows, after.seq)!.phase).toBe("refused");
    expect(momentAt(rows, fin.seq)!.phase).toBe("finished");
  });

  it("a seq the ledger lacks is no moment", async () => {
    const events = await run(1);
    expect(momentAt(events, 9999)).toBeNull();
    expect(momentAt(events, -1)).toBeNull();
  });
});

describe("a picked moment never offers Approve (Joshua, Wed Oct 28)", () => {
  it("approve_never_reachable_from_a_past_moment: every row of a run hides the cart card; now shows it", async () => {
    const events = await run(1);
    expect(events.some((e) => e.actor === "guard" && e.action === "ask")).toBe(true); // a run with a cart to approve
    for (const e of events) expect(cartCardShown(e.seq)).toBe(false); // the last row too: a pick is a pick
    expect(cartCardShown(null)).toBe(true); // control: "Back to now" brings it back
  });
});
