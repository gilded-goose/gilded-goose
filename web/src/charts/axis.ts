// The week chart's price axis, in one place (Track D): Bars.tsx draws it and Week.tsx says where it starts, so the words
// under the chart can't drift from the axis on it. Kept out of Bars.tsx so Week.tsx can read it without loading the
// lazy AG Charts chunk.

/** Dollars between ticks. */
export const WEEK_STEP = 20;

/** The axis runs from $0 (AS-15, Joshua Sat 3:30 AM: "no chart apologizes for its scale"): a price chart that starts
 *  above zero makes a $28 fall look like half the price, and the page used to say so in a sentence under it. From $0 the
 *  drawing is honest on its own and needs no caption. The top leaves a little room for the marked words and sits on a
 *  tick, so it is the same at every width. */
export function weekAxis(dollars: number[]): { lo: number; hi: number; step: number } {
  const lo = 0;
  const hi = Math.ceil((Math.max(...dollars) + 12) / WEEK_STEP) * WEEK_STEP;
  return { lo, hi, step: WEEK_STEP };
}
