// Every menu address on the Desk paints before the Desk's code runs (Tier 1: every route cold under 1 s on a phone). A
// room (`#wants`) gets a cover with its head (room-heads.ts, Track F); a hash that opens the landing itself (`#ask`,
// `#talk`, `#watcher`, `#mixer`) gets the landing's own first paint. R, Nov 6: those four fell through the gate's
// `else return` and drew nothing on a cold phone until 135 KB of code had run (first paint 1452 ms, the rooms' 504).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LANDING_HASHES, MENU_ACTIONS, MIXER_HASH } from "../src/view/menu-hash.ts";
import { ROOM_HEADS } from "../../web/src/desk/room-heads.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("a menu hash's first paint", () => {
  it("every_menu_hash_paints_first: each is a room with a cover or a landing hash, never neither, never both", () => {
    const rooms = Object.keys(ROOM_HEADS);
    for (const a of MENU_ACTIONS) expect(rooms.includes(a) !== LANDING_HASHES.includes(a), a).toBe(true);
    expect(LANDING_HASHES).toContain(MIXER_HASH);
    for (const h of LANDING_HASHES) expect(rooms, h).not.toContain(h);
  });

  it("landing_hashes_open_the_landing: the Desk sends each to its ask pane, so the landing's paint is the right page", () => {
    const desk = read("web/src/desk/Desk.tsx");
    const paneOf = desk.match(/const PANE_OF: Record<MenuAction, Pane> = \{([^}]+)\}/)?.[1] ?? "";
    expect(paneOf).not.toBe("");
    for (const h of LANDING_HASHES.filter((x) => x !== MIXER_HASH)) expect(paneOf, h).toMatch(new RegExp(`\\b${h}: "ask"`));
    // The mixer is the tour's chip: it puts its ask in the box on the landing (Desk.tsx's open()).
    expect(desk).toContain("location.hash === `#${MIXER_HASH}`");
    expect(desk).toMatch(/MIXER_HASH[\s\S]{0,300}ready\(MIXER_ASK\)/);
  });

  it("the_gate_paints_the_landing_for_them: prerender's desk gate takes the landing branch on these hashes", () => {
    const pre = read("web/prerender.ts");
    expect(pre).toContain("`else if(!N||${JSON.stringify(LANDING_HASHES)}.indexOf(N)>=0){a(\"desk\");");
    // The control: the old branch, which gave these hashes nothing, is gone.
    expect(pre).not.toContain("`else if(!N){a(\"desk\");");
  });
});
