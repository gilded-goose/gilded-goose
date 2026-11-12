// The shot list's on-screen lines, each tied to the code that draws it (Lead-12, Nov 6: "the video must show what the site
// draws"). Track T's filming check on live 05e3ebb3 found six lines in docs/video-shot-list.md that live no longer drew that
// way: an old set-aside tag, "Goose skipped", an end card with a footer line and an AG credit it never carried, an address
// and QR it never drew, and an FTC line worded differently from the landing's. Every quoted line in the shot sections is
// now either drawn by code (tied here to the value or the literal) or said by the voice; anything else fails, so a line
// the site retires fails here, not on the re-shoot. The same idea as the kit's filming guide (video-kit.test.ts).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MOVING_ITEMS } from "../src/sellers/moving.ts";
import { CLOSE, CLOSE_NOTES, protectLine, scrollStory } from "../src/view/scroll.ts";
import { BEST_DEAL, MARKET_LINE, PAYMENTS_WORDS, UNDERSTOOD, asideTag, boundLine, deskPile, paymentsWords } from "../src/view/desk.ts";
import { END_CARD_LINES } from "../src/view/impact.ts";
import { PROMISES } from "../src/view/promises.ts";
import { TOUR_TITLE } from "../src/view/tour.ts";
import { WAS_WHOSE, wasLine } from "../src/ask/recorded-market.ts";
import { BRAND_NAME } from "../../trust/src/paypal.ts";
import type { StoreResult } from "../src/storesync.ts";

const file = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const flat = (s: string) => s.replace(/\s+/g, " ");
const quotes = (s: string) => [...s.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);

const SHOTS_MD = file("docs/video-shot-list.md");
// The shot sections: the open, the three moments, the close and the stills; not the header, the cuts or the staged lines.
const at = SHOTS_MD.indexOf("## Open"), end = SHOTS_MD.indexOf("## Cut from the video");
const lines = SHOTS_MD.slice(at, end).split("\n");
const SHOTS = flat(lines.filter((l) => !l.startsWith("> ")).join("\n"));
const VOICE = flat(lines.filter((l) => l.startsWith("> ")).map((l) => l.slice(2)).join(" ").replace(/\[(beat|pause)\]/g, ""));

const story = scrollStory();
const desk = file("web/src/desk/Desk.tsx"), takes = file("scripts/video-takes.ts"), close = file("web/src/desk/story/Close.tsx");
const why = story.scam.why!;
const tag = asideTag([why.replace(/^it /, "")]);
const results = story.sellers.map((x) => ({ watcher: x.verdict }) as unknown as StoreResult);
const tixNote = MOVING_ITEMS.flatMap((i) => i.sellers).find((s) => s.sellerId === "tixquack")!.note;
const oneCent = file("docs/claims.md").split("\n").find((l) => l.startsWith("| one-cent |"))!.split("|")[2]!.trim();
const footer = `Fictional sellers. Practice only: no real money. ${paymentsWords("sandbox")}`;
const CREDIT = "Built with AG Studio";

