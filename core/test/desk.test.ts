import { describe, expect, it } from "vitest";
import { ASKING, CART_GONE, asksToReword, causeOnly, LOADING, PAYMENTS_WORDS, TROUBLE, WANTS_EMPTY, troubleOf, troubleLine, dealSoFar, deskAside, deskDeal, paymentMode, noteWords, paymentsWords, sellerName, sentence, skipReason } from "../src/view/desk.ts";
import { WAKING_FAILED } from "../../web/src/states/words.ts";
import { readFileSync as readNoteSrc } from "node:fs";
import { MARKET_FAILED } from "../src/ask/fictional-market.ts";
import type { StoreResult } from "../src/storesync.ts";

const r = (id: string, price: string, watcher: StoreResult["watcher"]): StoreResult =>
  ({ id, merchant: id, item: "a kettle", price, currency: "USD", history: 3, quoted: "", watcher, said: [] });

describe("the Desk's payments line", () => {
  it("reads the one payments mode from /api/health", () => {
    expect(paymentMode({ ok: true, payment: "sandbox" })).toBe("sandbox");
    expect(paymentMode({ payment: "fake" })).toBe("fake");
    expect(paymentMode({ payment: "off" })).toBe("off");
  });

  it("is neutral until health answers, or when it says something else", () => {
    for (const h of [null, undefined, {}, { payment: "live" }, { payment: 1 }, "sandbox"]) expect(paymentMode(h)).toBeNull();
    expect(paymentsWords(null)).toBe("Only your tap pays.");
    // The neutral line names no mode: no sandbox, no PayPal, no practice claim.
    expect(PAYMENTS_WORDS.unknown).not.toMatch(/sandbox|PayPal|practice/i);
  });

  it("only the sandbox line says sandbox, and the off line never says your tap pays", () => {
    expect(paymentsWords("sandbox")).toContain("PayPal sandbox");
    expect(paymentsWords("fake")).not.toMatch(/sandbox/i);
    expect(paymentsWords("off")).not.toMatch(/tap pays/i);
  });
});

describe("the Desk's deal", () => {
  it("is the cheapest listing the Watcher didn't refuse; a refused one never is, however cheap", () => {
    const rs = [r("scam", "12.00", "refuse"), r("held", "40.00", "hold"), r("ok", "52.00", "clear"), r("dear", "70.00", "clear")];
    expect(deskDeal(rs)?.id).toBe("held");
    expect(deskAside(rs).map((x) => x.id)).toEqual(["scam"]);
  });

  it("is none when every listing was refused", () => {
    expect(deskDeal([r("a", "1.00", "refuse")])).toBeNull();
    expect(deskDeal([])).toBeNull();
  });

  it("turns a Watcher phrase into one sentence", () => {
    expect(sentence("asks to be paid by gift card")).toBe("Asks to be paid by gift card.");
    expect(sentence("new seller, no sales yet.")).toBe("New seller, no sales yet.");
    expect(sentence("")).toBe("");
  });
});

describe("skipReason", () => {
  it("leads with the payment ask, else the first reason", () => {
    expect(skipReason(["its note tries to instruct the agent", "it asks to be paid by gift card", "new seller, no sales yet"])).toBe("it asks to be paid by gift card");
    expect(skipReason(["its note tries to instruct the agent"])).toBe("its note tries to instruct the agent");
    expect(skipReason([])).toBe("");
  });
});

describe("the live run's words", () => {
  it("names a seller without the (fictional) code adds, since the market label says it once", () => {
    expect(sellerName("Gullwing Clearance (fictional)")).toBe("Gullwing Clearance");
    expect(sellerName("Pondside Goods")).toBe("Pondside Goods");
    expect(sellerName("The (fictional) Shop (fictional)")).toBe("The (fictional) Shop");
  });

  it("shows the best deal so far only from sellers already checked, and never a refused one", () => {
    const rs = [r("a", "52.00", "clear"), r("b", "47.00", "clear"), r("scam", "12.00", "refuse")];
    expect(dealSoFar(rs, 0)).toBeNull();
    expect(dealSoFar(rs, 1)?.id).toBe("a");
    expect(dealSoFar(rs, 2)?.id).toBe("b");
    expect(dealSoFar(rs, 3)?.id).toBe("b");
    expect(dealSoFar(rs, 99)?.id).toBe(deskDeal(rs)?.id);
  });
});

