// The opening's clock (opening.ts), kept pure so it can be tested. Every time is on the page's own clock
// (performance.now(), from navigation start), not counted from when a timer happened to fire: a long task (a slow
// phone's main thread) can hold a timer, but it can't push the hero past its cap.

export const GLIDE_MS = 640; // the glide on time
export const GLIDE_BY = 700; // the glide starts by this, whatever has loaded
export const END_PAD = 40; // the opening ends this long after the glide lands
export const HERO_BY = GLIDE_BY + GLIDE_MS + END_PAD; // 1380: the hero is up by this
export const MIN_GLIDE = 320; // shorter than this, a glide reads as a jump: show the finished hero instead

/** How long the glide runs when it starts at `now`: the full glide on time; a shorter one, landing by the cap, when
 *  something held it; 0 when it is too late to glide at all (the finished hero shows at once). */
export function glideMs(now: number): number {
  const left = HERO_BY - END_PAD - now;
  if (left >= GLIDE_MS) return GLIDE_MS;
  return left >= MIN_GLIDE ? Math.round(left) : 0;
}
