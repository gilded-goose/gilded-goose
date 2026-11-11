// The team line and the repo and video placeholders (scripts/claims-placeholders.ts, run by scripts/check-claims.ts).
// Joshua's mandate, Fri Oct 30 2:40 PM, item 5: the team is "Joshua Javier and Lucas (a team of two)", exactly, on the
// README, Devpost and the video credits; the repo and video links stay placeholders until he fills them.

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLAIMS_KEY, OLD_TEAM_PLACEHOLDER, PASTE_FROM, PASTE_TO, PLACEHOLDERS, STAGED_FILES, TEAM, TEAM_FILES, VERDICT_FILES, competitorFails, judgePathFails, pastedFails, pastedRange, placeholderFails, privatePathFails, processWordFails, stagedFails, verdictWordFails } from "../../scripts/claims-placeholders.ts";

const read = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
const REPO = "**Code:** **[placeholder: public repo link, Nov 11]**";
const VIDEO = "**Video:** **[placeholder: video link, Wed Nov 11]**";

/** Texts that keep every rule; each test breaks one thing. */
function good(): Record<string, string> {
  return {
    "README.md": `# Gilded Goose\n${VIDEO}\n${REPO}\n**Team:** ${TEAM}\n`,
    "docs/devpost.md": `${VIDEO}\n${REPO}\n**Team:** ${TEAM}\nA team of Claude Code agents wrote code.\n`,
    "docs/video-shot-list.md": `End card: "${TEAM}".\n`,
  };
}

describe("the team line and the placeholders", () => {
  it("passes texts that keep every rule", () => {
    expect(placeholderFails(good())).toEqual([]);
  });

  it("holds the team to Joshua's words, exactly", () => {
    expect(TEAM).toBe("Joshua Javier and Lucas (a team of two)");
    expect([...TEAM_FILES]).toEqual(["README.md", "docs/devpost.md", "docs/video-shot-list.md"]);
  });

  it.each(TEAM_FILES)("fails when %s loses the team line", (f) => {
    const t = good();
    t[f] = t[f]!.replace(TEAM, "");
    expect(placeholderFails(t).some((m) => m.startsWith(`${f}: the team line`))).toBe(true);
  });

  it.each([
    ["a shorter name", "Joshua and Lucas"],
    ["another size", "Joshua Javier and Lucas (a team of three)"],
    ["an ampersand", "Joshua Javier & Lucas (a team of two)"],
    ["lower case", "joshua javier and lucas (a team of two)"],
  ])("fails a near miss: %s", (_, wrong) => {
    const t = good();
    t["docs/devpost.md"] = t["docs/devpost.md"]!.replace(TEAM, wrong);
    expect(placeholderFails(t).length).toBeGreaterThan(0);
  });

  it("fails a second, different team line beside the right one", () => {
    const t = good();
    t["README.md"] += "Built by Joshua and Lucas.\n";
    expect(placeholderFails(t)).toEqual([expect.stringContaining("README.md: names Lucas 2 time(s)")]);
  });

  it("fails a team size said outside the exact line, but not a team of agents", () => {
    const t = good();
    t["docs/video-shot-list.md"] += "We are a team of 3.\n";
    expect(placeholderFails(t)).toEqual([expect.stringContaining("team size")]);
    expect(placeholderFails(good())).toEqual([]);
  });

  it("fails while any text still says the old team placeholder", () => {
    const t = good();
    t["docs/devpost.md"] += `Roles: **${OLD_TEAM_PLACEHOLDER}**\n`;
    expect(placeholderFails(t)).toEqual([expect.stringContaining(`docs/devpost.md: still says "${OLD_TEAM_PLACEHOLDER}"`)]);
  });

  it.each(PLACEHOLDERS.flatMap((p) => p.files.map((f) => [p.text, f] as const)))("fails when %s is gone from %s", (text, f) => {
    const t = good();
    t[f] = t[f]!.split("\n").filter((l) => !l.includes(text)).join("\n");
    expect(placeholderFails(t)).toEqual([expect.stringContaining(`${f}: the placeholder "${text}" is gone`)]);
  });

  it("fails a placeholder that sits beside a real link", () => {
    const t = good();
    t["README.md"] = t["README.md"]!.replace(VIDEO, `${VIDEO} https://example.com/watch`);
    expect(placeholderFails(t)).toEqual([expect.stringContaining("sits beside a link")]);
  });

  it("fails when a file isn't given at all", () => {
    const t = good();
    delete t["docs/video-shot-list.md"];
    expect(placeholderFails(t)).toEqual(["docs/video-shot-list.md: not read"]);
  });

  it("fails on a team size said another way: solo, duo, an N-person team", () => {
    for (const said of ["Built solo.", "We are a duo.", "A two-person team built it.", "A 3-member team", "A 2 person team"]) {
      const t = good();
      t["docs/devpost.md"] += `${said}\n`;
      expect(placeholderFails(t), said).toEqual([expect.stringContaining("gives a team size")]);
    }
  });

  it("fails when any line holding a placeholder has a link, in any form", () => {
    for (const link of ["www.example.com", "youtu.be/abc", "youtube.com/watch", "github.com/x/y", "[watch](here)"]) {
      const t = good();
      t["README.md"] += `${VIDEO} ${link}\n`;
      expect(placeholderFails(t), link).toEqual([expect.stringContaining("sits beside a link")]);
    }
  });

  it("fails when the shot list's team line isn't in the end card", () => {
    const t = good();
    t["docs/video-shot-list.md"] = `- Close voice.\n\n- Credits: "${TEAM}".\n`;
    expect(placeholderFails(t)).toEqual([expect.stringContaining("isn't in the end card")]);
  });

  it("passes the real README, Devpost text and shot list", () => {
    expect(placeholderFails(Object.fromEntries(TEAM_FILES.map((f) => [f, read(f)])))).toEqual([]);
  });
});

