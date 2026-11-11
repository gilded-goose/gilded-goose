// "Things to try" (the Desk's slice 5), in the page: this browser's ticks (`TriedKeeper`, core/src/view/tries.ts), each
// from a real event and never from a tap on the list. `markTried` is called where the server's answer arrives (an Ask's
// chips, a photo read) or when Behind the scenes opens; `syncTried` reads what the session's own ledger proves (GET
// /api/runs/session/tried: a trick, a price swap, Approve, Undo, the market, an Ask's row). Storage blocked: the ticks
// live for this page only, and nothing breaks. The list's UI listens for `TRIED_EVENT`.

import { TriedKeeper, isTryKey, type TryKey } from "@goose/core/tries";

export const TRIED_EVENT = "goose:tried";
const keeper = new TriedKeeper(() => (typeof localStorage === "undefined" ? null : localStorage));

export const readTried = (): TryKey[] => keeper.read();

/** Tick what a real event proved, and tell the list. */
export function markTried(...keys: TryKey[]): void {
  const before = keeper.read().length;
  const after = keeper.add(keys);
  if (after.length !== before) dispatchEvent(new CustomEvent(TRIED_EVENT, { detail: after }));
}

/** Read what this session's ledger proves and tick it. No session yet, or no server: nothing changes. */
export async function syncTried(): Promise<void> {
  const r = await fetch("/api/runs/session/tried").catch(() => null);
  if (!r?.ok || !(r.headers.get("content-type") ?? "").includes("json")) return;
  const body = (await r.json().catch(() => null)) as { tried?: unknown } | null;
  if (Array.isArray(body?.tried)) markTried(...body.tried.filter(isTryKey));
}
