// The room covers' fills live in their own file, not in index.html (web/src/desk/room-fill.ts): inline, they were 1,007 B on
// every route's first load and put the Community ledger over its line on push 18f. These run the head's start of the file
// and the file meeting the placer in both orders, and hold index.html's bytes clear of any room's fill.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { CHALLENGE_FILL, EARLY_CHALLENGE } from "../../web/src/desk/story/early-challenge.ts";
import { EARLY_WANTS, WANTS_FILL } from "../../web/src/desk/early-wants.ts";
import { FILL_PLACED, FILLED_ROOMS, ROOM_FILL_FILE, fillAsk, roomFillFile } from "../../web/src/desk/room-fill.ts";

const read = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

/** A page: the file's fill counts its runs instead of touching a cover. */
function page() {
  const added: string[] = [];
  const sandbox: Record<string, unknown> = { document: { createElement: () => ({}), head: { append: (s: { src: string }) => added.push(s.src) } } };
  sandbox.window = sandbox;
  return { sandbox, added, run: (code: string) => vm.runInNewContext(code, sandbox) };
}

describe("the covers' fills, in their own file", () => {
  it("the head starts the file only on an arrival at a room it fills", () => {
    for (const room of ["challenge", "wants", "after", "week", "settings"]) {
      const p = page();
      p.run(`(function(N){${fillAsk(JSON.stringify("/" + ROOM_FILL_FILE))}})(${JSON.stringify(room)})`);
      expect(p.added).toEqual((FILLED_ROOMS as readonly string[]).includes(room) ? ["/first/room-fill.js"] : []);
    }
  });

  it("fills once, after the cover is in, whichever lands first", () => {
    const file = roomFillFile("window.n=(window.n||0)+1");
    for (const order of [[file, FILL_PLACED], [FILL_PLACED, file]]) {
      const p = page();
      for (const code of order) p.run(code);
      expect(p.sandbox.n).toBe(1);
    }
    // The file alone never fills: the cover isn't there yet, or was never placed.
    const alone = page();
    alone.run(file);
    expect(alone.sandbox.n).toBeUndefined();
  });

  it("the file parses with both fills in it, as the build writes it", () => {
    expect(() => new Function(roomFillFile(CHALLENGE_FILL + WANTS_FILL))).not.toThrow();
  });

  it("index.html carries no room's fill: only the asks, the file's start and the placer's mark", () => {
    const pre = read("web/prerender.ts");
    expect(pre).not.toMatch(/\$\{(CHALLENGE|WANTS)_FILL\}/);
    expect(pre).toContain("writeFileSync(join(dist, ROOM_FILL_FILE), roomFillFile(CHALLENGE_FILL + WANTS_FILL));");
  });

  it("a room's code in index.html stays the asks and the file's start: every route downloads it", () => {
    // 618 B today (the two asks, the file's start, the placer's mark); the fills alone were 1,007 B more. Only tightens.
    const inline = EARLY_CHALLENGE + EARLY_WANTS + fillAsk(JSON.stringify("/" + ROOM_FILL_FILE)) + FILL_PLACED;
    expect(inline.length).toBeLessThanOrEqual(650);
  });
});
