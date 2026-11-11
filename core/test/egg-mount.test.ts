// Track F (Nov 6, P's trace): the live egg mounted in one task, the studio's light (PMREM, 157 ms) and the first draw
// (shader compiling, 171 ms) back to back, inside the phone's opening. It mounts in two tasks with a frame between.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("the live egg mounts in two tasks", () => {
  it("bakes the light, lets a frame pass, compiles in parallel, then draws", () => {
    const src = read("web/src/desk/eggThree.ts");
    expect(src).toContain("const nextTask = () => new Promise<void>((ok) => requestAnimationFrame(() => setTimeout(ok, 0)));");
    expect(src).toContain("export async function mountEgg(");
    const at = (s: string) => { const i = src.indexOf(s); expect(i, s).toBeGreaterThan(-1); return i; };
    const order = [at("pmrem.fromScene("), at("await nextTask();"), at("await renderer.compileAsync(scene, camera)"), at("  resize();\n  return {")];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // Nothing else draws before the yield: the first render is resize()'s, after it.
    expect(src.slice(0, at("await nextTask();")).match(/\bresize\(\);/g)).toBeNull();
  });

  it("every caller waits for it, and the Desk drops an egg made after the page left", () => {
    const egg = read("web/src/desk/Egg.tsx");
    expect(egg).toContain("const made = await mountEgg(");
    expect(egg).toContain("if (gone) { made?.dispose(); return; }");
    expect(egg).toContain("void mount(mountEgg, gl).catch(() => { if (!gone) setDead(true); })");
    expect(read("scripts/egg-still.ts")).toContain("const egg = await mountEgg(c, 1, gl);");
  });
});
