// "The 21 that got through", built from the stored first run when the site is built (Lead-13, Wed Nov 11). Nothing here
// is hand-copied: the wall's rows are `wallOf` over docs/fixtures/sealed-8-first-run.json. `virtual:goose-wall` is
// imported only by the wall's own lazy chunk (web/src/site/proof/MissesWall.tsx), so it adds no byte to any route's first
// load. `builtNotes` joins both sets into one file for scripts/bench.ts; the build does not emit it and the site does
// not serve it.

import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import { joinRun, noteFile, noteFileText, wallOf, type NoteFile, type RunRow, type SetInput, type Wall } from "../core/src/view/wall.ts";

const ID = "virtual:goose-wall";
const json = (p: string) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));

export const NOV4 = "docs/fixtures/sealed-8-first-run.json";
export const OCT28_NOTES = "core/test/fixtures/reader-blind-r4.json";
export const OCT28_RUN = "docs/fixtures/reader-r4.json";
const CODE = "Gilded Goose's plain-code rules, no AI";

/** Both sets, newest first, as the site's Proof page orders them. */
export function noteSets(): SetInput[] {
  const nov = json(NOV4) as { written: string; rulesAt: string; withReader: string; rows: RunRow[] };
  const octNotes = json(OCT28_NOTES) as { asks: string[]; fair: string[] };
  const oct = json(OCT28_RUN) as { model: string; timeoutMs: number; runs: string; rows: RunRow[] };
  return [
    { id: "nov-4", written: nov.written, writer: "one Claude Sonnet agent that never opened our repo", code: `${CODE}, as merged at ${nov.rulesAt}, scored once`, withReader: nov.withReader, source: [NOV4], rows: nov.rows },
    { id: "oct-28", written: "Wed Oct 28 2026", writer: "one Claude Sonnet 5.5 agent told never to open our repo", code: `${CODE}, measured before any change`, withReader: `${oct.model} with a ${oct.timeoutMs / 1000} second limit; ${oct.runs}`, source: [OCT28_NOTES, OCT28_RUN], rows: joinRun(octNotes, oct.rows) },
  ];
}

export interface WallData { wall: Wall }

export function builtNotes(): { file: NoteFile; text: string } {
  const file = noteFile(noteSets());
  return { file, text: noteFileText(file) };
}

export function builtWall(): WallData {
  const wall = wallOf((json(NOV4) as { rows: RunRow[] }).rows);
  // Through JSON once here, so the copy tests read is byte for byte the copy the page is served.
  return JSON.parse(JSON.stringify({ wall })) as WallData;
}

export function wallData(): Plugin {
  return {
    name: "goose-wall",
    resolveId: (id) => (id === ID ? `\0${ID}` : null),
    load: (id) => (id === `\0${ID}` ? `export default ${JSON.stringify(builtWall())};` : null),
  };
}
