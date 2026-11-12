// DK part 6 (g), the DD on part 5: the Ask pane opens from three menu items, and the menu marks the one that opened it,
// not always "Ask Goose".
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MENU_INDEX_ITEMS } from "../src/view/menu-hash.ts";
import { currentItem } from "../../web/src/desk/current.ts";

const root = new URL("../../", import.meta.url).pathname;

describe("the Desk's current menu item", () => {
  it("marks the item that opened the Ask pane", () => {
    expect(currentItem(MENU_INDEX_ITEMS, "ask", "ask")).toBe("ask");
    expect(currentItem(MENU_INDEX_ITEMS, "ask", "talk")).toBe("talk");
    expect(currentItem(MENU_INDEX_ITEMS, "ask", "watcher")).toBe("watcher");
  });
  it("marks the open room, whatever opened the Ask pane before", () => {
    expect(currentItem(MENU_INDEX_ITEMS, "wants", "watcher")).toBe("wants");
    expect(currentItem(MENU_INDEX_ITEMS, "settings", "talk")).toBe("limits");
    expect(currentItem(MENU_INDEX_ITEMS, "after", "after")).toBe("after");
    expect(currentItem(MENU_INDEX_ITEMS, "ask", "week")).toBe("ask"); // the week's "ask again" lands on Ask Goose
    expect(currentItem(MENU_INDEX_ITEMS, "ask", null)).toBe("ask");
  });
  it("is what the Desk passes to SiteNav, with the opener menuAct records", () => {
    const desk = readFileSync(root + "web/src/desk/Desk.tsx", "utf8");
    expect(desk).toMatch(/current=\{app \|\| opener \? currentItem\(MENU_INDEX_ITEMS, pane, opener\) : undefined\}/); // a fresh landing marks nothing
    expect(desk).toMatch(/function startOver[^]*?setOpener\(null\)/); // the lockup back to the landing clears it
    expect(desk).toMatch(/function menuAct\(a: MenuAction\) \{[^]*?setOpener\(a\)/);
  });
  it("forgets the opener when a pane changes outside the menu (the DD on part 6: never a stale dot)", () => {
    const desk = readFileSync(root + "web/src/desk/Desk.tsx", "utf8");
    const start = desk.indexOf("function menuAct(a: MenuAction) {");
    const end = desk.indexOf("\n  }\n", start); // menuAct's own closing brace, at its indent
    expect(start).toBeGreaterThan(0);
    const outside = (desk.slice(0, start) + desk.slice(end)).split("\n").filter((l) => /\bsetPane\(/.test(l));
    expect(outside.length).toBeGreaterThan(0);
    for (const l of outside) expect(l, l.trim()).toMatch(/setOpener\(/);
  });
});
