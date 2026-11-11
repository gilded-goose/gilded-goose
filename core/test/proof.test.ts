// The Proof panel (?desk=proof; Joshua, Fri Oct 30): every figure it shows is its claims row's Value, each links to that
// row, the panel's own file types no figure, the test count stays above its row's floor, and the Toolkit list is the
// tools the code really runs. `scripts/check-claims.ts` re-reads each row's Value from its source on every check.

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DOT_ROWS, PROOF_GROUPS, TEST_ROW, anchorOf, blindDots, claimRows, countTestCases, nOf, proofGroups, runFigure, sandboxIds, testFloor, toolkitToolsCalled, webhookEvents } from "../src/proof.ts";
import { TOOLKIT_ACTIONS } from "../../trust/src/paypal.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const ROWS = claimRows(read("docs/claims.md"));
const GROUPS = proofGroups(ROWS);
const PANEL = read("web/src/Proof.tsx");
const tests = () => ["core/test", "trust/test"].flatMap((d) => readdirSync(new URL(`../../${d}/`, import.meta.url)).filter((f) => f.endsWith(".test.ts")).map((f) => read(`${d}/${f}`)));

describe("the Proof panel's figures", () => {
  it("proof_figures_are_claims_rows: each figure is its row's Value and Claim, and links to its own row by anchor", () => {
    const items = GROUPS.flatMap((g) => g.items);
    expect(items.map((i) => i.id)).toEqual(PROOF_GROUPS.flatMap((g) => [...g.ids]));
    for (const it of items) {
      const row = ROWS.find((r) => r.id === it.id)!;
      expect(it).toMatchObject({ figure: row.value, claim: row.claim, source: row.source, line: row.line, anchor: `claim-${it.id}` });
      expect(row.value).not.toBe("placeholder");
      expect(read("docs/claims.md").split("\n")[row.line - 1]).toMatch(new RegExp(`^\\| ${it.id} \\|`));
    }
    // The panel renders each figure as a link to `#<anchor>` and gives each sources row that id.
    expect(PANEL).toContain("href={`#${item.anchor}`}");
    expect(PANEL).toContain("id={anchorOf(it.id)}");
    expect(new Set(items.map((i) => anchorOf(i.id))).size).toBe(items.length);
  });

  it("the voided run says what happened, and only that run changes", () => {
    const f = (id: string, figure: string) => runFigure({ id, figure } as Parameters<typeof runFigure>[0]);
    expect(f("sandbox-void", "$0.00 captured")).toBe("$0.00 · hold voided");
    expect(f("sandbox-capture", "$50.13 captured")).toBe("$50.13 captured");
    expect(read("web/src/Proof.tsx")).toContain("<Split figure={runFigure(r)} />");
  });

  it("proof_types_no_figure: the panel's file holds no number of its own (every figure comes from a row or the build)", () => {
    const code = PANEL.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(code.match(/\$\d|\b\d+ of \d+\b|\b\d{2,}\b|\b\d+(\.\d+)? ?(tests?|tools?|webhooks?|captured)\b/g)).toBeNull();
  });

  it("proof_missing_row_fails_the_build: a missing or placeholder row throws, never an empty figure", () => {
    expect(() => proofGroups(ROWS.filter((r) => r.id !== "blind-fair"))).toThrow(/no row "blind-fair"/);
    expect(() => proofGroups(ROWS.map((r) => (r.id === "sandbox-void" ? { ...r, value: "placeholder" } : r)))).toThrow(/placeholder/);
  });

  it("proof_test_count: the build's count stays at or above the row's floor, and counts only cases that open a line", () => {
    const floor = testFloor(ROWS.find((r) => r.id === TEST_ROW)!.value);
    expect(floor).not.toBeNull();
    expect(countTestCases(tests())).toBeGreaterThanOrEqual(floor!);
    expect(countTestCases(['  it("a", () => {});', 'test.each([1])("b", () => {});', '  // it("comment"', 'const x = "it("'])).toBe(2);
    expect(testFloor("750 test cases")).toBeNull();
  });

  it("proof_toolkit_tools: the listed tools are the ones the code runs, each one turned on in TOOLKIT_ACTIONS", () => {
    const called = toolkitToolsCalled(read("trust/src/paypal.ts"));
    expect(ROWS.find((r) => r.id === "toolkit-tools")!.value).toBe(called.join(", "));
    const on: Record<string, boolean | undefined> = {
      get_order: TOOLKIT_ACTIONS.orders.get, create_refund: TOOLKIT_ACTIONS.payments.createRefund,
      create_shipment_tracking: TOOLKIT_ACTIONS.shipment.create, get_shipment_tracking: TOOLKIT_ACTIONS.shipment.get,
      list_disputes: TOOLKIT_ACTIONS.disputes.list, list_transactions: TOOLKIT_ACTIONS.transactions.list,
    };
    for (const t of called) expect([t, on[t]]).toEqual([t, true]);
    // Store Sync's last step is a name, not a Toolkit tool, and REST calls are never listed.
    expect(called).not.toContain("complete_payment");
    expect(toolkitToolsCalled('return run(make({ sandbox: true }), "list_disputes", {});\nconst x = await kit.run(name, args);')).toEqual(["list_disputes"]);
  });
});

