// A tap on a first paint: the page is drawn before its code has landed, so on a slow line a button can look ready and do nothing,
// and the shopper is left wondering. index.html's first script notes the last button tapped (it has to be there: code in a chunk
// can't hear a tap made while that chunk is still coming), and here, once the page is live, that tap counts. No spinner: the button
// looked ready, and now it is.
//
// Only what's cheap and undoable is on the list: opening the menu, the wallet's replay, chip and fold, the tour's steps. Never Approve,
// which no first paint draws anyway, and never a tap that starts something the shopper may have forgotten and can't take back: a live
// haggle or the market's search stay as they are, and a tap older than HOLD_MS is let go. The Desk's own chips aren't shown until it's live.
const HOLDS = ".gm-btn,.skip,.wchip,.logfold,.tr-step";
const HOLD_MS = 15_000;

export type Tap = [string, number];

/**
 * Loaded only when a tap was noted, so a page no one tapped early pays for none of this. The noting script is still running: a tap made
 * since this chunk was asked for is a new note, so this one is let go, and a real tap on the live page isn't counted twice.
 */
export function heldTap(tap: Tap): void {
  const w = window as unknown as { __tap?: Tap | 0 };
  const moved = w.__tap !== tap;
  w.__tap = 0;
  if (moved) return;
  const [said, at] = tap;
  const stop = () => { clearInterval(looking); removeEventListener("click", stop, true); };
  const look = () => {
    if (Date.now() - at > HOLD_MS) return stop();
    // A page's lazy parts come a moment after it does. Hidden twins don't count (the bench's bar under a Desk page). The markup menu over a classic page or the market is still inert here: left alone.
    const b = [...document.querySelectorAll<HTMLButtonElement>(HOLDS)].find((e) => e.textContent?.trim() === said && !e.disabled && e.getClientRects().length > 0 && !e.closest("[data-gn-menu]"));
    if (!b) return;
    stop();
    b.click();
  };
  // Whatever the shopper taps next is what they want now.
  addEventListener("click", stop, true);
  const looking = setInterval(look, 100);
  setTimeout(look);
}
