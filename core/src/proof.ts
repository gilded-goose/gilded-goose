// The Proof panel's data (Joshua, Fri Oct 30: "Each number links to its source in docs/claims.md. Real evidence, never
// badges or vague claims."). Nothing here holds a number: every figure the panel shows is a claims row's Value, read
// from docs/claims.md when the page is built (web/vite.config.ts), and `scripts/check-claims.ts` re-reads each Value
// from its own source on every check. The one figure that isn't a row's Value is the test count, counted from the
// test files at build; its row holds the floor that count must stay above.

/** One row of the claims table, as written. `line` is its line in docs/claims.md (1-based). */
export interface ClaimRow { id: string; claim: string; shows: string; value: string; source: string; line: number }

/** The rows between `<!-- claims:start -->` and `<!-- claims:end -->`, parsed the way `scripts/check-claims.ts` does. */
export function claimRows(md: string): ClaimRow[] {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => l.includes("<!-- claims:start -->"));
  const end = lines.findIndex((l) => l.includes("<!-- claims:end -->"));
  if (start < 0 || end < start) throw new Error("docs/claims.md: no claims markers");
  const rows: ClaimRow[] = [];
  for (let i = start + 1; i < end; i++) {
    const l = lines[i]!;
    if (!l.startsWith("| ") || l.startsWith("| id ") || l.startsWith("|---")) continue;
    const [id, claim, shows, value, source] = l.split("|").slice(1, -1).map((c) => c.trim());
    rows.push({ id: id!, claim: claim!, shows: shows!, value: value!, source: source!, line: i + 1 });
  }
  return rows;
}

/** The panel's groups, in reading order, each naming the claims rows it shows. Words only; the figures are the rows'. */
export const PROOF_GROUPS = [
  { key: "blind", title: "The blind tests", ids: ["fresh-code-through", "fresh-fair-held", "fresh-fair-refused", "fresh-reader-through", "fresh-reader-fair-refused", "fresh-reader-fair-held", "fresh-counts", "blind-code-through", "blind-reader-on", "blind-fair", "blind-fair-code-held", "blind-fair-reader-held", "blind-code-alone", "d-blind-pairs", "d-blind-bound"] },
  { key: "money", title: "Money on PayPal's sandbox", ids: ["sandbox-capture", "sandbox-authorize", "sandbox-void", "sandbox-webhooks"] },
  { key: "attacks", title: "Red team", ids: ["redteam-surfaces", "redteam-asks"] },
  { key: "code", title: "The code", ids: ["test-count", "toolkit-tools"] },
] as const;

export type ProofId = (typeof PROOF_GROUPS)[number]["ids"][number];

/** The row whose Value is a floor: the panel shows the build's own count beside it, never above the row's word. */
export const TEST_ROW = "test-count";

/** One figure on the panel: the row's Value as the figure, the row's Claim as its sentence, its Source, its anchor. */
export interface ProofItem { id: ProofId; figure: string; claim: string; source: string; line: number; anchor: string }
export interface ProofGroup { key: string; title: string; items: ProofItem[] }

/** Where each figure links: its own row in the panel's sources list, which quotes the claims row as written. */
export const anchorOf = (id: string) => `claim-${id}`;

/** The figure a money run shows. Lead-10 (Wed Nov 4): the voided run read "$0.00 captured" over "Voided hold", as if
 *  something had been captured, so it shows the row's amount and what happened. The row keeps its Value: the run log's
 *  "nothing was captured" is its evidence, and the README and Devpost quote it beside "the last after a void". */
export const runFigure = (item: Pick<ProofItem, "id" | "figure">): string =>
  item.id === "sandbox-void" ? item.figure.replace(/ captured$/, " · hold voided") : item.figure;

/** The panel's groups, every figure from its row. A missing or placeholder row throws, so the build fails, not the page. */
export function proofGroups(rows: readonly ClaimRow[]): ProofGroup[] {
  const by = new Map(rows.map((r) => [r.id, r]));
  return PROOF_GROUPS.map((g) => ({
    key: g.key, title: g.title,
    items: g.ids.map((id) => {
      const r = by.get(id);
      if (!r) throw new Error(`docs/claims.md has no row "${id}" (the Proof panel shows it)`);
      if (r.value === "placeholder") throw new Error(`docs/claims.md row "${id}" is a placeholder; the Proof panel shows only checked rows`);
      return { id, figure: r.value, claim: r.claim, source: r.source, line: r.line, anchor: anchorOf(id) };
    }),
  }));
}

