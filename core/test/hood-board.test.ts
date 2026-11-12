// Under the hood's board on the white site (W2, Wed Nov 11): midnight.css sets the Desk's dark --lx-* names on :root, and
// web/src/site/hood/board.css gives each its light value inside the board. One name left out (--lx-hover) painted every
// hovered AG Studio pivot row #221b1f, near-black under dark words. This holds the whole class: every --lx-* name
// midnight.css's :root sets is restated in board.css's light block. scripts/hood-hover.ts reads the pixels in a browser.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const names = (css: string) => new Set([...css.matchAll(/(--lx-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));

describe("hood board", () => {
  const midnight = read("web/src/ledger/midnight.css");
  const root = /:root\s*\{([^}]*)\}/.exec(midnight)?.[1] ?? "";
  const board = read("web/src/site/hood/board.css");
  const light = /\.hood-board,\s*html\.hood-on\s*\{([^}]*)\}/.exec(board)?.[1] ?? "";

  it("light_block_restates_every_dark_root_name", () => {
    expect(names(root).size).toBeGreaterThan(10);
    const missing = [...names(root)].filter((n) => !names(light).has(n));
    expect(missing).toEqual([]);
  });

  it("light_block_names_hover_light", () => {
    expect(light).toMatch(/--lx-hover:\s*var\(--surface-2\)/);
    // midnight.css stays loaded after the page closes; its :root color-scheme: dark must not reach the rest of the site.
    expect(read("web/src/site/tokens.css")).toMatch(/html:root\s*\{\s*color-scheme:\s*light;\s*\}/);
  });
});