describe("the Proof panel's pictures are drawn from the rows alone (Desk-B-5)", () => {
  const value = (id: string) => ROWS.find((r) => r.id === id)!.value;
  const claim = (id: string) => ROWS.find((r) => r.id === id)!.claim;

  it("proof_dots: each dot row's counts are its claims row's Value, and code alone's through and stopped add up to the set", () => {
    const dots = blindDots(GROUPS);
    expect(dots.map((d) => d.id)).toEqual(DOT_ROWS.map((d) => d.id));
    for (const d of dots) expect(`${d.n} of ${d.of}`).toBe(value(d.id));
    expect(dots.map((d) => [d.n, d.of])).toEqual([[19, 60], [0, 60], [0, 40]]);
    const through = nOf(value("blind-code-through"))!, stopped = nOf(value("blind-code-alone"))!;
    expect(through.of).toBe(stopped.of);
    expect(through.n + stopped.n).toBe(through.of);
    expect(nOf("at least 750 test cases")).toBeNull();
    expect(() => blindDots(proofGroups(ROWS.map((r) => (r.id === "blind-fair" ? { ...r, value: "none of forty" } : r))))).toThrow(/N of M/);
    // The panel says the test is bounded, as the rows do: it mounts Track D's dots, which carry the sentence.
    expect(PANEL).toContain("<BlindDots />");
    const dotsSrc = read("web/src/charts/BlindDots.tsx");
    expect(dotsSrc).toContain("One writer, one set");
    expect(dotsSrc.indexOf("Nov 4 set")).toBeLessThan(dotsSrc.indexOf("Oct 28 set"));
  });

  it("proof_sandbox_ids: each sandbox run's ids and date come from its own claim, and the webhook row names two events and its run", () => {
    expect(sandboxIds(claim("sandbox-capture"))).toEqual({ order: "13N827972W393402V", capture: "9TV27323LG073963D", authorization: null, date: "Oct 28" });
    expect(sandboxIds(claim("sandbox-authorize"))).toMatchObject({ order: "8HB70734L2592544S", capture: "82J89619UL0650258", date: "Oct 28" });
    expect(sandboxIds(claim("sandbox-void"))).toMatchObject({ order: "95Y9710596672060Y", authorization: "7VJ78702NE221540N", capture: null, date: "Oct 29" });
    const w = webhookEvents(claim("sandbox-webhooks"));
    expect(w).toEqual({ run: "e25d626d6420", events: ["PAYMENT.AUTHORIZATION.CREATED", "PAYMENT.CAPTURE.COMPLETED"] });
    expect(`${w.events.length} webhooks`).toBe(value("sandbox-webhooks"));
  });
});
