// Track F, Nov 5: the tuned fallback faces (desk/tokens.css) named only Arial and Helvetica. A Linux machine has
// neither, so `local()` found nothing, the face never loaded and the first paint fell to the untuned system font: GitHub's
// runner put the wallet's practice-site line a hair lower before the web fonts than after (692 then 691, desk-walk).
// Liberation Sans (most Linux, and Playwright's own deps) and Arimo (ChromeOS) are drawn to Arial's metrics, so the
// overrides tuned against Arial hold for them as they are. `local()` matches a face's own name, never an alias.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(import.meta.dirname, "../../web/src");
const sheets = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? sheets(join(dir, d.name)) : d.name.endsWith(".css") ? [join(dir, d.name)] : []);
const faces = sheets(SRC).flatMap((f) => [...readFileSync(f, "utf8").matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => ({ file: f.slice(SRC.length + 1), face: m[0] })));
const tuned = faces.filter(({ face }) => /local\("Arial"\)/.test(face));

describe("fallback faces tuned to Arial load where Arial isn't installed", () => {
  it("finds the tuned faces (a moved file would pass the rule below with nothing to check)", () => {
    expect(tuned.length).toBeGreaterThanOrEqual(4);
  });
  it.each(tuned.map((t, i) => [i, t] as const))("face %i also names Arial's metric clones, after Arial", (_i, { file, face }) => {
    const order = ["Arial", "Liberation Sans", "Arimo"].map((n) => face.indexOf(`local("${n}")`));
    expect(order.every((at) => at >= 0), `${file}: ${face.slice(0, 120)}`).toBe(true);
    expect(order[0]! < order[1]! && order[1]! < order[2]!, `${file}: Arial first, so a Mac keeps the face it was measured on`).toBe(true);
    expect(face, `${file}: the clones only stand in for Arial, so the overrides tuned against it must stay`).toMatch(/size-adjust:[^;]+;\s*ascent-override:[^;]+;\s*descent-override:[^;]+;\s*line-gap-override: 0%/);
  });
});
