// The ping, played (Joshua, Nov 5 6:40 PM: "when it's right it PINGS you"). After "Set your price", the recorded week
// replays one simulated day a second on the want's row, and on the day its price reaches hers the browser shows a real
// notification if she allowed it (ping-notify.ts). Without that, the row's line is the ping. Every word is the server's
// (`pingFor`, core/src/ask/watching-list.ts); this file types none. Tapping it opens the ask held to her price, like
// "Shop at your price": it never buys, approves or reserves.
import { useEffect, useRef, useState } from "react";
import type { WatchPing } from "@goose/core/watching-list";
import { notify, unnotify } from "./ping-notify.ts";

/** One simulated day a second: a judge gets the ping in about five. */
const DAY_MS = 1000;

export default function PingReplay({ ping, tag, onOpen }: { ping: WatchPing; tag: string; onOpen: () => void }) {
  const [at, setAt] = useState(0);
  const last = ping.steps.length - 1;
  // A tap opens the row as it is when tapped, never as it was when the ping showed (R's red team F2): the parent hands a
  // new onOpen each render, and this reads the newest. A new price replays from a new key, and Stop watching removes the
  // row: either way this replay leaves, and takes its notification with it.
  const open = useRef(onOpen);
  open.current = onOpen;
  useEffect(() => () => unnotify(tag), [tag]);
  useEffect(() => {
    if (at < last) { const t = setTimeout(() => setAt(at + 1), DAY_MS); return () => clearTimeout(t); }
    notify(ping.title, ping.body, tag, () => open.current());
    return undefined;
  }, [at]); // eslint-disable-line react-hooks/exhaustive-deps
  return <>{ping.steps[at]}</>;
}
