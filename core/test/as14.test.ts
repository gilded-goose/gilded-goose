// AS-14 (the Design Director's AS-13 ruling, required changes): the AI cap's quiet line is one sentence, the cause only,
// the same on the capped 200 and the 429; gold on the Studio page marks only the limit line and the deal (never a hover,
// never the Edit toggle); the phone breakpoint is one value the lede and the Edit switch both read; the Watcher's why
// is shown as the source writes it (POL-3 put the one verb there), with no rewrite left in Studio.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RULE_NAME, VIEW_CAPPED, VIEW_TOOLS, viewHandler, type ViewLlm, type ViewTurn } from "../../server/src/view.ts";
import { PAGE_RULE_LABEL, PAGE_RULE_NOTE } from "../../web/src/studio/rule.ts";
import { PHONE } from "../../web/src/studio/words.ts";
import { watchWhy } from "../../trust/src/watch.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

type Context = Parameters<ReturnType<typeof viewHandler>>[0];
const ctx = (json: unknown): Context => ({
  req: { header: (n: string) => (n.toLowerCase() === "content-type" ? "application/json" : undefined), json: async () => json },
  json: (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } }),
  text: (t: string, status = 200) => new Response(t, { status }),
} as unknown as Context);
const ask = { input: [{ type: "message", role: "user", content: [{ type: "text", text: "what did Goose block?" }] }], tools: VIEW_TOOLS.map((name) => ({ name })) };
const model: ViewLlm = { name: "stand-in", async turn(): Promise<ViewTurn> { throw new Error("the model is never reached past the cap"); } };

describe("AS-14 item 1: one quiet line for the spent AI cap, the same on both paths", () => {
  it("cap_line_is_the_cause_only: the DD's exact sentence, one sentence, never what the answer's label already says", () => {
    expect(VIEW_CAPPED).toBe("Today's AI view-building from here is used up.");
    expect(VIEW_CAPPED.match(/[.!?](\s|$)/g)).toHaveLength(1);
    expect(VIEW_CAPPED).not.toMatch(/rule|nothing|changed|added|still works|on the server/i);
    expect(PAGE_RULE_LABEL).toBe("No AI call: a fixed rule read your words."); // the label that says the rest
  });

  it("page_note_is_the_cause_only: the no-answer note is one sentence too (DD AS-14 (b), system.md §8)", () => {
    expect(PAGE_RULE_NOTE).toBe("Goose's server didn't answer.");
    expect(PAGE_RULE_NOTE.match(/[.!?](\s|$)/g)).toHaveLength(1);
    expect(PAGE_RULE_NOTE).not.toMatch(/rule|nothing|changed|added/i);
  });

  it("cap_line_same_on_200_and_429: the capped 200's note and the 429's error are the same string", async () => {
    const who = () => ({ token: "a", ip: "net" }), ownPage = () => null;
    const r200 = await viewHandler({ llm: () => model, live: { takeOrWhy: () => "global" }, rule: { takeOrWhy: () => null }, who, ownPage })(ctx(ask));
    const b200 = (await r200.json()) as { model: string; note?: string };
    expect([r200.status, b200.model, b200.note]).toEqual([200, RULE_NAME, VIEW_CAPPED]);
    const r429 = await viewHandler({ llm: () => model, live: { takeOrWhy: () => "global" }, rule: { takeOrWhy: () => "ip" }, who, ownPage })(ctx(ask));
    expect([r429.status, ((await r429.json()) as { error: string }).error]).toEqual([429, VIEW_CAPPED]);
    // The page shows the server's sentence on both (the 429's `error` becomes the note for the rest of the page's asks).
    const ai = read("web/src/studio/ai.ts");
    expect(ai).toMatch(/if \(r\.status === 429\) \{ pageOnly = error \|\| PAGE_RULE_NOTE; viewNote\.text = pageOnly;/);
    expect(ai).toMatch(/if \(typeof body\.note === "string" && body\.note\) viewNote\.text = body\.note;/);
    expect(read("server/src/view.ts")).not.toMatch(/VIEW_RULE_NOTE|used up on the server|so a fixed rule answered/);
  });
});

describe("AS-14 item 2: gold marks only the limit line and the deal", () => {
  const css = read("web/src/studio/studio.css");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.replace(/\/\*[\s\S]*?\*\//g, "").trim(), body: m[2]! }));

  it("no_gold_hover_or_toggle: every rule that paints --lx-gold is the limit line or the deal's dot", () => {
    const gold = rules.filter((r) => r.body.includes("--lx-gold")).map((r) => r.sel);
    expect(gold).toEqual([".st-sw-limit", ".st-dot"]);
    for (const r of rules.filter((x) => /:hover/.test(x.sel))) expect(r.body, r.sel).not.toMatch(/gold/);
  });

  it("hover_goes_to_ink: a ledger row's Who/Did and a PayPal row's figure turn --lx-ink; the pressed Edit switch is an ink border and ink text", () => {
    const body = (sel: string) => rules.find((r) => r.sel === sel)?.body ?? "";
    expect(body(".st-row:hover .st-row-who, .st-row:hover .st-row-did, .st-row:hover .st-row-why")).toMatch(/color: var\(--lx-ink\);/);
    expect(body(".st-proof-row:hover .st-row-did, .st-proof-row:hover .st-proof-fig")).toMatch(/color: var\(--lx-ink\);/);
    expect(body('.st-switch[aria-pressed="true"]')).toMatch(/border-color: var\(--lx-ink\); color: var\(--lx-ink\);/);
  });
});

describe("AS-14 item 3: the phone breakpoint is one value", () => {
  it("one_phone_query: studio.css has one width query, PHONE's, and it holds both the Edit switch's hiding and the lede's swap", () => {
    expect(PHONE).toBe("(max-width: 767px)");
    const css = read("web/src/studio/studio.css");
    const widths = [...css.matchAll(/@media \(((?:max|min)-width:[^)]*)\)/g)].map((m) => `(${m[1]})`);
    expect(widths).toEqual([PHONE]);
    const phone = css.slice(css.indexOf(`@media ${PHONE} {`));
    const block = phone.slice(0, phone.indexOf("\n}"));
    expect(block).toMatch(/\.st-switch \{ display: none; \}/);
    expect(block).toMatch(/\.st-lede-wide \{ display: none; \}/);
    expect(block).toMatch(/\.st-lede-phone \{ display: inline; \}/);
    expect(css).toMatch(/\.st-lede \{[^}]*text-wrap: pretty;/); // the DD's optional: no lone "screen." at 390
    for (const f of ["web/src/studio/Shell.tsx", "web/src/studio/Studio.tsx"]) {
      const src = read(f);
      expect(src, f).not.toMatch(/76[78]px/); // the 720 px placeholder swap is the field's own, not this one
      expect(src, f).toMatch(/import \{[^}]*\bPHONE\b[^}]*\} from "\.\/words\.ts";/);
      expect(src, f).toMatch(/matchMedia\(PHONE\)/);
    }
  });
});

describe("AS-14 item 4: the Watcher's why as the source writes it", () => {
  it("no_why_rewrite: Studio shows the row's why unchanged; the source already says the one verb", () => {
    expect(watchWhy("QuickQuack Deals", [{ rule: "gift-card", severity: "refuse", said: "it asks to be paid by gift card" }] as never)).toBe("Watcher set QuickQuack Deals aside: it asks to be paid by gift card.");
    for (const f of ["web/src/studio/data.ts", "web/src/studio/widgets/index.tsx"]) expect(read(f), f).not.toMatch(/setAsideWhy|Watcher refused/);
  });
});
