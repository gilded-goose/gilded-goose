// A walk that injects a fault proves it got in before it judges the page (Track F, Nov 5; S found it). Push 4's desk-walk swapped
// `X as WeekPane` only. Once P's ping and F's watcher shared ping-notify, Rollup made Panes export a frozen namespace instead, nothing
// threw, and "a throw in week" judged a room that never broke. The swap now knows both forms, and the walk counts a swap that happened.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THROWN, swapExport } from "../../scripts/walk-throw.ts";

// Push 4's Panes chunk, as S read it on f113894b.
const NAMESPACE = 'const Re=Object.freeze(Object.defineProperty({__proto__:null,SettingsPane:ye,WantsPane:we,Watch:B,WeekPane:ke},Symbol.toStringTag,{value:"Module"}));export{Re as P,F as u};';
const NAMED = "function ke(){}function we(){}export{ke as WeekPane,we as WantsPane};";

describe("the walk's throw reaches the part in either export form", () => {
  it("swaps a part exported by name", () => {
    expect(swapExport(NAMED, "WeekPane")).toBe("function ke(){}function we(){}export{__thrown as WeekPane,we as WantsPane};");
  });

  it("swaps a part inside the frozen namespace a shared chunk exports, and only that part", () => {
    const out = swapExport(NAMESPACE, "WeekPane");
    expect(out).toContain("Watch:B,WeekPane:__thrown}");
    expect(out).toContain("SettingsPane:ye,WantsPane:we,");
    expect(swapExport(NAMESPACE, "Watch")).toContain("Watch:__thrown,WeekPane:ke}"); // a prefix of WeekPane isn't WeekPane
    expect(swapExport('X=Object.freeze({__proto__:null,default:Zt});', "default")).toBe("X=Object.freeze({__proto__:null,default:__thrown});");
  });

  it("leaves a chunk without the part unchanged, so the walk can fail on a swap that didn't happen", () => {
    expect(swapExport(NAMESPACE, "AfterPay")).toBe(NAMESPACE);
    expect(swapExport("const WeekPane=1;", "WeekPane")).toBe("const WeekPane=1;"); // not an export
    expect(THROWN).toContain("function __thrown()");
  });

  it("desk-walk swaps only through it, counts only a swap that happened, and checks a room's swap before judging it", () => {
    const walk = readFileSync(new URL("../../scripts/desk-walk.ts", import.meta.url), "utf8");
    expect(walk).not.toMatch(/__thrown/); // no second, older copy of the swap
    expect(walk.match(/swapExport\(/g)).toHaveLength(3);
    expect(walk).not.toMatch(/^\s*swapped\.add\("Desk"\);$/m); // counted only when it changed the code
    const room = walk.indexOf("the walk's throw never got into ${PART[room]}"), judged = walk.indexOf('page.locator(".dk-room-lost");\n    await lost.waitFor');
    expect([room > 0, judged > room]).toEqual([true, true]);
  });
});
