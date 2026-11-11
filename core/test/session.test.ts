// The Desk's "Behind the scenes" ledger (slice 3): the grid's rows equal the session's ledger exactly (Joshua's required
// test), whether they arrive one at a time with repeats, as the stream sends them, or all at once; a streamed row
// never changes; every row has one kind; and the totals count only the shopper's own money.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bundledLibrary, localRun, DemoShoppers, type LedgerEvent, type ShopperLedger, type Tape } from "../src/index.ts";
import {
  SESSION_KINDS, SessionRows, TOTALS_WHO, kindOf, sessionRows, sessionTotals, totalsWords, writeAsk, CSV_COLUMNS, WEEK_LABEL, LEDGER_CHIPS, chipOf, headerStrip,
  isSigned, ledgerRows, matchesSearch, passesLedgerChips, sessionCsv, weekRows, ledgerCharts, weekStory, KEPT_SAID, WEEK_ITEM, WATCHER_DID,
} from "../src/view/session.ts";
import { toCents } from "../src/money.ts";
import { recordedWeek } from "../src/view/week.ts";
import { isShoppers } from "../src/ledger/events.ts";
import { SEEDED_NOTE } from "../src/view/wallet.ts";
import { MOVING_DAYS, MOVING_ITEMS, priceOn } from "../src/sellers/moving.ts";
import { postedSellers } from "../src/sellers/posted.ts";
import { seededRng } from "../src/deps.ts";
import type { Cents } from "../src/money.ts";
import { categoryLimitFor } from "../src/trust/policy.ts";
import { demoPolicy } from "../src/scenario.ts";
import { verdictOf, watch } from "../src/trust/watch.ts";
import { BEAT_DAY } from "../src/ask/watching.ts";
import { cardLabel, cardWords, fromWords, whoWords } from "../../web/src/ledger/rows.ts";

const FIXTURES = new URL("../../docs/fixtures/", import.meta.url);
const TAPES = [1, 2, 3].map((n) => JSON.parse(readFileSync(new URL(`tape-seed-${n}.json`, FIXTURES), "utf8")) as Tape);
const LIB = bundledLibrary(TAPES, TAPES[0]!.meta.promptSha256);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const AT = 1_800_000_000_000;

async function runEvents(seed: number): Promise<LedgerEvent[]> {
  const r = localRun({ library: LIB, asked: seed, maxPrice: 6000, hash: sha, now: () => AT, fresh: () => seed, pace: false, onRow: () => {} });
  if ("error" in r) throw new Error(String(r.error));
  return (await r.done).events;
}

/** A session as the server holds one: the seeded week, then each run written through its own view. */
async function session(seeds: number[], pay?: { seed: number; refund?: boolean }): Promise<ShopperLedger> {
  const shopper = new DemoShoppers().for("t", AT);
  for (const seed of seeds) {
    const view = shopper.run(`run-${seed}`, "recorded");
    const events = await runEvents(seed);
    for (const { v: _v, seq: _seq, runId: _r, source: _s, day: _d, ...e } of events) view.append(e);
    if (pay?.seed === seed) {
      const offer = events.find((e) => e.actor === "seller" && e.action === "offer")!;
      const base = { t: AT, shopperId: offer.shopperId, visibility: "owner" as const, actor: "paypal" as const, layer: 3 as const, sellerId: offer.sellerId!, currency: "USD" };
      view.append({ ...base, action: "captured", verdict: "ok", price: "40.00", why: "Captured CAP-1: $40.00." });
      view.append({ ...base, action: "webhook", verdict: "ok", price: "40.00", why: "PayPal says the capture completed.", data: { eventId: "WH-1", eventType: "PAYMENT.CAPTURE.COMPLETED", verified: true, matched: true } });
      if (pay.refund) view.append({ ...base, action: "refunded", verdict: "ok", price: "40.00", why: "Undone: refund R-1 sent for capture CAP-1, $40.00 back." });
    }
  }
  return shopper;
}

