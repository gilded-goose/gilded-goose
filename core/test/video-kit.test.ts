// The video kit (Lead-10, Joshua's final push section 6): its README says the promises in the site's words, the retired line
// stays out of the voice, the sweep catches what it says it does, and no take can add to the live counter.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROMISES, SUPPORT_PROTECT } from "../src/view/promises.ts";
import { MISSED_DROP, PING_NEVER_BUYS, STORY_ITEM, WEEK_NOTE, protectLine, scrollStory, weekMoments } from "../src/view/scroll.ts";
import { THESIS_LINES, THESIS_QUOTE, VISION_CART, VISION_SCREENLESS } from "../src/view/thesis.ts";
import { pingFor } from "../src/ask/watching-list.ts";
import { MOVING_ITEMS, priceOn } from "../src/sellers/moving.ts";
import { TAP_TO_BUY } from "../src/ask/copy.ts";
import { understand } from "../src/ask/understood.ts";
import { VOICE_DECLINED, VOICE_SHOPPING } from "../src/ask/voice.ts";
import { demoCatalogItems, demoPolicy } from "../src/scenario.ts";
import { UNDERSTOOD, asideTag, boundLine, deskPile } from "../src/view/desk.ts";
import type { StoreResult } from "../src/storesync.ts";
import { WAS_WHOSE, wasLine } from "../src/ask/recorded-market.ts";
import { TOUR_TITLE } from "../src/view/tour.ts";
import { PROMISES as PROMISE_LINES } from "../src/view/promises.ts";
import { END_CARD_LINES } from "../src/view/impact.ts";
import { SET_YOUR_PRICE } from "../src/view/watching-words.ts";
import { spendsTheCounter } from "../../scripts/video-guard.ts";
import { NEVER_NAMED, privatePathFails, processWordFails } from "../../scripts/claims-placeholders.ts";
import { SHOT_LIST_DROPS, VOICE_DROPS, cleanBrand, cleanFaq, dropSections, isClean, kitContents, kitPaths, sweep, takesIndex, type TakeRow } from "../../scripts/video-kit-words.ts";

const file = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const README = file("docs/video-kit/README.md");
const voiceOf = (p: string) => file(p).split("\n").filter((l) => l.startsWith("> ")).join(" ");

describe("the kit's README", () => {
  it("carries each promise word for word, with its line", () => {
    for (const p of PROMISES) expect(README).toContain(`**${p.head}** ${p.line}`);
  });
  it("gives the live link, the tour and the current lines", () => {
    expect(README).toContain("https://gilded-goose.onrender.com/?desk=tour");
    expect(README).toContain(SUPPORT_PROTECT.join(" "));
    expect(README).toContain("Nothing is paid until you tap.");
  });
  it("is clean by the kit's own sweep", () => {
    expect(sweep({ "README.md": README })).toEqual([]);
  });
});

// "A Week with Goose" (Joshua, Thu Nov 5 6:10 PM): the video's four beats, each a day and one sentence. Every day, seller
// and price in them is read here from the recorded week the site replays, so a change to the week fails this, not the cut.
describe("the kit's spine: A Week with Goose", () => {
  const story = scrollStory();
  const week = MOVING_ITEMS.find((i) => i.id === STORY_ITEM)!;
  const whole = (c: number) => { expect(c % 100).toBe(0); return `$${c / 100}`; };
  const firstDay = (id: string) => week.sellers.find((s) => s.sellerId === id)!.curve[0]!.day + 1; // the site counts from Day 1
  const limit = whole(story.limit.cents), scam = whole(story.scam.total), deal = whole(story.deal.total);
  it("the week says what the beats say: the scam is the cheapest, set aside, and the deal is under the limit on Day 5", () => {
    expect(story.cheapestWasScam).toBe(true);
    expect(story.scam.verdict).toBe("refuse");
    expect(story.deal.total).toBeLessThanOrEqual(story.limit.cents);
    expect([story.scam.name, story.deal.name]).toEqual(["TixQuack", "Lantern Hall Box Office"]);
    expect(firstDay(story.scam.id)).toBe(2);
    expect(story.day).toBe(5);
    expect(story.deal.byDay[story.day - 2]).toBeGreaterThan(story.deal.total); // it fell on Day 5, not before
  });
  it("carries the four beats word for word, with the week's own days and prices", () => {
    // The beats are the landing's week (P's weekMoments, one source), row by row, in order.
    const moments = weekMoments();
    expect(moments).toHaveLength(4);
    const rows = README.split("\n").filter((l) => /^\| [1-4]\. /.test(l));
    expect(rows.map((r, i) => r.includes(`| Day ${moments[i]!.day} | ${moments[i]!.line} |`))).toEqual([true, true, true, true]);
    // and the week still says what the beats need: a Day 1 ask, the scam's first day, the deal's day
    expect(moments.map((m) => m.day)).toEqual([1, firstDay(story.scam.id), story.day, story.day]);
    expect(moments.map((m) => m.line).join(" ")).toContain(`${story.scam.name}, asks ${scam} by gift card`);
    expect(moments[2]!.line).toContain(`falls to ${deal}, under your ${limit}`);
    // Goose sends no notification anywhere in the code, so the beats never say it does (the ping is the deal, shown).
    expect(README.slice(README.indexOf("## The spine"), README.indexOf("## The three promises"))).not.toMatch(/notif|pings? you|lets you know|alert/i);
    expect(README).toContain("**These moments come from our practice market. Prices are simulated.**");
  });
  it("says why beats 3 and 4 are one day: the price goes back up the next day", () => {
    const next = priceOn(week.sellers.find((s) => s.sellerId === story.deal.id)!.curve, story.day)!.total; // day index = Day 6
    expect(next).toBeGreaterThan(story.limit.cents);
    expect(README).toContain(`back up to ${whole(next)} on Day ${story.day + 1}`);
  });
  // The take waits on the moment's words read from code (Track T, Nov 6): it waited on the retired "Day 5." heading and
  // timed out on live 7f4d95d2 while this test still passed, because the pin was the take's own string.
  it("beat 3's take exists and waits on the landing moment's current words", () => {
    const takes = file("scripts/video-takes.ts");
    const moment = file("web/src/desk/story/Moment.tsx");
    expect(takes).toContain(`id: "k-day5", beat: "week 3, the ping", where: "live"`);
    expect(takes).toContain(`hasText: "${MISSED_DROP[0]}"`);
    expect(moment).toContain("{MISSED_DROP[0]}");
    expect(takes).toContain(`hasText: "Simulated day ${story.day}"`);
    expect(moment).toContain("Simulated day {story.day}");
    expect(takes).toContain(`hasText: "${story.deal.words}"`);
    for (const cls of ["ds-moment", "ds-moment-h", "ds-ticket-top", "ds-now-price", "ds-ticket-price", "ds-track"]) {
      if (takes.includes(`".${cls}`)) expect(moment).toMatch(new RegExp(`className="[^"]*\\b${cls}\\b`));
    }
  });
});

