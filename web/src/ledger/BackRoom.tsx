// The back room's one header (Desk-B-5; Joshua, Fri Oct 30: "Midnight is the back room: Behind the scenes, Every
// decision, Proof"), since Fri 3:40 PM the one nav every page wears (web/src/nav, S1) in Midnight. The page's own
// styles are backroom.css, on the Midnight tokens (midnight.css), loaded by every back-room page.

import { SiteNav } from "../nav/SiteNav.tsx";
import "./midnight.css";
import "./backroom.css";

export type BackRoomView = "ledger" | "proof" | "haggle";

/** The one nav (S1, Joshua Fri 3:40 PM: every page wears the Desk's), Midnight here; "Behind the scenes" is marked as
 *  the page on the ledger and as the section on Proof and the haggle. Proof stays one tap away in the ledger's lede. */
export function BackRoomNav({ here }: { here: BackRoomView; proofHref?: string }) {
  return <SiteNav here="back" exact={here === "ledger"} room="back" />;
}