describe("grid rows equal the ledger exactly", () => {
  it("one row per ledger row, same seq, why and price, streamed with repeats or all at once", async () => {
    const shopper = await session([1, 2, 77], { seed: 2 });
    const ledger = shopper.read();
    const all = sessionRows(ledger);
    expect(all.map((r) => r.seq)).toEqual(ledger.map((e) => e.seq));
    expect(all.map((r) => r.why)).toEqual(ledger.map((e) => e.why));
    expect(all.map((r) => r.price)).toEqual(ledger.map((e) => (e.price === undefined ? null : `$${e.price}`)));
    expect(all.map((r) => r.run)).toEqual(ledger.map((e) => e.runId ?? null));
    // The SSE replay may send a row twice (it subscribes before replaying); the stream ignores the repeat.
    const s = new SessionRows();
    const added = [];
    for (const e of ledger) { for (const x of [e, e]) { const r = s.add(x); if (r) added.push(r); } }
    expect(added).toEqual(all);
    expect(s.rows).toEqual(all);
  });

  it("a streamed row never changes: the rows from any prefix are the first rows of the whole", async () => {
    const ledger = (await session([1, 3])).read();
    const all = sessionRows(ledger);
    for (const k of [0, 1, 5, Math.floor(ledger.length / 2), ledger.length]) expect(sessionRows(ledger.slice(0, k))).toEqual(all.slice(0, k));
  });

  it("a missing row is an error, never a grid that silently skips one", async () => {
    const ledger = (await session([1])).read();
    const s = new SessionRows();
    s.add(ledger[0]!);
    expect(() => s.add(ledger[2]!)).toThrow(/missing/);
  });
});

describe("each row says what it is", () => {
  it("every row has one of the Desk's kinds; seeded rows say so; refusals are skipped sellers; webhooks are webhooks", async () => {
    const ledger = (await session([1, 2, 3], { seed: 1 })).read();
    const rows = sessionRows(ledger);
    const keys = new Set(SESSION_KINDS.map((k) => k.key));
    for (const r of rows) expect(keys.has(r.kind)).toBe(true);
    const seeded = rows.filter((r) => r.source === "seeded");
    expect(seeded.length).toBeGreaterThan(0);
    for (const r of seeded) expect(r.sourceWords).toBe(SEEDED_NOTE);
    for (const e of ledger) if (e.actor === "watcher" && e.verdict === "refused") expect(kindOf(e)).toBe("skipped");
    expect(rows.filter((r) => r.kind === "skipped").length).toBeGreaterThan(0);
    expect(rows.find((r) => r.eventId === "WH-1")?.kind).toBe("webhook");
    expect(rows.filter((r) => r.kind === "item").length).toBe(ledger.filter((e) => e.actor === "seller").length);
  });

  it("a set-aside row's Did names neither the What's kind nor the Who's actor (DD, POL-3 and L-did, system.md §8)", async () => {
    const ledger = (await session([1, 2, 3], { seed: 1 })).read();
    const watcher = ledgerRows(sessionRows(ledger), weekRows((await recordedWeek(TAPES[0]!, sha, () => AT)).events)).filter((r) => r.kind === "skipped" && r.actor === "watcher");
    expect(watcher.some((r) => r.part === "session") && watcher.some((r) => r.part === "week")).toBe(true);
    expect(watcher.length).toBeGreaterThan(0);
    const what = SESSION_KINDS.find((k) => k.key === "skipped")!.one;
    for (const r of watcher) {
      expect(r.did).toBe("on evidence");
      expect(r.did.toLowerCase()).not.toContain(what.toLowerCase());
      expect(r.did.toLowerCase()).not.toContain("watcher");
      expect(cardWords(r, "now")).toContain(WATCHER_DID);
    }
  });

  it("the CSV's columns are the row's own fields", () => {
    const sample = sessionRows([])[0];
    expect(sample).toBeUndefined();
    for (const c of CSV_COLUMNS) expect(["seq", "t", "run", "sourceWords", "kind", "who", "did", "price", "why", "quoted", "eventId"]).toContain(c);
  });
});

