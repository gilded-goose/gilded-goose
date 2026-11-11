// The Challenge's three examples, on purpose (Joshua, Nov 4, 7:10 AM, 3a), the feed under its counter (3c), the verdict brought
// into view (3b) and the fold's arrow (3e). Every round here is the real one; a fake reader stands in only where the real
// reads are checked from what they recorded (`docs/fixtures/challenge-examples-read.json`).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ATTEMPT_RULES, ATTEMPT_VERDICTS, HOLDING_RULES, JUDGE_CHIPS, answerOf, countsAsTry, demoJudgeRound, notCountedWords, parseAttempt, parseJudgeRequest, quoteNote, verdictOf, watch, type ReaderPort } from "../src/index.ts";
import { CHALLENGE_CHIPS, FEED_NOTE, THREE_LAYERS, agoWords, chipLayerWords, layerSaid, rowLayerWords, type ChallengeChip, type ChallengeLayer } from "../src/view/layers.ts";
import { sha256Hex } from "../src/sha256.ts";

const ROOT = join(import.meta.dirname, "../..");
const text = (p: string) => readFileSync(join(ROOT, p), "utf8");
const chip = (layer: ChallengeLayer) => CHALLENGE_CHIPS.find((c) => c.layer === layer)!;
const MAX = "60.00";

/** The real round. `said` is what the AI reader answers, and asking for it makes this an AI round; none is a plain-rule round. */
async function round(c: Pick<ChallengeChip, "note" | "price">, said?: { verdict: string; sign: string } | "broken") {
  const asked = parseJudgeRequest({ note: c.note, price: c.price, mode: said ? "ai" : "rule" });
  if (!asked.ok) throw new Error(asked.error);
  const reader: ReaderPort | null = said ? { name: "fake", async read() { if (said === "broken") throw new Error("down"); return said; } } : null;
  const buyer = { name: "fake", async decide() { return { type: "walk" as const, why: "No model here." }; } };
  const { events, reader: read } = await demoJudgeRound({ req: asked.value, hash: sha256Hex, now: () => 1_800_000_000_000, seed: 7, runId: "t-1", ai: said ? buyer : null, reader, aiState: said ? "on" : "off", aiName: said ? "fake" : "", where: "server" });
  const a = answerOf(events, asked.value.note, asked.value.price);
  return { ...a, read, said: (live: boolean, example: ChallengeLayer | null) => layerSaid({ verdict: a.verdict, rule: a.rule, price: c.price, max: MAX, reader: read, live, example }) };
}

describe("what holds anyway reads at least as clearly as what the Watcher caught (Joshua, Nov 4)", () => {
  const css = readFileSync(join(import.meta.dirname, "../../web/src/desk/story/challenge.css"), "utf8");
  it("the counter's second line and 'places no order' are body type, in ink, wherever the Challenge shows them", () => {
    for (const rule of ["ds-ch-second", "ds-ch-noorder"]) {
      const body = css.match(new RegExp(`\\.ds-ch \\.${rule} \\{([^}]*)\\}`))?.[1] ?? "";
      expect(body, rule).toMatch(/color: var\(--ink\);/);
      expect(body, rule).toMatch(/font-size: var\(--t-body\);/);
    }
  });
});

