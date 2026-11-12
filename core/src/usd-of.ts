// The one formatter's core (core/src/money.ts has usd and usdWhole on top of it), alone in a module that imports
// nothing: a route that only shows wire amounts (the market, StoreSync) loads this and not the money chunk.

/**
 * An amount as the wire or a form carries it ("1218.00", "90", a chart's 1200) as a person reads it: "$1,218.00",
 * "$90", "$1,200". Only the commas are added: its digits stay as they came, so a limit typed "90" still reads "$90".
 * Never throws on a screen: anything that isn't plain digits shows as it came, after the "$", as the hand-glued "$" did.
 */
export function usdOf(amount: string | number | null | undefined): string {
  const s = String(amount);
  return /^\d+(\.\d+)?$/.test(s) ? `$${s.replace(/\B(?=(\d{3})+(?!\d))(?<!\..*)/g, ",")}` : `$${s}`;
}