// [the line as the shot list quotes it, whether the code draws exactly it]
const ties: [string, boolean][] = [
  // the open
  [`Set aside: ${tag}`, desk.includes("`Set aside: ${asideTag(")],
  ["Read as data, never as orders", file("web/src/desk/moment/Case.tsx").includes('export const CASE_LABEL = "Read as data, never as orders";')],
  [tixNote, true],
  [protectLine(story.scam.name), true],
  [PROMISES.map((p) => p.head).join(" "), true],
  [`Paid ${story.deal.words}`, desk.includes("`Paid ${usdOf(back.total)}`")],
  ["You approved this exact cart in PayPal, and code checked it again before taking payment.",
    desk.includes(`"You approved this exact cart in PayPal, and code checked it again before taking payment."`)],
  ["Practice payments on this server", PAYMENTS_WORDS.fake.startsWith("Practice payments on this server")],
  // the captions, made by `video:takes --stills` from these words
  ["Fictional seller", takes.includes('{ name: "fictional", text: "Fictional seller"')],
  ["PayPal sandbox", takes.includes('{ name: "sandbox", text: "PayPal sandbox"')],
  [oneCent, takes.includes('l.startsWith("| one-cent |")')],
  // moment 1
  [UNDERSTOOD.replace(/\.$/, ""), true],
  [deskPile(results), true],
  [BEST_DEAL, true],
  [MARKET_LINE.recorded, desk.includes("marketLine(")],
  [`Why Goose set ${story.scam.name} aside`, desk.includes("Why Goose set {sellerName(skipped.merchant)} aside")],
  [`${why[0]!.toUpperCase()}${why.slice(1)}`, true],
  ["Its note is data. Goose never follows it.", desk.includes("Its note is data. Goose never follows it.")],
  ["Your limit lives in code. A seller's words can't change it.", desk.includes("Your limit lives in code. A seller's words can't change it.")],
  ["Before you approve", desk.includes("<summary><span>Before you approve</span>")],
  [`Was ~~${story.deal.firstWords}~~ ${WAS_WHOSE}. ${wasLine("seat", story.deal.firstDay, "waited")}`,
    desk.includes(`Was <s className="dk-was">{usdOf(was.total)}</s> {was.whose}. {was.line}`)],
  // moment 2: PayPal's own page shows the brand name the order sets
  [`The Watcher set ${story.scam.name} aside: ${why}.`, desk.includes("The Watcher set {sellerName(skipped.merchant)} aside: {skipReason(skipped.said)}.")],
  [boundLine(story.deal.words.replace("$", "")), true],
  [BRAND_NAME, file("trust/src/paypal.ts").includes("brand_name: BRAND_NAME")],
  // moment 3
  ["Money on PayPal's sandbox", file("core/src/proof.ts").includes(`title: "Money on PayPal's sandbox"`)],
  ["Cart changed after the hold", file("web/src/Proof.tsx").includes('"sandbox-void": "Cart changed after the hold"')],
  // the close
  ["Judge? Start here", file("web/src/nav/SiteNav.tsx").includes('Judge<span className="dk-jl">? Start here</span>')],
  [TOUR_TITLE, true],
  [CLOSE[0], close.includes("{CLOSE[0]}")],
  [CLOSE[1], close.includes("{CLOSE[1]}")],
  [END_CARD_LINES[0], takes.includes('document.querySelector(".ds-close-notes")') && takes.includes("}, END_CARD_LINES);")],
  [END_CARD_LINES[1], takes.includes('document.querySelector(".ds-close-notes")') && takes.includes("}, END_CARD_LINES);")],
  ...CLOSE_NOTES.map((n): [string, boolean] => [n.text, close.includes("CLOSE_NOTES.map(")]),
  [footer, desk.includes('<p className="dk-footer">Fictional sellers. Practice only: no real money. {payLine}</p>') && desk.includes("const payLine = paymentsWords(mode);")],
  [CREDIT, file("web/src/studio/words.ts").includes(`export const EYEBROW = "${CREDIT}";`) && file("web/src/studio/Shell.tsx").includes("{EYEBROW}")],
];

describe("the shot list quotes only what the site draws, or what the voice says", () => {
  const quoted = quotes(SHOTS);
  it("finds the shot sections, and the voice in them", () => {
    expect(at).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(at);
    expect(VOICE).toContain("Nothing is paid until you tap.");
  });
  it("every quoted line is tied to the code that draws it, or is said by the voice", () => {
    const tied = new Set(ties.map(([l]) => l));
    expect(quoted.filter((q) => !tied.has(q) && !VOICE.includes(q))).toEqual([]);
  });
  it("each tie is still drawn by the code, and the shot list quotes it", () => {
    for (const [line, drawn] of ties) {
      expect(drawn, line).toBe(true);
      expect(quoted, line).toContain(line);
    }
  });
  it("never quotes the six lines live stopped drawing that way", () => {
    const all = flat(SHOTS_MD);
    const gone = ["Set aside: asks to be paid by gift card", "Goose skipped TixQuack", "Fictional sellers. PayPal sandbox.", "Built with AG Grid Community"];
    expect(gone.filter((g) => all.includes(g))).toEqual([]);
  });
});

// The end card is `video:takes --stills`' screenshot of the landing's close (section.ds-close) with the two END_CARD_LINES
// it adds. The address, the QR code, the footer under the close and the credit are not in that section, so the shot list
// names them as added in the edit, each in the site's own words, and nothing else is added.
describe("C3, the end card: what the still draws, then what the edit adds", () => {
  const c3 = SHOTS.slice(SHOTS.indexOf("**C3 ·"), SHOTS.indexOf("- **Voice", SHOTS.indexOf("**C3 ·")));
  const split = c3.indexOf("**Added in the edit**");
  it("the still is the close plus END_CARD_LINES, in the close's own words", () => {
    expect(split).toBeGreaterThan(0);
    expect(takes).toContain('p.locator("section.ds-close")');
    expect(quotes(c3.slice(0, split))).toEqual([CLOSE[0], CLOSE[1], ...END_CARD_LINES, ...CLOSE_NOTES.map((n) => n.text)]);
  });
  it("the edit adds the address and its QR, the landing's footer and Behind the scenes' credit, and nothing more", () => {
    const added = c3.slice(split);
    expect(added).toContain("https://gilded-goose.onrender.com and its QR code");
    expect(quotes(added)).toEqual([footer, CREDIT]);
    expect(file("docs/video-shot-list.md")).toContain("C3's four additions (the address, its QR code, the footer line and the\n  credit) are added in the edit");
  });
  // A sponsor's name on the card is a credit, so it must be true: the build depends on what it names.
  it("the credit names what the site is built with", () => {
    const web = JSON.parse(file("web/package.json")) as { dependencies: Record<string, string> };
    for (const dep of ["ag-studio", "ag-studio-react", "ag-grid-community", "ag-charts-community"]) expect(web.dependencies[dep], dep).toBeTruthy();
  });
});
