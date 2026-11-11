// Publishes the ratchet's numbers to the board (Lead-10, Nov 4; Joshua's 1(d): "numbers on the board daily"), between the
// markers in docs/guild/board.md, and keeps one row a day in docs/guild/ratchet-days.json. It reads what `pnpm check` and
// scripts/ratchet-record.ts left; it adds one short run, the money paths' coverage. It never moves a limit.
//
//   corepack pnpm ratchet:board
//
// Exit 0 even with a worse number: scripts/ratchet.ts is the gate, and this is the reading of it. A number it can't read
// prints "not measured" with why, never a pass.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { addDay, boardTable, dayRow, spliceBoard, trendTable, type BoardInput, type DayRow, type LiveRecord, type Measured, type RatchetFile } from "./ratchet-lib.ts";
import { bundles, claims, coverage, sha, tests } from "./ratchet.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BOARD = join(ROOT, "docs/guild/board.md");
const DAYS = join(ROOT, "docs/guild/ratchet-days.json");
const LIVE = join(ROOT, "docs/guild/ratchet-live.json");

const measured: Measured = {};
let gz: Measured = {};
const unread: string[] = [];
const read = (what: string, get: () => Measured) => {
  try { Object.assign(measured, get()); }
  catch (e) { unread.push(`${what}: ${String(e instanceof Error ? e.message : e).split("\n")[0]!.slice(0, 160)}`); }
};
read("tests", tests);
read("coverage", coverage);
read("bundles", () => { const b = bundles(); gz = b.gz; return b.raw; });
read("claims", claims);

const file = JSON.parse(readFileSync(join(ROOT, "docs/guild/ratchet.json"), "utf8")) as RatchetFile;
const live = existsSync(LIVE) ? JSON.parse(readFileSync(LIVE, "utf8")) as { latest: LiveRecord | null; best: Record<string, number> } : { latest: null, best: {} };
// docs/ is what this script and the Lead write; only code makes these numbers another commit's.
const dirty = execFileSync("git", ["status", "--porcelain", "--", ".", ":!docs"], { cwd: ROOT, encoding: "utf8" }).trim() !== "";
const input: BoardInput = { at: new Date().toISOString(), sha: sha(), dirty, measured, gz, unread, limits: file.limits, bundleToleranceBytes: file.bundleToleranceBytes, live: live.latest, best: live.best };

const days = addDay(existsSync(DAYS) ? (JSON.parse(readFileSync(DAYS, "utf8")) as { days: DayRow[] }).days : [], dayRow(input));
const section = `${boardTable(input)}\n\n${trendTable(days)}`;
writeFileSync(BOARD, spliceBoard(readFileSync(BOARD, "utf8"), section));
writeFileSync(DAYS, `${JSON.stringify({ about: "One row a day of the ratchet's numbers, written by scripts/ratchet-board.ts. The trend on the board reads it.", days }, null, 2)}\n`);
console.log(`ratchet-board: ${(section.match(/^\| /gm) ?? []).length} rows on docs/guild/board.md, ${(section.match(/WORSE/g) ?? []).length} worse, ${(section.match(/not measured:/g) ?? []).length} not measured, ${(section.match(/stale, /g) ?? []).length} stale.`);