// Joshua's strategy, Fri Oct 30 3:25 PM: Channel3, AG Studio and the tour wait as staged drafts until their code ships.
describe("staged lines wait for their code", () => {
  const texts = (readme: string, voice: string, prose = ""): Record<string, string> => ({
    "README.md": readme, "docs/devpost.md": "Goose.\n", "docs/video-shot-list.md": `${prose}\n> ${voice}\n`,
  });

  it("passes when no staged line shows, even if the shot list's prose stages it", () => {
    expect(stagedFails(texts("Goose.", "Goose."), [])).toEqual([]);
    expect(stagedFails(texts("Goose.", "Goose.", "- lands with Track C3: real prices from Channel3; AG Studio; the tour"), [])).toEqual([]);
  });

  it("fails each staged name in the README, the Devpost or the voice", () => {
    expect(stagedFails(texts("Real prices from Channel3.", "Goose."), [])).toEqual([expect.stringContaining("README.md: names Channel3 before Track C3")]);
    expect(stagedFails(texts("Goose.", "Built in AG Studio."), [])).toEqual([expect.stringContaining("docs/video-shot-list.md: names AG Studio before Track AS")]);
    expect(stagedFails(texts("Prices from Channel-3, built in ag-studio.", "Goose."), [])).toHaveLength(2);
    const indented = texts("Goose.", "Goose.");
    indented["docs/video-shot-list.md"] = "  > Prices from Channel3.\n";
    expect(stagedFails(indented, [])).toEqual([expect.stringContaining("names Channel3")]);
    const t = texts("Goose.", "Goose.");
    t["docs/devpost.md"] = "Take the tour.\n";
    expect(stagedFails(t, [])).toEqual([expect.stringContaining("docs/devpost.md: names the tour before Track S1")]);
  });

  it("lets a line through once its track lands a row (the tour's row must be about the tour)", () => {
    const t = texts("Real prices from Channel 3. Take the tour.", "Built in AG Studio.");
    expect(stagedFails(t, [{ id: "c3-prices", claim: "x" }, { id: "as-dash", claim: "y" }, { id: "s1-tour", claim: "the tour takes 3 minutes" }])).toEqual([]);
    expect(stagedFails(t, [{ id: "c3-prices", claim: "x" }, { id: "as-dash", claim: "y" }, { id: "s1-glass", claim: "glass" }])).toEqual([expect.stringContaining("names the tour")]);
    // S1's real row names the tour in its id, not its claim ("Everything Goose does, in about 3 minutes.").
    expect(stagedFails(t, [{ id: "c3-prices", claim: "x" }, { id: "as-dash", claim: "y" }, { id: "s1-tour-time", claim: "Everything Goose does, in about 3 minutes." }])).toEqual([]);
    expect(stagedFails(t, [{ id: "c3-prices", claim: "x" }, { id: "as-dash", claim: "y" }, { id: "s1-nav", claim: "about 3 minutes" }])).toEqual([expect.stringContaining("names the tour")]);
  });

  it("passes the real README, Devpost text and shot list against the real rows", () => {
    const rows = read("docs/claims.md").split("\n").filter((l) => l.startsWith("| ")).map((l) => l.split("|").map((c) => c.trim()))
      .map((c) => ({ id: c[1]!, claim: c[2]! }));
    expect(stagedFails(Object.fromEntries(STAGED_FILES.map((f) => [f, read(f)])), rows)).toEqual([]);
  });
});

