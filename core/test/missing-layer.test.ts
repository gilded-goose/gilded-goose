// The missing layer's words stay exactly as strong as the reading: the Lead's three limits (Joshua's update, Nov 3,
// section 2). The quotes' rows and their probes are in docs/claims.md and scripts/check-claims.ts.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AP2_NOTE, LAYER_THESIS, LEAD_GAP_WHO, FEARS, LAYER_CAVEAT, LAYER_DOC_LINE, LAYER_GOOSE, LAYER_GOOSE_HEAD, LAYER_GOOSE_REST, LAYER_HEAD, LAYER_LEDE, LAYER_QUOTES, LAYER_SOURCES, RESEARCH_NOTE, sourceOf } from "../src/view/missing-layer.ts";
import { PROMISES } from "../src/view/promises.ts";
import { layerProof } from "./promise-proof.ts";
import { NAMED_SECTION, NEVER_NAMED, competitorFails } from "../../scripts/claims-placeholders.ts";
import { brief } from "../../scripts/brief.ts";

const root = new URL("../../", import.meta.url).pathname;
const file = (p: string) => readFileSync(join(root, p), "utf8");
const walk = (d: string): string[] => readdirSync(join(root, d)).flatMap((f) => {
  const p = `${d}/${f}`;
  return statSync(join(root, p)).isDirectory() ? walk(p) : [p];
});
const ours = [LAYER_HEAD, LAYER_THESIS, LEAD_GAP_WHO, LAYER_LEDE, LAYER_GOOSE, LAYER_CAVEAT, AP2_NOTE, RESEARCH_NOTE, LAYER_DOC_LINE, ...Object.values(FEARS)];
/** Wider than the reading: "we didn't find" is all it supports. */
const TOO_WIDE = /\bnone\b|\bno one\b|\bnobody\b|\bfirst[- ]ever\b|\bthe first\b|\bonly (?:one|product|agent)\b|\bspeaks AP2\b|\bAP2[- ]compliant\b|\bprevents? prompt injection\b/i;

