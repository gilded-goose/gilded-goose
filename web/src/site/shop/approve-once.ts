// Approve can be pressed once at a time (Review Focus 5): a second tap while the first is still asking for a cart, or
// while PayPal is opening, joins the first instead of asking again. Once it settles, a failure can be tried again.

export interface Once<T> {
  (): Promise<T>;
  pending(): boolean;
}

export function approveOnce<T>(fn: () => Promise<T>): Once<T> {
  let inFlight: Promise<T> | null = null;
  const tap = (() => {
    if (inFlight) return inFlight;
    const p = fn();
    inFlight = p;
    const clear = () => { if (inFlight === p) inFlight = null; };
    p.then(clear, clear);
    return p;
  }) as Once<T>;
  tap.pending = () => inFlight !== null;
  return tap;
}