describe("no competitor is named in public text", () => {
  it("fails a named rival protocol or payment company, and passes the sponsors and our own tools", () => {
    expect(competitorFails({ "docs/devpost.md": "Goose follows the same idea as AP2's cart mandate." })).toEqual([expect.stringContaining('names "AP2"')]);
    expect(competitorFails({ "README.md": "Pay with Stripe." })).toHaveLength(1);
    expect(competitorFails({ "README.md": "PayPal sandbox, AG Grid, Claude Haiku, Whisper tiny.en, a cart-mandate protocol." })).toEqual([]);
  });

  it("passes the real README, Devpost text, shot list and script", () => {
    const files = ["README.md", "docs/devpost.md", "docs/video-shot-list.md", "docs/beat-script.md"];
    expect(competitorFails(Object.fromEntries(files.map((f) => [f, read(f)])))).toEqual([]);
  });
});

// R, Thu Nov 5 night: "[placeholder: video link]" sat in Presentation, inside the About text judges are pasted.
describe("nothing unfinished in Devpost's pasted About range", () => {
  const head = `**Video:** **[placeholder: video link, Wed Nov 11]** \`TODO(Joshua)\`\n\n`;
  const body = `${PASTE_FROM}\nOpen the site.\n\n## Presentation\nThe video shows the flow.\n\n${PASTE_TO}\nTypeScript\n`;
  const tail = `\n---\n\n## Open before submit\n- TODO: the video link [placeholder: video link]\n`;
  const ok = head + body + tail;

  it("passes when the only placeholders sit in the header fields and below the line", () => {
    expect(pastedFails(ok)).toEqual([]);
    expect(pastedRange(ok)).toContain("TypeScript");
    expect(pastedRange(ok)).not.toContain("Open before submit");
  });

  it.each([
    ["a link placeholder", "**[placeholder: video link, Wed Nov 11]** The video"],
    ["a TODO", "TODO(Joshua) say the date"],
    ["a TBD", "Prize: TBD"],
    ["a FIXME", "FIXME: the count"],
    ["the old team placeholder", "[Joshua fills in]"],
  ])("fails %s inside the range", (_, line) => {
    expect(pastedFails(ok.replace("The video shows the flow.", line))).toEqual([expect.stringContaining("judges would see it")]);
  });

  it("fails when the range's start or end heading is gone, so the check can't silently pass", () => {
    expect(pastedFails(ok.replace(PASTE_FROM, "## Judge Goose"))).toEqual([expect.stringContaining("can't be found")]);
    expect(pastedFails(ok.replace(PASTE_TO, "## Tools"))).toEqual([expect.stringContaining("can't be found")]);
  });

  it("passes the real Devpost text", () => {
    expect(pastedFails(read("docs/devpost.md"))).toEqual([]);
  });
});

describe("one word per verdict: set aside, never refused, in the README, FAQ and pasted Devpost", () => {
  const real = () => Object.fromEntries(VERDICT_FILES.map((f) => [f, read(f)]));
  const with1 = (line: string) => ({ ...real(), "README.md": `${read("README.md")}\n${line}\n` });

  // Each line here is how "refused" read in the README before Nov 5's sweep.
  it.each([
    "with the AI reader on, 0 of 60 (19 held for your yes, 41 refused).",
    "On the Oct 28 recorded set, 0 of 40 fair notes were refused (8 held for your yes, 32 cleared).",
    "On the fresh Nov 4 set, 4 of 30 were refused and 11 held for your yes.",
    "held 9 of 30 fair notes for your yes, refusing none.",
    "Honest notes still get refused.",
    "a deal Goose haggled down, one seller refused, and a real button",
    "reads what the seller wrote and refuses or holds the seller before any order exists.",
  ])("fails %s", (line) => {
    expect(verdictWordFails(with1(line))).toHaveLength(1);
  });

  it.each([
    "code refuses a re-read order whose `custom_id` isn't that hash",
    "the guard refusing a changed cart",
    "the server refuses it on Render",
  ])("leaves code's own refusal alone: %s", (line) => {
    expect(verdictWordFails(with1(line))).toEqual([]);
  });

  it("checks only Devpost's pasted range, and fails a file it wasn't given", () => {
    const outside = `${read("docs/devpost.md")}\n\n| internal | 41 refused) |\n`;
    expect(verdictWordFails({ ...real(), "docs/devpost.md": outside })).toEqual([]);
    expect(verdictWordFails({ "README.md": "" })).toEqual(["docs/launch/faq.md: not read", "docs/devpost.md: not read"]);
  });

  it("passes the real texts", () => {
    expect(verdictWordFails(real())).toEqual([]);
  });
});

