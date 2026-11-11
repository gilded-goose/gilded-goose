// The threat log's live rows, totals and Excel file, and the ledger as an audit log (Joshua, Nov 4, items 1 and 2).
import { describe, expect, it } from "vitest";
import { streamed, sessionRows, type LedgerRow } from "@goose/core/session";
import { auditList, findRows, isVisitHead, paypalInVisit, rulesOf, visitsOf } from "../../web/src/studio/audit.ts";
import { csvOf, ledgerForRule, SIDE_FILE, tableOf, triesArrived, triesTotals, tryRows } from "../../web/src/studio/threat-model.ts";
import { xlsxOf } from "../../web/src/studio/xlsx.ts";
import type { Attempt } from "../../web/src/studio/threat-shape.ts";

const row = (o: Partial<LedgerRow> & { seq: number }): LedgerRow => ({ t: 0, run: "r1", source: null, sourceWords: null, kind: "decision", actor: "code", who: "Code", did: "checked", price: null, cents: null, why: "why", quoted: null, fenced: null, label: null, tone: "plain", eventId: null, rule: null, layer: "3", signed: false, flow: null, part: "session", id: String(o.seq), ...o }) as unknown as LedgerRow;

describe("the ledger as an audit log", () => {
  const rows = [
    row({ seq: 1, run: "a" }),
    row({ seq: 2, run: "a", actor: "paypal", did: "order created", eventId: "ORD-1" }),
    row({ seq: 3, run: "a", actor: "paypal", did: "webhook", eventId: "WH-1", signed: true }),
    row({ seq: 4, run: "b", actor: "watcher", rule: "instructs-agent, gift-card" }),
    row({ seq: 5, run: null, part: "week", source: "seeded", actor: "paypal", id: "w5" }),
    row({ seq: 6, run: "w", part: "week", actor: "watcher", rule: "gift-card", id: "w6" }),
  ];

  it("puts every row in exactly one visit, in the ledger's order", () => {
    const vs = visitsOf(rows);
    expect(vs.flatMap((v) => v.rows.map((r) => r.id)).sort()).toEqual(rows.map((r) => r.id).sort());
    expect(vs.map((v) => v.words)).toEqual(["Your visit 1", "Your visit 2", "The seeded row", "The recorded demo week"]);
  });

  it("never counts the seeded row as PayPal's", () => {
    const vs = visitsOf(rows);
    expect(vs.map((v) => v.paypal)).toEqual([2, 0, 0, 0]);
    expect(paypalInVisit(rows, rows[4]!)).toEqual([]);
  });

  it("a click opens that visit's PayPal rows, not another visit's and not the row itself", () => {
    expect(paypalInVisit(rows, rows[0]!).map((r) => r.eventId)).toEqual(["ORD-1", "WH-1"]);
    expect(paypalInVisit(rows, rows[1]!).map((r) => r.eventId)).toEqual(["WH-1"]);
    expect(paypalInVisit(rows, rows[3]!)).toEqual([]);
  });

  it("Find by rule shows every row naming it, including a row that names two", () => {
    expect(findRows(rows, "", "gift-card").map((r) => r.id)).toEqual(["4", "w6"]);
    expect(rulesOf(rows)[0]).toMatchObject({ rule: "gift-card", count: 2 });
    expect(findRows(rows, "ORD-1", null).map((r) => r.id)).toEqual(["2"]);
  });

  it("a closed visit keeps its head; a Find opens everything it found and drops the rest", () => {
    const closed = auditList(rows, new Set(["session|a"]), "", null);
    expect(closed.filter(isVisitHead)).toHaveLength(4);
    expect(closed.some((r) => r.id === "1")).toBe(false);
    const finding = auditList(rows, new Set(["session|b"]), "", "gift-card");
    expect(finding.filter((r) => !isVisitHead(r)).map((r) => r.id)).toEqual(["4", "w6"]);
    expect(finding.filter(isVisitHead)).toHaveLength(2);
  });

  it("a visit's head is never a row of the ledger", () => {
    const list = auditList(rows, new Set(), "", null);
    expect(list.filter((r) => !isVisitHead(r))).toEqual(rows);
    for (const h of list.filter(isVisitHead)) expect(h.id.startsWith("visit:")).toBe(true);
  });

  it("the streamed row's shape is what the model reads", () => {
    expect(sessionRows([]).map(streamed)).toEqual([]);
  });
});

