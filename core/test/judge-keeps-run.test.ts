// Judge in 60 seconds, stop 5 "Approve it yourself" (Nov 11 audit): it primed the Ask exactly like stop 2, so a judge who
// had already run at stop 2 ran Goose twice. Stop 5 now keeps a finished run's pick; with no finished run it primes as before.
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { hasFinishedRun, setFinishedRun } from "../../web/src/site/shop/finished.ts";

// Loaded at run time: core's typecheck has no JSX, so it must not follow a static import into a .tsx (vitest compiles it).
const JUDGE = fileURLToPath(new URL("../../web/src/site/judge/Judge.tsx", import.meta.url));
const { JUDGE_STOPS, primeAsk } = await import(JUDGE) as { JUDGE_STOPS: readonly { title: string; ask?: string; keepRun?: boolean }[]; primeAsk(ask?: string, keepRun?: boolean): void };

const store = new Map<string, string>();
(globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
} as Storage;
// Shop's own read of the hero's words (Shop.tsx readOnce): read once, then gone. A second ask happens when this finds words.
const shopMounts = () => { const w = store.get("gg-ask") ?? null; store.delete("gg-ask"); return w; };
const click = (n: number) => { const s = JUDGE_STOPS[n - 1]!; primeAsk(s.ask, s.keepRun); };

describe("Judge stop 5 keeps the finished run", () => {
  beforeEach(() => { store.clear(); setFinishedRun(false); });

  it("judge_stop5_is_the_review_stop: stop 2 and stop 5 both open Shop with the kettle ask; only stop 5 keeps a run", () => {
    expect(JUDGE_STOPS[1]!.ask).toBe("A kettle under $60");
    expect(JUDGE_STOPS[4]!.title).toBe("Approve it yourself");
    expect(JUDGE_STOPS[4]!.keepRun).toBe(true);
    expect(JUDGE_STOPS[1]!.keepRun).toBeUndefined();
  });

  it("judge_stop2_then_stop5_runs_once: stop 2 asks, the run finishes, stop 5 primes nothing, so Shop asks no second time", () => {
    click(2);
    expect(shopMounts()).toBe("A kettle under $60"); // Shop mounts and runs once
    setFinishedRun(true); // Goose's pick is on screen
    click(5);
    expect(store.has("gg-ask")).toBe(false);
    expect(shopMounts()).toBeNull(); // no second run
  });

  it("judge_stop5_clears_a_stale_ask_while_a_run_is_finished: stop 2 pressed on Shop leaves words Shop never read; stop 5 removes them", () => {
    setFinishedRun(true);
    click(2);
    click(5);
    expect(store.has("gg-ask")).toBe(false);
  });

  it("judge_stop5_without_a_finished_run_primes_as_before: no run, or the run left with its page, stop 5 asks", () => {
    click(5);
    expect(shopMounts()).toBe("A kettle under $60");
    setFinishedRun(true); setFinishedRun(false); // Shop unmounted: the run is gone
    click(5);
    expect(shopMounts()).toBe("A kettle under $60");
  });

  it("finished_flag_is_memory_only", () => {
    setFinishedRun(true);
    expect(hasFinishedRun()).toBe(true);
    expect(store.size).toBe(0);
  });
});