// T's Nov 9 dry run (Thu Nov 5): 24 citations in the judge-facing docs pointed at notes the public copy leaves out.
describe("judge-facing docs cite only files the public copy keeps", () => {
  it("fails on each private folder or file, and names the line", () => {
    const f = (t: string) => privatePathFails({ "README.md": `First line.\n${t}` });
    expect(f("Prior art: `docs/inbox/2026-10-28-prior-art.md`.")).toEqual([expect.stringContaining("README.md:2: cites docs/inbox/")]);
    for (const p of ["docs/adr/0001.md", "docs/milestones/m2.md", "docs/student-session/tally-sheet.md", "docs/QUEUE.md", "PROFILE.md", "CLAUDE.md", "docs/guild/001-design.md", "docs/guild/openings/forum.md"])
      expect(f(`See \`${p}\`.`), p).toHaveLength(1);
  });

  it("passes what the copy keeps: the folder, the ratchet's JSON files and the brand guide", () => {
    expect(privatePathFails({ "README.md": "The ratchet (`docs/guild/`, `docs/guild/ratchet.json`, `docs/guild/ratchet-live.json`) and `docs/guild/brand.md` §10.3." })).toEqual([]);
  });
});

// Lead-12, Thu Nov 5 night: a judge doesn't know what "Track C" or "the DD" is.
describe("judge-facing docs use no team-process word unexplained", () => {
  it("fails on a track, a numbered lead, the DD or the Guild", () => {
    for (const w of ["Drafted by Track C.", "Lead-12's call.", "the DD's budget", "the Guild's record"])
      expect(processWordFails({ "docs/launch/faq.md": w }), w).toHaveLength(1);
    expect(processWordFails({ "docs/launch/faq.md": "Drafted by Claude, our lead agent; the design review's budget. Track changes. Leader-board." })).toEqual([]);
  });

  it("lets the claims ledger keep them only while its key explains them", () => {
    expect(processWordFails({ "docs/claims.md": `${CLAIMS_KEY} Track C is one agent.\n| x | Track C: the probe |` })).toEqual([]);
    expect(processWordFails({ "docs/claims.md": "| x | Track C: the probe |" })).toHaveLength(1);
  });

  it("passes the real README, Devpost, FAQ and claims ledger", () => {
    const files = ["README.md", "docs/devpost.md", "docs/launch/faq.md", "docs/claims.md"];
    const real = Object.fromEntries(files.map((f) => [f, read(f)]));
    expect(privatePathFails(real)).toEqual([]);
    expect(processWordFails(real)).toEqual([]);
  });
});

