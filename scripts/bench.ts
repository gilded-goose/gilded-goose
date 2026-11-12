// Run a guard over our two note sets and print the two counts we publish, per set, beside ours (Lead-13, Wed Nov 11).
//
//   node scripts/bench.ts                       our own guard, the worked example (scripts/bench-goose.ts)
//   node scripts/bench.ts ./my-guard.ts         your guard: a module whose default export is
//                                               (note: string) => "clear" | "held" | "aside"   (it may be async)
//   node scripts/bench.ts ./my-guard.ts --file notes.json     the same shape from a file of your own
//
// The sets are built from the repo's stored runs (web/wall-data.ts `builtNotes`). The site does not serve them as a
// file: the quoted notes name real payment apps. Not a rate: each set had one writer and one run, and both sets are in
// the repo, so a guard can be tuned to them. Today's rules have changed since the Oct 28 run, so our own guard's line
// for that set differs from the stored one; the stored verdicts are the record (core/test/bench.test.ts holds both).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { FILE_NOT_A_RATE, bench, benchLine, type BenchSet, type Guard, type NoteFile } from "../core/src/view/wall.ts";
import { builtNotes } from "../web/wall-data.ts";

/** The stored counts as a bench result, so they print in the same words as a guard's. */
export const stored = (f: NoteFile, by: "code" | "withReader"): BenchSet[] => f.sets.map((s) => ({ id: s.id, scam: s.tallies.scam[by], fair: s.tallies.fair[by] }));

export async function report(f: NoteFile, guard: Guard, name: string): Promise<string[]> {
  const yours = await bench(f, guard), code = stored(f, "code"), reader = stored(f, "withReader");
  return [
    `${name}, on ${f.notes.length} notes:`,
    ...yours.flatMap((s, k) => [`  ${benchLine(s)}`, `    ours, code alone, as recorded:      ${benchLine(code[k]!).replace(`${s.id}: `, "")}`, `    ours, with the AI reader, recorded: ${benchLine(reader[k]!).replace(`${s.id}: `, "")}`]),
    FILE_NOT_A_RATE,
  ];
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--file");
  const path = at >= 0 ? args[at + 1] : undefined;
  if (at >= 0 && !path) { console.error("bench: --file needs a path"); process.exit(2); }
  const mod = args.filter((a, k) => a !== "--file" && (at < 0 || k !== at + 1))[0];
  const file = path ? JSON.parse(readFileSync(resolve(path), "utf8")) as NoteFile : builtNotes().file;
  const guard = (await import(mod ? pathToFileURL(resolve(mod)).href : new URL("./bench-goose.ts", import.meta.url).href) as { default?: unknown }).default;
  if (typeof guard !== "function") { console.error(`bench: ${mod} has no default export that is a function (note) => "clear" | "held" | "aside"`); process.exit(2); }
  try {
    for (const line of await report(file, guard as Guard, mod ?? "Gilded Goose's own guard today (scripts/bench-goose.ts)")) console.log(line);
  } catch (e) { console.error((e as Error).message); process.exit(1); }
}
