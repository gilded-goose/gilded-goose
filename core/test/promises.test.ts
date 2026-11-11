// The three promises (Joshua, Nov 3, section 2): his words on every surface, and each one held by the code it names.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CAP_CHIP, PROMISES, SUPPORT_LINE, curly } from "../src/view/promises.ts";
import { MENU, MENU_ITEMS } from "../src/view/menu.ts";
import { MENU_INDEX, MIXER_ASK } from "../src/view/menu-hash.ts";
import { TOUR, TOUR_GROUPS, TOUR_TITLE } from "../src/view/tour.ts";
import { TRICK_HREF } from "../src/view/scroll.ts";
import { recordedItem } from "../src/ask/recorded-market.ts";
import { FIT_WORDS } from "../../web/first-fit.ts";
import { fooledProof, hideProof, overspendProof } from "./promise-proof.ts";

const root = join(import.meta.dirname, "../..");
const file = (p: string) => readFileSync(join(root, p), "utf8");

describe("the promises are Joshua's words, and they lead", () => {
  it("are his three sentences, and his supporting line word for word", () => {
    expect(PROMISES.map((p) => p.head)).toEqual(["Goose can't be fooled into paying.", "Goose can't overspend.", "Goose can't hide anything."]);
    expect(SUPPORT_LINE).toBe("Goose compresses the whole market into one safe decision. PayPal protects the payment; Goose protects everything before it.");
  });
  it("lead the landing: the hero's three lines, in order", () => {
    expect(FIT_WORDS.h1).toEqual(PROMISES.map((p) => curly(p.head)));
    expect(file("web/src/desk/story/index.tsx")).toMatch(/PROMISES\.map\(\(p, i\) => <span key=\{p\.id\} className="dk-mask"/);
  });
  it("lead the menu: one group each, and the light index the same", () => {
    expect(MENU.map((g) => g.name)).toEqual(PROMISES.map((p) => p.head));
    expect(MENU_INDEX.map((g) => g.name)).toEqual(PROMISES.map((p) => p.head));
  });
  it("lead the tour: every stop proves one promise, the promises in order, and the challenge is stop 1", () => {
    expect(TOUR_TITLE).toMatch(/^Three promises/);
    expect(TOUR_GROUPS.map((g) => g.promise.id)).toEqual(PROMISES.map((p) => p.id));
    expect(TOUR_GROUPS.flatMap((g) => g.stops.map((s) => s.stop.id))).toEqual(TOUR.map((s) => s.id));
    expect(TOUR[0]!.id).toBe("trick");
    expect(TOUR[0]!.href).toBe(TRICK_HREF);
    expect(MENU_ITEMS[0]!.id).toBe("trick");
  });
  it("the landing's proofs are menu items, and the chip that moved still asks", () => {
    const src = file("web/src/desk/story/Promises.tsx");
    for (const id of [...src.matchAll(/(?:fooled|overspend|hide): \[([^\]]+)\]/g)].flatMap((m) => m[1]!.split(",").map((s) => s.trim().replace(/"/g, "")))) {
      expect(MENU_ITEMS.map((i) => i.id)).toContain(id);
    }
    expect(src).toContain("onAsk(CAP_CHIP)");
    expect(CAP_CHIP).toMatch(/\$85$/);
    expect(file("web/src/desk/Desk.tsx")).not.toContain(CAP_CHIP); // one place, or the hero is back over its budget
  });
  it("the challenge's slot mounts Track C's file when it exists, and never imports it statically", () => {
    const src = file("web/src/desk/story/TrickSlot.tsx");
    expect(src).toMatch(/import\.meta\.glob<[^>]+>?>\("\.\/Challenge\.tsx"\)/);
    expect(src).not.toMatch(/from "\.\/Challenge(\.tsx)?"/); // ChallengeStart.tsx, its opening lines, is a separate file
    expect(file("web/src/desk/story/Story.tsx").indexOf("<TrickSlot />")).toBeLessThan(file("web/src/desk/story/Story.tsx").indexOf("<Moment "));
  });
  it("the old thesis is gone from every surface the promises replaced", () => {
    for (const p of ["web/src/desk/story/Steps.tsx", "web/src/ledger/Hero.tsx", "README.md", "docs/launch/press-release.md", "docs/devpost.md"]) {
      expect([p, /Payment networks protect|protects the conversation/.test(file(p))]).toEqual([p, false]);
    }
  });
});

// The DD's ruling on the promises (seat 3, Nov 4), each item held so it can't drift back.
describe("the DD's conditions on the promises", () => {
  const talk = (list: readonly { id: string }[]) => list.map((i) => i.id);
  it("a real apostrophe at display size: the data stays straight, the drawing curls", () => {
    expect(curly("Goose can't overspend.")).toBe("Goose can\u2019t overspend.");
    expect(PROMISES.every((p) => p.head.includes("'") && !p.head.includes("\u2019"))).toBe(true);
    for (const [f, draws] of [
      ["web/src/desk/story/index.tsx", "curly(p.head)"], ["web/src/desk/story/Promises.tsx", "curly(p.head)"],
      ["web/src/desk/story/Band.tsx", "curly(BAND_HEAD)"], ["web/src/menu/MenuPanel.tsx", "curly(g.name)"],
      ["web/src/tour/Tour.tsx", "curly(promise.head)"],
    ] as const) expect(file(f), f).toContain(draws);
  });
  it("Talk to Goose proves 'overspend', right after Ask Goose, in the menu and the tour", () => {
    for (const items of [MENU[0]!.items, MENU_INDEX[0]!.items]) expect(talk(items)).not.toContain("talk");
    for (const items of [MENU[1]!.items, MENU_INDEX[1]!.items]) expect(talk(items).slice(0, 2)).toEqual(["ask", "talk"]);
    const ids = TOUR.map((s) => s.id);
    expect(ids.indexOf("talk")).toBe(ids.indexOf("ask") + 1);
    expect(TOUR.find((s) => s.id === "talk")!.promise).toBe("overspend");
  });
  it("the menu's Talk line is brand.md \u00a710.3's wording", () => {
    expect(MENU[1]!.items.find((i) => i.id === "talk")!.line).toBe("Hold the mic. Your voice is never sent.");
  });
  it("the egg moves with a margin, not a transform: parallax owns the transform", () => {
    const css = file("web/src/desk/story/hero.css");
    expect(css).toMatch(/\.dk-hero-egg \{ grid-column: 2; grid-row: 1; align-self: end; margin-bottom: calc\(-1 \* var\(--s-4\)\); \}/);
    expect(css).toMatch(/\.dk-hero-egg \{ order: -1; align-self: auto; margin-bottom: 0; \}/);
    // Q's ruling (Nov 5, on P's loosening, which didn't land): a transform, translate, rotate or scale in any egg rule,
    // :hover included, would fight the parallax that owns the egg's transform (Desk.tsx, data-depth). will-change may name it.
    expect(css.match(/\.dk-hero-egg\b[^{]*\{[^}]*\}/g)!.join(" ")).not.toMatch(/[{;]\s*(transform|translate|rotate|scale)\s*:/);
  });
  it("the challenge has one address, and the slot's fallback never points at the block that failed", () => {
    expect(TRICK_HREF).toBe("?desk=1#challenge");
    expect(TOUR[0]!.subject.wide).toEqual(["#ds-ch-note"]);
    expect(file("web/src/desk/story/Close.tsx")).toContain(`href="#challenge"`);
    expect(file("web/src/desk/story/ChallengeStart.tsx")).toContain(`CHALLENGE_ID = "challenge"`);
    const slot = file("web/src/desk/story/TrickSlot.tsx");
    expect(slot).not.toContain("TRICK_HREF");
    expect(slot).toContain(`"?wallet=0#break"`);
  });
  it("every link to the challenge is the one address: only the slot's fallback may name the old lab", () => {
    // Track F, Nov 4: the threat board's "Try to trick Goose" still went to the classic lab, with its own copy of the name TRICK_HREF.
    expect(file("web/src/studio/board-first-words.ts")).toContain(`export const TRICK_HREF = "${TRICK_HREF}";`);
    const listed = execFileSync("git", ["ls-files", "web/src", "web/*.html", "core/src"], { cwd: root, encoding: "utf8" }).trim().split("\n");
    const found = listed.filter((f) => /\.(tsx?|html)$/.test(f) && file(f).includes("wallet=0#break"));
    // brand/title.ts names the classic lab's room, for its tab title: an address it's told, not a link it draws.
    expect(found.sort()).toEqual(["web/src/brand/title.ts", "web/src/desk/story/TrickSlot.tsx"]);
  });
  it("the tour's Watcher stop carries the secondhand chip, and its words reach the listing with the planted scam", () => {
    const chip = TOUR.find((s) => s.id === "watcher")!.chip!;
    expect(chip).toEqual({ words: "A used Fernway mixer", href: "?desk=1#mixer" });
    const hit = recordedItem(chip.words)!;
    expect(hit.item.id).toBe("fernway-mixer-used");
    expect(hit.item.sellers.some((s) => s.sellerId === "quickdeal-sam")).toBe(true);
    // Fixed words, never read from the address: a link can't put anything else in the box.
    expect(file("web/src/desk/Desk.tsx")).toContain("ready(MIXER_ASK)");
    // Every ask that waits in the box is one of two fixed sentences, so nothing from an address can reach it this way.
    const waiting = [...file("web/src/desk/Desk.tsx").matchAll(/\bready\(([^)]*)\)/g)].map((m) => m[1]).filter((w) => w !== "w: string");
    expect([...new Set(waiting)].sort()).toEqual(["MIXER_ASK", "WATCH_ASK"]);
  });
  it("the share card says the promise, and the market line stays off the site until Real Market exists", () => {
    for (const p of ["web/src/brand/meta.ts", "web/index.html", "scripts/brand-render.ts"]) expect([p, /protects the conversation/.test(file(p))]).toEqual([p, false]);
    expect(file("web/src/brand/meta.ts")).toContain(`headline: "Nothing is paid until you tap."`);
    for (const p of ["web/src/desk/story/Steps.tsx", "web/src/desk/Desk.tsx", "web/src/Proof.tsx", "web/src/ledger/Hero.tsx"]) expect([p, /SUPPORT_MARKET|whole market/.test(file(p))]).toEqual([p, false]);
  });
  it("the gift card is the Steps card's beat alone: the moment's sentence went", () => {
    expect(file("web/src/desk/story/Moment.tsx")).not.toContain("gift card");
    expect(file("web/src/desk/story/Steps.tsx")).toContain("{SCAM_HEAD}");
  });
});

describe("each promise says only what the code holds", () => {
  it("fooled: an order you didn't approve captures nothing; control: an approved one does", async () => {
    expect(await fooledProof()).toEqual({ unapproved: 0, approved: 1 });
  });
  it("overspend: over your max, the cap or the category limit is refused; a price changed after the tap never captures; controls pass", async () => {
    expect(await overspendProof()).toEqual({ overMax: "max", overCap: "cap", overCategory: "limit", atLimit: "ask", swapped: 0, unchanged: 1 });
  });
  it("hide: each decision adds a row with its reason, an empty reason throws, a row can't be edited, and the store has no edit or delete", () => {
    const p = hideProof();
    expect(p.asked).toBeGreaterThan(0);
    expect(p.refused).toBeGreaterThan(0);
    expect(p.reasons).toBe(true);
    expect(p.edited).toBe(false);
    expect(p.emptyThrows).toBe(true);
    expect(p.methods).toEqual(["append", "on", "read", "size"]);
  });
  it("hide's line never says removed: old runs are evicted past the run budget, so the words stay scoped to your visit", () => {
    const hide = PROMISES.find((p) => p.id === "hide")!.line;
    expect(hide).toMatch(/in your visit/);
    expect(hide).not.toMatch(/removed|forever|deleted/);
  });
  it("what the hash and voice listeners run reads the live view, never the first render's", () => {
    const desk = file("web/src/desk/Desk.tsx");
    const body = desk.slice(desk.indexOf("function menuAct("), desk.indexOf("A menu link from another page lands here"));
    expect(body).toContain("viewNow.current");
    expect(body).not.toMatch(/[^.\w]view\s*[!=]==/);
    expect(desk).toContain("viewNow.current = view;");
  });
  it("the Challenge's landing stops looking, and her own scroll, tap or key wins", () => {
    const desk = file("web/src/desk/Desk.tsx");
    const body = desk.slice(desk.indexOf('case "challenge":'), desk.indexOf('case "ask":'));
    expect(body).toMatch(/if \(n < 180\) requestAnimationFrame/);
    expect(body).toContain('["wheel", "pointerdown", "keydown"]');
    expect(body).toMatch(/if \(hers\)/);
  });
  it("an answer on its way when she left is dropped", () => {
    const desk = file("web/src/desk/Desk.tsx");
    expect(desk.slice(desk.indexOf("function startOver()"), desk.indexOf("function startOver()") + 90)).toContain("asks.current++");
    expect(desk.match(/if \(ask !== asks\.current\)/g)?.length).toBe(2);
    expect(desk.match(/if \(ask === asks\.current\) \{/g)?.length).toBe(2);
  });
  it("a landing section's head names its subject: the section above it can change", () => {
    expect(file("web/src/desk/story/PromisesStart.tsx")).toContain(`PROMISES_HEAD = "Three promises, exactly as far as the code goes."`);
    const heads = readdirSync(join(root, "web/src/desk/story")).filter((f) => f.endsWith(".tsx")).flatMap((f) => [...file(`web/src/desk/story/${f}`).matchAll(/<h2[^>]*>([^<{]+)</g)].map((m) => m[1]!));
    expect(heads.length).toBeGreaterThan(0);
    for (const h of heads) expect(h).not.toMatch(/^(?:Each one|Each of them|This|That|These|Those|It|They)\b/);
    expect("Each one, exactly as far").toMatch(/^(?:Each one|Each of them|This|That|These|Those|It|They)\b/); // Control: the old head.
  });
  it("only the shopper's tap pays, so no surface says Goose does", () => {
    // Joshua's "fooled into paying" stays; true negatives ("Goose never buys on its own") pass. peer-why and ladder-words are Track S's sweep.
    const SAYS_GOOSE_PAYS = /\bGoose (?:pays|paid|buys|bought|can only pay|can't pay past)\b|\bdid Goose pay\b|\bgot Goose to pay\b|\bpay past\b/;
    const surfaces = ["core/src/view/menu.ts", "core/src/view/tour.ts", "core/src/view/promises.ts", "core/src/view/missing-layer.ts", "web/src/desk/RealPrices.tsx", "web/src/studio/words.ts",
      "README.md", "docs/devpost.md", "docs/launch/press-release.md", "docs/launch/faq.md",
      ...readdirSync(join(root, "web/src/desk/story")).filter((f) => f.endsWith(".tsx")).map((f) => `web/src/desk/story/${f}`)];
    for (const f of surfaces) expect(file(f), f).not.toMatch(SAYS_GOOSE_PAYS);
    expect(MENU_ITEMS.find((i) => i.id === "list")!.line).toBe("Gifts under one total no cart in this browser can pass.");
    for (const old of ["Gifts under one total Goose can't pay past.", "how many got Goose to pay", "What did Goose pay, and when?"]) expect(old).toMatch(SAYS_GOOSE_PAYS); // Control: the old words.
  });
  it("every launch doc leads with the three promises, before its first section of story", () => {
    const first: Record<string, string> = { "README.md": "## The problem", "docs/devpost.md": "## Potential Impact\n", "docs/launch/press-release.md": "## Who it's for", "docs/launch/faq.md": "## Is it real?" };
    for (const [f, section] of Object.entries(first)) {
      const lead = file(f).split(section)[0]!;
      expect(lead.length, f).toBeLessThan(file(f).length);
      for (const p of PROMISES) expect(lead, `${f}: ${p.head}`).toContain(p.head);
    }
  });
  it("no launch doc sends a judge through the tour on a stop that moved, or to Try to trick Goose by the old address alone", () => {
    for (const f of ["README.md", "docs/devpost.md", "docs/launch/press-release.md"]) {
      expect(file(f), f).not.toMatch(/on its first stop/);
      expect(file(f), f).toContain("Try to trick Goose");
    }
    expect(file("README.md")).toContain(`\`${TRICK_HREF}\``);
  });
  it("the tour's mixer chip and the Desk's say the same words, so a merge can't leave two names for one listing", () => {
    expect(file("web/src/desk/Desk.tsx")).toContain(`"${MIXER_ASK}"`);
    expect(file("web/src/desk/first-paint.tsx")).toContain(`"${MIXER_ASK}"`);
  });
  it("the scammer AI's button draws only on the server's switch, and no CSS hold stands in for it", () => {
    expect(file("web/src/desk/story/Challenge.tsx")).toMatch(/\{scammerOn && <div className="ds-ch-ai">/);
    expect(file("web/src/desk/story/story.css")).not.toMatch(/ds-ch-ai/);
  });
  it("no promise line claims a catch rate: the Watcher can miss a scam, and the line says so", () => {
    expect(PROMISES.find((p) => p.id === "fooled")!.line).toMatch(/can miss a scam/);
    for (const p of PROMISES) expect(p.line).not.toMatch(/\b(every scam|all scams|never miss|100%|guarantee)/i);
  });
});