// Track C's cold walk of the judges' steps (Lead-12, Fri Nov 6): a step names what's on screen at 1440 and at 390.
describe("a reader's steps name what's on screen at both widths", () => {
  it("fails on tapping the trick heading and on Judge? Start here with no phone path", () => {
    expect(judgePathFails({ "README.md": "4. Tap **Try to trick Goose** under the ask." })).toEqual([expect.stringContaining("README.md:1: says to tap")]);
    expect(judgePathFails({ "docs/devpost.md": "Open it and click on **Try to trick Goose**." })).toHaveLength(1);
    expect(judgePathFails({ "README.md": "5. **Judge? Start here** in the top bar: each promise." })).toEqual([expect.stringContaining("no phone path")]);
    expect(judgePathFails({ "docs/launch/press-release.md": "Pay with your own PayPal sandbox buyer account." })).toEqual([expect.stringContaining('"your own" sandbox')]);
    expect(judgePathFails({ "README.md": "Pay with **your own sandbox** account." })).toHaveLength(1);
  });

  it("passes the heading named in place, a menu tap, and a phone path on the same or the next line", () => {
    expect(judgePathFails({ "README.md": "Scroll down to **Try to trick Goose**, right under the ask." })).toEqual([]);
    expect(judgePathFails({ "README.md": "On a phone, tap **Menu**, then tap **Try to trick Goose**." })).toEqual([]);
    expect(judgePathFails({ "README.md": "A sandbox buyer account: judges, the testing instructions say how to get ours; anyone else, your own." })).toEqual([]);
    expect(judgePathFails({ "docs/launch/surface-words.md": "Not counting PayPal's own sandbox login." })).toEqual([]);
    expect(judgePathFails({ "README.md": "**Judge? Start here** in the top bar (on a phone, **Menu**, then **Judge tour**)." })).toEqual([]);
    expect(judgePathFails({ "docs/launch/press-release.md": "tap **Judge? Start here** (**Menu**, then\n   **Judge tour**, on a phone)." })).toEqual([]);
  });

  // Lead-12, Fri Nov 6: one of Proof's three sandbox runs is a $0.00 hold that was voided, so "three runs" never stands alone.
  // C's GET of live at 1440 (Fri Nov 6): Three promises and A week with Goose sit between the ask and the trick.
  // Joshua, Fri Nov 6 9:35 AM, decision 1a: the trick is right under the ask. The routes from before (the menu, or after
  // A week with Goose) send a judge the long way, on their line or wrapped to the next; "right under the ask" passes.
  it("fails the old routes to the trick, on their line or wrapped to the next, and passes it right under the ask", () => {
    const menu = "4. Tap **Everything Goose does** (on a phone, **Menu**), then **Try to trick Goose**, and be the seller.";
    expect(judgePathFails({ "README.md": menu })).toEqual([expect.stringContaining("README.md:1: sends a judge the old way to Try to trick Goose")]);
    expect(judgePathFails({ "docs/devpost.md": "Open the site, tap **Everything Goose does** (on a phone,\n**Menu**), then **Try to trick Goose**. No login." })).toEqual([expect.stringContaining("docs/devpost.md:1: sends a judge the old way")]);
    expect(judgePathFails({ "docs/launch/press-release.md": "Scroll to **Try to trick Goose**, after **A week with Goose**." })).toHaveLength(1);
    expect(judgePathFails({ "README.md": "4. **Try to trick Goose** is right under the ask: scroll down to it and be the seller." })).toEqual([]);
    expect(judgePathFails({ "docs/devpost.md": "Open the site: **Try to trick Goose** sits right under\nthe ask. No login." })).toEqual([]);
    expect(judgePathFails({ "README.md": "The answer shows under the Ask box." })).toEqual([]);
  });

  // C's GET of live's Judge tour (Fri Nov 6): its 12 stops never name the Live Threat Board; Behind the scenes leads with it.
  it("fails the Judge tour named as the way to the Live Threat Board, and passes it with Behind the scenes", () => {
    expect(judgePathFails({ "docs/launch/press-release.md": "4. For the rest (the Live Threat Board, the haggle), tap **Judge? Start here** (**Menu**, then\n   **Judge tour**, on a phone)." })).toEqual([expect.stringContaining(":1: sends a reader to the Judge tour for the Live Threat Board")]);
    expect(judgePathFails({ "docs/launch/press-release.md": "4. For the rest, tap **Judge? Start here** (**Menu**, then **Judge tour**, on a phone): the haggle is a stop\n   there, and the Live Threat Board leads **Behind the scenes**." })).toEqual([]);
    expect(judgePathFails({ "docs/launch/faq.md": "- **The Live Threat Board's demo week.** Notes we wrote." })).toEqual([]);
  });

  it("keeps the landing's order the steps quote: Try to trick Goose first under the ask, in the page and its first paint", () => {
    const story = read("web/src/desk/story/Story.tsx").split("\n").map((l) => l.trim());
    expect(story.indexOf("<TrickSlot />") - story.indexOf('<div className="ds" ref={root}>')).toBe(1);
    expect(read("web/src/desk/story/index.tsx")).toContain(`fallback={<div className="ds"><ChallengeStart /></div>}`);
  });

  it("fails three sandbox runs counted as payments, and passes them with the voided hold named within a line", () => {
    expect(judgePathFails({ "README.md": "Proof shows three sandbox runs that did go through, each with PayPal's order id." })).toEqual([expect.stringContaining("README.md:1: counts three sandbox runs")]);
    expect(judgePathFails({ "docs/launch/press-release.md": "To see payments\n   that went through, open **Proof**: three sandbox runs, each with an id." })).toEqual([expect.stringContaining(":2: counts three")]);
    expect(judgePathFails({ "docs/devpost.md": "We made three payments on PayPal's sandbox." })).toHaveLength(1);
    expect(judgePathFails({ "README.md": "open **Proof**: three sandbox runs (two captured, one hold voided), each with PayPal's order id." })).toEqual([]);
    expect(judgePathFails({ "docs/launch/faq.md": "Three runs we watched end to end:\n$50.13 captured; $0.00 captured, the last after the hold was voided." })).toEqual([]);
  });

  it("passes the real README, Devpost and every launch doc", () => {
    const files = ["README.md", "docs/devpost.md", ...readdirSync(new URL("../../docs/launch", import.meta.url)).filter((f) => f.endsWith(".md")).map((f) => `docs/launch/${f}`)];
    expect(judgePathFails(Object.fromEntries(files.map((f) => [f, read(f)])))).toEqual([]);
  });
});
