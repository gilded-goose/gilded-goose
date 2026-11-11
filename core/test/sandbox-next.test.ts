import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PAID_ELSEWHERE, SANDBOX_NEXT } from "../../web/src/states/words.ts";
import { RETURN_CHECKING, RETURN_WORDS, RETURN_WRONG, returnCard, walletReturn } from "../src/view/wallet.ts";

const WEB = new URL("../../web/src/", import.meta.url).pathname;
const read = (f: string) => readFileSync(join(WEB, f), "utf8");
const everyFile = (dir = WEB): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? everyFile(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []));

// Round 5, consumer B2: live's Approve opened PayPal's sandbox login with no warning, and an older shopper may type a real password there.
describe("every button that opens PayPal warns first, in sandbox mode only", () => {
  it("says it's practice, no real password, the way out, and that nothing is paid", () => {
    expect(SANDBOX_NEXT).toBe("Next: PayPal's practice site. Don't type your real password. No practice account? Press Cancel and pay nothing.");
    expect(SANDBOX_NEXT.split(/\s+/).length).toBe(17); // the card's budget of 50 has room for exactly this; desk-walk counts it drawn
  });
  it("no page opens PayPal without it: found by what opens PayPal, not by a list", () => {
    const opens = everyFile().filter((f) => /location\.assign\([^)]*approveUrl|href=\{run\.approveUrl\}/.test(readFileSync(f, "utf8")));
    expect(opens.length).toBeGreaterThanOrEqual(4);
    for (const f of opens) expect(readFileSync(f, "utf8"), f).toContain("{SANDBOX_NEXT}");
  });
  // The new site's approve card (goose.html): its tap opens PayPal from Shop.tsx through pay.ts, which the "what opens PayPal" scan
  // above can't see (no approveUrl in the call), so the card itself is held to the same rule.
  it("the site's approve card draws it in sandbox mode only, and its button is described by it", () => {
    const card = read("site/shop/ApproveSheet.tsx");
    expect(card).toContain("{mode === \"sandbox\"");
    expect(card).toMatch(/<b>PayPal sandbox\.<\/b> \{SANDBOX_NEXT\}/);
    expect(card).toContain('id="approve-mode"');
    expect(card).toMatch(/<Button tone="paypal"[^>]*aria-describedby="approve-mode"/);
    expect(read("site/shop/Shop.tsx")).toContain('run.health?.payment === "sandbox" ? "sandbox" : "practice"');
  });
  // Q's catch: SwapTry opens PayPal too, and the test above passed because the file holds the line for another button. So look at each component.
  const componentsIn = (f: string) => read(f).split(/\n(?=(?:export default )?(?:async )?function \w)/);
  it("in the wallet and the classic page, each component with a button that opens PayPal draws the line itself", () => {
    const opensHere = /approveWeek\(deal|href=\{run\.approveUrl\}|onClick=\{press\}[^\n]*Approve/;
    const seen: string[] = [];
    for (const f of ["Wallet.tsx", "App.tsx"]) for (const c of componentsIn(f)) {
      if (!opensHere.test(c) || c.startsWith("async function approveWeek")) continue;
      const name = /function (\w+)/.exec(c)?.[1] ?? "?";
      seen.push(name);
      expect(c, `${f} ${name}`).toContain("{SANDBOX_NEXT}");
      expect(c, `${f} ${name}`).toMatch(/aria-describedby=/);
    }
    expect(seen).toContain("SwapTry");
    expect(seen.length).toBeGreaterThanOrEqual(3);
  });
  it("SwapTry's line has its own id, is sandbox only, and describes its button", () => {
    const swap = componentsIn("Wallet.tsx").find((c) => c.startsWith("function SwapTry"))!;
    expect(swap).toContain('{sandbox && <p className="apractice" id="swap-next">{SANDBOX_NEXT}</p>}');
    expect(swap).toContain('aria-describedby={`swap-terms${sandbox ? " swap-next" : ""}`}');
    expect(read("Wallet.tsx")).toContain('<SwapTry deal={d} sandbox={practiceNext(payment)} />');
  });
  it("each draws it only when the server says sandbox", () => {
    expect(read("desk/Desk.tsx")).toContain('const next = mode === "sandbox" ? "dk-next" : undefined;');
    expect(read("desk/Desk.tsx")).toContain("{next && payable ? <p className=\"dk-practice\" id={next}>{SANDBOX_NEXT}</p> : <div className=\"dk-deal-foot\">");
    // The wallet opens with it, in its first paint (2.9 s on a phone otherwise, Nov 4), and a server that isn't the sandbox takes it away.
    expect(read("Wallet.tsx")).toContain('{practiceNext(payment) && <p className="apractice" id="approve-next">{SANDBOX_NEXT}</p>}');
    expect(read("Wallet.tsx")).toContain('const practiceNext = (payment: Payment) => payment === "sandbox" || (payment === "checking" && import.meta.env.BASE_URL === "/");');
    expect(read("first-paint.tsx")).toContain('{practice && <p className="apractice">{SANDBOX_NEXT}</p>}');
    expect(read("prerender.tsx")).toContain('practice={import.meta.env.BASE_URL === "/"}');
    expect(read("StoreSync.tsx")).toContain('{cart.canPay && sandbox && <p className="ssm-practice" id="ssm-next">{SANDBOX_NEXT}</p>}');
    expect(read("StoreSync.tsx")).toContain('setSandbox(data.payment === "sandbox")');
    expect(read("App.tsx")).toContain('sandbox={run.payment === "sandbox"}');
  });
  it("and each button is described by it, so a screen reader hears it before the tap", () => {
    for (const f of ["desk/Desk.tsx", "Wallet.tsx", "StoreSync.tsx", "App.tsx"]) expect(read(f), f).toMatch(/aria-describedby=\{(next|sandbox \?|`approve-terms\$\{practiceNext\(payment\)|run\.payment === "sandbox")/);
  });
});

// The line sends a stranger to Cancel. On the way back the Desk and the market read "Waiting on PayPal", which was false.
describe("back from PayPal's Cancel", () => {
  const row = { actor: "shopper", action: "cancel" };
  const open = { settled: null, bound: null, week: null };
  const said = (run: object) => walletReturn({ ...open, ...run } as never);
  const capturing = { actor: "guard", action: "capturing", seq: 3 };
  it("reads as cancelled while nothing settled, and only then", () => {
    expect(said({ events: [row] })?.kind).toBe("cancelled");
    expect(said({ events: [] })).toBeNull();
    expect(said({})).toBeNull();
    // She cancelled, then came back and paid the same cart: the cart is open after a cancel, and paid wins.
    expect(said({ settled: { ok: true }, events: [row], bound: { total: "1.00", orderId: "O" }, week: 1 })?.kind).toBe("paid");
  });
  // Fresh Q (Nov 5): "You cancelled" went to whoever held the link, and said "Nothing was charged" beside a capture under way. Anyone who
  // reached PayPal's page can press Cancel, so an owner who never did read it too: no browser's words say "you".
  // C's steps 4–5 walk (Nov 6): the cart does stay open on the server (abuse.test.ts cancel_keeps_the_cart_open), but saying so
  // on the Desk invited an Approve that card doesn't draw (return-actions.test.ts). "Cancelled" is only read when no capture
  // began (a capture under way reads "unknown", the next test), so "Nothing was paid" is true wherever it shows.
  it("nobody reads that they cancelled, and nothing invites an Approve the card doesn't draw", () => {
    for (const mine of [true, false, undefined]) expect(said({ events: [row], mine })).toEqual({ kind: "cancelled", words: RETURN_WORDS.cancelled });
    expect(RETURN_WORDS.cancelled).not.toMatch(/\byou\b/i);
    expect(RETURN_WORDS.cancelled).toMatch(/Nothing was paid\.$/);
    expect(RETURN_WORDS.cancelled).not.toMatch(/stays open|until|again/);
  });
  it("a Cancel doesn't answer a capture already under way, for anyone", () => {
    for (const mine of [true, false, undefined]) {
      expect(said({ events: [capturing, row], mine })?.kind).toBe("unknown");
      expect(said({ events: [{ actor: "paypal", action: "captured", seq: 4 }, row], mine })?.kind).toBe("unknown");
    }
    // PayPal's clear no closes the capture, so the Cancel stands.
    expect(said({ events: [capturing, { actor: "paypal", action: "capture-failed", seq: 4, data: { hold: 3, code: "DECLINED" } }, row] })?.kind).toBe("cancelled");
  });
  it("the Desk, the market and the wallet read one reader", () => {
    for (const f of ["desk/Desk.tsx", "StoreSync.tsx"]) {
      expect(read(f), f).toContain("card: data.card ?? null");
      expect(read(f), f).toContain('back.card?.head ?? (back.ok ? `Paid ${usdOf(back.total)}` : "Waiting on PayPal")');
      expect(read(f), f).not.toMatch(/\? "Not paid"/);
    }
    expect(read("Wallet.tsx")).toMatch(/RETURN_WRONG : asking \? "Checking…" : unknown \? RETURN_CHECKING/);
  });
});

// Fresh Q (Nov 5): the cards said "Not paid" over a capture nobody confirmed and over one for another amount.
describe("the Desk's and the market's card on a run that isn't simply paid", () => {
  const run = (over: object) => ({ settled: { ok: false, reason: "r" }, events: [], bound: null, week: null, ...over }) as never;
  it("never says Not paid when money may have moved", () => {
    expect(returnCard(run({ events: [{ actor: "guard", action: "capturing", seq: 1 }] }))).toEqual({ head: RETURN_CHECKING, line: RETURN_WORDS.unknown });
    expect(returnCard(run({ events: [{ actor: "paypal", action: "capture-failed", seq: 1, data: { code: "unknown" } }] }))?.head).toBe(RETURN_CHECKING);
    // Its line stays the settle's: the wallet's words promise an Undo these cards don't have.
    expect(returnCard(run({ events: [{ actor: "paypal", action: "capture-mismatch", seq: 1 }] }))).toEqual({ head: RETURN_WRONG, line: null });
    expect(returnCard(run({ events: [{ actor: "paypal", action: "capture-mismatch", seq: 1 }], mine: false }))?.head).toBe(RETURN_CHECKING);
  });
  it("says it when nothing moved, and nothing while nothing has settled", () => {
    expect(returnCard(run({ settled: { ok: false, reason: "cart changed: hash 9f3a != 1b2c" } }))).toEqual({ head: "Not paid", line: null });
    // A bare internal code ("set-aside", "already-paid") never reaches the screen as words.
    expect(returnCard(run({ settled: { ok: false, reason: "set-aside" } }))).toEqual({ head: "Not paid", line: "This cart closed before any money moved. Nothing was charged." });
    expect(returnCard(run({ settled: null }))).toBeNull();
    expect(returnCard(run({ settled: null, events: [{ actor: "shopper", action: "cancel", seq: 1 }] }))).toEqual({ head: "Not paid", line: RETURN_WORDS.cancelled });
  });
  it("a refund reads as a refund, to everyone: not Paid, not Not paid", () => {
    const refund = run({ settled: { ok: true }, bound: { total: "42.00", orderId: "O" }, week: 1, refunded: true });
    expect(returnCard(refund)?.head).toBe("Refunded $42.00");
    expect(returnCard(run({ settled: { ok: true }, bound: null, refunded: true }))?.head).toBe("Refunded");
    expect(returnCard(run({ settled: { ok: true }, bound: { total: "42.00", orderId: "O" }, week: 1 }))).toBeNull();
    expect(walletReturn(run({ settled: { ok: true }, refunded: true, mine: false }))?.kind).toBe("refunded");
    // PENDING and an unread capture write this row, so they read as can't-tell, and a refund's kind never reads as paid elsewhere.
    expect(returnCard(run({ events: [{ actor: "paypal", action: "capture-failed", seq: 1, data: { hold: 9, code: "unknown" } }] }))?.head).toBe(RETURN_CHECKING);
  });
});

// Round 5, red team 1: a fresh browser at someone's paid run link read "You approved this exact cart", or on the wallet "We can't tell yet".
describe("a stranger on someone's paid link", () => {
  const paid = { settled: { ok: true }, events: [], bound: null, week: null };
  it("reads that it was paid from another browser, in the same words on every page", () => {
    expect(walletReturn({ ...paid, mine: false } as never)).toEqual({ kind: "elsewhere", words: PAID_ELSEWHERE });
    expect(RETURN_WORDS.elsewhere).toBe(PAID_ELSEWHERE);
  });
  it("and an unpaid one never reads as their own", () => {
    for (const reason of ["cancelled", undefined]) expect(walletReturn({ ...paid, settled: { ok: false, reason }, mine: false } as never)?.kind).toBe("not-charged");
  });
  // The security review's catch: an owner on a second device reads as a stranger too. The server sends non-owners every row with PayPal's ids
  // masked, so when money may have moved, no browser reads "Nothing was charged".
  it("when money may have moved, nobody reads that nothing was charged", () => {
    const closed = { ...paid, settled: { ok: false, reason: "code closed it" }, mine: false };
    const rows = { actor: "paypal", seq: 2 };
    for (const ev of [
      { ...rows, action: "capture-mismatch" },
      { ...rows, action: "capture-failed", data: { code: "unknown" } },
      { ...rows, action: "captured" },
      { actor: "guard", action: "capturing", seq: 3 },
      { actor: "guard", action: "release", seq: 4, data: { release: "unconfirmed" } },
    ]) expect(walletReturn({ ...closed, events: [ev] } as never)?.kind, ev.action).toBe("unknown");
    // A clear no from PayPal, or a release that was confirmed, still reads as closed.
    const hold = { actor: "guard", action: "capturing", seq: 1 };
    expect(walletReturn({ ...closed, events: [hold, { ...rows, action: "capture-failed", data: { hold: 1, code: "INSTRUMENT_DECLINED" } }] } as never)?.kind).toBe("not-charged");
    expect(RETURN_WORDS.unknown).not.toMatch(/nothing was charged/i);
  });
  it("the owner's words stay the owner's: only `mine` true says you", () => {
    for (const f of ["desk/Desk.tsx", "StoreSync.tsx"]) expect(read(f), f).toMatch(/back\.ok \? !back\.mine \? PAID_ELSEWHERE : .You approved this exact cart/);
    expect(read("desk/Desk.tsx")).toContain("{back?.ok && back.mine && backRun && <Suspense");
  });
});
