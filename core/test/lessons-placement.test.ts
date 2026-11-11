import { describe, expect, it } from "vitest";
import { inPublicCopy, privateText } from "./public-copy.ts";

// Lead-12 (Fri Nov 6 01:45): five tracks' one-line lessons landed at the end of the file, under "For the shared file",
// where no session reads them first, and 76 had piled up there. Every "- " line sits in "One line each", except the
// shared-file proposals, which are pinned below by their exact openings (Lead-12, 01:58: a prefix like "Proposed" let a
// stray through). A new shared-file proposal adds its opening to SHARED_FORMS. A merge that re-adds moved lines fails too.
const ONE_LINE = "## One line each";
const SHARED = "## For the shared file";
/** The shared-file proposals, in the file's order, by the exact words each opens with. */
export const SHARED_FORMS = [
  "- Proposed (021 §8, lesson 34): **",
  "- Proposed for the shared file (008): **",
  "- Lesson 5 (one gate runs the real runtime when it isn't the test runner's compiler) and lesson 6",
  "- Proposed (010): **",
  "- Proposed (009): **",
];
/** The shape of a shared-file proposal's opening: a lesson in One line each doesn't take it. */
const SHARED_SHAPE = /^- Proposed( for the shared file)? \(\d{3}[^)]*\): \*\*/;

/** Each "- " line in the wrong place, with its section: outside One line each and not a pinned proposal, or a proposal inside it. */
export function strayLessons(text: string): string[] {
  let section = "";
  const stray: string[] = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) section = line;
    else if (!line.startsWith("- ")) continue;
    else if (section.startsWith(ONE_LINE) ? SHARED_SHAPE.test(line) : !(section === SHARED && SHARED_FORMS.some((f) => line.startsWith(f)))) {
      stray.push(`${section.slice(0, 40)} | ${line.slice(0, 80)}`);
    }
  }
  return stray;
}

/** The public copy leaves LESSONS.md out (T's Nov 9 dry run, Fri Nov 6: read bare, it failed a stranger's pnpm check).
 *  There these run on a stand-in of the same shape; only the line count needs the real file. */
const STAND_IN = [`${ONE_LINE} (a stand-in: the public copy has no LESSONS.md)`, "", "- one lesson", "- another lesson", "", SHARED, "", ...SHARED_FORMS.map((f) => `${f} a shared proposal`), ""].join("\n");

describe("every one-line lesson sits in One line each", () => {
  const { here: HERE, text } = privateText("docs/guild/LESSONS.md", () => STAND_IN);
  const lines = text.split("\n");

  it("the file is here, or it's absent because the public copy leaves it out", () => {
    expect(inPublicCopy("docs/guild/LESSONS.md")).toBe(false); // if the copy ever keeps it, privateText throws and the stand-in goes
    expect(HERE || text.includes("a stand-in")).toBe(true);
  });

  it("LESSONS.md as it is: no stray lesson, sections in place, no line twice", () => {
    expect(strayLessons(text)).toEqual([]);
    const heads = lines.filter((l) => l.startsWith("## "));
    expect(heads[0]).toMatch(/^## One line each/);
    expect(heads.at(-1)).toBe(SHARED);
    const bullets = lines.filter((l) => l.startsWith("- "));
    expect(bullets.filter((l, i) => bullets.indexOf(l) !== i)).toEqual([]);
    expect(bullets.length).toBeGreaterThan(HERE ? 400 : SHARED_FORMS.length);
  });

  it("For the shared file holds exactly the pinned proposals, each once, in order", () => {
    const shared = lines.slice(lines.indexOf(SHARED) + 1).filter((l) => l.startsWith("- "));
    expect(shared.map((l) => SHARED_FORMS.findIndex((f) => l.startsWith(f)))).toEqual(SHARED_FORMS.map((_, i) => i));
  });

  it("a lesson at the end is caught, a stray proposal anywhere is caught, and a lesson starting 'Lesson 47' is not", () => {
    const end = (line: string) => strayLessons(`${text.trimEnd()}\n${line}\n`);
    expect(end("- A new lesson at the end → it goes in One line each")).toHaveLength(1);
    expect(end("- Proposed (099): **a shared rule nobody pinned**")).toHaveLength(1);
    expect(end("- Proposed for later → still a one-line lesson at the end")).toHaveLength(1);
    expect(end("- Lesson 5 (a different lesson 5)")).toHaveLength(1);
    expect(strayLessons(`${ONE_LINE}\n- Proposed (011): **a proposal in One line each**\n`)).toHaveLength(1);
    expect(strayLessons(`${ONE_LINE}\n- Lesson 47 (the DD's rule): a step acts when it changes\n`)).toEqual([]);
    expect(strayLessons(`${ONE_LINE}\n- fine\n## Active\n- stray\n`)).toEqual(["## Active | - stray"]);
  });
});
