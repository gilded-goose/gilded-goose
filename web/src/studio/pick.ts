// Behind the scenes picks its page here (Track AS, 044 §2): the AG Studio dashboard when the build's licence facts say
// the key is valid and unexpired, else today's Community ledger, with Studio never instantiated (no banner, no
// watermark). `?studio=force` opens Studio on a good licence or a developer's own machine, never for a public visitor with no key (`?desk=studio` follows the licence). A module of its
// own, so main.tsx's route table stays one plain row per page and the first screen's chunk carries none of this.
// Shell first (slice 9; Round 2's a11y and performance review): the Studio page is its shell (Shell.tsx, a small chunk:
// the bar, heading, ask box and empty frames) at once, and the dashboard (Studio.tsx, the 1.6 MB br chunk with AG Grid,
// AG Charts and AG Studio) takes the shell's place when it's drawn. The board's cards (ShellBoard.tsx) come first.
import { studioAllowed } from "@goose/core/studio-gate";

export function pick() {
  return studioAllowed(__AG_STUDIO_LICENCE__, Date.now(), location.search, __STUDIO_BY_DEFAULT__, location.hostname).studio ? import("./Shell.tsx").then((m) => ({ default: m.StudioPage })) : import("../SessionLedger.tsx");
}
