// scripts/brief.ts: the checks that read Joshua's words read his brief's public quote (Lead-12, Nov 5), and the quote can
// only tighten. In this repo every quoted line must be whole sentences of his saved message; only a copy marked as the
// public one (no docs/inbox/, and docs/launch/.public-copy) reads the quote alone.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { SUPPORT_LINE } from "../src/view/promises.ts";
import { BRIEF, BRIEF_SOURCE, PUBLIC_MARK, brief } from "../../scripts/brief.ts";
import { privateText } from "./public-copy.ts";

const root = new URL("../../", import.meta.url).pathname;
const dirs: string[] = [];
/** His saved message; the public copy has no inbox (T's Nov 9 dry run), so there it is a stand-in made of the quote's own lines,
 * read from this tree's quote before any case changes it, so every case below runs in both trees. */
const MESSAGE = privateText(BRIEF_SOURCE, () => `${readFileSync(join(root, BRIEF), "utf8").split(/\r?\n/).filter((l) => l.startsWith("> ")).map((l) => l.slice(2)).join("\n")}\n`).text;
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
/** A copy holding the brief, and his message unless `inbox` says otherwise. */
function copy(inbox: "message" | "empty" | "none" | "public", quote?: (q: string) => string): string {
  const d = mkdtempSync(join(tmpdir(), "goose-brief-"));
  dirs.push(d);
  mkdirSync(dirname(join(d, BRIEF)), { recursive: true });
  const q = readFileSync(join(root, BRIEF), "utf8");
  writeFileSync(join(d, BRIEF), quote ? quote(q) : q);
  if (inbox === "public") writeFileSync(join(d, PUBLIC_MARK), "public copy\n");
  else if (inbox !== "none") mkdirSync(join(d, dirname(BRIEF_SOURCE)), { recursive: true });
  if (inbox === "message") writeFileSync(join(d, BRIEF_SOURCE), MESSAGE);
  return d;
}

describe("brief: Joshua's words from their public quote", () => {
  it("this repo: the quote holds his supporting line and his three fears, and each of its lines is in his message", () => {
    const q = brief(root);
    expect(q).toContain(SUPPORT_LINE);
    expect(q).toContain("it'll get tricked, it'll overspend, I won't know what it did");
    const source = MESSAGE;
    for (const line of q.split("\n")) expect([line, source.includes(line)]).toEqual([line, true]);
    // What the old check asserted still holds whenever this one passes: his message has the line.
    expect(source).toContain(SUPPORT_LINE);
  });

  it("one word changed in the quote fails while his message is here", () => {
    const d = copy("message", (q) => q.replace("one safe decision", "one smart decision"));
    expect(() => brief(d)).toThrow(/aren't Joshua's, word for word/);
    const curly = copy("message", (q) => q.replace("it'll overspend", "it’ll overspend")); // a curly apostrophe is a different character
    expect(() => brief(curly)).toThrow(/aren't Joshua's/);
    const cased = copy("message", (q) => q.replace("GOOSE CAN'T OVERSPEND", "Goose can't overspend")); // his capitals are his words
    expect(() => brief(cased)).toThrow(/aren't Joshua's/);
    const added = copy("message", (q) => `${q}> Goose is the safest way to shop.\n`); // a line he never wrote
    expect(() => brief(added)).toThrow(/aren't Joshua's/);
  });

  it("an inbox without his message fails, an empty quote fails, and the public copy (no inbox) reads the quote alone", () => {
    expect(() => brief(copy("empty"))).toThrow(/can't be checked/);
    expect(() => brief(copy("message", (q) => q.replace(/^> .*$/gm, "")))).toThrow(/quotes nothing/);
    expect(() => brief(copy("message", (q) => q.replace(/^> GOOSE.*$/m, "> ")))).toThrow(/empty line/);
    const pub = copy("public");
    expect(brief(pub)).toBe(brief(root));
    expect(brief(pub)).toContain(SUPPORT_LINE);
    // Deleting docs/inbox/ here, with no public mark, doesn't quietly loosen it (Q, MEDIUM 2).
    expect(() => brief(copy("none"))).toThrow(/only the public copy reads the quote alone/);
  });

  it("every line markdown shows as his quote is one it checks (Q, MEDIUM 3)", () => {
    const tail = (q: string, extra: string) => q.replace(/(^> Supporting line:.*$)/m, `$1\n${extra}`);
    expect(() => brief(copy("message", (q) => tail(q, "Goose is the safest way to shop.")))).toThrow(/runs on from the quote/); // a lazy continuation
    expect(() => brief(copy("message", (q) => tail(q, ">Goose is the safest way to shop.")))).toThrow(/doesn't start with "> "/);
    expect(() => brief(copy("message", (q) => tail(q, "  > Goose is the safest way to shop.")))).toThrow(/doesn't start with "> "/);
    expect(brief(copy("message", (q) => tail(q, "")))).toBe(brief(root)); // control: a blank line ends the quote
  });

  it("a fragment or a cut sentence isn't his words, and a Windows checkout reads the same (Q, LOW 4 and 6)", () => {
    expect(() => brief(copy("message", (q) => q.replace(/^> GOOSE CAN'T BE FOOLED.*$/m, "> GOOSE CAN'T")))).toThrow(/word for word and whole/);
    expect(() => brief(copy("message", (q) => q.replace("as the code guarantees, never stronger.", "as the code guarantees,")))).toThrow(/whole/);
    expect(() => brief(copy("message", (q) => q.replace("> Every feature is shown", "> feature is shown")))).toThrow(/whole/); // starts mid-sentence
    expect(() => brief(copy("message", (q) => q.replace('everything before it."', "everything before it.")))).toThrow(/whole/); // his closing quote mark dropped
    // Control: dropping a whole sentence is an excerpt ("quoted word for word, excerpted"), still whole sentences of his.
    expect(brief(copy("message", (q) => q.replace("> Every feature is shown as proof of one promise. ", "> ")))).toContain("\nEach promise is worded");
    expect(brief(copy("message", (q) => q.replace(/\n/g, "\r\n")))).toBe(brief(root));
  });
});
