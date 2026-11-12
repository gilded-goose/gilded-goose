// Item 10 (021 §4; restart notes §22, §24A; 018 N27; 019 §5): voice gets you to the last step, and only your tap signs it.
// "Buy this right now" prepares (starts the run, says the cart, brings its card forward); "not this one" sets it aside,
// even while Goose haggles; a spoken yes gets "Tap Approve to buy."; nothing from the Ask box reaches Approve, and no
// handler or effect but Approve's own click can press it. Speak-back: median 3 s or less, cart lines about 4.3 s, measured.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TAP_TO_BUY } from "../src/ask/copy.ts";
import { askInBrowser } from "../src/ask/ask.ts";
import { cartSaid, spokenStore, spokenUsd, voiceIntent } from "../src/ask/voice.ts";
import { toCents } from "../src/money.ts";
import { spokenLines } from "./spoken-lines.ts";

const web = (f: string) => readFileSync(new URL(`../../web/src/${f}`, import.meta.url), "utf8");
/** A function's body in a source file, from its declaration to the first line that closes it at its own indent. */
function body(src: string, decl: string): string {
  const at = src.indexOf(decl);
  if (at < 0) throw new Error(`${decl} not found`);
  const indent = src.slice(src.lastIndexOf("\n", at) + 1, at);
  const end = src.indexOf(`\n${indent}}\n`, at);
  return src.slice(at, end < 0 ? undefined : end);
}

const YESES = ["yes", "Yes.", "yes, buy it", "Yes buy it", "yeah", "ok approve", "okay", "sure, go ahead and pay", "approve", "confirm", "pay", "do it"];
const BUY_NOW = ["Hey Goose, buy this right now", "buy this right now", "Buy it now.", "buy it", "get me one now", "OK Goose, order the kettle now!", "please buy that now", "buy this one now"];
// Code review of item 10: the ways people say no, dictation's own punctuation included (shared Lessons 35, 89).
const DECLINES = ["no", "No.", "Nope, thanks.", "not this one", "No, not that one.", "cancel", "cancel the order", "don't buy it", "Don’t buy that.", "do not buy", "never mind", "Hey Goose, skip it.",
  "No. Not this one.", "No, thanks. Not that one", "nah, not this one", "Never mind, don't buy it", "don't buy it now", "cancel that order please", "stop", "wait", "not now", "no no no", "decline", "I changed my mind"];
// Not commands: they go to the Ask route as before. "no more than $60" is a limit, never a "no"; a buy that names an
// item or a number is an ask, never a run of the kettle at the Max field's price (code review of item 10).
const NEITHER = ["a black kettle like mine", "no more than $60", "no lid kettle", "not too pricey", "cancel my limit", "what should I buy now?", "buy a kettle under $60", "I saw it for $55", "now", "wait, a black kettle like mine",
  "buy a laptop now", "buy a toaster now", "get me a kettle under 40 now", "buy one under 30 bucks now", "order a 500 dollar kettle now", "buy a black kettle now"];

