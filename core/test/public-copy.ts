import { existsSync, readFileSync } from "node:fs";

// What the public copy keeps (scripts/public-allow.txt, the list its build copies from). A test that reads a file the copy
// leaves out must still pass there: T's Nov 9 dry run went red because lessons-placement.test.ts read docs/guild/LESSONS.md,
// which the copy leaves out (Lead-12, Fri Nov 6). public-copy-reads.test.ts holds the rule.
const LIST = readFileSync(new URL("../../scripts/public-allow.txt", import.meta.url), "utf8");
const LINES = LIST.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
/** The listed paths, and the three files the build writes itself (scripts/public-copy.sh). */
export const KEPT = [...LINES.filter((l) => !l.startsWith("!")), "docs/guild/board.md", ".env.example", "docs/launch/.public-copy"];
/** The `!` lines: paths taken back out of a kept folder. */
export const DROPPED = LINES.filter((l) => l.startsWith("!")).map((l) => l.slice(1));

const under = (p: string, k: string) => p === k || p.startsWith(`${k}/`);
/** Whether the public copy has `path` (a file, or a folder it keeps whole or in part). */
export function inPublicCopy(path: string): boolean {
  const p = path.replace(/^(\.\.\/)+/, "").replace(/\/$/, "");
  if (DROPPED.some((d) => under(p, d))) return false;
  return KEPT.some((k) => under(p, k) || k.startsWith(`${p}/`));
}

/** A file the public copy leaves out (`rel`, from the repo root): its text where it's here, its stand-in where it isn't, as in
 *  the copy. Every test read of such a path goes through here, read by read (public-copy-reads.test.ts; Lead-12, Fri Nov 6:
 *  a file-level check let one guarded read hide a second bare one). A path the copy keeps throws: read that one directly. */
export function privateText(rel: string, standIn: () => string): { here: boolean; text: string } {
  if (inPublicCopy(rel)) throw new Error(`${rel} is in the public copy, so read it directly`);
  const url = new URL(`../../${rel}`, import.meta.url);
  const here = existsSync(url);
  return { here, text: here ? readFileSync(url, "utf8") : standIn() };
}
