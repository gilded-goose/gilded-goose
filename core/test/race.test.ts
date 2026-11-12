import { describe, expect, it } from "vitest";
import { racePorts, type BuyerInput, type BuyerMove, type LlmPort } from "../src/index.ts";

const input: BuyerInput = { want: { item: "x", qty: 1, maxPrice: 6000 }, round: 1, maxRounds: 5, offers: [], history: [] };
const after = (ms: number, move: unknown) => new Promise<BuyerMove>((res) => setTimeout(() => res(move as BuyerMove), ms));

// Fakes ignore their signal (like a request already in flight) and record it, so only racePorts can abort them.
function fake(name: string, ms: number, move: unknown, seen: AbortSignal[]): LlmPort {
  return { name, decide: (_i, s) => { seen.push(s!); return after(ms, move); } };
}

describe("racePorts (hedged buyer)", () => {
  it("warm() warms every racer at once, and a port without warm() is fine", async () => {
    let warmed = 0;
    const port = (w: boolean): LlmPort => ({ name: "m", async decide() { return { type: "wait", why: "x" }; }, ...(w ? { async warm() { warmed++; } } : {}) });
    await racePorts([port(true), port(true), port(false)]).warm?.();
    expect(warmed).toBe(2);
  });

  it("returns the first answer and aborts the slower port", async () => {
    const slow: AbortSignal[] = [], fast: AbortSignal[] = [];
    const m = await racePorts([fake("a", 80, { type: "walk", why: "slow" }, slow), fake("a", 5, { type: "wait", why: "fast" }, fast)]).decide(input);
    expect(m.why).toBe("fast");
    expect(slow[0]!.aborted).toBe(true);
  });

  it("control: a single port is called once and its answer passes through", async () => {
    const seen: AbortSignal[] = [];
    const m = await racePorts([fake("a", 1, { type: "wait", why: "only" }, seen)]).decide(input);
    expect(m.why).toBe("only");
    expect(seen).toHaveLength(1);
  });

  it("a fast malformed answer does not beat a slower good one", async () => {
    const m = await racePorts([fake("a", 1, { type: "accept" }, []), fake("a", 20, { type: "wait", why: "good" }, [])]).decide(input);
    expect(m.why).toBe("good");
  });

  it("all failing rethrows the first port's own error", async () => {
    const boom = (msg: string): LlmPort => ({ name: "a", decide: async () => { throw new Error(msg); } });
    await expect(racePorts([boom("first"), boom("second")]).decide(input)).rejects.toThrow("first");
  });

  it("the caller's abort (the engine's timeout) reaches every port", async () => {
    const a: AbortSignal[] = [], b: AbortSignal[] = [];
    const outer = new AbortController();
    const p = racePorts([fake("a", 50, { type: "wait", why: "x" }, a), fake("a", 50, { type: "wait", why: "y" }, b)]).decide(input, outer.signal);
    outer.abort();
    expect(a[0]!.aborted && b[0]!.aborted).toBe(true);
    await p;
  });

  it("an already-aborted caller signal reaches every port at the start", async () => {
    // Record the signal's state when each port is called: by the end, finally{} has aborted everything anyway.
    const atCall: boolean[] = [];
    const port: LlmPort = { name: "a", decide: (_i, s) => { atCall.push(s!.aborted); return after(1, { type: "wait", why: "x" }); } };
    const outer = new AbortController();
    outer.abort();
    await racePorts([port, port]).decide(input, outer.signal);
    expect(atCall).toEqual([true, true]);
  });

  it("reports a racer that fails before it was aborted; control: the aborted loser is not reported", async () => {
    const reported: string[] = [];
    const onRacerError = (e: Error) => reported.push(e.message);
    await racePorts([fake("a", 1, { type: "accept" }, []), fake("a", 20, { type: "wait", why: "good" }, [])], { onRacerError }).decide(input);
    expect(reported).toEqual(["a returned a malformed move"]);
    reported.length = 0;
    // The loser here resolves late with a malformed move after it was aborted: not a failure worth reporting.
    await racePorts([fake("a", 1, { type: "wait", why: "fast" }, []), fake("a", 30, { type: "accept" }, [])], { onRacerError }).decide(input);
    await after(40, null);
    expect(reported).toEqual([]);
  });

  it("refuses racers of different models (the ledger labels moves with one name)", () => {
    expect(() => racePorts([fake("claude-haiku-5-5", 1, {}, []), fake("rule", 1, {}, [])])).toThrow("identical ports");
  });

  it("keeps the first port's name for the ledger's source label", () => {
    expect(racePorts([fake("claude-haiku-5-5", 1, {}, []), fake("claude-haiku-5-5", 1, {}, [])]).name).toBe("claude-haiku-5-5");
  });
});