describe("item 10: voice prepares, only the tap pays", () => {
  it("spoken_yes_never_reaches_approve (018 N27, W49a): a yes is answered \"Tap Approve to buy.\" by the Ask rule, and nothing on the page can press Approve but the tap", async () => {
    for (const w of YESES) {
      expect([w, voiceIntent(w)]).toEqual([w, null]);
      expect([w, (await askInBrowser(w)).speak]).toEqual([w, TAP_TO_BUY]);
    }
    expect(TAP_TO_BUY).not.toMatch(/\?/);
    const app = web("App.tsx");
    // One request makes PayPal's order, inside Approve's own press, and press runs only from the button's click.
    expect(app.match(/\/approve`/g)).toHaveLength(1);
    const approve = body(app, "function Approve(");
    expect(approve).toContain("/approve`");
    expect(approve.match(/\{press\}/g)).toEqual(["{press}"]);
    expect(approve).toContain("onClick={press}");
    // Code review of item 10: inside Approve, no other handler (a press on focus) and no effect, and press is only declared.
    expect(approve.match(/\bon[A-Z]\w*=/g)).toEqual(["onClick="]);
    expect(approve.match(/\bpress\s*\(/g)).toEqual(["press("]);
    expect(approve).toMatch(/async function press\(\)/);
    expect(approve).not.toMatch(/use(?:Layout)?Effect/);
    // Outside Approve, nothing calls or passes its press.
    expect(app.replace(approve, "")).not.toMatch(/\bpress\s*\(|\{press\}/);
    // Nothing clicks a control for the shopper, and nothing reaches Approve: the voice path focuses the cart's card.
    for (const f of ["App.tsx", "AskGoose.tsx", "speech.ts"]) expect([f, /\.click\(|dispatchEvent|\/approve|location\.assign|getElementById\("approve"\)/.test(f === "App.tsx" ? app.replace(body(app, "function Approve("), "") : web(f))]).toEqual([f, false]);
    const toCart = body(app, "function toCart(");
    expect(toCart).toMatch(/getElementById\("cart"\)[\s\S]*\.focus\(/);
    // After a wait, never out of a field the shopper is typing in.
    expect(toCart).toMatch(/if \(late && [^\n]*INPUT\|TEXTAREA[^\n]*\) return;/);
    // N27's control: a "no" does end the cart.
    expect(voiceIntent("not this one")).toBe("decline");
  });

  it("buy_now_by_voice_prepares_but_never_approves (restart notes §24A): it starts the run or says the waiting cart and brings Approve forward; never more", () => {
    for (const w of BUY_NOW) expect([w, voiceIntent(w)]).toEqual([w, "buy-now"]);
    for (const w of DECLINES) expect([w, voiceIntent(w)]).toEqual([w, "decline"]);
    for (const w of NEITHER) expect([w, voiceIntent(w)]).toEqual([w, null]);
    const app = web("App.tsx");
    const voice = body(app, "function voice(");
    expect(voice).toContain("void start(true);");
    expect(voice).toContain("toCart();");
    expect(voice).toContain("setAsideOn(run!)");
    // 025: setting aside tells the server "no" (its aside route) and never reaches Approve.
    const setAside = body(app, "function setAsideOn(");
    expect(setAside).toContain("setDeclined(r.id)");
    expect(setAside).toContain("keepAside(r.id, false)");
    expect(setAside).not.toMatch(/press|approve|\.click\(|location/);
    expect(voice).not.toMatch(/press|approve`|\.click\(|location/);
    // A "no" while Goose haggles is kept, not lost (code review of item 10, shared Lesson 35): the coming cart is set aside.
    expect(voice).toMatch(/if \(busy\) \{ asideNext\.current = true; voiced\.current = null; return said\(\{ text: VOICE_ASIDE_SOON \}\); \}/);
    // The run it started is said back once code ends it: its cart and the tap, never a press; the one set aside never is.
    const at = app.indexOf("useEffect(() => {\n    if (!run?.done) return;");
    const said = app.slice(at, app.indexOf("\n  }, [", at));
    expect(said.length).toBeGreaterThan(40);
    const aside = said.slice(0, said.indexOf("return;\n    }"));
    expect(aside).toContain("if (asideNext.current) {");
    expect(aside).toContain("setAsideOn(run)");
    expect(aside).not.toContain("cartSaid");
    expect(said).toContain("if (voiced.current !== run.id) return;");
    expect(said).toContain("say(cartSaid(run.bound, canPay(run)));");
    expect(said).not.toMatch(/press|approve`|\.click\(/);
    // Tied to the run: Go's click is never a voiced start, and a run that failed is never said later.
    expect(app).toContain("onClick={() => void start()}");
    // No handler is handed start itself: a click's event would arrive as a truthy byVoice (Lead-3: the full-screen
    // ledger's "Go find it" was said back as a voice run).
    expect(app).not.toMatch(/=\{start\}/);
    expect(app).toContain("if (error) { voiced.current = null;");
    // Set aside on this page only: the strip is rows only and never says it (PROFILE: strip == fold(ledger)).
    expect(body(app, "function Strip(")).not.toMatch(/declined/);
    // A command never goes to the Ask route: the page answers it before any request.
    const ask = web("AskGoose.tsx");
    const call = ask.indexOf("onVoice(intent);\n      if (intent) return;");
    expect(call).toBeGreaterThan(0);
    expect(call).toBeLessThan(ask.indexOf("await read(asked)"));
    // The cart said back: its price to the cent and its store, then the tap, or that this page can't pay.
    expect(cartSaid({ merchant: "Reedbank Outfitters (fictional)", total: "47.73" }, true)).toBe("$47.73 at Reedbank. Tap Approve to buy.");
    expect(cartSaid({ merchant: "Reedbank Outfitters (fictional)", total: "47.73" }, false)).toBe("$47.73 at Reedbank. Nothing to pay here.");
    expect([spokenUsd(toCents("55.00")), spokenUsd(toCents("7.27")), spokenStore("Pondside Goods (fictional)")]).toEqual(["$55", "$7.27", "Pondside"]);
  });

  it("speak_back_about_3_s (the iPhone test's 6.4 s): every line said back is measured (a Mac voice estimate, calibrated to desktop Chrome), median 3 s or less, none over 4.5 s, a cart said back about 4.3 s", async () => {
    const f = JSON.parse(readFileSync(new URL("../../docs/fixtures/speak-times.json", import.meta.url), "utf8")) as { voice: string; rate: number; calibration: { say: number; chrome: number }; lines: Record<string, number> };
    expect([f.voice, f.rate]).toEqual(["Samantha", 1.05]);
    expect(Math.abs(f.calibration.say - f.calibration.chrome)).toBeLessThanOrEqual(0.4);
    const lines = await spokenLines();
    // A line reworded without re-measuring (`corepack pnpm speak:times`) fails here.
    for (const l of lines) expect([l, l in f.lines]).toEqual([l, true]);
    const secs = lines.map((l) => f.lines[l]!).sort((a, b) => a - b);
    expect(secs[Math.floor(secs.length / 2)]).toBeLessThanOrEqual(3);
    for (const l of lines) expect([l, f.lines[l]! <= 4.5]).toEqual([l, true]);
    // Its own budget for the cart said back (code review: the median passing on short lines hid it): to the cent, 4.4 s.
    const carts = lines.filter((l) => /^\$\d/.test(l) && / at \w+\. /.test(l));
    expect(carts.length).toBeGreaterThanOrEqual(4);
    for (const l of carts) expect([l, f.lines[l]! <= 4.4]).toEqual([l, true]);
  });
});
