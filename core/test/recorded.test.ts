import { readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RecordedPort, RuleBuyer, TapeMiss, demoCatalog, isDemoWeek, demoDeps, demoSellers, demoWant, inputHash, recordPort, runHaggle, stableStringify, whyProblems, DEMO_ENTRY, DEMO_SHOPPER,
  type BuyerInput, type LedgerEvent, type LlmPort, type Tape,
} from "../src/index.ts";
import { sha256, world } from "./helpers.ts";

const FIXTURES = new URL("../../docs/fixtures/", import.meta.url);
const TAPES: Tape[] = readdirSync(FIXTURES).filter((f) => /^tape-seed-\d+\.json$/.test(f)).sort()
  .map((f) => JSON.parse(readFileSync(new URL(f, FIXTURES), "utf8")) as Tape);
const weekOf = (t: Tape) => { if (!isDemoWeek(t.meta.week)) throw new Error(`tape seed ${t.meta.seed}: unknown week ${t.meta.week}`); return t.meta.week; };
const PROMPT = readFileSync(new URL("../../server/prompts/buyer.honest.md", import.meta.url), "utf8");

/** The engine with a tape, on the same sim-clock world the recorder used, with the guard and catalog entry the server ships (W7). */
async function replay(tape: Tape, buyer: LlmPort = new RecordedPort(tape, sha256)) {
  const w = world(tape.meta.seed);
  await runHaggle({ want: demoWant(), sellers: demoSellers(weekOf(tape)), buyer, guard: w.guard, deps: w.deps, ledger: w.ledger, shopperId: DEMO_SHOPPER, catalogId: DEMO_ENTRY });
  return w.ledger.read();
}

/** A ledger without `t`, and without the fields that say which port spoke (checked on their own). */
function comparable(events: ReadonlyArray<Omit<LedgerEvent, "t"> & { t?: number }>) {
  return events.map(({ t: _t, ...e }) => {
    if (e.actor !== "buyer" || !e.data) return e;
    const { source: _s, model: _m, modelLabel: _l, recordedOn: _r, ...data } = e.data;
    return { ...e, data };
  });
}

afterEach(() => { vi.useRealTimers(); });