describe("the totals row counts only the shopper's own money", () => {
  it("the seeded week alone is nothing spent, nothing kept, nothing skipped", async () => {
    expect(sessionTotals((await session([])).read())).toEqual({ spent: 0, kept: 0, skipped: 0, checked: 0, confirmed: 0 });
  });

  it("its label says the seeded week isn't counted, and that's what the totals do: its capture is in the ledger, never in spent", async () => {
    expect(TOTALS_WHO).toBe("This session · seeded week not counted");
    const ledger = (await session([])).read();
    const seeded = ledger.filter((e) => e.source === "seeded" && e.actor === "paypal" && e.action === "captured");
    expect(seeded.map((e) => e.price)).toEqual(["54.00"]);
    expect(totalsWords(sessionTotals(ledger)).spent).toBe("$0.00 spent");
  });

  it("a capture is spent, its seller's opening ask less the price is kept, and each refused seller counts once per run", async () => {
    const ledger = (await session([1, 2], { seed: 2 })).read();
    const t = sessionTotals(ledger);
    expect(t.spent).toBe(4000);
    const opening = ledger.find((e) => e.runId === "run-2" && e.actor === "seller" && e.action === "offer")!;
    expect(t.kept).toBe(Math.max(0, Math.round(Number(opening.price) * 100) - 4000));
    const refused = new Set(ledger.filter((e) => e.source !== "seeded" && e.actor === "watcher" && e.verdict === "refused").map((e) => `${e.runId}:${e.sellerId}`));
    expect(t.skipped).toBe(refused.size);
    expect(totalsWords(t).spent).toBe("$40.00 spent");
  });

  it("a refunded capture is neither spent nor kept", async () => {
    const t = sessionTotals((await session([2], { seed: 2, refund: true })).read());
    expect(t.spent).toBe(0);
    expect(t.kept).toBe(0);
  });
});

describe("an Ask is a row of its own (Desk-A's routes call writeAsk)", () => {
  it("it keeps only the checked chips' catalog words, streams like any row, and moves no money or record", async () => {
    const shopper = await session([1]);
    const words = "I want a black kettle, my card is 4111 1111 1111 1111";
    const row = writeAsk(shopper, [{ kind: "item", value: "kettle" }, { kind: "attribute", name: "color", value: "black" }, { kind: "limit", value: "under your limit" }], AT, "voice");
    expect(row.source).toBe("ask");
    expect(row.why).not.toContain("4111");
    expect(JSON.stringify(row)).not.toContain(words);
    expect(row.why).toMatch(/Goldfeather Kettle · black · under your limit/);
    const rows = sessionRows(shopper.read());
    const r = rows.at(-1)!;
    expect(r.kind).toBe("ask");
    expect(r.did).toBe("asked Goose");
    expect(r.sourceWords).toBe("your Ask");
    expect(rows.map((x) => x.seq)).toEqual(shopper.read().map((e) => e.seq));
    expect(isShoppers(row)).toBe(false);
    expect(sessionTotals(shopper.read())).toEqual(sessionTotals(shopper.read().filter((e) => e.source !== "ask")));
  });

  it("an Ask outside the catalog says so and keeps nothing it was asked with", async () => {
    const shopper = await session([]);
    const row = writeAsk(shopper, [], AT);
    expect(row.why).toBe("You asked Goose for something outside the catalog. Nothing you asked with is kept.");
    expect(row.data).toEqual({ chips: 0, how: "typed" });
  });
});

