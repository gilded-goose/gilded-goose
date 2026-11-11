// Why this matters (Joshua, Nov 4): the section sits right after the Challenge, says what can be confirmed and no more, and
// its one scene can't show what the code wouldn't do.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { quoteNote, verdictOf, watch } from "../src/index.ts";
import { WHAT_KEPT } from "../src/judge/attempts.ts";
import { END_CARD_LINES, IMPACT_FIGURES, IMPACT_HEAD, SCENE_LABEL, SCENE_LINES, SCENE_NOTE } from "../src/view/impact.ts";
import { CLOSE_NOTES } from "../src/view/scroll.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("the Impact section", () => {
  it("comes right after the Challenge, and leads with Joshua's line", () => {
    expect(read("web/src/desk/story/Story.tsx")).toMatch(/<TrickSlot \/>\s*<Impact \/>/);
    expect(IMPACT_HEAD).toBe("Made to protect the people who get scammed online, especially those least able to spot it.");
  });

  it("every figure links to ftc.gov, and the one share is the FTC's own, quoted", () => {
    for (const f of IMPACT_FIGURES) expect(f.url).toMatch(/^https:\/\/www\.ftc\.gov\//);
    const others = IMPACT_FIGURES.filter((f) => f.row !== "ftc-older");
    expect(JSON.stringify(others)).not.toMatch(/\d+ ?%|\bshare\b(?!")/);
    const older = IMPACT_FIGURES.find((f) => f.row === "ftc-older")!;
    expect(older.figure).toBe("46%");
    expect(older.say).toContain("“reported by adults 60 and older.”");
    expect(older.say).toContain("estimated $261.5 billion"); // its base, on the tile: not the reported total beside it
    expect(older.say).not.toMatch(/\d+ ?%/);
    expect(IMPACT_FIGURES.find((f) => f.row === "ftc-gift-share")?.say).toContain("2018 to 2021");
  });

  it("the words moved, so the landing doesn't say them twice; the end card still has them", () => {
    for (const n of CLOSE_NOTES) expect(END_CARD_LINES).not.toContain(n.text);
    expect(read("scripts/video-takes.ts")).toContain("END_CARD_LINES");
  });

  it("the scene is five lines at most, labeled first, and its note is set aside by the real Watcher", () => {
    expect(SCENE_LINES.length).toBeLessThanOrEqual(5);
    expect(SCENE_LABEL).toMatch(/made-up/);
    expect(SCENE_LABEL).toMatch(/fictional/);
    expect(read("web/src/desk/story/Impact.tsx")).toMatch(/<figcaption[^>]*>\{SCENE_LABEL\}<\/figcaption>\s*<ol>/);
    for (const history of [0, 50, null]) expect(verdictOf(watch({ quoted: quoteNote(SCENE_NOTE), history }))).toBe("refuse");
  });

  it("the classmates' page keeps the code's kept words", () => {
    expect(read("docs/launch/how-to-try.md").replace(/\s+/g, " ")).toContain(WHAT_KEPT);
  });
});