describe("recorded buyer (ADR 0011)", () => {
  it("three tapes exist, one per seed, so Go twice is two runs (Lesson 18)", () => {
    expect(TAPES.map((t) => t.meta.seed)).toEqual([1, 2, 3]);
    expect(new Set(TAPES.map((t) => stableStringify(t.moves.map((m) => m.move)))).size).toBe(3);
  });

  it("the three tapes tell visibly different stories: a different ending each (Joshua, 2026-10-23)", () => {
    // The ending a viewer sees: who the AI took, or that it walked away.
    const ending = (t: Tape) => { const last = t.moves.at(-1)!.move; return last.type === "accept" ? `accept ${last.sellerId}` : last.type; };
    expect(new Set(TAPES.map(ending)).size).toBe(3);
    expect(TAPES.map(ending)).toContain("walk");
  });

  for (const tape of TAPES) {
    it(`seed ${tape.meta.seed}: replay equals the recorded live run minus t, with zero fallbacks`, async () => {
      const events = await replay(tape);
      const buyer = events.filter((e) => e.actor === "buyer" && typeof e.data?.source === "string");
      expect(buyer.length).toBe(tape.moves.length);
      expect(buyer.filter((e) => e.data?.source === "rule-fallback")).toEqual([]);
      // Lesson 25 of 011: every row a recorded model made carries source, model and date.
      for (const e of buyer) expect(e.data).toMatchObject({ source: "recorded", model: tape.meta.model, modelLabel: tape.meta.modelLabel, recordedOn: tape.meta.recordedOn });
      // The live run's own rows named the live model, not "recorded".
      const recorded = tape.ledger ?? [];
      expect(recorded.length).toBeGreaterThan(0); // the fixture tapes carry the live ledger; only library runs leave it out
      for (const e of recorded.filter((x) => x.actor === "buyer" && x.data?.source)) expect(e.data?.source).toBe(tape.meta.model);
      // These runs were recorded before the Watcher wrote rows (step 5). Its rows are code's and change nothing the buyer
      // saw, so the replay must equal the live run once they are taken out; their seq shift is why seq is set aside.
      expect(events.filter((e) => e.actor === "watcher").map((e) => e.sellerId)).toEqual(["quickquack"]);
      const noSeq = (xs: ReturnType<typeof comparable>) => xs.map(({ seq: _q, ...e }) => e);
      expect(stableStringify(noSeq(comparable(events.filter((e) => e.actor !== "watcher"))))).toBe(stableStringify(noSeq(comparable(recorded))));
    });

    it(`seed ${tape.meta.seed}: recorded with today's buyer prompt, so a changed prompt makes the tape stale`, () => {
      expect(tape.meta.promptSha256).toBe(sha256(PROMPT));
      expect(tape.meta.maxPrice).toBe(demoWant().maxPrice);
    });

    it(`seed ${tape.meta.seed}: the shopper-facing why-lines carry no raw cents and no seller ids (Lessons 8, 17)`, async () => {
      const port = new RecordedPort(tape, sha256);
      const problems: string[] = [];
      await replay(tape, { name: port.name, rowData: port.rowData, async decide(i: BuyerInput) { const m = await port.decide(i); problems.push(...whyProblems(i, m)); return m; } });
      expect(problems).toEqual([]);
    });
  }

  it("a miss throws, never improvises: another max is an input the tape never saw", async () => {
    const tape = TAPES[0]!;
    const seen: BuyerInput[] = [];
    await replay(tape, { name: "spy", async decide(i) { seen.push(structuredClone(i)); return new RecordedPort(tape, sha256).decide(i); } });
    const port = new RecordedPort(tape, sha256);
    await expect(port.decide(seen[0]!)).resolves.toBeTruthy(); // control: the recorded input hits
    await expect(port.decide({ ...seen[0]!, want: { ...seen[0]!.want, maxPrice: seen[0]!.want.maxPrice + 1 } })).rejects.toBeInstanceOf(TapeMiss);
  });

  it("whyProblems: bare cents are caught; dollars and plain words pass (control); ids are the engine's job now", () => {
    const input: BuyerInput = { want: { item: "x", qty: 1, maxPrice: 6000 }, round: 1, maxRounds: 5, history: [], offers: [{ sellerId: "reedbank", price: 4950, round: 1, shape: "one-off", hasNote: false, history: 87 }] };
    expect(whyProblems(input, { type: "accept", sellerId: "reedbank", price: 4950, why: "Taking 4950 from Reedbank." })).toEqual(['cents in why: "4950"']);
    expect(whyProblems(input, { type: "accept", sellerId: "reedbank", price: 4950, why: "Taking $49.50 from this seller (87 sales)." })).toEqual([]);
    expect(whyProblems(input, { type: "counter", sellerId: "reedbank", price: 4950, why: "The ask is 82% of the max, so I'm accepting it." })).toEqual(["a counter says it accepts"]);
    expect(whyProblems(input, { type: "counter", sellerId: "reedbank", price: 4800, why: "Countering at $48.00; I'll accept once the ask is at my bid." })).toEqual([]);
    // Week 1's recording, round 2 (2026-10-23): a counter that opens "Accepting $49.50".
    expect(whyProblems(input, { type: "counter", sellerId: "reedbank", price: 4950, why: "Accepting $49.50 from this seller with a record; 3 rounds remain after this one." })).toContain("a counter says it accepts");
    expect(whyProblems(input, { type: "counter", sellerId: "reedbank", price: 4950, why: "The ask is 82.5% of your max, but I'm countering at $47.00 to push lower." })).toEqual(["says it counters at $47.00, it bids $49.50"]);
    expect(whyProblems(input, { type: "counter", sellerId: "reedbank", price: 4950, why: "Countering this seller at $49.50, 82.5% of your max." })).toEqual([]);
    // Rounds left after this one: week 1's recording said "4 rounds left" in round 2 (reviewer, 014).
    const r2 = { ...input, round: 2, maxRounds: 5 };
    expect(whyProblems(r2, { type: "counter", sellerId: "reedbank", price: 4800, why: "Countering at $48.00 with 4 rounds left." })).toEqual(["says 4 rounds left, it is 3"]);
    expect(whyProblems(r2, { type: "counter", sellerId: "reedbank", price: 4800, why: "Countering at $48.00 with three rounds left." })).toEqual([]);
    expect(whyProblems(r2, { type: "counter", sellerId: "reedbank", price: 4800, why: "Countering at $48.00; this is the last round." })).toEqual(["says last round, 3 left"]);
    expect(whyProblems({ ...r2, round: 5 }, { type: "accept", sellerId: "reedbank", price: 4800, why: "Taking $48.00; this is the last round." })).toEqual([]);
  });

  it("recordPort hashes the input with sorted keys: key order never changes the hash", () => {
    const a = { want: { item: "x", qty: 1, maxPrice: 1 }, round: 1, maxRounds: 1, offers: [], history: [] } as BuyerInput;
    const b = { history: [], offers: [], maxRounds: 1, round: 1, want: { maxPrice: 1, qty: 1, item: "x" } } as BuyerInput;
    expect(inputHash(a, sha256)).toBe(inputHash(b, sha256));
  });

  it("pacing: each move lands its recorded dtMs after the round's offers; pacing off gives the identical ledger", async () => {
    const tape = TAPES[0]!;
    vi.useFakeTimers();
    const deps = { ...demoDeps(tape.meta.seed, sha256), clock: { now: () => Date.now() } };
    const w = world(tape.meta.seed);
    const paced = runHaggle({ want: demoWant({ deadline: Date.now() + 7 * 86_400_000 }), sellers: demoSellers(weekOf(tape)), buyer: new RecordedPort(tape, sha256, { pace: true }), guard: w.guard, deps, ledger: w.ledger, shopperId: DEMO_SHOPPER, catalogId: DEMO_ENTRY, llmTimeoutMs: 10_000 });
    await vi.runAllTimersAsync();
    await paced;
    const ev = w.ledger.read();
    const gaps: number[] = [];
    let lastOffer = 0;
    for (const e of ev) {
      if (e.actor === "seller" && e.action === "offer") lastOffer = e.t;
      if (e.actor === "buyer" && e.data?.source === "recorded") gaps.push(e.t - lastOffer);
    }
    expect(gaps).toEqual(tape.moves.map((m) => m.dtMs));
    vi.useRealTimers();
    const unpaced = await replay(tape);
    const strip = (x: LedgerEvent[]) => x.filter((e) => e.actor === "seller" || e.actor === "buyer").map(({ t: _t, ...e }) => e);
    expect(stableStringify(strip(ev))).toBe(stableStringify(strip(unpaced)));
  });

  it("control: a live port's rows carry no recorded model or date", async () => {
    const w = world(1);
    await runHaggle({ want: demoWant(), sellers: demoSellers(), buyer: new RuleBuyer(), guard: w.guard, deps: w.deps, ledger: w.ledger, shopperId: DEMO_SHOPPER });
    const buyer = w.ledger.read().filter((e) => e.actor === "buyer" && e.data?.source);
    expect(buyer.length).toBeGreaterThan(0);
    for (const e of buyer) { expect(e.data?.source).toBe("rule"); expect(e.data?.model).toBeUndefined(); }
  });

  it("recordPort passes the inner move through and records it with its input", async () => {
    const got: string[] = [];
    const port = recordPort(new RuleBuyer(), sha256, (m) => got.push(m.inputHash), () => 0);
    const w = world(1);
    await runHaggle({ want: demoWant(), sellers: demoSellers(), buyer: port, guard: w.guard, deps: w.deps, ledger: w.ledger, shopperId: DEMO_SHOPPER });
    expect(got.length).toBe(w.ledger.read().filter((e) => e.actor === "buyer" && e.data?.source === "rule").length);
  });
});