describe("the three examples each show their layer, from the round's own answer", () => {
  it("there are three, one per layer, in Joshua's order, and each is ours: never on the count", () => {
    expect(CHALLENGE_CHIPS.map((c) => c.layer)).toEqual(["code", "reader", "limit"]);
    for (const c of CHALLENGE_CHIPS) {
      expect(countsAsTry(c.note), c.note).toBe(false);
      expect(notCountedWords(c.note), c.note).toMatch(/ready-made/);
    }
  });

  it("plain code: the gift-card ask is set aside on its words alone, whatever the reader says", async () => {
    for (const said of [undefined, { verdict: "clear", sign: "other" }, { verdict: "refuse", sign: "gift-card" }, "broken"] as const) {
      const r = await round(chip("code"), said);
      expect([r.verdict, r.rule, r.type]).toEqual(["set-aside", "gift-card", "gift-card"]);
      expect(r.said(said !== undefined, "code")).toBe("The plain code, on these words alone. No AI was needed.");
    }
  });

  it("AI reader only: code finds nothing in the words, the reader holds it, and the verdict says the reader alone", async () => {
    const c = chip("reader");
    expect(verdictOf(watch({ quoted: quoteNote(c.note), history: 150 }))).toBe("clear");
    const r = await round(c, { verdict: "refuse", sign: "off-paypal" });
    expect([r.verdict, r.rule, r.type]).toEqual(["held", "ai-reader", "pay-off-site"]);
    expect(r.said(true, "reader")).toMatch(/^The AI reader alone\./);
  });

  it("AI reader only: proven on real reads, and a changed note fails until it's read again", () => {
    const real = JSON.parse(text("docs/fixtures/challenge-examples-read.json")) as { model: string; examples: Array<{ layer: ChallengeLayer; note: string; price: string; runs: number; tally: Record<string, number> }> };
    expect(real.examples.map((e) => [e.layer, e.note, e.price])).toEqual(CHALLENGE_CHIPS.map((c) => [c.layer, c.note, c.price]));
    const of = (l: ChallengeLayer) => real.examples.find((e) => e.layer === l)!;
    expect(of("reader").runs).toBeGreaterThanOrEqual(30);
    expect(of("reader").tally).toEqual({ "held/ai-reader/pay-off-site/read": of("reader").runs });
    expect(of("code").tally).toEqual({ "set-aside/gift-card/gift-card/read": of("code").runs });
    expect(of("limit").tally).toEqual({ "set-aside/instructs-agent/hidden-instructions/read": of("limit").runs });
  });

  it("the AI-reader example never claims the reader when it didn't read: the mirror, a cap, a model that's down, a model that says clear", async () => {
    const c = chip("reader");
    const browser = await round(c);
    expect(browser.verdict).toBe("held");
    const mirror = browser.said(false, "reader")!;
    expect(mirror).toMatch(/only runs in live mode/);
    expect(mirror).not.toMatch(/AI reader alone|(?<!not )caught/i);
    const capped = browser.said(true, "reader")!;
    expect(capped).toMatch(/didn't read it this round/);
    const down = await round(c, "broken");
    expect(down.read).toBe("error");
    expect(down.said(true, "reader")).toMatch(/didn't read it this round/);
    const clear = await round(c, { verdict: "clear", sign: "other" });
    expect(clear.said(true, "reader")).toBe("Not caught, by the plain code or the AI reader.");
    // And the chip itself says so before it's pressed.
    expect(chipLayerWords("reader", "on")).toBe("AI reader");
    expect(chipLayerWords("reader", "away")).toBe("AI reader, live only");
    expect(chipLayerWords("reader", "rested")).toBe("Goose's AI reader: off");
    for (const s of ["on", "away", "rested"] as const) { expect(chipLayerWords("code", s)).toBe("Plain code"); expect(chipLayerWords("limit", s)).toBe("Limit in code"); }
  });

  it("the limit: SYSTEM $500 names the limit first, and says the plain code caught its words too, because both did", async () => {
    const c = chip("limit");
    expect(c.note).toBe(JUDGE_CHIPS[0]!.note);
    for (const said of [undefined, { verdict: "refuse", sign: "instructs-agent" }] as const) {
      const r = await round(c, said);
      expect([r.verdict, r.rule]).toEqual(["set-aside", "instructs-agent"]);
      expect(r.said(said !== undefined, "limit")).toBe("The limit in code. $500.00 is over your $60.00 max, and no note can move it. The plain code caught its words too.");
    }
    // A fair note over the limit is the limit alone: it says nothing of the words.
    const fair = await round({ note: "Ships in 2 days.", price: "500.00" });
    expect([fair.verdict, fair.rule]).toEqual(["refused", "max"]);
    expect(fair.said(true, null)).toBe("The limit in code. $500.00 is over your $60.00 max, and no note can move it.");
  });

  it("what Joshua saw: a note code only held, raised by the reader, names both", async () => {
    const r = await round({ note: "$19, gift card, now", price: "19.00" }, { verdict: "refuse", sign: "gift-card" });
    if (r.verdict === "set-aside" && HOLDING_RULES.has(r.rule as never)) expect(r.said(true, null)).toBe("The plain code held it on these words, and the AI reader raised it to set aside.");
    else expect(r.said(true, null)).toBe("The plain code, on these words alone. No AI was needed."); // Track S's rule made it an act
  });

  it("a note nothing caught, and a round that paid", async () => {
    const r = await round({ note: "Ships in 2 days.", price: "19.00" });
    expect(r.said(false, null)).toBe("Not caught by the plain code. The AI reader only runs in live mode.");
    expect(layerSaid({ verdict: "paid", rule: "money-moved", price: "19.00", max: MAX, reader: "read", live: true, example: null })).toBeNull();
  });
});

describe("the feed's layer, from a row's closed fields", () => {
  it("knows the Watcher's holding rules exactly", () => {
    const raised = ATTEMPT_RULES.filter((r) => rowLayerWords("set-aside", r) === "Code and AI reader");
    expect(new Set(raised)).toEqual(new Set([...HOLDING_RULES]));
  });

  it("names something for every verdict and rule, and only from its own short list", () => {
    const words = new Set(ATTEMPT_VERDICTS.flatMap((v) => ATTEMPT_RULES.map((r) => rowLayerWords(v, r))));
    expect(words).toEqual(new Set(["Nothing stopped it", "Limit in code", "Plain code", "Code and AI reader", "AI reader", "Your tap"]));
  });

  it("reads the rows the examples leave", () => {
    expect(rowLayerWords("set-aside", "gift-card")).toBe("Plain code");
    expect(rowLayerWords("held", "ai-reader")).toBe("AI reader");
    expect(rowLayerWords("refused", "max")).toBe("Limit in code");
    expect(rowLayerWords("held", "no-history")).toBe("Your tap");
    expect(rowLayerWords("held", "mentions-gift-card")).toBe("Plain code");
  });

  it("the time, to the minute", () => {
    const now = 1_800_000_000_000;
    expect(agoWords(now, now)).toBe("just now");
    expect(agoWords(now - 59_000, now)).toBe("just now");
    expect(agoWords(now - 60_000, now)).toBe("1 min ago");
    expect(agoWords(now - 59 * 60_000, now)).toBe("59 min ago");
    expect(agoWords(now - 60 * 60_000, now)).toBe("1 h ago");
    expect(agoWords(now - 25 * 3_600_000, now)).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });

  it("never anyone's words: the row is parsed down to closed lists, and the feed reads nothing else", () => {
    const row = parseAttempt({ at: 60_000, verdict: "held", rule: "ai-reader", type: "none", source: "person", note: "my secret words", words: "my secret words" });
    expect(JSON.stringify(row)).not.toContain("secret");
    const feed = text("web/src/desk/story/ChallengeFeed.tsx");
    expect(feed).toContain("readBoard(await r.json())");
    expect(feed).not.toMatch(/\.note\b|\.quoted|\.why\b|dangerouslySetInnerHTML/);
    expect(FEED_NOTE).toContain("Never anyone's words.");
  });

  it("the feed stays out of the first paint, and asks only when it's live and near", () => {
    expect(text("web/src/desk/story/TrickSlot.tsx")).toMatch(/import\.meta\.glob<[^>]+>?>\("\.\/Challenge\.tsx"\)/);
    expect(text("web/src/ledger/first-paint.tsx")).not.toContain("ChallengeFeed");
    expect(text("web/prerender.ts")).not.toContain("ChallengeFeed");
    const feed = text("web/src/desk/story/ChallengeFeed.tsx");
    expect(feed).toContain("if (!live || !near) return;");
    expect(feed).toContain("if (document.hidden) return;");
  });

  it("at zero tries, the three layers", () => {
    expect(THREE_LAYERS.map((l) => l.key)).toEqual(["code", "reader", "limit"]);
    expect(text("web/src/desk/story/ChallengeFeed.tsx")).toContain("!rows || rows.length === 0");
  });
});

describe("an example tap never counts as a try", () => {
  for (const c of CHALLENGE_CHIPS) it(`${c.layer}: "${c.label}"`, () => {
    expect(countsAsTry(c.note)).toBe(false);
    // However it's retyped: the same words in other case and spacing are still ours.
    expect(countsAsTry(`  ${c.note.toUpperCase()}  `)).toBe(false);
    // And a real note built on it counts.
    expect(countsAsTry(`${c.note} and more`)).toBe(true);
  });
});

describe("the block's behavior", () => {
  const block = text("web/src/desk/story/Challenge.tsx");
  const sheet = text("web/src/desk/story/challenge.css");

  it("brings the verdict up after a round: smooth, instant with reduced motion, and focus moves first with no jump", () => {
    expect(block).toContain('r.focus({ preventScroll: true });');
    // In an effect on the answer's count: from a frame after a reply, it could run before React drew the verdict, and focus nothing.
    expect(block).toMatch(/useEffect\(\(\) => \{\s+if \(nth === 0\) return;[\s\S]*?r\.focus\([\s\S]*?\}, \[nth\]\);/);
    expect(block).not.toContain("requestAnimationFrame");
    expect(block).toContain('behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start"');
    expect(block).toMatch(/className="ds-ch-verdict" tabIndex=\{-1\}/);
    expect(sheet).toMatch(/\.ds-ch-verdict \{[^}]*scroll-margin-top/);
    // Focus reads it; a live region around it would read it twice.
    expect(block).not.toMatch(/ds-ch-result"[^>]*aria-live/);
  });

  it("every fold in the block has a visible arrow that turns", () => {
    for (const summary of block.match(/<summary>.*?<\/summary>/g)!) expect(summary).toContain('<span aria-hidden="true">›</span>');
    expect(block.match(/<summary>/g)).toHaveLength(2);
    expect(sheet).toMatch(/\.ds-ch-fold\[open\] summary span \{ transform: rotate\(90deg\); \}/);
  });

  it("says the browser's round has no AI reader, wherever it says what ran", () => {
    expect(block).not.toContain("the same checks");
    expect(block.match(/\$\{IN_BROWSER_RUNS\}/g)).toHaveLength(2);
  });

  it("the chips read the three examples, and the classic pages keep their own, every one caught by code", () => {
    expect(block).toContain("CHALLENGE_CHIPS.map(");
    expect(block).not.toContain("JUDGE_CHIPS");
    expect(JUDGE_CHIPS.map((c) => c.note)).not.toContain(chip("reader").note);
  });
});
