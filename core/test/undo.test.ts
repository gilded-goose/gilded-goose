// Undo and "take it back" (QUEUE M3 slot 2, 018 N28, 019): a refund is a bad pick that turns the dial back, the wallet
// says "Undone" from the server's own refunded cookie, and voice only ever brings the Undo tap forward, for the last
// purchase made in this tab and only while its Undo is open. The booted half (the route, the cookie, the dial on the
// next run) is in abuse.test.ts, "answer 1".

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEMO_T0, NOT_THIS_ONE, demoCatalogItems, demoPolicy, dialPreview, type LedgerEvent, type Tape } from "../src/index.ts";
import { turnBack, setCategoryLimit } from "../src/trust/policy.ts";
import { badPickEnd, isBadPick } from "../src/view/lanes.ts";
import { recordedWeek } from "../src/view/week.ts";
import { ENTRY_CATEGORY } from "../src/view/local.ts";
import { sha256Hex } from "../src/sha256.ts";
import { saidTakeBack, voiceIntent } from "../src/ask/voice.ts";
import {
  TAKE_BACK_CLOSED, TAKE_BACK_NONE, UNDONE_NOTE, parseUndoState, refundedFor, takeBack, takeBackConfirm, takeBackDone, walletHome, walletPaidHome,
  walletRefundedHome, type LastPurchase,
} from "../src/view/wallet.ts";

const CAT = demoCatalogItems();
const TAPE = JSON.parse(readFileSync(new URL("../../docs/fixtures/tape-seed-1.json", import.meta.url), "utf8")) as Tape;
const run = () => recordedWeek(TAPE, sha256Hex, () => DEMO_T0, ENTRY_CATEGORY);
const ev = (over: Partial<LedgerEvent>): LedgerEvent => ({ v: 1, seq: 0, t: 0, shopperId: "s", visibility: "owner", actor: "paypal", action: "captured", verdict: "ok", price: "25.00", why: "w", data: { catalogId: "kettle" }, ...over });
const refunded = ev({ action: "refunded", why: "Undone: refund R sent for capture C, $25.00 back." });

describe("Undo is a bad pick and turns the dial back", () => {
  it("turnBack asks first again and restarts the category's record, changing no limit and nothing else", () => {
    const p = demoPolicy({ dial: { kitchen: "buy-within-limits", garden: "buy-within-limits" } });
    const q = turnBack(p, "kitchen", 1234);
    expect(q.dial).toEqual({ kitchen: "ask-first", garden: "buy-within-limits" });
    expect(q.recordSince).toEqual({ ...p.recordSince, kitchen: 1234 });
    expect(q.categoryLimit).toEqual(p.categoryLimit);
    expect({ ...q, dial: p.dial, recordSince: p.recordSince }).toEqual(p);
    // A new Policy: the old one is untouched (a run keeps the Policy it started with).
    expect(p.dial.kitchen).toBe("buy-within-limits");
    // Never turns anything up: an "ask first" category stays so.
    expect(turnBack(demoPolicy(), "kitchen", 1).dial.kitchen).toBe("ask-first");
  });

  it("a refunded row is a bad pick: the clean record before it no longer counts, and a clean capture after it does", () => {
    const p = demoPolicy();
    expect(isBadPick(refunded)).toBe(true);
    expect(isBadPick(ev({}))).toBe(false);
    expect(dialPreview([ev({}), ev({})], p, "kitchen", CAT).clean).toBe(2);
    expect(dialPreview([ev({}), ev({}), refunded], p, "kitchen", CAT).clean).toBe(0);
    expect(dialPreview([ev({}), refunded, ev({})], p, "kitchen", CAT).clean).toBe(1);
    expect(badPickEnd([ev({}), refunded, ev({})])).toBe(2);
    // The other bad picks are as they were.
    expect(isBadPick(ev({ actor: "shopper", action: NOT_THIS_ONE, verdict: "refused" }))).toBe(true);
  });

  it("after Undo the dial reads \"ask me first\", not the starting setting, and records from the refund on", () => {
    const at = 10 * 86_400_000;
    const q = turnBack(demoPolicy({ dial: { kitchen: "buy-within-limits" } }), "kitchen", at);
    const preview = dialPreview([ev({ t: at - 1 }), ev({ t: at + 1 })], q, "kitchen", CAT);
    expect(preview.setting).toBe("ask me first");
    expect(preview.clean).toBe(1); // only the capture after the turn-back
    // The same move a limit raise makes (setCategoryLimit), so the two can't drift apart.
    const raised = setCategoryLimit(demoPolicy({ dial: { kitchen: "buy-within-limits" } }), "kitchen", 9000, at);
    expect({ dial: raised.dial, recordSince: raised.recordSince }).toEqual({ dial: q.dial, recordSince: q.recordSince });
  });
});