describe("demo catalog (ADR 0012)", () => {
  it("entry 0 is the kettle, and the rule run on seed 1 gives the seller and buyer rows of the seed-1 fixture", async () => {
    expect(demoCatalog()[0]!.id).toBe("kettle");
    expect(demoWant()).toEqual(demoCatalog()[0]!.want);
    const fixture = JSON.parse(readFileSync(new URL("seed-1.json", FIXTURES), "utf8")) as { events: LedgerEvent[] };
    const w = world(1);
    await runHaggle({ want: demoWant(), sellers: demoSellers(), buyer: new RuleBuyer(), guard: w.guard, deps: w.deps, ledger: w.ledger, shopperId: DEMO_SHOPPER });
    const pick = (x: LedgerEvent[]) => x.filter((e) => e.actor === "seller" || e.actor === "buyer").map((e) => [e.actor, e.action, e.sellerId ?? "", e.price ?? "", e.why]);
    expect(pick(w.ledger.read())).toEqual(pick(fixture.events));
  });

  it("each call builds fresh sellers, so two haggles never share seller state", () => {
    expect(demoCatalog()[0]!.sellers[0]).not.toBe(demoCatalog()[0]!.sellers[0]);
  });
});

describe("a replay that misses says so (shared Lesson 53)", () => {
  it("another max through the engine: every move falls back with the recording's sentence, never 'the AI call failed'", async () => {
    const tape = TAPES[0]!;
    const w = world(tape.meta.seed);
    await runHaggle({ want: demoWant({ maxPrice: tape.meta.maxPrice + 100 }), sellers: demoSellers(weekOf(tape)), buyer: new RecordedPort(tape, sha256), guard: w.guard, deps: w.deps, ledger: w.ledger, shopperId: DEMO_SHOPPER });
    const buyer = w.ledger.read().filter((e) => e.actor === "buyer" && e.data?.source);
    expect(buyer.length).toBeGreaterThan(0);
    for (const e of buyer) {
      expect(e.data).toMatchObject({ source: "rule-fallback", reason: "tape-miss" });
      expect(e.why).toContain("The recording has no move for this point, so a plain rule made this move.");
      expect(e.why).not.toMatch(/AI call failed|didn't answer/);
      expect(e.data?.model).toBeUndefined();
    }
  });

  it("every tape says how many live runs it took and why the others were not kept", () => {
    for (const t of TAPES) {
      expect(t.meta.tries).toBeGreaterThanOrEqual(1);
      expect(t.meta.discarded).toHaveLength(t.meta.tries - 1);
    }
  });
});