// Track J: PayPal's return or its reload naming a run the server no longer has said "Waiting on PayPal". It can't know.
describe("cart_gone_never_claims_paid_or_waiting", () => {
  it("says the server can't tell, and claims no outcome", () => {
    const all = `${CART_GONE.title} ${CART_GONE.line}`;
    expect(all).not.toMatch(/waiting|\bpaid\b|not paid|charged|refund/i);
    expect(CART_GONE.line).toMatch(/can't say/);
  });
});

describe("the deal's note line (Round 2 judges, fix 1b: never empty quotes)", () => {
  it("is null for a seller with no note, an empty one or only spaces, so the line isn't drawn", () => {
    for (const q of ["", "   ", "\n", null, undefined]) expect(noteWords(q)).toBeNull();
  });
  it("is the note itself, trimmed, when there is one", () => {
    expect(noteWords("  Ships Friday. ")).toBe("Ships Friday.");
  });
  it("is how View details draws Its note: only when noteWords has words, and never the raw quote", () => {
    const desk = readNoteSrc(new URL("../../web/src/desk/Desk.tsx", import.meta.url), "utf8");
    const line = desk.split("\n").find((l) => l.includes("<dt>Its note</dt>"));
    expect(line).toBeDefined();
    expect(line).toMatch(/noteWords\(deal\.quoted\) !== null &&/);
    expect(line).not.toContain("{deal.quoted}");
  });
});

// DK (item 5): every Desk state, held to the DD's system.md §10 States block: what happened in ≤ 8 words, one cause
// sentence, ≤ 24 words in all, no countdown or promised time, and a failure never read as "no market".
describe("desk_states_are_one_block_each", () => {
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  it("reads why from what came back, never guessed", () => {
    expect(troubleOf(0, false, false)).toBe("offline");
    expect(troubleOf(503, false, false)).toBe("offline"); // the browser's own word comes first
    expect(troubleOf(0, false, true)).toBe("away");
    expect(troubleOf(503, false, true)).toBe("waking"); // a free host asleep answers its own page
    expect(troubleOf(503, true, true)).toBe("error"); // the server's own 503 is its error, not a wake
    expect(troubleOf(429, true, true)).toBe("capped");
    expect(troubleOf(500, true, true)).toBe("error");
    expect(troubleOf(502, false, true)).toBe("error");
  });
  it("each block fits the budget and claims no time", () => {
    const blocks: { title: string; line: string; action?: string }[] = [...Object.values(TROUBLE), { title: LOADING, line: "" }, { title: ASKING, line: "" }, WANTS_EMPTY];
    for (const b of blocks) {
      expect(words(b.title), b.title).toBeLessThanOrEqual(8);
      expect(words(`${b.title} ${b.line} ${b.action ?? ""}`), b.title).toBeLessThanOrEqual(24);
      expect(`${b.title} ${b.line}`, b.title).not.toMatch(/\d|second|minute|tomorrow|soon|%/i);
      expect(b.title, b.title).toMatch(/\.$/);
    }
    // A cap can't be helped by asking again, and offline asks again by itself; every other trouble offers Try again.
    expect(Object.entries(TROUBLE).filter(([, t]) => !t.retry).map(([k]) => k)).toEqual(["offline", "capped"]);
    expect(Object.entries(TROUBLE).filter(([, t]) => t.auto).map(([k]) => k)).toEqual(["offline"]);
    // The DD (check 2, b): "Nothing changed" is said once, by the status line or a control's note, never inside a block.
    for (const t of Object.values(TROUBLE)) expect(`${t.title} ${t.line}`, t.title).not.toMatch(/nothing changed/i);
    for (const t of Object.keys(TROUBLE) as (keyof typeof TROUBLE)[]) expect(troubleLine(t)).toMatch(/^Nothing changed\. \S/);
  });
  it("a failure that asks to reword offers Change my words, never Try again (DK check 2 f)", () => {
    expect(asksToReword(MARKET_FAILED)).toBe(true);
    expect(asksToReword(TROUBLE.error.line)).toBe(false);
    expect(asksToReword(null)).toBe(false);
    expect(causeOnly("Today's made-up markets from here are used up. Nothing changed.")).toBe("Today's made-up markets from here are used up.");
    expect(causeOnly("Nothing changed.")).toBe("Nothing changed.");
    // A failed wake on the Desk (its own failed view) says the kit's words, so the Desk and R's page-wide line can't drift.
    expect({ title: TROUBLE.waking.title, line: TROUBLE.waking.line }).toEqual({ title: WAKING_FAILED.title, line: WAKING_FAILED.line });
    // Under a cap's head ("…from here."), its cause doesn't say "from here" again (the DD, part 2 nit 1).
    expect(causeOnly("Today's made-up markets from here are used up. Nothing changed.", "capped")).toBe("Today's made-up markets are used up.");
    for (const t of Object.keys(TROUBLE) as (keyof typeof TROUBLE)[]) expect(`${TROUBLE[t].title} ${TROUBLE[t].line}`.match(/from here/g)?.length ?? 0, t).toBeLessThanOrEqual(1);
    const desk = readNoteSrc(new URL("../../web/src/desk/Desk.tsx", import.meta.url), "utf8");
    // DK part 8: the action is one object, drawn by the kit's pill or, before its chunk, the same pill plain.
    expect(desk).toMatch(/!trouble \|\| asksToReword\(failed\) \? \{ label: "Change my words", onClick: changeWords \}/);
  });
  it("the Desk shows a failure as its trouble, never as no market (control: the old one headline)", () => {
    const desk = readNoteSrc(new URL("../../web/src/desk/Desk.tsx", import.meta.url), "utf8");
    // DK part 8 (the DD): the title stays her ask; a trouble is said under it, and only no market is titled so.
    const has = (src: string) => /isFailed && !trouble \? "No market for that yet\."/.test(src) && /\{trouble && <p className="dk-s-why">\{wasOffline \? WAS_OFFLINE\.title : TROUBLE\[trouble\]\.title\}<\/p>\}/.test(src);
    expect(has(desk)).toBe(true);
    expect(desk).not.toMatch(/setFailed\(OFFLINE\)/);
    expect(has('{isFailed ? "No market for that yet." : x}')).toBe(false);
  });
  it("DK-13: back online with the offline block up, it says WAS_OFFLINE's words; only a failed Shop gets Try again, by her press (control: the old title)", () => {
    const desk = readNoteSrc(new URL("../../web/src/desk/Desk.tsx", import.meta.url), "utf8");
    // The kit's words, imported, never retyped (no new words): the title and the action label are its constants.
    expect(desk).toMatch(/import \{[^}]*\bWAS_OFFLINE\b[^}]*\} from "\.\.\/states\/words\.ts";/);
    expect(desk).not.toMatch(/"That didn't go through while you were offline\."/);
    // The state: a failed-offline block while the browser says it is online (her words changed, so nothing was asked).
    expect(desk).toMatch(/const wasOffline = isFailed && trouble === "offline" && online;/);
    // A Shop (a read is on screen) gets the one Try again, which shops the bubble's words; an ask (no read) gets none.
    const way = /: wasOffline && read \? \{ label: WAS_OFFLINE\.action, onClick: \(\) => shopTap\(asked\) \}/;
    expect(desk).toMatch(way);
    expect(": wasOffline ? { label: WAS_OFFLINE.action, onClick: () => void ask(asked) }").not.toMatch(way);
    // Nothing sends by itself (lesson 47): the online handler still asks only her unchanged words.
    expect(desk).toMatch(/if \(backOnce\.current \|\| wordsNow\.current\.trim\(\) !== asked\.trim\(\)\) return;/);
  });
});
