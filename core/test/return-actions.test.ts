// Back from PayPal, a card may name only what its own screen lets you do, or a real place outside it (C's steps 4–5 walk,
// Nov 6: the Desk's Cancel card said "this cart stays open until its approval runs out", and the Desk's return card draws no
// Approve). Each screen's controls are read from its own source, so adding or removing a control changes the answer here.
// The same walk found "the exact cart you approved" on a Cancel: the trail's cart row says "approved" only with PayPal's OK.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CART_GONE } from "../src/view/desk.ts";
import { RETURN_CANCELLED } from "../src/view/return.ts";
import { TRAIL_WORDS, payAhead, payTrail, stepsAhead } from "../src/view/trail.ts";
import { RETURN_WORDS } from "../src/view/wallet.ts";
import { PAID_ELSEWHERE } from "../../web/src/states/words.ts";

const src = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
const block = (text: string, from: string, to: string) => {
  const i = text.indexOf(from), j = i < 0 ? -1 : text.indexOf(to, i + from.length);
  if (i < 0 || j < 0) throw new Error(`the block from \`${from}\` to \`${to}\` is gone: point this test at where the return card is drawn now`);
  return text.slice(i, j + to.length);
};
// Every sentence-like string literal in a source: a new return line is covered the day it's written, without a list here.
// Line by line, comment lines skipped: quoted words in a comment would pair quotes across the whole file.
const literals = (text: string) => text.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.replace(/\{\/\*.*?\*\/\}/g, ""))
  .flatMap((l) => [...l.matchAll(/"([A-Z][^"]{11,})"/g)].map((m) => m[1]!)).filter((s) => /\s/.test(s));
const flat = (o: unknown): string[] => (typeof o === "string" ? [o] : o && typeof o === "object" ? Object.values(o).flatMap(flat) : []);

// The three screens a PayPal return lands on, cut to the card that draws the return's words and what sits beside it.
const desk = block(src("web/src/desk/Desk.tsx"), '{view === "back" && (', "</article>");
const wallet = block(src("web/src/Wallet.tsx"), '<div className="acts">', "</div>");
const classic = block(src("web/src/App.tsx"), '<div id="cart"', "</div>\n  );");
const walletPage = src("web/src/Wallet.tsx");

type Screen = "desk" | "wallet" | "classic";
/** What each screen draws, from its source. `place` is somewhere the shopper can go from that screen. */
const DRAWS: Record<string, Record<Screen, boolean>> = {
  approve: { desk: /<Approve\b|<HeroApprove\b|approveUrl/.test(desk), wallet: /<HeroApprove\b/.test(wallet), classic: /<Approve\b|href=\{run\.approveUrl\}/.test(classic) },
  undo: { desk: /<AfterPay\b/.test(desk), wallet: /<HeroWrong\b|<HeroPaid\b/.test(wallet), classic: /\bUndo\b/.test(classic) },
  behind: { desk: /desk=ledger/.test(desk), wallet: /desk=ledger/.test(walletPage), classic: /desk=ledger/.test(classic) },
  week: { desk: false, wallet: /"Your week"|>Your week</.test(walletPage), classic: false },
};

/** Words that ask the reader to do something, and the control or place each needs. PayPal and its activity page are real places. */
const ASKS: { said: RegExp; needs: keyof typeof DRAWS | "outside" }[] = [
  { said: /\bstays? open\b|\buntil its approval\b|\bapprov\w* (it |this )?again\b|\byou can (still )?approve\b/i, needs: "approve" },
  { said: /\bUndo\b/, needs: "undo" },
  { said: /\bBehind the scenes\b/, needs: "behind" },
  { said: /\bYour week\b/, needs: "week" },
  { said: /\bCheck (your payment activity|this order in PayPal)\b/, needs: "outside" },
];
/** Any other ask in a return line fails until it's listed above with what draws it. */
const ASKING = /\b(Tap|Press|Open|Check|Go to|Scroll|Try again|Undo|until|stays? open|you can)\b/;

function unbacked(words: readonly string[], screen: Screen): string[] {
  const out: string[] = [];
  for (const w of words) {
    const hits = ASKS.filter((a) => a.said.test(w));
    if (ASKING.test(w) && hits.length === 0) out.push(`${screen}: "${w}" asks for something this test doesn't know`);
    for (const a of hits) if (a.needs !== "outside" && !DRAWS[a.needs]![screen]) out.push(`${screen}: "${w}" names ${a.needs}, which this screen doesn't draw`);
  }
  return out;
}

const returnLines = literals(src("core/src/view/return.ts"));
const SCREENS: Record<Screen, string[]> = {
  // The Desk's return card: the server's card (return.ts), its own lines, the trail under it.
  desk: [...returnLines, ...literals(desk), CART_GONE.title, CART_GONE.line, PAID_ELSEWHERE, ...flat(TRAIL_WORDS)],
  wallet: [...flat(RETURN_WORDS), ...returnLines],
  classic: [...returnLines],
};

describe("return cards name only what their screen draws", () => {
  it("reads each screen's controls from its source (controls)", () => {
    expect(DRAWS.approve).toEqual({ desk: false, wallet: true, classic: true });
    expect(DRAWS.undo!.desk && DRAWS.undo!.wallet).toBe(true);
    expect(DRAWS.behind!.desk).toBe(true);
    expect(DRAWS.week!.wallet).toBe(true);
    expect(returnLines).toContain(RETURN_CANCELLED);
    expect(SCREENS.desk.length).toBeGreaterThan(30);
  });

  it("every return line on every screen names a control drawn there, or a real place outside it", () => {
    expect(Object.entries(SCREENS).flatMap(([s, w]) => unbacked(w, s as Screen))).toEqual([]);
  });

  it("fails the old Cancel line on the Desk, and would pass it where Approve is drawn (mutant)", () => {
    const old = "Cancel was pressed in PayPal. Not paid so far; this cart stays open until its approval runs out.";
    expect(unbacked([old], "desk")).toHaveLength(1);
    expect(unbacked([old], "wallet")).toEqual([]);
    expect(unbacked(["Tap Approve again below."], "desk")).toHaveLength(1);
  });

  it("the Cancel line says nothing was paid, and never 'you'", () => {
    expect(RETURN_CANCELLED).toBe("Cancel was pressed in PayPal. Nothing was paid.");
    expect(RETURN_CANCELLED).not.toMatch(/\byou\b/i);
  });
});

describe("the trail's cart row says 'approved' only when PayPal had the shopper's OK", () => {
  const H = "abcdef0123456789abcdef";
  const order = { actor: "paypal", action: "order-created", data: { orderId: "O-1", hash: H } };
  const cancel = { actor: "shopper", action: "cancel", data: { cart: "open" } };
  const row = (action: string, data: object = {}) => ({ actor: "paypal", action, data: { orderId: "O-1", ...data } });

  it("a Cancel in PayPal, or no answer yet: sent to PayPal", () => {
    expect(payTrail([order, cancel], H, "AUTHORIZE")!.approved).toBe(false);
    expect(payTrail([order], H, "AUTHORIZE")!.approved).toBe(false);
    expect(payTrail([order, cancel], H, "CAPTURE")!.approved).toBe(false);
    // A row saved before Round 3 (no `cart: "open"`) closed its cart: still the shopper's no.
    expect(payTrail([order, { actor: "shopper", action: "cancel", data: {} }], H, "AUTHORIZE")!.approved).toBe(false);
  });

  it("held, captured, voided, or a stop after PayPal's OK: approved", () => {
    expect(payTrail([order, row("authorized")], H, "AUTHORIZE")!.approved).toBe(true);
    expect(payTrail([order, row("authorized"), row("captured")], H, "AUTHORIZE")!.approved).toBe(true);
    expect(payTrail([order, row("authorized"), row("voided")], H, "AUTHORIZE")!.approved).toBe(true);
    expect(payTrail([order, row("capture-failed", { code: "declined" })], H, "CAPTURE")!.approved).toBe(true);
    // Cancelled first, then approved and paid on the same cart (abuse.test.ts cancel_keeps_the_cart_open).
    expect(payTrail([order, cancel, row("authorized"), row("captured")], H, "AUTHORIZE")!.approved).toBe(true);
  });

  it("before PayPal is asked: approved only once Approve was tapped (the cart's mark shows)", () => {
    expect(payAhead("AUTHORIZE", H)!.approved).toBe(true);
    expect(stepsAhead("AUTHORIZE")!.approved).toBe(false);
  });

  it("the card draws the branch, and the words differ", () => {
    expect(src("web/src/desk/Trail.tsx")).toContain("{trail.approved ? TRAIL_WORDS.exact : TRAIL_WORDS.sent}");
    expect(TRAIL_WORDS.sent).toBe("the exact cart sent to PayPal");
    expect(TRAIL_WORDS.sent).not.toMatch(/approv/i);
  });
});
