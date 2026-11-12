// The shopper's "Not this one" and "Bring it back" as ledger rows (Track T's suggestion, 025): the server writes them,
// so Approve and PayPal's return honor the "no" on any page and a reload, and the dial counts it until it's taken back.

import type { NewEvent } from "../ledger/events.ts";

/** The shopper's "Not this one" on a cart the agent picked: the shopper rejection that is a bad pick (`isBadPick`). */
export const NOT_THIS_ONE = "reject";
/** "Bring it back" after "Not this one": that rejection is withdrawn, so it is no bad pick (`badPickEnd`). */
export const BRING_BACK = "bring-back";

/** The row the server writes when the shopper sets a cart aside: Approve is refused and PayPal's return captures nothing. */
export function setAside(t: number, shopperId: string): NewEvent {
  return { t, shopperId, visibility: "owner", actor: "shopper", action: NOT_THIS_ONE, layer: 3, verdict: "refused", why: "Not this one: you set this cart aside. Approve is off and nothing is captured until you bring it back." };
}

/** "Bring it back": the set-aside cart waits for the shopper's tap again. */
export function broughtBack(t: number, shopperId: string): NewEvent {
  return { t, shopperId, visibility: "owner", actor: "shopper", action: BRING_BACK, layer: 3, verdict: "ok", why: "You brought this cart back. Nothing is paid without your tap on Approve." };
}
