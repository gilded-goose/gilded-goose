// The shopper's name in the page (034, default 1): `NameKeeper` (core/src/view/name.ts) over this browser's
// localStorage, and `useName` for the greeting. Nothing here sends anything: no request, no URL, no log. Storage blocked:
// the name lives for this page only, and nothing breaks. The greeting listens for `NAME_EVENT` (and for another tab's
// change through the browser's own `storage` event).

import { useEffect, useState } from "react";
import { NameKeeper } from "@goose/core/name";

export const NAME_EVENT = "goose:name";
const keeper = new NameKeeper(() => (typeof localStorage === "undefined" ? null : localStorage));

export const readName = (): string | null => keeper.read();

/** Keeps the name and tells the greeting; returns the name as kept (tidied). */
export function keepName(raw: string): string | null {
  const name = keeper.set(raw);
  dispatchEvent(new Event(NAME_EVENT));
  return name;
}

export function forgetName(): void {
  keeper.forget();
  dispatchEvent(new Event(NAME_EVENT));
}

/** The name this browser keeps, kept current when it changes here or in another tab. */
export function useName(): string | null {
  const [name, setName] = useState<string | null>(readName);
  useEffect(() => {
    const again = () => setName(readName());
    addEventListener(NAME_EVENT, again);
    addEventListener("storage", again);
    return () => { removeEventListener(NAME_EVENT, again); removeEventListener("storage", again); };
  }, []);
  return name;
}