/**
 * Test cases written in the code: each `it(` or `test(` that opens a line, in the given test files' text (`.skip` and `.todo` never count). A loop or a
 * template can run one case several times, so the test runner reports more; this count is the floor, never above it.
 */
export function countTestCases(sources: readonly string[]): number {
  let n = 0;
  for (const s of sources) n += (s.match(/^[ \t]*(?:it|test)(?:\.(?:each|concurrent|only)\b[^(\n]*)?\(/gm) ?? []).length;
  return n;
}

/** The floor in the test-count row's Value ("at least N test cases"), or null when it isn't worded that way. */
export function testFloor(value: string): number | null {
  const m = /^at least (\d+) test cases$/.exec(value);
  return m ? Number(m[1]) : null;
}

/**
 * The PayPal Agent Toolkit tools the code calls: every `run(<instance>, "<tool>", …)` in the one file that imports the
 * Toolkit (`trust/src/paypal.ts`), in the order they're written. A tool turned on but never run isn't listed.
 */
export function toolkitToolsCalled(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/\brun\([^,()]+(?:\([^)]*\))?[^,()]*,\s*"([a-z_]+)"/g)) if (!out.includes(m[1]!)) out.push(m[1]!);
  return out;
}

// ---------- The panel's pictures (Desk-B-5; Joshua, Fri Oct 30, PART 4.4) ----------
// Each picture is drawn from its row's Value and Claim only, so a row reworded or recounted redraws it; nothing here
// holds a number of its own. core/test/proof.test.ts checks every dot row and every id against its claims row.

/** "19 of 60" as { n: 19, of: 60 }; null when a Value isn't worded that way. */
export function nOf(value: string): { n: number; of: number } | null {
  const m = /^(\d+) of (\d+)$/.exec(value);
  return m ? { n: Number(m[1]), of: Number(m[2]) } : null;
}

/**
 * The blind test as dots (Joshua: "19 of 60 code alone, 0 of 60 with the reader, 0 of 40 fair refused, one writer, one
 * set"): one dot per note, the marked ones being what went wrong (a scam note through, a fair note refused). Each row's
 * counts are its claims row's Value. `blind-code-alone` (stopped) isn't a dot row: it is the code-alone row's other side,
 * and the test checks the two add up to the set.
 */
export const DOT_ROWS = [
  { id: "blind-code-through", label: "Code alone", marked: "got through" },
  { id: "blind-reader-on", label: "Code plus the AI reader", marked: "got through" },
  { id: "blind-fair", label: "Fair notes", marked: "wrongly refused" },
] as const satisfies readonly { id: ProofId; label: string; marked: string }[];

export interface DotRow { id: ProofId; label: string; marked: string; n: number; of: number; anchor: string }

export function blindDots(groups: readonly ProofGroup[]): DotRow[] {
  const by = new Map(groups.flatMap((g) => g.items).map((i) => [i.id, i]));
  return DOT_ROWS.map((d) => {
    const it = by.get(d.id);
    const c = it ? nOf(it.figure) : null;
    if (!it || !c) throw new Error(`the Proof panel's dots need claims row "${d.id}" worded "N of M"`);
    return { ...d, ...c, anchor: it.anchor };
  });
}

/** PayPal's ids named in a sandbox row's Claim: the order, and its capture or authorization, as PayPal printed them. */
export function sandboxIds(claim: string): { order: string | null; capture: string | null; authorization: string | null; date: string | null } {
  const id = (k: string) => new RegExp(`${k} ([0-9A-Z]{17})`).exec(claim)?.[1] ?? null;
  return { order: id("order"), capture: id("capture"), authorization: id("authorization"), date: /(Mon|Tue|Wed|Thu|Fri|Sat|Sun) ([A-Z][a-z]{2}) (\d{1,2}) (\d{4})/.exec(claim)?.slice(2, 4).join(" ") ?? null };
}

/** The webhook row's run id and PayPal event names, read from its Claim. */
export function webhookEvents(claim: string): { run: string | null; events: string[] } {
  return { run: /run ([0-9a-f]{12})/.exec(claim)?.[1] ?? null, events: [...claim.matchAll(/\b(PAYMENT\.[A-Z_.]*[A-Z])\b/g)].map((m) => m[1]!) };
}
