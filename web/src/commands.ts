// Words the page answers itself, before anything is sent (034, defaults 1 and 2): a go-to ("show me the proof") opens
// one of the app's own pages, and "call me Sam" / "forget my name" keep or forget the name in this browser. Checked
// first in every Ask box (AskGoose, the Desk), so these words never reach the server. A go-to only navigates, to a fixed
// address from `GO_TO_HREF`: it never starts a run, sets a cart aside, approves or pays. Anything else returns null and
// is asked as before.
// Track V (042): "show me my priorities list" opens Your wants (`?desk=1#wants`). On the Desk itself only the hash would
// change, which loads nothing, so the page first offers the room to the Desk (`GO_ROOM_EVENT`, cancelable: a page that
// opens it in place cancels it) and otherwise reloads at that address, where the Desk opens the room on arrival.

import { GO_TO_HREF, goToIntent } from "@goose/core/voice";
import { NAME_FORGOT, NAME_HELLO, hiName, nameCommand } from "@goose/core/name";
import { forgetName, keepName } from "./name.ts";
import { say } from "./speech.ts";

/** What the page did: `line` is the words to show (null: it is leaving for another page). */
export type PageCommand = { kind: "go" | "name"; line: string | null };
/** Fired on `window` with the room's name (`detail`, e.g. "wants") when a go-to names a room of the page already open. */
export const GO_ROOM_EVENT = "goose:room";

/** Opens one of the app's own addresses (a `GO_TO_HREF` value); only ever navigates. */
function go(href: string): void {
  const to = new URL(href || location.pathname, location.href);
  const here = to.pathname === location.pathname && to.search === location.search;
  if (!here || !to.hash) { location.assign(to.href); return; }
  if (!dispatchEvent(new CustomEvent(GO_ROOM_EVENT, { detail: to.hash.slice(1), cancelable: true }))) return;
  location.assign(to.href);
  location.reload();
}

export function pageCommand(words: string): PageCommand | null {
  const to = goToIntent(words);
  if (to) {
    go(GO_TO_HREF[to]);
    return { kind: "go", line: null };
  }
  const cmd = nameCommand(words);
  if (!cmd) return null;
  if (cmd.kind === "forget") {
    forgetName();
    say(NAME_FORGOT);
    return { kind: "name", line: NAME_FORGOT };
  }
  // The name is shown, never spoken: Goose says the fixed (recorded) line, and the text adds the name.
  const name = keepName(cmd.name);
  say(NAME_HELLO);
  return { kind: "name", line: hiName(NAME_HELLO, name) };
}
