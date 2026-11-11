// Track R: the states kit (brand.md §10.9). Surface owners place these; docs/guild/062-r.md documents the API.
//
//   <Loading sellers? />                      "Goose is checking the sellers." / "Goose is loading this."
//   <Empty title? line? action? />            "No rows yet." · "They start when you ask Goose." · Ask Goose ›
//   <ErrorState onRetry network? />           "Goose couldn't load this." (+ "Goose's server didn't answer.") · Try again
//   <Offline onBack? />                       "You're offline." · what stays (and, with onBack, the re-ask on `online`)
//   <RateLimited onRetry? retryAfterMs? daily? title? cause? />
//                                             "Goose needs a minute." · Try again, enabled once Retry-After has passed;
//                                             no action for a daily cap or a Retry-After over a minute (limitedAction)
//   <Waking state? onRetry? lit? />           the egg at 40% · "Goose's server is waking up." · pending: fills in when it answers; failed: Try again
//   <NotFound href? />                        "Nothing here." · Back to Goose ›
//   <StateNote kind title line? action? />    the one block they are all made of
//   <ErrorBoundary onError?>                  a part that throws becomes <ErrorState> (Reload for a lost chunk; offline wins)
//   useOnline(), useWaking(), retryAfterMs()  the page's offline and waking state; a 429's wait
//   mountStates()                             (./mount.ts, lazy) the page-wide line: offline, waking, updated
import { useEffect, useState } from "react";

export { StateNote, StateEgg, type StateKind, type StateAction } from "./StateNote.tsx";
export { Loading, Empty, ErrorState, Offline, RateLimited, Waking, NotFound } from "./kit.tsx";
export { retryAfterMs, limitedAction, LONG_WAIT_MS } from "./retry.ts";
export type { WakeState } from "./waking.ts";
import type { WakeState } from "./waking.ts";
export { ErrorBoundary, isChunkError } from "./ErrorBoundary.tsx";
export * as WORDS from "./words.ts";

export { useOnline } from "./online.ts";

/** The waking server's state (waking.ts): "pending" while an /api call waits on it, "failed" once the wake's calls
 *  ended with no real answer, null when awake. Pass it to `<Waking state>`. Needs mountStates() to have run on the page. */
export function useWaking(): WakeState | null {
  const [w, setW] = useState<WakeState | null>(null);
  useEffect(() => {
    let off = () => {};
    let gone = false;
    void import("./mount.ts").then(({ wake }) => { if (gone) return; setW(wake.state); off = wake.subscribe(setW); });
    return () => { gone = true; off(); };
  }, []);
  return w;
}