describe("the wallet after Undo", () => {
  const paid = { week: 1, orderId: "6BL5024492609723T", total: "47.73" };

  it("the paid row becomes refunded and \"you paid\" counts it no more; nothing waits again", async () => {
    const home = walletHome(await run(), DEMO_T0);
    const before = walletPaidHome(home, paid);
    const after = walletRefundedHome(home, paid);
    expect(after.counts).toEqual({ ...before.counts, paid: before.counts.paid - 1 });
    expect(after.counts.waiting).toBe(home.counts.waiting - 1);
    expect(after.week.find((r) => r.seq === home.deal!.seq)).toMatchObject({ kind: "refunded", price: "47.73", note: UNDONE_NOTE });
    expect(after.week.filter((r) => r.kind === "waiting")).toEqual([]);
    expect(after.week.length).toBe(home.week.length);
    // Another total (a bent cookie) or nothing waiting: nothing moves.
    expect(walletRefundedHome(home, { ...paid, total: "47.74" })).toEqual(home);
    const empty = walletHome(null, DEMO_T0);
    expect(walletRefundedHome(empty, paid)).toEqual(empty);
  });

  it("the refunded cookie counts only for this very payment", () => {
    expect(refundedFor(paid, { ...paid })).toBe(true);
    for (const other of [{ ...paid, week: 2 }, { ...paid, orderId: "OTHER" }, { ...paid, total: "47.74" }]) expect(refundedFor(paid, other)).toBe(false);
    expect(refundedFor(null, paid)).toBe(false);
    expect(refundedFor(paid, null)).toBe(false);
  });

  it("the run view's undo is read strictly: anything bent is none, never open", () => {
    expect(parseUndoState({ state: "open", until: 5 })).toEqual({ state: "open", until: 5 });
    expect(parseUndoState({ state: "refunded" })).toEqual({ state: "refunded" });
    for (const bent of [null, undefined, "open", { state: "open" }, { state: "open", until: "5" }, { state: "open", until: Infinity }, { state: "OPEN", until: 5 }, []]) {
      expect(parseUndoState(bent)).toEqual({ state: "none" });
    }
  });
});

describe("voice undo: \"take it back\" (018 N28)", () => {
  it("the phrase, whole: take it/that back, undo or refund that (purchase), with a please or a hey Goose", () => {
    for (const w of ["take it back", "Take it back.", "take that back!", "Hey Goose, take it back", "please take it back", "take it back please", "undo that", "undo that purchase", "refund that purchase", "Refund my last order", "take it back"]) {
      expect(saidTakeBack(w), w).toBe(true);
    }
    for (const w of ["don't take it back", "do not take it back", "take it back to the store", "I want to take it back to the shop and get a black one", "undo", "refund", "take it", "I'll take it", "buy it back", "take back the kettle under 40", "can you take back my limit", "take it back, I changed my mind", "take it back and buy a black one", ""]) {
      expect(saidTakeBack(w), w).toBe(false);
    }
    // It is no other command: "take it back" never declines or buys.
    expect(voiceIntent("take it back")).toBeNull();
  });

  it("voice_undo_only_last_purchase_in_window: a confirm only for this tab's last purchase while its Undo is open; never a refund on its own", () => {
    const now = 1_000_000;
    const last = (over: Partial<LastPurchase> = {}): LastPurchase => ({ item: "Goldfeather Kettle", amount: "$47.73", undo: { state: "open", until: now + 60_000 }, hasKey: true, ...over });
    expect(takeBack(last(), now)).toEqual({ kind: "confirm", words: takeBackConfirm("Goldfeather Kettle", "$47.73") });
    expect(takeBack(last(), now).words).toMatch(/Nothing is refunded until you tap\.$/);
    // The last second of the window still asks; one past it doesn't.
    expect(takeBack(last({ undo: { state: "open", until: now } }), now).kind).toBe("confirm");
    expect(takeBack(last({ undo: { state: "open", until: now - 1 } }), now)).toEqual({ kind: "none", words: TAKE_BACK_CLOSED });
    // Another tab's purchase (no undo key here), nothing bought, or a run the server says isn't open: nothing.
    expect(takeBack(last({ hasKey: false }), now)).toEqual({ kind: "none", words: TAKE_BACK_NONE });
    expect(takeBack(null, now)).toEqual({ kind: "none", words: TAKE_BACK_NONE });
    expect(takeBack(last({ undo: { state: "none" } }), now)).toEqual({ kind: "none", words: TAKE_BACK_NONE });
    // Already undone: says so, and asks for nothing.
    expect(takeBack(last({ undo: { state: "refunded" } }), now)).toEqual({ kind: "none", words: takeBackDone("$47.73") });
    // Every answer says what happened to the money: "Nothing is refunded until you tap" or "nothing was refunded".
    for (const w of [TAKE_BACK_NONE, TAKE_BACK_CLOSED, takeBackDone("$1.00")]) expect(w).toMatch(/[Nn]othing (?:more )?was refunded/);
  });

  it("voice never refunds: Ask Goose and the wallet's take-back answer call no Undo, fetch nothing and focus nothing", () => {
    const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
    // Ask Goose hands "take it back" to the page and returns before the Ask route: no undo route, no undo call.
    const ask = src("../../web/src/AskGoose.tsx");
    expect(ask).not.toMatch(/\/undo|undoKey|\.undo\(/);
    const hook = ask.slice(ask.indexOf("saidTakeBack(words)"), ask.indexOf("return;", ask.indexOf("saidTakeBack(words)")));
    expect(hook).not.toMatch(/fetch|undo\b/);
    // The wallet's answer: words, and the Undo scrolled into view; never a press, a fetch or focus (a held Enter would press it).
    const wallet = src("../../web/src/Wallet.tsx");
    const take = wallet.slice(wallet.indexOf("onTakeBack={() => {"), wallet.indexOf("return t.words;"));
    expect(take.length).toBeGreaterThan(0);
    expect(take).not.toMatch(/fetch|\.undo\(|undo\.undo|\.focus\(|\.click\(/);
  });
});
