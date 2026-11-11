// Words the Ask boxes answer on the page itself, typed or said into the mic. Two kinds, both from the Desk's own code:
// "call me Sam" / "forget my name" (the name lives in this browser only, never sent), and go-to commands ("proof",
// "my wallet", "home") that only open another page. Nothing here starts a run, approves or pays. Anything else is an ask.
import { goToIntent, GO_TO_HREF, type GoTo } from "@goose/core/voice";
import { NAME_FORGOT, NAME_HELLO, nameCommand } from "@goose/core/name";
import { forgetName, keepName } from "../../name.ts";
import { hrefOf } from "../route.ts";

const BASE = import.meta.env.BASE_URL;

/** The new site's own page where it has one; the Desk's address for the rest (wallet, market, the list). */
const HREF: Record<GoTo, string> = {
  proof: hrefOf("proof"),
  ledger: hrefOf("under-the-hood"),
  home: hrefOf("home"),
  wallet: `${BASE}${GO_TO_HREF.wallet}`,
  market: `${BASE}${GO_TO_HREF.market}`,
  wants: `${BASE}${GO_TO_HREF.wants}`,
};

/** True when the words were a command the page answered (the line to show goes to `onStatus`); false for an ordinary ask. */
export function handleSaid(words: string, onStatus: (line: string) => void): boolean {
  const name = nameCommand(words);
  if (name) {
    if (name.kind === "set") { keepName(name.name); onStatus(NAME_HELLO); }
    else { forgetName(); onStatus(NAME_FORGOT); }
    return true;
  }
  const to = goToIntent(words);
  if (to) {
    const href = HREF[to];
    if (href.startsWith("#")) window.location.hash = href; else window.location.assign(href);
    return true;
  }
  return false;
}