describe("the wording is as strong as the reading, never stronger", () => {
  it("says \"we didn't find\" where it makes the claim", () => {
    for (const l of [LAYER_LEDE, LAYER_CAVEAT, LAYER_DOC_LINE]) expect(l).toMatch(/we didn't find/);
  });
  it("the guard against wider words can fail", () => {
    for (const bad of ["none reads the seller's words", "the first ever", "AP2-compliant"]) expect(bad).toMatch(TOO_WIDE);
    expect("we didn't find").not.toMatch(TOO_WIDE);
  });
  it("our own lines never go wider", () => {
    for (const l of ours) expect(l).not.toMatch(TOO_WIDE);
    for (const s of LAYER_SOURCES) expect(s.note).not.toMatch(TOO_WIDE);
  });
  it("no surface that draws the claim says \"none reads\" or \"first ever\" as our own", () => {
    for (const f of ["README.md", "docs/devpost.md", "docs/launch/press-release.md", "docs/launch/faq.md"]) {
      expect([f, /\bnone (?:of them )?reads?\b/i.test(file(f))]).toEqual([f, false]);
      for (const m of file(f).matchAll(/first[- ]ever/gi)) expect(file(f).slice(Math.max(0, m.index - 30), m.index)).toMatch(/not\s+"?$/);
    }
  });
  it("keeps the line that it can miss a scam beside the claim", () => {
    expect(LAYER_GOOSE).toMatch(/It can miss a scam/);
    expect(LAYER_GOOSE).toMatch(/Only your tap in PayPal does/);
  });
  it("adds a layer before AP2's: it never says AP2 is wrong", () => {
    expect(AP2_NOTE).toMatch(/adds a layer before that one/);
    expect(AP2_NOTE).toMatch(/serious design/);
    expect(AP2_NOTE).not.toMatch(/\bwrong\b|\bfails?\b|\bflaw/i);
  });
});

describe("what the layer's line says the code does", () => {
  it("the guard refuses on each field the line names, with no cart to order from; a fair seller gets one", () => {
    const p = layerProof();
    for (const f of [p.note, p.merchant, p.item]) expect(f).toEqual({ kind: "refused", rule: "watcher", bound: false });
    expect(p.fair.kind).not.toBe("refused");
    expect(p.fair.bound).toBe(true);
  });
  it("says what was read: never a plural the reading doesn't back", () => {
    expect(LAYER_DOC_LINE).toContain("a card network, PayPal and two agent-payment protocols");
    expect(LAYER_DOC_LINE).not.toMatch(/networks\b/);
  });
});

describe("the sources", () => {
  it("quotes AP2 whole, at the address the Lead checked", () => {
    expect(sourceOf("ap2").quotes[0]!.text).toBe("AP2 assumes that preventing prompt injection attacks is infeasible.");
    expect(sourceOf("ap2").url).toBe("https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/security_and_privacy_considerations.md");
  });
  it("carries the research's other half", () => {
    expect(sourceOf("magentic").quotes.map((q) => q.text)).toContain("Frontier models demonstrate robust manipulation resistance.");
    expect(sourceOf("unit42").note).toMatch(/not an observed attack/);
    expect(sourceOf("scamlexity").note).toMatch(/Results varied/);
  });
  it("every source is linked, and every quote is short and has its own row", () => {
    const claims = file("docs/claims.md");
    expect(new Set(LAYER_QUOTES.map((q) => q.row)).size).toBe(LAYER_QUOTES.length);
    for (const q of LAYER_QUOTES) {
      expect(q.source.url).toMatch(/^https:\/\//);
      expect(q.text.split(/\s+/).length).toBeLessThan(15);
      expect(claims).toContain(`| ${q.row} | ${q.text} |`);
    }
  });
});

describe("a cited source is named in this one section, nowhere else", () => {
  it("the section does name them, so the gate has something to hold", () => {
    expect(file(NAMED_SECTION)).toMatch(NEVER_NAMED);
  });
  it("no other file of the app's words names one", () => {
    const files = [...walk("web/src"), ...walk("core/src/view")].filter((f) => /\.(ts|tsx|css|html)$/.test(f) && f !== NAMED_SECTION);
    expect(competitorFails(Object.fromEntries(files.map((f) => [f, file(f)])))).toEqual([]);
  });
  it("only the sources list draws a name: the heading's line and the lead quote name none (Joshua, Nov 11)", () => {
    expect(LAYER_THESIS).toBe("A yes is only safe if what you approve is exactly what you asked for.");
    expect(LAYER_LEDE.startsWith(LAYER_THESIS)).toBe(true);
    expect(competitorFails({ lede: LAYER_LEDE, who: LEAD_GAP_WHO, note: AP2_NOTE, research: RESEARCH_NOTE, goose: LAYER_GOOSE, caveat: LAYER_CAVEAT })).toEqual([]);
    const body = file("web/src/desk/story/MissingLayer.tsx");
    expect(body).toContain("<Lead source={gap} who={LEAD_GAP_WHO}");
    expect(body).toContain("quote={gap.quotes[1]!.text}"); // quotes[0] says "AP2", so it stays in the list
    expect(sourceOf("ap2").quotes[1]!.text).not.toMatch(NEVER_NAMED);
  });
  it("the press release and the FAQ name none either", () => {
    expect(competitorFails({ press: file("docs/launch/press-release.md"), faq: file("docs/launch/faq.md"), line: LAYER_DOC_LINE })).toEqual([]);
  });
});

describe("the section stands on both pages, from one body", () => {
  it("the landing and Proof mount the same words", () => {
    expect(file("web/src/desk/story/Story.tsx")).toContain("<MissingLayer />");
    expect(file("web/src/Proof.tsx")).toContain("<LayerBody open />");
    const body = file("web/src/desk/story/MissingLayer.tsx");
    expect(body).toContain('rel="noopener noreferrer"');
    expect(body).not.toMatch(NEVER_NAMED);
  });
  it("the big idea draws on its own line at the lead quotes' size, and no word changes", () => {
    expect(LAYER_GOOSE_HEAD).toBe("Goose is the missing layer.");
    expect(`${LAYER_GOOSE_HEAD} ${LAYER_GOOSE_REST}`).toBe(LAYER_GOOSE);
    expect(file("web/src/desk/story/MissingLayer.tsx")).toContain("<span className=\"ml-goose-head\">{LAYER_GOOSE_HEAD}</span> {LAYER_GOOSE_REST}");
    const css = file("web/src/desk/story/missing-layer.css");
    const size = (sel: string) => css.split("\n").find((l) => l.startsWith(sel))!.match(/font-size: ([^;]+);/)![1];
    expect(size(".ml .ml-goose-head")).toBe(size(".ml-lead blockquote"));
  });
  it("a rule on a paragraph or a link is deep enough to beat Proof's own `.pf p` and `.pf a`", () => {
    // Seen on Proof: `.ml-goose` lost its margin to `.pf p` and the line sat on the caption, while the landing looked right.
    const css = file("web/src/desk/story/missing-layer.css").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const sel of [".ml-goose", ".ml-caveat", ".ml-link", ".ml-groups p"]) {
      const rules = [...css.matchAll(/^([^{}\n]+)\{/gm)].map((m) => m[1]!.trim()).filter((r) => r.includes(sel));
      expect([sel, rules.length > 0]).toEqual([sel, true]);
      for (const r of rules.filter((x) => !x.includes(","))) expect([r, (r.match(/\.[a-z]/g) ?? []).length >= 2]).toEqual([r, true]);
    }
  });
  it("each promise answers its fear, in Joshua's words", () => {
    const his = brief(root); // his brief's public quote, held to his saved message wherever docs/inbox/ exists
    expect(PROMISES.map((p) => FEARS[p.id]).map((f) => f.replace(/\.$/, "").toLowerCase()).join(", ")).toBe("it'll get tricked, it'll overspend, i won't know what it did");
    expect(his).toContain("it'll get tricked, it'll overspend, I won't know what it did");
    expect(file("web/src/desk/story/Promises.tsx")).toContain("FEARS[p.id]");
  });
});
