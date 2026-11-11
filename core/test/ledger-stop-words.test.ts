// The ledger's moment panel under the week's stop (Lead-12, Nov 5): a browser that paid this week (or can't tell yet, or paid
// then undid it) replays a classic run whose guard asked. The panel's head and deal lane read the server's stop words, never
// "waiting for your yes" or "needs your yes", because that yes can't come. These call the panel's own words on a real moment
// (recorded week 1 through momentAt); static-demo pins only the wiring (App hands the Ledger its run, the panel reads run.stop).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bundledLibrary, localRun, type LedgerEvent, type Tape } from "../src/index.ts";
import { momentAt, type Phase } from "../src/view/grid.ts";
import { STOP_SAID } from "../src/view/return.ts";
import { HEAD, dealLane } from "../../web/src/ledger-words.ts";

const FIXTURES = new URL("../../docs/fixtures/", import.meta.url);
const TAPES = [1, 2, 3].map((n) => JSON.parse(readFileSync(new URL(`tape-seed-${n}.json`, FIXTURES), "utf8")) as Tape);
const LIB = bundledLibrary(TAPES, TAPES[0]!.meta.promptSha256);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

async function week1(): Promise<LedgerEvent[]> {
  const r = localRun({ library: LIB, asked: 1, maxPrice: 6000, hash: sha, now: () => 1_800_000_000_000, fresh: () => 1, pace: false, onRow: () => {} });
  if ("error" in r) throw new Error(String(r.error));
  return (await r.done).events;
}

const ASKS = /waiting for your yes|needs your yes/;

describe("ledger_replays_a_stopped_ask_in_the_stops_words", () => {
  it("the asked moment's head and deal lane say each stop's words, and without a stop still ask (the control)", async () => {
    const events = await week1();
    const ask = events.find((e) => e.actor === "guard" && e.action === "ask")!;
    const m = momentAt(events, ask.seq)!;
    expect(m.phase).toBe("asked");
    const price = `$${(m.model.deal!.price / 100).toFixed(2)}`;
    // Control: no stop, the moment asks.
    expect(HEAD.asked(m)).toBe(`Deal at ${price}, waiting for your yes`);
    expect(HEAD.asked(m, null)).toMatch(ASKS);
    expect(dealLane("asked")).toBe("deal, needs your yes");
    expect(dealLane("asked", null)).toMatch(ASKS);
    for (const [kind, said] of Object.entries(STOP_SAID)) {
      expect(HEAD[m.phase](m, said), kind).toBe(`Deal at ${price}${said.strip}`);
      expect(dealLane(m.phase, said), kind).toBe(said.lane);
      expect(`${HEAD[m.phase](m, said)} ${dealLane(m.phase, said)}`, kind).not.toMatch(ASKS);
    }
  });

  it("the stop speaks only for the ask: every other phase reads the money's own state, with or without it", async () => {
    const events = await week1();
    for (const e of events) {
      const m = momentAt(events, e.seq)!;
      if (m.phase === "asked") continue;
      for (const said of Object.values(STOP_SAID)) {
        expect(HEAD[m.phase](m, said)).toBe(HEAD[m.phase](m));
        expect(dealLane(m.phase, said)).toBe(dealLane(m.phase));
      }
    }
    for (const phase of ["deal", "approved", "ordered", "paid", "finished", "closed"] as Phase[]) {
      expect(dealLane(phase, STOP_SAID.paid)).toBe(dealLane(phase));
    }
  });
});