// ---------- Behind the scenes, the Midnight ledger (Desk-B-4) ----------
describe("the Midnight ledger: the demo week below, the session above, never mixed", () => {
  const weekEvents = async () => (await recordedWeek(TAPES[0]!, sha, () => AT)).events;

  it("every streamed row and every demo-week row is one grid row: the session's in seq order, then the seeded row, then the week", async () => {
    const ledger = (await session([1, 2], { seed: 2 })).read();
    const stream = sessionRows(ledger);
    const w = weekRows(await weekEvents());
    expect(w.length).toBeGreaterThan(5);
    const rows = ledgerRows(stream, w);
    expect(rows.length).toBe(stream.length + w.length);
    const own = rows.filter((r) => r.part === "session");
    expect(own.map((r) => r.seq)).toEqual(ledger.filter((e) => e.source !== "seeded").map((e) => e.seq));
    expect(own.map((r) => r.id)).toEqual(own.map((r) => String(r.seq)));
    expect(rows.slice(0, own.length)).toEqual(own);
    expect(rows.slice(own.length).every((r) => r.part === "week")).toBe(true);
    expect(rows[own.length]!.source).toBe("seeded");
    expect(rows.slice(-w.length)).toEqual(w);
    // Ids never clash: the session keeps its seqs, the week is "w" + seq.
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const r of w) expect(r.sourceWords).toBe(WEEK_LABEL);
  });

  it("the totals and header strip count only the session's own stream: the seeded week and the demo week never enter them", async () => {
    const ledger = (await session([1, 2], { seed: 2 })).read();
    const t = sessionTotals(ledger);
    expect(sessionTotals(ledger.filter((e) => e.source !== "seeded"))).toEqual(t);
    // Why the page sums only the stream: the demo week's recorded rows would count if they were mixed in.
    expect(sessionTotals([...ledger, ...(await weekEvents())])).not.toEqual(t);
    expect(weekRows(await weekEvents()).some((r) => r.kind === "skipped")).toBe(true);
    const fresh = sessionTotals((await session([])).read());
    expect(fresh).toEqual({ spent: 0, kept: 0, skipped: 0, checked: 0, confirmed: 0 });
    expect(headerStrip(fresh).map((h) => h.value)).toEqual(["0", "0", "$0.00", "$0.00", "0"]);
  });

  it("the header strip's numbers are sessionTotals of the same rows", async () => {
    const ledger = (await session([1, 2, 3], { seed: 2 })).read();
    const t = sessionTotals(ledger);
    const own = ledger.filter(isShoppers);
    expect(t.checked).toBe(new Set(own.filter((e) => e.actor === "seller").map((e) => `${e.runId}:${e.sellerId}`)).size);
    expect(t.checked).toBeGreaterThan(t.skipped);
    expect(t.confirmed).toBe(1);
    const strip = headerStrip(t);
    expect(strip.map((h) => h.key)).toEqual(["checked", "skipped", "spent", "kept", "confirmed"]);
    const w = totalsWords(t);
    expect(strip.map((h) => h.value)).toEqual([String(t.checked), String(t.skipped), w.spent.replace(" spent", ""), w.kept.replace(" kept off by haggling", ""), "1"]);
    expect(strip.at(-1)!.label).toBe("PayPal confirmation");
  });

  it("the chips partition the rows by who wrote them: every row in exactly one, all five used", async () => {
    const ledger = (await session([1, 2], { seed: 2 })).read();
    const asked = await session([1]);
    writeAsk(asked, [], AT);
    const rows = [...ledgerRows(sessionRows(ledger), weekRows(await weekEvents())), ...sessionRows(asked.read())];
    const keys = LEDGER_CHIPS.map((c) => c.key);
    for (const r of rows) {
      expect(keys.filter((k) => passesLedgerChips(r, new Set([k])))).toEqual([chipOf(r)]);
      expect(passesLedgerChips(r, new Set())).toBe(true);
    }
    expect(new Set(rows.map(chipOf))).toEqual(new Set(keys));
    expect(LEDGER_CHIPS.map((c) => c.label)).toEqual(["Sellers", "Goose", "Code", "PayPal", "You", "Seeded"]);
    for (const r of rows) if (r.actor === "seller") expect(chipOf(r)).toBe("sellers");
    for (const r of rows) if (r.actor === "watcher" || r.actor === "agent") expect(chipOf(r)).toBe("goose");
  });

  it("the PayPal chip never counts the seeded week's simulated capture: it is Seeded (Round 2 data review)", async () => {
    // The page before any ask: the stream's seeded row, then the recorded week. "PayPal confirmations 0" on the tiles,
    // so the PayPal chip must say 0 too, and the seeded capture is counted under Seeded.
    const before = await session([]);
    const rows = ledgerRows(sessionRows(before.read()), weekRows(await weekEvents()));
    const count = (k: string) => rows.filter((r) => chipOf(r) === k).length;
    const seeded = rows.filter((r) => r.source === "seeded");
    expect(seeded.length).toBe(1);
    expect(seeded[0]!.actor).toBe("paypal");
    expect(seeded[0]!.signed).toBe(false);
    expect(chipOf(seeded[0]!)).toBe("seeded");
    expect(count("seeded")).toBe(1);
    expect(count("paypal")).toBe(0);
    expect(sessionTotals(before.read()).confirmed).toBe(0);
    // After a real run, PayPal's own rows (its order answers and the verified webhook) are PayPal's, and only those.
    const paid = await session([2], { seed: 2 });
    const after = ledgerRows(sessionRows(paid.read()), weekRows(await weekEvents()));
    const pp = after.filter((r) => chipOf(r) === "paypal");
    expect(pp.length).toBeGreaterThan(0);
    for (const r of pp) { expect(r.actor).toBe("paypal"); expect(r.source).not.toBe("seeded"); }
    expect(pp.filter((r) => r.signed).length).toBe(sessionTotals(paid.read()).confirmed);
    for (const r of after) if (r.source === "seeded") expect(chipOf(r)).toBe("seeded");
  });

  it("a phone card's name starts with its visible words, in order (Round 2 a11y, axe 4.14 Label in Name)", async () => {
    const paid = await session([1, 2], { seed: 2, refund: true });
    const rows = ledgerRows(sessionRows(paid.read()), weekRows(await weekEvents()));
    expect(rows.some((r) => r.flow === "out") && rows.some((r) => r.signed) && rows.some((r) => r.quoted)).toBe(true);
    for (const r of rows) {
      const when = r.part === "session" ? new Date(r.t).toISOString().slice(11, 19) : fromWords(r);
      const label = cardLabel(r, when);
      const shown = cardWords(r, when).join(" ");
      expect(label.startsWith(shown)).toBe(true);
      expect(label.startsWith(whoWords(r))).toBe(true);
      expect(label.endsWith(". Open the full story.")).toBe(true);
      if (r.price) expect(shown).toContain(r.price);
      if (r.quoted) expect(shown).toContain(r.quoted.trim());
    }
    const seed = rows.find((r) => r.source === "seeded")!;
    expect(cardLabel(seed, fromWords(seed))).toMatch(/^Seed \(simulated\) \$54\.00 Payment captured \(simulated\) Seeded, simulated /);
    // The card draws these words and names itself from them; the amount inside carries no second name.
    const cards = readFileSync(new URL("../../web/src/ledger/Cards.tsx", import.meta.url), "utf8");
    expect(cards).toContain("aria-label={cardLabel(r, when)}");
    expect(cards).toContain("<Amount r={r} plain />");
    expect(cards).not.toMatch(/aria-label=\{`/);
  });

  it("the PayPal badge sits only on PayPal's signed webhook rows, never on a row that merely names PayPal", async () => {
    const shopper = await session([2], { seed: 2 });
    shopper.run("run-unsigned", "recorded").append({ t: AT, shopperId: "s", visibility: "owner", actor: "paypal", action: "webhook", layer: 3, verdict: "ok", why: "no signature check", data: { eventId: "WH-2", eventType: "PAYMENT.CAPTURE.COMPLETED", verified: false, matched: true } });
    const rows = sessionRows(shopper.read());
    expect(rows.filter((r) => r.signed).map((r) => r.eventId)).toEqual(["WH-1"]);
    for (const r of rows) expect(r.signed).toBe(r.kind === "webhook" && r.eventId === "WH-1");
    expect(rows.filter((r) => r.actor === "paypal" && !r.signed).length).toBeGreaterThan(1);
    expect(shopper.read().filter(isSigned).length).toBe(1);
    // Money moved only on the shopper's own capture; the seeded capture moved none.
    expect(rows.filter((r) => r.flow === "out").map((r) => r.price)).toEqual(["$40.00"]);
    expect(rows.find((r) => r.source === "seeded")!.flow).toBeNull();
  });

  it("a skipped seller's row says which rule and layer; search reads the row's own words", async () => {
    const rows = sessionRows((await session([1])).read());
    const refusal = rows.find((r) => r.kind === "skipped")!;
    expect(refusal.rule).not.toBeNull();
    expect(refusal.layer).toMatch(/Watcher|Seller text/);
    expect(matchesSearch(refusal, refusal.who.split(" ")[0]!)).toBe(true);
    expect(matchesSearch(refusal, `${refusal.layer} zzzzqqq`)).toBe(false);
    expect(matchesSearch(refusal, "")).toBe(true);
  });

  it("the download is the session's own rows in CSV_COLUMNS order, with the grid's names, quoted and formula-safe", async () => {
    const ledger = (await session([1, 2], { seed: 2 })).read();
    const own = ledgerRows(sessionRows(ledger), []).filter((r) => r.part === "session");
    const csv = sessionCsv(own);
    expect(csv.split("\r\n")[0]).toBe("#,Time (UTC),Run,From,What,Who,Did,Amount,Why,Seller's words,PayPal event");
    expect(CSV_COLUMNS).toEqual(["seq", "t", "run", "sourceWords", "kind", "who", "did", "price", "why", "quoted", "eventId"]);
    // One record per row (a quoted field may hold a newline, so count outside quotes).
    let records = 0;
    let quoted = false;
    for (const ch of csv) { if (ch === '"') quoted = !quoted; else if (ch === "\n" && !quoted) records++; }
    expect(records).toBe(own.length + 1);
    expect(csv).toContain("WH-1");
    const line = sessionCsv([{ ...own[0]!, why: '=HYPERLINK("x")', quoted: 'a, "b"' }]).split("\r\n")[1]!;
    expect(line).toContain(`"'=HYPERLINK(""x"")"`);
    expect(line).toContain('"a, ""b"""');
  });
});

describe("the charts are the ledger's own numbers, exactly", () => {
  it("where the money went: paid and kept are the totals row's, asking is the paid seller's opening ask, from the rows themselves", async () => {
    const ledger = (await session([1, 2, 3], { seed: 2 })).read();
    const t = sessionTotals(ledger);
    const c = ledgerCharts(ledger);
    expect(c.money.map((m) => m.key)).toEqual(["asking", "kept", "paid"]);
    const [asking, kept, paid] = c.money;
    expect(paid!.cents).toBe(t.spent);
    expect(kept!.cents).toBe(t.kept);
    // Counted again from the rows, not from sessionTotals: the one capture, and its seller's opening ask in that run.
    const capture = ledger.find((e) => isShoppers(e) && e.actor === "paypal" && e.action === "captured")!;
    const opening = ledger.find((e) => e.runId === capture.runId && e.actor === "seller" && e.action === "offer" && e.sellerId === capture.sellerId)!;
    expect(paid!.cents).toBe(toCents(capture.price!));
    expect(asking!.cents).toBe(toCents(opening.price!));
    expect(asking!.cents).toBe(paid!.cents + kept!.cents);
    expect(c.money.map((m) => m.dollars)).toEqual(c.money.map((m) => m.cents / 100));
    expect(c.summary.money).toBe(`Opening asks ${asking!.words}. Haggling kept ${kept!.words} off them. Your tap paid ${paid!.words}. A price that fell over the days is not counted as haggling.`);
  });

  it("sellers checked and set aside are the header strip's, and each Watcher rule counts the grid rows that name it", async () => {
    const ledger = (await session([1, 2, 3], { seed: 2 })).read();
    const t = sessionTotals(ledger);
    const c = ledgerCharts(ledger);
    const by = Object.fromEntries(c.sellers.map((s) => [s.key, s.count]));
    expect(by.checked).toBe(t.checked);
    expect(by.skipped).toBe(t.skipped);
    expect(t.skipped).toBeGreaterThan(0);
    const own = ledger.filter(isShoppers);
    const refusedKeys = new Set(own.filter((e) => e.actor === "watcher" && e.verdict === "refused").map((e) => `${e.runId}:${e.sellerId}`));
    const heldKeys = new Set(own.filter((e) => e.actor === "watcher" && e.verdict === "asked").map((e) => `${e.runId}:${e.sellerId}`).filter((k) => !refusedKeys.has(k)));
    expect(by.held).toBe(heldKeys.size);
    // Every rule on every Watcher row of the session, counted from the ledger's own `data.rule`.
    const fired = new Map<string, { refused: number; held: number }>();
    for (const e of own.filter((x) => x.actor === "watcher" && typeof x.data?.rule === "string" && x.data.rule !== "")) {
      for (const r of String(e.data!.rule).split(",")) {
        const n = fired.get(r) ?? { refused: 0, held: 0 };
        if (e.verdict === "refused") n.refused++; else n.held++;
        fired.set(r, n);
      }
    }
    expect(Object.fromEntries(c.rules.map((r) => [r.rule, { refused: r.refused, held: r.held }]))).toEqual(Object.fromEntries(fired));
    expect(c.rules.length).toBeGreaterThan(0);
    expect(c.rules.every((r) => r.label !== r.rule)).toBe(true); // every rule that fired has words
    const totals = c.rules.map((r) => r.refused + r.held);
    expect(totals).toEqual([...totals].sort((a, b) => b - a));
  });

  it("the seeded week never enters a chart: a fresh session's charts are all zero and say so", async () => {
    const fresh = ledgerCharts((await session([])).read());
    expect(fresh.money.every((m) => m.cents === 0)).toBe(true);
    expect(fresh.sellers.every((s) => s.count === 0)).toBe(true);
    expect(fresh.rules).toEqual([]);
    expect(fresh.summary).toEqual({ money: "No money has moved this session yet.", sellers: "0 sellers checked, 0 held for your yes, 0 set aside.", rules: "No Watcher rule has fired this session yet." });
    // The seeded rows alone (a capture among them) chart nothing.
    const seededOnly = (await session([])).read().filter((e) => e.source === "seeded");
    expect(ledgerCharts(seededOnly).money.every((m) => m.cents === 0)).toBe(true);
  });
});

describe("kept off by haggling counts haggling only, never a price that fell over the days (Joshua, PART 5)", () => {
  it("a posted seller asks the same total every round, so a posted run (the ticket, the inn, the flight) keeps $0.00 off", () => {
    for (const item of MOVING_ITEMS) for (let day = 0; day < MOVING_DAYS; day++) for (const s of postedSellers(item, day)) {
      const open = s.open(0).price;
      const rng = seededRng(day + 1);
      const bids = [1, open - 1, open * 2] as Cents[];
      expect(bids.map((b, i) => s.respond(b, i + 1, rng)?.price)).toEqual([open, open, open]);
      expect(open).toBe(priceOn(item.sellers.find((x) => x.sellerId === s.id)!.curve, day)!.total);
    }
  });

  it("the words say haggling wherever the figure shows, and the money chart says a fall over the days isn't in it", async () => {
    const ledger = (await session([1, 2, 3], { seed: 2 })).read();
    const t = sessionTotals(ledger);
    expect(KEPT_SAID).toBe("kept off by haggling");
    expect(totalsWords(t).kept).toBe(`$${(t.kept / 100).toFixed(2)} kept off by haggling`);
    expect(headerStrip(t).find((h) => h.key === "kept")!.label).toBe(KEPT_SAID);
    const c = ledgerCharts(ledger);
    expect(c.money.find((m) => m.key === "kept")!.label).toBe("Kept off by haggling");
    expect(c.summary.money).toContain("not counted as haggling");
  });
});

describe("the week chart is the recorded week's own numbers (Joshua, PART 4.3: the cheapest offer was the scam)", () => {
  const item = MOVING_ITEMS.find((i) => i.id === WEEK_ITEM)!;
  const w = weekStory();

  it("every seller's total, every day, is moving.ts's own (priceOn), in cents and dollars", () => {
    expect(w.days).toEqual(Array.from({ length: MOVING_DAYS }, (_, d) => `Day ${d + 1}`));
    expect(w.sellers.map((s) => s.id)).toEqual(item.sellers.map((s) => s.sellerId));
    for (const s of w.sellers) {
      const curve = item.sellers.find((x) => x.sellerId === s.id)!.curve;
      expect(s.cents).toEqual(w.days.map((_, d) => priceOn(curve, d)?.total ?? null));
      expect(s.dollars).toEqual(s.cents.map((c) => (c === null ? null : c / 100)));
    }
  });

  it("the limit is the policy's Events limit, and each seller's verdict is the Watcher's own", () => {
    expect(w.limit.cents).toBe(categoryLimitFor(demoPolicy(), item.category));
    expect(w.limit.cents).toBe(toCents("90.00"));
    expect(w.limit.label).toBe("Events limit");
    for (const s of w.sellers) {
      const m = item.sellers.find((x) => x.sellerId === s.id)!;
      expect(s.verdict).toBe(verdictOf(watch({ quoted: m.note, merchant: m.name, history: m.history })));
    }
  });

  it("Lantern Hall's $84.00 on day 5 is marked, fallen from $112.00 on day 1; TixQuack's $55.00 is set aside and the cheapest of all", () => {
    expect(w.pick).toMatchObject({ id: "lanternhall", day: BEAT_DAY, words: "$84.00", firstDay: 0, firstWords: "$112.00", fellWords: "$28.00" });
    expect(w.pick.day + 1).toBe(5);
    const lantern = w.sellers.find((s) => s.id === "lanternhall")!;
    expect(lantern.cents[BEAT_DAY]).toBe(w.pick.cents);
    expect(w.pick.cents).toBeLessThanOrEqual(w.limit.cents);
    expect(w.scam).toMatchObject({ id: "tixquack", words: "$55.00" });
    expect(w.sellers.find((s) => s.id === "tixquack")!.verdict).toBe("refuse");
    const clearedLow = Math.min(...w.sellers.filter((s) => s.verdict === "clear").flatMap((s) => s.cents.filter((c): c is number => c !== null)));
    expect(w.scam.cents).toBeLessThan(clearedLow);
    expect(w.cheapestWasScam).toBe(true);
    for (const n of ["$112.00", "$84.00", "$90.00", "$55.00", "day 5", "set aside"]) expect(w.summary).toContain(n);
  });
});
