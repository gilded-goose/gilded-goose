// The landing's demo button (web/src/desk/story/Moment.tsx) is named by its visible words, in order (WCAG 2.5.3 Label
// in Name; Round 2 a11y fix 4, axe's label-content-name-mismatch). It is a flex row, so its parts need a real space
// between them (`{" "}`; flex drops a space-only run from the layout, so nothing moves) or the name would run its
// words together ("Approve $84.00Replay"). No aria-label: an aria-label that differs from the visible text is what
// failed. The practice line under the button is its description, not its name.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync(new URL("../../web/src/desk/story/Moment.tsx", import.meta.url), "utf8");
const button = src.slice(src.indexOf('className={`ds-approve'), src.indexOf("</button>"));

describe("the demo button's name is its visible words (Label in Name)", () => {
  it("has no aria-label (the visible words are the name) and keeps the practice line as its description", () => {
    expect(button).not.toMatch(/aria-label/);
    expect(button).toMatch(/aria-describedby="ds-tapline"/);
  });

  it("puts a real space between its parts, so the name reads 'Approve $84.00 Replay', then 'Replay In a real run: …'", () => {
    // Before the tap: Approve, the price, a space, the Replay tag.
    expect(button).toMatch(/Approve <span className="ds-num">\{deal\.words\}<\/span>\{" "\}<span className="ds-tag ds-tag-quiet">Replay<\/span>/);
    // After the tap: the Replay tag, a space, the sentence.
    expect(button).toMatch(/<span className="ds-tag">Replay<\/span>\{" "\}In a real run: /);
  });
});
