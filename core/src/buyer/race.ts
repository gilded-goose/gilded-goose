// Hedged buyer: ask several identical ports at once, take the first good answer,
// abort the rest. S3 measured Haiku's tail against a 1500 ms budget: one call
// p95 1957 ms; two raced 1349–1645 ms over three runs (not a stable pass);
// three raced 1355/1375/1349 ms, none of 90 over (mostly warm moves; live,
// the first move of a run is slower: 3 timeouts in ~24 live moves on day 1, at least 2 of them a run's first move). Most of the tail is the
// network, not the model, so independent tries are what cut it. Every answer
// is still only a proposal: the guard decides. Racing N multiplies spend by up
// to N: an aborted loser's input tokens are still billed.

import { isBuyerMove, type BuyerInput, type BuyerMove, type LlmPort } from "./port.ts";

export interface RaceOptions {
  /** Called for each racer that fails or returns a malformed move before it was aborted, so a bad loser is never silent. */
  onRacerError?: (error: Error, port: string) => void;
}

export function racePorts(ports: LlmPort[], opts: RaceOptions = {}): LlmPort {
  if (ports.length === 0) throw new Error("racePorts needs at least one port");
  // The ledger labels every move with this one name, so every racer must be the same model.
  const name = ports[0]!.name;
  if (ports.some((p) => p.name !== name)) throw new Error(`racePorts needs identical ports, got ${ports.map((p) => p.name).join(", ")}`);
  return {
    name,
    // Every racer warms at once, so each opens its own connection for the first move's three calls.
    async warm() { await Promise.all(ports.map((p) => p.warm?.())); },
    async decide(input: BuyerInput, signal?: AbortSignal): Promise<BuyerMove> {
      const ctrls = ports.map(() => new AbortController());
      const stopAll = () => { for (const c of ctrls) c.abort(); };
      if (signal?.aborted) stopAll();
      signal?.addEventListener("abort", stopAll, { once: true });
      try {
        // A malformed answer counts as a failure, so a fast bad move can't beat a good one.
        return await Promise.any(ports.map(async (p, k) => {
          try {
            const m: unknown = await p.decide(input, ctrls[k]!.signal);
            if (!isBuyerMove(m)) throw new Error(`${p.name} returned a malformed move`);
            return m;
          } catch (e) {
            if (!ctrls[k]!.signal.aborted) opts.onRacerError?.(e instanceof Error ? e : new Error(String(e)), p.name);
            throw e;
          }
        }));
      } catch (e) {
        throw e instanceof AggregateError && e.errors[0] instanceof Error ? e.errors[0] : e;
      } finally {
        stopAll(); // abort the losers' requests (their input tokens are still billed)
        signal?.removeEventListener("abort", stopAll);
      }
    },
  };
}