const tries: Attempt[] = [
  { at: 240_000, verdict: "held", rule: "no-history", type: "fake-urgency", source: "person" },
  { at: 180_000, verdict: "set-aside", rule: "gift-card", type: "gift-card", source: "scammer-ai" },
  { at: 120_000, verdict: "refused", rule: "price", type: "none", source: "person" },
  { at: 60_000, verdict: "paid", rule: "your-tap", type: "none", source: "person" },
];

describe("the threat log's live rows", () => {
  const list = tryRows(tries, "real");
  it("a try at the top arrives on its own, and the rows under it are untouched", () => {
    expect(triesArrived(list.slice(1), list)?.map((r) => r.id)).toEqual([list[0]!.id]);
    expect(triesArrived(list, list)).toEqual([]);
  });
  it("anything else replaces the list: a filter, a removal, a new order", () => {
    expect(triesArrived(list, list.slice(1))).toBeNull();
    expect(triesArrived(list.slice(0, 2), list)).toBeNull();
    expect(triesArrived(list, [...list].reverse())).toBeNull();
  });
  it("the strip counts the rows it's beside", () => {
    expect(triesTotals(list)).toEqual({ aside: 2, held: 1, over: 0, cleared: 0, paid: 1 });
  });
});

describe("what a try's detail shows of the ledger", () => {
  const ledger = [row({ seq: 1, rule: "gift-card" }), row({ seq: 2, part: "week", rule: "gift-card, off-paypal", id: "w2" }), row({ seq: 3, part: "week", rule: "gift-cards", id: "w3" })];
  it("reads this side of the record only", () => {
    expect(ledgerForRule(ledger, "gift-card", "real").map((r) => r.id)).toEqual(["1"]);
    expect(ledgerForRule(ledger, "gift-card", "demo").map((r) => r.id)).toEqual(["w2"]);
  });
});

/** The stored entries of our own zip, read back by the format's own headers. */
function unzip(b: Uint8Array): Record<string, string> {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: Record<string, string> = {};
  let o = 0;
  while (v.getUint32(o, true) === 0x04034b50) {
    expect(v.getUint16(o + 8, true)).toBe(0);
    const size = v.getUint32(o + 18, true);
    const nameLen = v.getUint16(o + 26, true);
    const name = new TextDecoder().decode(b.subarray(o + 30, o + 30 + nameLen));
    out[name] = new TextDecoder().decode(b.subarray(o + 30 + nameLen, o + 30 + nameLen + size));
    o += 30 + nameLen + size;
  }
  expect(v.getUint32(o, true)).toBe(0x02014b50);
  return out;
}

describe("the Excel file", () => {
  it("says its side, holds the CSV's table, and has no formula in it", () => {
    for (const source of ["real", "demo"] as const) {
      const t = tableOf(tries, source);
      const files = unzip(xlsxOf(SIDE_FILE[source].sheet, t.head, t.rows));
      expect(files["xl/workbook.xml"]).toContain(`name="${SIDE_FILE[source].sheet}"`);
      const sheet = files["xl/worksheets/sheet1.xml"]!;
      expect(sheet).not.toContain("<f>");
      const cells = [...sheet.matchAll(/<t xml:space="preserve">([^<]*)<\/t>/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));
      expect(cells).toEqual([...t.head, ...t.rows.flat()]);
      expect(csvOf(tries, source).split("\n")[0]).toBe(t.head.join(","));
      expect(t.rows.every((r) => r[0] === (source === "demo" ? "seeded demo week" : "real"))).toBe(true);
    }
  });
  it("escapes a cell, and a leading equals sign stays text", () => {
    const sheet = unzip(xlsxOf("a/b:c", ["h"], [["=1+1 <&>"]]))["xl/worksheets/sheet1.xml"]!;
    expect(sheet).toContain("=1+1 &lt;&amp;&gt;");
    expect(sheet).not.toContain("<f>");
    expect(unzip(xlsxOf("a/b:c", ["h"], []))["xl/workbook.xml"]).toContain('name="a b c"');
  });
});
