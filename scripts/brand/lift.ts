/**
 * brand.md §10.2's lift ("lift the front fill so the body below the equator reads gold, not brown"), as three of the soft
 * boxes in web/src/desk/eggThree.ts's studio(): the low front fill, the dim front wash (the "dark door") and the floor
 * bounce. Measured by scripts/egg-still.ts on an M4's GPU at glow 1: the body's median luma below the equator goes from
 * 120 (brown; #b98a1c is 140) to 181, and at glow 0 from 91 to 171. The front fill alone barely moves it (120 → 131): the
 * lower half of a mirror egg reflects the floor.
 *
 * eggThree.ts is Track DK's file, so the still's render applies the lift to the module as served, until DK writes these
 * three values into studio() ("Needs from DK"); from then on it finds them already there and changes nothing, and the
 * live egg and the still are the same light again. Only light values move; the object, its gold, pose and camera never do.
 * core/test/brand.test.ts holds eggThree.ts to one of the two states, so a studio edit can't silently break the render.
 */
export const LIFT = [
  { box: "box(7, 2.4, 0.4, -1.6, 4.6, ", was: "[0.42, 0.38, 0.34]", now: "[2.0, 1.85, 1.65]" }, // broad front fill, low
  { box: "box(6, 4.2, 1.4, 1.3, 5.4, ", was: "[0.2, 0.175, 0.15]", now: "[0.8, 0.72, 0.62]" }, // dim front wash
  { box: "box(12, 12, 0, -4.5, 0, ", was: "[0.12, 0.085, 0.06]", now: "[0.5, 0.36, 0.24]" }, // warm floor bounce
] as const;

/** eggThree.ts's source with LIFT applied: a box at its `was` value moves to `now`; a box already at `now` is left alone;
 *  a box at neither throws, since the studio changed under the still's render. */
export function lifted(src: string): { src: string; applied: number } {
  let out = src, applied = 0;
  for (const l of LIFT) {
    if (out.includes(l.box + l.now)) continue;
    if (!out.includes(l.box + l.was)) throw new Error(`egg-still: eggThree.ts's studio box "${l.box}…" is neither ${l.was} nor ${l.now}; update scripts/brand/lift.ts`);
    out = out.replace(l.box + l.was, l.box + l.now); applied++;
  }
  return { src: out, applied };
}
