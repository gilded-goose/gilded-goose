// Joshua's brief (Tue Nov 3, 11:35 PM), read from its public quote, docs/launch/joshua-brief.md (Lead-12, Nov 5: the
// public copy has no docs/inbox/, so the checks that read his words read the quote). The quote can only tighten: wherever
// docs/inbox/ exists (this repo), every quoted line must be a whole sentence run of his saved message, character for
// character, so a check that reads the quote still asserts his exact words. The quote is read alone only in a copy that
// says it is the public one (PUBLIC_MARK, written by the public build); a repo with neither the inbox nor the mark fails,
// so deleting docs/inbox/ here can't quietly loosen it (Q, Nov 5).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const BRIEF = "docs/launch/joshua-brief.md";
export const BRIEF_SOURCE = "docs/inbox/2026-11-03-joshua-final-push-2335.md";
export const PUBLIC_MARK = "docs/launch/.public-copy";

/** True when `line` sits in `source` as whole sentences: it starts a source line or follows ". ", and it ends a source
 * line or is followed by a space, ending on ".", ":" or a closing quote. A fragment ("GOOSE CAN'T") fails. */
function wholeIn(source: string, line: string): boolean {
  if (!/[.:"]$/.test(line)) return false;
  for (let i = source.indexOf(line); i !== -1; i = source.indexOf(line, i + 1)) {
    const starts = i === 0 || source[i - 1] === "\n" || source.slice(i - 2, i) === ". ";
    const after = source[i + line.length];
    if (starts && (after === undefined || after === "\n" || after === "\r" || after === " ")) return true;
  }
  return false;
}

/** The brief's quoted lines (its `> ` lines, without the marker), joined with newlines. Throws on an empty quote, a quote
 * line markdown would show that this doesn't read, or a quoted line that isn't his, word for word, where the repo has an
 * inbox; and in a repo with neither the inbox nor the public mark. */
export function brief(root: string): string {
  const all = readFileSync(join(root, BRIEF), "utf8").split(/\r?\n/);
  const lines: string[] = [];
  all.forEach((l, i) => {
    if (/^\s*>/.test(l)) {
      if (!l.startsWith("> ")) throw new Error(`${BRIEF}:${i + 1} is a quote line that doesn't start with "> "`);
      lines.push(l.slice(2));
    } else if (l.trim() !== "" && i > 0 && all[i - 1]!.startsWith("> ")) {
      throw new Error(`${BRIEF}:${i + 1} runs on from the quote (markdown shows it as his words); leave a blank line`);
    }
  });
  if (lines.length === 0 || lines.some((l) => l.trim() === "")) throw new Error(`${BRIEF} quotes nothing, or quotes an empty line`);
  if (existsSync(join(root, "docs/inbox"))) {
    if (!existsSync(join(root, BRIEF_SOURCE))) throw new Error(`docs/inbox/ is here but ${BRIEF_SOURCE} isn't: the quote can't be checked`);
    const source = readFileSync(join(root, BRIEF_SOURCE), "utf8");
    const off = lines.filter((l) => !wholeIn(source, l));
    if (off.length) throw new Error(`${BRIEF} quotes words that aren't Joshua's, word for word and whole: ${off.map((l) => JSON.stringify(l.slice(0, 60))).join(", ")}`);
  } else if (!existsSync(join(root, PUBLIC_MARK))) {
    throw new Error(`no docs/inbox/ and no ${PUBLIC_MARK}: only the public copy reads the quote alone`);
  }
  return lines.join("\n");
}
