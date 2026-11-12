// The market logic (web/src/goose/market.ts): what the field draws comes only from the server's market answer and the
// recorded curves, the scam is set aside on the day it lists, and the deal is the one cleared seller under your limit.
import { describe, expect, it } from "vitest";
import { buildWeek, PULLS, tracksAt, type Market } from "../../web/src/goose/market.ts";
import { PLANTED_SCAMS } from "../src/ask/fictional-market.ts";
import { MOVING_ITEMS } from "../src/sellers/moving.ts";
import { verdictOf, watch } from "../src/trust/watch.ts";

const ticket: Market = {
  kind: "market", marketId: "rec-marsh-lights-ticket-d5", item: "A ticket to The Marsh Lights, Saturday (fictional)",
  claim: "Fictional market from a recorded demo week.", madeBy: "the recorded fictional week (no AI call)", readerSays: "",
  limitWhy: "Events limit $90.00", cap: "90.00", heldBy: "your $90.00 Events limit",
  recorded: { catalogId: "marsh-lights-ticket", day: 5 },
  results: [
    { id: "rm-tixquack", merchant: "TixQuack (fictional)", item: "", price: "55.00", currency: "USD", history: 40, quoted: "…", watcher: "refuse", said: [PULLS, "it asks to be paid by gift card"] },
    { id: "rm-lanternhall", merchant: "Lantern Hall Box Office (fictional)", item: "", price: "84.00", currency: "USD", history: 1200, quoted: "", watcher: "clear", said: [] },
    { id: "rm-reedwhistle", merchant: "Reedwhistle Tickets (fictional)", item: "", price: "97.00", currency: "USD", history: 340, quoted: "", watcher: "clear", said: [], over: "Over your $90.00 Events limit" },
  ],
};

describe("Goose's market week", () => {
  it("the line is pulled only by seller text the Watcher names as giving Goose orders, never by a gift card alone", () => {
    // Every planted scam whose note gives orders carries the Watcher's own words that The Line keys the tug on.
    for (const s of PLANTED_SCAMS.filter((p) => /SYSTEM:|Agent:/.test(p.note))) {
      const flags = watch({ quoted: s.note, merchant: `${s.merchant} (fictional)`, history: 0 });
      expect(verdictOf(flags)).toBe("refuse");
      expect(flags!.map((f) => f.said)).toContain(PULLS);
    }
    // TixQuack only asks for a gift card: set aside, and the line isn't pulled.
    const tix = MOVING_ITEMS.find((i) => i.id === "marsh-lights-ticket")!.sellers.find((s) => s.sellerId === "tixquack")!;
    const said = watch({ quoted: tix.note, merchant: tix.name, history: tix.history })!.map((f) => f.said);
    const ticketWithTixAsTheServerSaysIt = { ...ticket, results: ticket.results.map((r) => (r.id === "rm-tixquack" ? { ...r, said } : r)) };
    expect(buildWeek(ticketWithTixAsTheServerSaysIt, 9000).beats.find((b) => b.kind === "aside")).toMatchObject({ pulls: false });
  });

  it("draws the recorded days, Lantern Hall's fall, and the deal at $84 on day 5", () => {
    const w = buildWeek(ticket, 9000);
    expect(w.days).toEqual(["Day 1", "Day 2", "Day 3", "Day 4", "Day 5"]);
    expect(w.best?.merchant).toMatch(/Lantern Hall/);
    const lantern = w.tracks.find((t) => t.id === "lanternhall")!;
    expect(lantern.marks.map((m) => [m.round, m.cents])).toEqual([[0, 11200], [2, 9400], [4, 8400]]);
    expect(lantern.state).toBe("deal");
    expect(w.tracks.find((t) => t.id === "reedwhistle")!.state).toBe("over");
    expect(w.tracks.find((t) => t.id === "tixquack")!.state).toBe("aside");
    const kinds = w.beats.map((b) => `${b.day}:${b.kind}:${b.sellerId}`);
    expect(kinds).toContain("1:aside:tixquack");
    expect(kinds[kinds.length - 1]).toBe("4:under:lanternhall");
    expect(w.beats.find((b) => b.kind === "aside")).toMatchObject({ pulls: true });
  });

  it("never names a deal over your limit, and a lower limit leaves none", () => {
    expect(buildWeek(ticket, 8000).best).toBeNull();
    expect(buildWeek(ticket, 8000).beats.some((b) => b.kind === "under")).toBe(false);
  });

  it("an answer with no recorded week is one column of today's prices", () => {
    const { recorded: _, ...made } = ticket;
    const w = buildWeek(made, 9000);
    expect(w.days).toEqual(["Now"]);
    expect(w.tracks.every((t) => t.marks.length === 1 && t.marks[0]!.round === 0)).toBe(true);
  });

  it("draws only what has happened so far", () => {
    const w = buildWeek(ticket, 9000);
    expect(tracksAt(w, 0).every((t) => t.marks.length === 0)).toBe(true);
    const all = tracksAt(w, w.beats.length);
    expect(all.find((t) => t.id === "lanternhall")!.marks.at(-1)!.deal).toBe(true);
    const before = tracksAt(w, w.beats.length - 1);
    expect(before.find((t) => t.id === "lanternhall")!.marks.some((m) => m.deal)).toBe(false);
  });
});