// The filming guide (Lead-12, Nov 6: "each beat with its route, the click, and the line on screen, so Joshua can film
// without asking"). Every line it quotes as on screen is tied here to the code that draws it: a value from code, or the
// literal in the component. A quote with no tie fails, so a line the site retires fails here, not on the re-shoot (Track
// T, Nov 6: k-day5 still waited on "Day 5." after the landing said "Missed the drop?").
describe("the kit's filming guide", () => {
  const story = scrollStory();
  const desk = file("web/src/desk/Desk.tsx"), moment = file("web/src/desk/story/Moment.tsx");
  const at = README.indexOf("## Film it beat by beat"), end = README.indexOf("## What the judges score");
  const quoted = [...README.slice(at, end).replace(/\s+/g, " ").matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
  const results = story.sellers.map((x) => ({ watcher: x.verdict }) as unknown as StoreResult);
  const why = story.scam.why!;
  const tag = asideTag([why.replace(/^it /, "")]);
  const was = `${story.deal.firstWords} ${WAS_WHOSE}. ${wasLine("seat", story.deal.firstDay, "waited")}`;
  // [the line as the guide quotes it, whether code draws exactly it]
  const ties: [string, boolean][] = [
    [UNDERSTOOD, true],
    [deskPile(results), true],
    [`Set aside: ${tag}`, desk.includes("`Set aside: ${asideTag(")],
    [protectLine(story.scam.name), true],
    [`Why Goose set ${story.scam.name} aside`, desk.includes("Why Goose set {sellerName(skipped.merchant)} aside")],
    [`${why[0]!.toUpperCase()}${why.slice(1)}.`, true],
    ["Its note is data. Goose never follows it.", desk.includes("Its note is data. Goose never follows it.")],
    ["Your limit lives in code. A seller's words can't change it.", desk.includes("Your limit lives in code. A seller's words can't change it.")],
    [MISSED_DROP[0], moment.includes("{MISSED_DROP[0]}")],
    [MISSED_DROP[1], moment.includes("{MISSED_DROP[1]}")],
    [`Simulated day ${story.day}`, moment.includes("Simulated day {story.day}")],
    [story.deal.words, moment.includes("{deal.words}")],
    [`Your ${story.limit.words} ${story.limit.label}`, moment.includes("Your {story.limit.words} {story.limit.label}")],
    [`Was ${was}`, desk.includes(`Was <s className="dk-was">{usdOf(was.total)}</s> {was.whose}. {was.line}`)],
    [boundLine(story.deal.words.replace("$", "")), true],
    [`Paid ${story.deal.words}`, desk.includes("`Paid ${usdOf(back.total)}`")],
    ["You approved this exact cart in PayPal, and code checked it again before taking payment.",
      desk.includes(`"You approved this exact cart in PayPal, and code checked it again before taking payment."`)],
    [WEEK_NOTE, true],
    [TOUR_TITLE, true],
  ];
  it("sits after beat 3's versions and before what the judges score", () => {
    expect(at).toBeGreaterThan(README.indexOf("## Beat 3: which version you film"));
    expect(end).toBeGreaterThan(at);
  });
  it("quotes only lines tied to the code that draws them", () => {
    const tied = new Set(ties.map(([line]) => line));
    expect(quoted.filter((q) => !tied.has(q))).toEqual([]);
  });
  it("each tie is still drawn by the code, and the guide quotes it", () => {
    for (const [line, drawn] of ties) {
      expect(drawn, line).toBe(true);
      expect(quoted, line).toContain(line);
    }
  });
  it("the shot list's count, set-aside row and day-1 price are the run's own", () => {
    const shots = file("docs/video-shot-list.md").replace(/\s+/g, " ");
    expect(shots).toContain(`"${deskPile(results)}"`);
    expect(shots).toContain(`"Set aside: ${tag}"`);
    expect(shots).toContain(`"Was ~~${story.deal.firstWords}~~ ${WAS_WHOSE}. ${wasLine("seat", story.deal.firstDay, "waited")}"`);
  });
  // Track T's walk of 4aefda21 (Nov 6): after beats 1 and 2, the site's bare address in the same tab reopened the run (the
  // tab keeps it, on purpose), so "Go to <site>/" never reached the ticket. The guide goes back by the name at the top
  // left, whose link is ?desk=1, or by a new tab, which keeps nothing.
  it("beat 3 goes back to the landing a way that shows it after a run", () => {
    const g = README.slice(at, end).replace(/\s+/g, " ");
    const beat3 = g.slice(g.indexOf("**Beat 3,"), g.indexOf("**Beat 4,"));
    const history = file("web/src/desk/desk-history.ts");
    expect(history).toContain('const KEY = "gg-desk-run";');
    expect(history).toContain("sessionStorage.setItem(KEY,");
    expect(file("web/src/nav/SiteNav.tsx")).toContain('<Lockup href={appHref("?desk=1")} />');
    expect(beat3).toContain("**Gilded Goose** name at the top left");
    expect(beat3).toContain("in a new tab");
    expect(beat3).not.toMatch(/\*\*Go to\*\* https:\/\/gilded-goose\.onrender\.com\/ and scroll/);
  });
});

// Beat 3 with the real ping (Joshua, Nov 5 6:40 PM §3): written both ways, with the switch stated, outside the spine, so the
// spine's notification-word ban holds until the ping is live and green. The take is the OS's own notification: by hand,
// whole screen, never faked, and it stops short of PayPal's sign-in.
describe("beat 3's two versions, and the switch between them", () => {
  const flat = (s: string) => s.replace(/\s+/g, " ");
  const at = README.indexOf("## Beat 3: which version you film");
  const sec = flat(README.slice(at, README.indexOf("\n## ", at + 1)));
  it("sits after the spine and the promises, so the spine's ban still covers the whole spine", () => {
    expect(at).toBeGreaterThan(README.indexOf("## The three promises"));
    expect(README.indexOf("## The spine")).toBeLessThan(README.indexOf("## The three promises"));
  });
  it("states the switch, both versions, and the fallback in the spine's own words", () => {
    expect(sec).toContain("filmed only if the site's browser notification is live and its check is green by Saturday, Nov 7. If it isn't, film the fallback.");
    expect(sec).toContain("set your price, the real notification lands, one tap opens your ask at your price, you press Shop for this, Goose runs it, and Approve $84.00 is in view for your tap in PayPal.");
    expect(sec).not.toContain("one tap opens the deal");
    const spineBeat3 = README.split("\n").find((l) => l.startsWith("| 3. "))!;
    expect(spineBeat3).toContain("so Goose shows you the deal.");
    expect(sec).toContain('beat 3 stays as the spine says: "Goose shows you the deal"');
    expect(flat(README)).toContain('see "Beat 3: which version you film", below.');
  });
  it("films the OS's own notification on desktop Chrome, whole screen, never faked, and never signs in", () => {
    for (const must of ["desktop Chrome on a Mac", "Record the **whole screen**", "**Never fake it:**", "never when the page loads",
      "Keep its words as they are, the \"simulated\" label included.", "and don't press it: PayPal's page needs a sign-in"]) expect(sec).toContain(must);
    expect(sec).not.toMatch(/\b(type|enter) (your|the) (password|login)/i);
    expect(file("scripts/video-takes.ts")).toMatch(/\{ id: "j-ping", beat: "3, the real ping", sizes: \["1440"\] as Size\[\], by: "the video team" \}/);
  });
  // P, Nov 5: the click opens the ask held to her price (the same path as "Shop at your price"), not the deal; Approve
  // shows only once that run lands. A take that says the deal opens at the click films a wait the team didn't plan for.
  it("the click opens the ask, the run lands the deal, and the take stops on Approve unpressed", () => {
    // T's walk of live's code (69624fd4, Fri Nov 6): the tapped ask waits; no Approve after 10 s until Shop for this.
    const steps = ["**One tap.** Click the notification.", `"${UNDERSTOOD.replace(/\.$/, "")}", your ask held to your $90.00 max. The deal isn't on screen yet.`,
      "**The run, then stop.**", "Press **Shop for this**: the run doesn't start on its own.", `**Approve $${(scrollStory().deal.total / 100).toFixed(2)}** in view. Stop there, and don't press it`];
    let from = 0;
    for (const s of steps) { const i = sec.indexOf(s, from); expect(i, s).toBeGreaterThan(-1); from = i; }
  });
  it("sets up a prompt that will actually show, on desktop Chrome only", () => {
    for (const must of ["a profile that already allowed or blocked it shows no prompt", "Reset permission",
      "on Android, iPhone and iPad the site never asks", "The field starts at the ticket's own max; type 90.",
      "one day per second, and day 5 crosses $90", "not a real store's watch"]) expect(sec).toContain(must);
  });
  // The site's own line (row yp-missed), read from the landing's moment.
  it("says the site's line over the press, and nothing over the notification", () => {
    expect(sec).toContain(`said over the press of **Set your price**: "${MISSED_DROP.join(" ")}" Say nothing over the notification itself`);
    expect(sec).not.toContain("say none over it");
  });
  // The notification's words are the server's (pingFor, row yp-ping-words), on the watch the take sets: $90 on the ticket.
  it("quotes the notification as pingFor writes it for a $90 watch on the ticket", () => {
    const ping = pingFor({ catalogId: STORY_ITEM, priority: "really", max: 9000, at: 1 }, demoCatalogItems(), demoPolicy())!;
    expect(sec).toContain(`It reads **${ping.title}**, then "${ping.body}"`);
    expect(ping.body).toMatch(/^Simulated day 5: /);
  });
});

// The close (C, Nov 5 ~11 PM, after 6b3c3455): what's next, marked as our view, then Why now, ending on the tap. Every line
// is thesis.ts's, so a reworded line there fails here; the kit is in each row's Shows in, so check-claims holds it too.
describe("the close: our view, then why now", () => {
  const at = README.indexOf("## The close: our view, then why now");
  const sec = README.slice(at, README.indexOf("\n## ", at + 1));
  const said = [VISION_SCREENLESS, VISION_CART, THESIS_QUOTE, ...THESIS_LINES];
  const MARK = "Our view of what's next, not a feature.";
  it("says the marker, then each line in C's order, and ends on the tap", () => {
    let from = sec.indexOf(`"${MARK}"`);
    expect(from).toBeGreaterThan(-1);
    for (const l of said) { const i = sec.indexOf(`"${l}"`, from); expect(i, l).toBeGreaterThan(from); from = i; }
    expect(THESIS_LINES.at(-1)).toMatch(/the only thing that pays\.$/);
    expect(sec.slice(from).match(/^ {3}- "/gm)).toBeNull(); // nothing said after it
  });
  it("keeps the vision lines voice only, and the thesis on screen only from the landing", () => {
    expect(sec).toContain("the two lines about what's next are voice only, never type");
    expect(sec).toContain("go on screen only once the landing's Why now section shows them");
  });
  it("states its time from its own words, at the shot list's pace, against the shot list's own totals", () => {
    const words = [MARK, ...said].join(" ").split(/\s+/).length;
    const shots = file("docs/video-shot-list.md");
    const pace = Number(shots.match(/at (\d+(?:\.\d+)?) words a second/)![1]);
    const [, total, voice] = shots.match(/\*\*Total (\d:\d\d)\*\*[\s\S]*?\*\*(\d+) words\*\*/)!;
    expect(sec.replace(/\s+/g, " ")).toContain(`The close is ${words} words, about ${Math.round(words / pace)} s of voice at the shot list's ${pace} words a second. The shot list's voice is ${voice} words (about 1:40) in a ${total} cut`);
  });
  it("lists the kit in each row's Shows in", () => {
    const claims = file("docs/claims.md").split("\n");
    for (const id of ["c-vision-screenless", "c-vision-cart", "c-thesis-quote", "c-thesis-vision", "c-thesis", "c-thesis-checks"]) {
      const row = claims.find((l) => l.startsWith(`| ${id} |`))!;
      expect(row.split(" | ")[2], id).toContain("`docs/video-kit/README.md`");
    }
  });
  it("says the judges' item 5 ends on the close, not on a line of its own", () => {
    expect(README).toContain("Then the close, below,\n   which ends on the tap.");
    expect(README).not.toMatch(/End on "Nothing is\s+paid until you tap\."/);
  });
});

// C's one word per verdict (Nov 5): the Desk says "Set aside", so the kit, which the video team reads aloud, never says a
// form of "refuse". Every committed kit file, whole-word, no exceptions (the code's own refusals are explained elsewhere).
describe("the kit never says refused", () => {
  it("no form of refuse in any committed kit file", () => {
    // the copies the build writes are gitignored and swept by the build (the next test); the rest is committed
    const BUILT = ["video-ownership-note.md", "press-release.md", "faq.md", "brand.md", "suggestion-voice.md", "suggestion-shot-list.md"];
    const mds = readdirSync(new URL("../../docs/video-kit/", import.meta.url)).filter((f) => f.endsWith(".md") && !BUILT.includes(f));
    expect(mds).toContain("README.md");
    for (const f of mds) expect(file(`docs/video-kit/${f}`).match(/\brefus\w*/gi), f).toBeNull();
  });
  it("the build's sweep stops on a verdict refused in any copy, and leaves the code's own refusal alone", () => {
    expect(sweep({ "faq.md": "Honest notes still get refused." })).toEqual(['faq.md:1: says "still get refused" for a verdict; the Desk\'s word is "set aside"']);
    expect(sweep({ "press-release.md": "the guard refusing a changed cart" })).toEqual([]);
  });
});

// The screenless close's words (P's, via Lead-12, Nov 5): pasted exactly, each line Goose says is the line the code says,
// and Joshua's line reads as the take note says it does, both ways Whisper may write "ninety".
describe("j-voice-close: Joshua's line, its three steps, and its take note", () => {
  const LINE = "Find me one ticket to The Marsh Lights on Saturday, under ninety dollars.";
  it("is in the kit word for word", () => {
    expect(README).toContain(`LINE (Joshua speaks it): "${LINE}"`);
    expect(README).toContain('1. Hold the mic, say the line, let go. The words land in the Ask box; tap Ask, then "Shop for this". Goose says "Shopping for it now."');
    expect(README).toContain('2. Goose reads the sellers. When it sets TixQuack aside (gift card), it says aloud "Set aside. Nothing is paid without your tap.", then "Tap Approve to buy." Captions show both.');
    expect(README).toContain("3. Joshua taps Approve $84.00, PayPal's own page opens, and his tap there pays. Voice never approves; only the tap pays (row p-voice-frame).");
    expect(README).toContain('TAKE NOTE: check "Here\'s what I understood" on each take. If Whisper writes "ninety" as a word, the "under $90" line doesn\'t show (spokenCap reads digits only; the $90.00 Events limit still holds the same cart). Re-take until it shows "under $90".');
  });
  it("every line Goose says in it is the line the code says", () => {
    for (const said of [VOICE_SHOPPING, VOICE_DECLINED, TAP_TO_BUY, UNDERSTOOD.replace(/\.$/, "")]) expect(README).toContain(`"${said}`);
    expect(README).toContain(`Approve $${(scrollStory().deal.total / 100).toFixed(2)}`);
  });
  it("reads as the take note says: digits show under $90, the word doesn't, and the $90.00 Events limit holds both", () => {
    const word = understand(LINE, demoPolicy()), digits = understand(LINE.replace("ninety dollars", "$90"), demoPolicy());
    expect([word.said, word.cap, word.held, word.category]).toEqual([null, null, "90.00", "Events"]);
    expect([digits.said, digits.cap, digits.held, digits.category]).toEqual(["under $90", "90.00", "90.00", "Events"]);
    expect(digits.item).toBe(word.item);
  });
});

// The shot list's staged lines (Track P's spoken words for lines that wait on code, the screenless close among them) are
// dropped from the kit's copy of the shot list, so the README carries them byte for byte instead (Lead-12, Nov 5). A rename
// or an edit on either side fails here, never leaves the video team a stale copy.
describe("the kit's staged lines are the shot list's, word for word", () => {
  const section = (text: string) => {
    const a = text.indexOf("## Staged lines");
    expect(a, "a \"## Staged lines\" heading").toBeGreaterThan(-1);
    const b = text.indexOf("\n## ", a + 5);
    return text.slice(a, b < 0 ? undefined : b).trimEnd();
  };
  it("the README's section equals the shot list's, heading and all", () => {
    const shots = section(file("docs/video-shot-list.md"));
    expect(shots.length).toBeGreaterThan(200); // control: the section has its lines, not just a heading
    expect(section(README)).toBe(shots);
  });
  it("the kit still drops it from its copy of the shot list, so the README is where the team reads it", () => {
    expect(SHOT_LIST_DROPS).toContain("## Staged lines");
  });
});

describe("the voice", () => {
  for (const p of ["docs/beat-script.md", "docs/video-shot-list.md"]) {
    it(`${p} says the current lines, not the retired one`, () => {
      expect(file(p)).not.toMatch(/protects the conversation|Payment networks protect/);
      expect(voiceOf(p)).toContain(SUPPORT_PROTECT.join(" "));
      expect(voiceOf(p)).toContain("Nothing is paid until you tap.");
    });
  }
  it("the sections the kit drops are still there to drop, and the voice survives the drop", () => {
    const shots = dropSections(file("docs/video-shot-list.md"), SHOT_LIST_DROPS);
    for (const h of SHOT_LIST_DROPS) expect(shots).not.toContain(h);
    expect(shots.split("\n").filter((l) => l.startsWith("> ")).join(" ")).toBe(voiceOf("docs/video-shot-list.md"));
    expect(shots).toContain("## Notes for the edit");
    expect(dropSections(file("docs/beat-script.md"), VOICE_DROPS).split("\n").filter((l) => l.startsWith("> ")).join(" ")).toBe(voiceOf("docs/beat-script.md"));
  });
  it("the kit's copies point at the kit, not the repo", () => {
    const out = kitPaths(`${file("docs/beat-script.md")}\n${file("docs/video-shot-list.md")}`);
    expect(out).not.toMatch(/docs\/(beat-script|video-shot-list|launch\/press-release)|docs\/video\/takes/);
  });
  it("a renamed section fails instead of leaking", () => {
    expect(() => dropSections("# a\n## Other\nx\n", ["## Schedule"])).toThrow(/Schedule/);
  });
});

describe("the sweep", () => {
  it.each([
    ["a key", "PAYPAL_CLIENT" + "_SECRET=abc", "secret"],
    ["a private path", "see side-session-" + "notes/x", "private"],
    ["a team note", "measured by Lead-" + "10", "private"],
    ["the env file", "read the ." + "env file", "private"],
    ["a competitor", "faster than Str" + "ipe", "names"],
    ["the market idea", "the Real " + "Market view", "private"],
  ])("stops on %s", (_name, line, says) => {
    const found = sweep({ "x.md": `fine\n${line}` });
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("x.md:2");
    expect(found[0]).toContain(says);
  });
  it("passes plain words", () => {
    expect(sweep({ "x.md": "Goose shops for you. PayPal sandbox. Practice only." })).toEqual([]);
  });
  it("brand.md comes out clean", () => {
    expect(sweep({ "brand.md": cleanBrand(file("docs/guild/brand.md")) })).toEqual([]);
  });
  it("keeps the FAQ's scammer AI line in the kit now the switch is on live, and the scammer take is local", () => {
    const faq = file("docs/launch/faq.md"), clean = cleanFaq(faq);
    expect(clean).toContain("Claude Sonnet 5.5 writes the scammer AI's note, with no tools.");
    expect(sweep({ "x.md": "Send in a scammer AI" })).toEqual([]);
    expect(file("scripts/video-takes.ts")).toMatch(/id: "k-scammer", beat: "[^"]+", where: "local"/);
    expect(clean).toContain("6. builds a chart view");
    expect(clean).toContain("It never holds a limit");
    expect(clean).toMatch(/like typed ones\.\n\nOne other job, when it's switched on:/);
  });
  // T's kit build at c8e8209b (Fri Nov 6) stopped on the shot list's "0 of 40 fair notes refused": only the press release
  // and the FAQ were swept here, so a word the build bans reached the shot list with every test green. Every text the
  // build writes is swept here, built the way the build builds it.
  it("every text the build writes comes out clean, the suggestions included", () => {
    expect(sweep({
      "suggestion-voice.md": kitPaths(dropSections(file("docs/beat-script.md"), VOICE_DROPS)),
      "suggestion-shot-list.md": kitPaths(dropSections(file("docs/video-shot-list.md"), SHOT_LIST_DROPS)),
      "video-ownership-note.md": file("docs/launch/video-ownership-note.md"),
      "brief.md": file("docs/video-kit/brief.md"),
    })).toEqual([]);
  });
  // And check-claims reads every .md in docs/video-kit as a judge doc, built copies included, so a built brand.md that
  // still said "(DD ruling)" failed pnpm check on any machine that had built the kit (T, Fri Nov 6).
  it("every text the build writes passes the judge-doc rules check-claims applies to the folder", () => {
    const built = {
      "brand.md": cleanBrand(file("docs/guild/brand.md")), "faq.md": cleanFaq(file("docs/launch/faq.md")), "press-release.md": file("docs/launch/press-release.md"),
      "suggestion-voice.md": kitPaths(dropSections(file("docs/beat-script.md"), VOICE_DROPS)),
      "suggestion-shot-list.md": kitPaths(dropSections(file("docs/video-shot-list.md"), SHOT_LIST_DROPS)),
      "video-ownership-note.md": file("docs/launch/video-ownership-note.md"),
    };
    expect([...processWordFails(built), ...privatePathFails(built)]).toEqual([]);
    expect(cleanBrand("stays 20 px (DD ruling): at 17 px")).toBe("stays 20 px (design review ruling): at 17 px");
  });
  it("the press release and the FAQ come out clean", () => {
    expect(sweep({ "press-release.md": file("docs/launch/press-release.md"), "faq.md": cleanFaq(file("docs/launch/faq.md")) })).toEqual([]);
  });
  it("keeps brand.md's values", () => {
    const out = cleanBrand(file("docs/guild/brand.md"));
    expect(out).toContain("## 3. Color");
    expect(out).toContain("### 10.1 The lockup");
    expect(out).toContain("#2c1520");
  });
});

describe("what ships", () => {
  it("sorts the kit's own files, and leaves out what never ships", () => {
    expect(kitContents(["README.md", "faq.md", "takes/INDEX.md", "images/share.png", "takes/k-x-390.webm", "takes/k-x-390-last.png", ".gitignore", "gilded-goose-video-kit.zip", ".DS_Store", "takes/.DS_Store"])).toEqual({
      texts: ["README.md", "faq.md", "takes/INDEX.md"],
      media: ["images/share.png", "takes/k-x-390.webm", "takes/k-x-390-last.png"],
      stray: [],
    });
  });
  it.each(["notes.md", "notes.txt", "secrets.json", ".env", "takes/takes.json", "takes/notes.md", "images/.lockup.html", "private/README.md", "private/a.png", "takes/sub/a.webm", "takes/a.webm.txt"])("%s stops the build", (path) => {
    expect(kitContents([path]).stray).toEqual([path]);
  });
  it("the zip takes an explicit list, never the whole folder", () => {
    const src = file("scripts/video-kit.ts");
    expect(src).toContain(`"-@"`);
    expect(src).not.toMatch(/"zip", \["-qr"/);
  });
});

describe("the takes", () => {
  const row = (over: Partial<TakeRow>): TakeRow => ({ id: "k-x", beat: "b", where: "local", size: "1440", file: "docs/video/takes/k-x-1440.webm", seconds: 9, ok: true, consoleErrors: [], ...over });
  it("only a clean take goes in", () => {
    expect(isClean(row({}))).toBe(true);
    expect(isClean(row({ ok: false, error: "never saw it" }))).toBe(false);
    expect(isClean(row({ skipped: "pending: not built" }))).toBe(false);
    expect(isClean(row({ consoleErrors: ["boom"] }))).toBe(false);
  });
  it("the index names the commit that filmed the takes, not the one that built the kit", () => {
    const out = takesIndex([row({ commit: "filmed1" })], "now", "built22");
    expect(out).toContain("filmed from `filmed1`; this kit was built at `built22`");
    expect(takesIndex([row({})], "now", "built22")).toContain("a commit not recorded");
  });
  it("every click on Shop for this moves the pointer off the rows", () => {
    const lines = file("scripts/video-takes.ts").split("\n");
    const clicks = lines.flatMap((l, i) => (/Shop for this\/.*\.click\(\);$|^\s*await shop\.click\(\);$/.test(l) ? [i] : []));
    expect(clicks.length).toBeGreaterThan(0);
    for (const i of clicks) expect(lines[i + 1]).toContain("await pointerAway(p)");
  });
  // Lead-12, Fri Nov 6: the landing's order changes in push 17, so the kit names the live build its live takes match.
  it("the index names the live build the live takes were shot against, and says when it wasn't recorded", () => {
    expect(takesIndex([row({ where: "live", live: "69624fd4" }), row({})], "now", "b")).toContain("The live takes match the live site at `69624fd4`, its /api/health commit when they were shot.");
    expect(takesIndex([row({ where: "live" })], "now", "b")).toContain("at a build not recorded (some not recorded)");
    expect(takesIndex([row({})], "now", "b")).not.toContain("live site at");
    const src = file("scripts/video-takes.ts");
    expect(src).toContain("const LIVE_BUILD = await fetch(`${LIVE}api/health`)");
    expect(src).toContain('...(t.where === "live" && LIVE_BUILD ? { live: LIVE_BUILD } : {})');
    expect(README.replace(/\s+/g, " ")).toContain("**Which build the takes match:** the first lines of `takes/INDEX.md` name the live site's build (its /api/health commit)");
  });
  it("films the trick from its own link, which holds when the landing's order changes", () => {
    const r = README.replace(/\s+/g, " ");
    expect(r).toContain("https://gilded-goose.onrender.com/?desk=1#challenge.");
    expect(r).toContain("film the trick from this link, never by scrolling from the ask or through the menu, and re-shoot `k-challenge` once that build is live.");
  });
  it("the index says what isn't here yet, and who adds the Approve", () => {
    const out = takesIndex([row({}), row({ id: "k-list", skipped: "pending: the Christmas list isn't built on this stack yet", file: "" }), row({ id: "j-pay", where: "hand", skipped: "waits", file: "" })], "now", "abc");
    expect(out).toContain("`k-x-1440.webm`");
    expect(out).toContain("`k-list-1440`: pending");
    expect(out).toContain("Joshua adds this take himself");
    const team = takesIndex([row({ id: "j-ping", where: "hand", skipped: "waits", file: "", by: "the video team" })], "now", "abc");
    expect(team).toContain("`j-ping-1440`: the video team records this take by hand.");
    expect(team).not.toContain("Joshua adds");
  });
  it.each([
    ["POST", "https://gilded-goose.onrender.com/api/runs/trick", true],
    ["POST", "https://gilded-goose.onrender.com/api/runs/scammer", true],
    ["POST", "https://gilded-goose.onrender.com/api/judge", true],
    ["POST", "https://gilded-goose.onrender.com/api/judge/round", true],
    ["GET", "https://gilded-goose.onrender.com/api/runs/trick", false],
    ["POST", "http://localhost:4213/api/runs/trick", false],
    ["POST", "http://127.0.0.1:8813/api/judge", false],
    ["POST", "https://gilded-goose.onrender.com/api/runs/desk", false],
  ])("%s %s: stopped is %s", (method, url, stopped) => {
    expect(spendsTheCounter(method, url)).toBe(stopped);
  });
  it("the list's takes run locally and never film an empty list", () => {
    const src = file("scripts/video-takes.ts");
    expect(src).toMatch(/id: "k-list", beat: "[^"]+", where: "local"/);
    expect(src).toMatch(/id: "k-read", beat: "[^"]+", where: "local"/);
    expect(src.match(/await startDemoList\(p\)/g)).toHaveLength(2);
    expect(src).toMatch(/where === "local"\) \{ await p\.goto\(`\$\{base\}\?desk=1`[^\n]*await runFirst\(p\)/); // the board's take has rows under it
  });
  // Nov 7: k-why-now framed the thesis with the missing layer under it, which names its sources (Visa, AP2, Google), and
  // the kit's sweep reads text files, never a frame. So every take watches its own window, from first frame to last.
  it("every take fails if a name the film never shows is drawn in its window, and the section takes show one section", () => {
    const src = file("scripts/video-takes.ts");
    expect(NEVER_NAMED.test(file("core/src/view/missing-layer.ts"))).toBe(true); // the site does show one, so the guard is needed
    expect(src).toContain('import { NEVER_NAMED } from "./claims-placeholders.ts";');
    expect(src).toContain("await page.addInitScript(seesNamed, NEVER_NAMED.source);");
    expect(src).toContain('await page.exposeFunction("__gooseNamed", (w: string) => { named.add(w); });');
    expect(src).toContain("if (!error && named.size) error = `a name the film never shows was on screen: ${[...named].join(\", \")}`;");
    expect(src).toMatch(/function seesNamed\(source: string\): void \{[\s\S]*?r\.setStart\(n, m\.index\); r\.setEnd\(n, m\.index \+ m\[0\]\.length\);[\s\S]*?b\.top < innerHeight[\s\S]*?setInterval\(look, 250\);/);
    expect(src).toContain('(s as HTMLElement).style.visibility = "hidden"');
  });
  it("the Challenge's take runs locally, and no take sends to a live round itself", () => {
    const src = file("scripts/video-takes.ts");
    expect(src).toMatch(/id: "k-challenge", beat: "[^"]+", where: "local"/);
    expect(src).not.toMatch(/method: "POST"/);
    expect(src).toContain("await watchCounter(ctx, spent)");
  });
});

// The one-page brief (Joshua, Fri Nov 6 9:35 AM, item 2f, via Lead-12): his order, his rules, and every quoted line and
// every dollar figure tied to a claims row that lists the brief, so check-claims re-reads each one there too. Bold words
// are what the screen says, tied to the code that draws them. The ping is what live's code does (69624fd4), walked by
// Track T on a local copy of that commit: the landing link, the form at 90, the notification, the tap, Shop for this.
describe("the brief: one page, Joshua's order, every line tied", () => {
  const BRIEF = file("docs/video-kit/brief.md");
  const flat = (x: string) => x.replace(/\s+/g, " ");
  const story = scrollStory();
  const ping = pingFor({ catalogId: STORY_ITEM, priority: "really", max: 9000, at: 1 }, demoCatalogItems(), demoPolicy())!;
  const claims = file("docs/claims.md").split("\n");
  const row = (id: string) => { const r = claims.find((l) => l.startsWith(`| ${id} |`)); expect(r, id).toBeTruthy(); const c = r!.split(" | "); return { claim: c[1]!, shows: c[2]!, value: c[3]! }; };
  // [the line as the brief quotes it, the row that backs it]
  const ties: [string, string][] = [
    [END_CARD_LINES[1], "c-impact-source"],
    ["Goose shops for you. Nothing is paid until you tap.", "c-launch-story"],
    ...weekMoments().map((m): [string, string] => [`Day ${m.day}: ${m.line}`, "week-moments"]),
    [WEEK_NOTE, "c-week-story"],
    [MISSED_DROP.join(" "), "yp-missed"],
    [ping.body, "yp-ping-words"],
    [PING_NEVER_BUYS, "yp-never"],
    [`Approve ${story.deal.words}`, "c-hero-deal"],
    [PROMISE_LINES[0]!.line, "p-promise-fooled"],
    [VISION_SCREENLESS, "c-vision-screenless"], [VISION_CART, "c-vision-cart"], [THESIS_QUOTE, "c-thesis-quote"],
    [THESIS_LINES[0]!, "c-thesis-vision"], [THESIS_LINES[0]!, "c-thesis"], [THESIS_LINES[1]!, "c-thesis-checks"],
  ];
  // The close's marker is a label, not a claim: it says the next lines are our view. It is the README's spoken line.
  const MARK = "Our view of what's next, not a feature.";
  const quoted = [...flat(BRIEF).matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
  it("runs in Joshua's order: problem, who, why now, the four moments, the ping, the tap, the close", () => {
    const heads = BRIEF.split("\n").filter((l) => l.startsWith("## "));
    expect(heads).toEqual(["## 1. The problem", "## 2. Who it's for", "## 3. Why now", "## 4. The four moments: A Week with Goose (the spine)", "## 5. The ping", "## 6. The tap", "## 7. The close: our view, then why now"]);
    expect(BRIEF.split("\n").length).toBeLessThan(70); // one page
  });
  it("states the rules, and keeps PayPal and Claude in by the organizers' rule", () => {
    const b = flat(BRIEF);
    for (const must of ["YouTube set to **Public**", "Under 3 minutes; the kit's own limit is 2:45.", "No music.", "An AI voiceover is fine",
      "no other company's name or mark", "PayPal and Claude are the exception: the organizers' rule says to name both and show them working, so keep them.",
      "**Claude, shown working:**", "**PayPal, shown working:**"]) expect(b, must).toContain(must);
    expect(flat(README)).toContain("**Length:** under 3 minutes, and the kit's own limit is 2:45.");
    expect(sweep({ "brief.md": BRIEF })).toEqual([]);
  });
  it("quotes only lines tied to a claims row that lists the brief", () => {
    const tied = new Set([...ties.map(([l]) => l), MARK]);
    expect(quoted.filter((q) => !tied.has(q))).toEqual([]);
    for (const [line, id] of ties) {
      const r = row(id);
      expect(quoted, line).toContain(line);
      expect(r.shows, id).toContain("`docs/video-kit/brief.md`");
      expect(line.includes(r.claim) || r.claim.includes(line) || r.value.includes(line), `${id}: ${line}`).toBe(true);
    }
    expect(flat(README)).toContain(`**Say first: "${MARK}"**`);
  });
  it("every dollar figure and day is in a tied row", () => {
    const rowsText = ties.map(([, id]) => { const r = row(id); return `${r.claim} ${r.value}`; }).join(" ");
    const figures = [...new Set(BRIEF.match(/\$\d+(?:\.\d\d)?|\b[Dd]ay \d\b/g)!)];
    expect(figures.length).toBeGreaterThan(5);
    expect(figures.filter((f) => !rowsText.includes(f) && !rowsText.includes(f.replace(/^d/, "D")))).toEqual([]);
  });
  it("films the ping as live's code does it: the landing link, the list, Allow, the words, the tap, Shop for this, Approve unpressed", () => {
    const b = flat(BRIEF);
    const sec = b.slice(b.indexOf("## 5. The ping"), b.indexOf("## 6. The tap"));
    const steps = [`press **${SET_YOUR_PRICE}**. It opens your list`, "price reads 90", `Press **${SET_YOUR_PRICE}** there`, "press **Allow**",
      `It reads **${ping.title}**, then "${ping.body}"`, `Goose opens **${UNDERSTOOD}**, held to your $90 price`, "Press **Shop for this**.",
      `**Approve ${story.deal.words}** comes into view. Stop. Don't press it.`];
    let from = 0;
    for (const s of steps) { const i = sec.indexOf(s, from); expect(i, s).toBeGreaterThan(-1); from = i; }
    expect(sec).toContain("Never faked");
    expect(sec).toContain("desktop Chrome, whole screen");
    // the labels are the code's
    expect(file("web/src/desk/Desk.tsx")).toContain('onClick={() => shopTap(asked)}>Shop for this <Use id="arrow" /></button>');
    expect(file("web/src/desk/Desk.tsx")).toContain("`Paid ${usdOf(back.total)}`");
    expect(b).toContain(`**Paid ${story.deal.words}**`);
  });
  it("ships in the kit with the ownership note, word for word", () => {
    expect(kitContents(["brief.md", "video-ownership-note.md"])).toEqual({ texts: ["brief.md", "video-ownership-note.md"], media: [], stray: [] });
    const src = file("scripts/video-kit.ts");
    expect(src).toContain('copyFileSync(join(ROOT, "docs/launch/video-ownership-note.md"), join(KIT, "video-ownership-note.md"));');
    expect(file("docs/video-kit/.gitignore").split("\n")).toContain("!brief.md");
    expect(sweep({ "video-ownership-note.md": file("docs/launch/video-ownership-note.md") })).toEqual([]);
    expect(BRIEF).toContain("sign `video-ownership-note.md`, in this kit");
    expect(README).toContain("sign `video-ownership-note.md`, in this kit");
  });
  // The class: the README sent the editor to a note the zip never held. Every .md a kit text names is a file the kit ships.
  it("every .md file the README or the brief names is one the kit ships", () => {
    const named = [...new Set(`${README}\n${BRIEF}`.match(/`[^`\s]+\.md`/g)!.map((m) => m.slice(1, -1)))];
    expect(named).toContain("video-ownership-note.md");
    expect(kitContents(named).stray).toEqual([]);
  });
});

// The kit stands alone (Nov 6, for an editor who has never seen Goose and has no team from Sat to Tue): one section with
// the cut's beats and times, the voice as one script, the only added type, and backups he can record himself. Its words
// are the site's and thesis.ts's, read here, so a reworded line fails this, not the edit.
describe("the kit's Start here section", () => {
  const flat = (s: string) => s.replace(/\s+/g, " ");
  const at = README.indexOf("## Start here: the whole cut on one page");
  const sec = README.slice(at, README.indexOf("\n## ", at + 1));
  const script = flat(sec.slice(sec.indexOf("### The voiceover, as one script"), sec.indexOf("### Captions")).split("\n\n").slice(1).join(" ")).trim();
  const rows = sec.split("\n").filter((l) => /^\| (?:[A-J]\. |End card)/.test(l));
  const secs = (t: string) => { const [m, s] = t.split(":").map(Number); return m! * 60 + s!; };
  it("comes first, before the spine, so the editor reads it before any detail", () => {
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(README.indexOf("## The spine"));
  });
  it("says the four moments, the promise, the support line and the whole close in the voice, in order", () => {
    // The cut leaves out VISION_CART for time (the judge seat, Nov 6); the close's section below still lists it.
    const lines = [...weekMoments().map((m) => `Day ${m.day}: ${m.line}`), "Our view of what's next, not a feature.", VISION_SCREENLESS, THESIS_QUOTE, ...THESIS_LINES];
    let from = 0;
    for (const l of lines) { const i = script.indexOf(l, from); expect(i, l).toBeGreaterThan(-1); from = i; }
    expect(script.endsWith(THESIS_LINES.at(-1)!)).toBe(true);
    expect(script).toContain(SUPPORT_PROTECT.join(" "));
    expect(script).toContain("Nothing is paid until you tap.");
  });
  it("its beats run back to back, end under the kit's 2:45, and leave the voice room at the shot list's pace", () => {
    const spans = rows.map((r) => r.split(" | ")[1]!.split("–").map(secs) as [number, number]);
    expect(spans.length).toBe(11);
    expect(spans[0]![0]).toBe(0);
    spans.forEach(([a, b], i) => { expect(b, rows[i]).toBeGreaterThan(a); if (i) expect(a).toBe(spans[i - 1]![1]); });
    const total = spans.at(-1)![1];
    expect(total).toBeLessThan(165);
    expect(sec).toContain(`### The cut, beat by beat (${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")};`);
    const pace = Number(file("docs/video-shot-list.md").match(/at (\d+(?:\.\d+)?) words a second/)![1]);
    expect(script.split(" ").length / pace).toBeLessThan(total - 25); // at least 25 s of picture without voice
  });
  it("says the live AI buyer the live takes were shot with, so \"Claude reads\" over a live take is checkable", () => {
    const live = { id: "m1-scam", beat: "1", where: "live", size: "1440", file: "x", seconds: 1, ok: true, consoleErrors: [], live: "bad654b8" };
    expect(takesIndex([{ ...live, buyer: "claude-haiku-5-5", payment: "sandbox" }], "now", "b")).toContain("Its AI buyer then: `claude-haiku-5-5`, payments in PayPal's sandbox.");
    expect(takesIndex([live], "now", "b")).toContain("Its AI buyer then: not recorded.");
    expect(file("scripts/video-takes.ts")).toContain('...(t.where === "live" ? LIVE_AI : {})');
    expect(flat(sec)).toContain("whose AI buyer is Claude: `takes/INDEX.md` names it");
  });
  it("names only takes the takes script records, or stills it makes", () => {
    const takes = file("scripts/video-takes.ts");
    const named = [...new Set(sec.match(/`([a-z0-9-]+)`/g)!.map((m) => m.slice(1, -1)))];
    expect(named.length).toBeGreaterThan(10);
    for (const id of named) expect(takes, id).toMatch(new RegExp(`(?:id: |\\[|: )"${id}"`));
    for (const still of ["caption-fictional-1440.png", "caption-sandbox-1440.png", "end-card-1440.png"]) expect(sec).toContain(still);
    expect(takes).toContain('name: "fictional", text: "Fictional seller"');
    expect(takes).toContain('name: "sandbox", text: "PayPal sandbox"');
  });
  it("keeps the vision lines and the problem off screen, no music, and no backup that pays, signs in or counts", () => {
    const f = flat(sec);
    for (const must of ["**Never as type:** the problem and who lines (beats A and B), and the two \"what's next\" lines in the close.",
      "**No music and no sound effects.**", "**Cmd-Shift-5**", "**Record Selected Portion**", "not the tabs, not the address bar",
      "**Never record, even as a backup:** pressing Approve", "beat G has no stand-in in the final cut,"]) expect(f, must).toContain(must);
    expect(f).not.toMatch(/\b(type|enter) (your|the) (password|login)/i);
  });
});
