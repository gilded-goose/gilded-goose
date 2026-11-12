// Track R-11 (the DD gate, Sat Oct 31: offline wins). What the page-wide strip and the error boundary may say after a
// chunk fails to load, as pure functions so the rule is tested without a browser (core/test/r-deploy.test.ts) and in
// one (scripts/offline-strip-probe.ts). The class rule: no state whose action needs the network shows while offline.
//   - offline beats everything: Reload, Try again and a waking line all need the network, and "updated" would be a
//     claim the code can't back (a chunk that failed offline failed because she was offline, not because of a deploy);
//   - a failed chunk is "lost", online or offline (DD 09:29): the strip says only that part of the page didn't load,
//     with Reload once she's online (the part can't be fetched again from this page, and reload is her tap);
//   - "updated" (a deploy replaced it) only once a release check confirms a newer release; none exists yet;
//   - then the waking states (failed before pending: Try again needs her tap).
import type { WakeState } from "./waking.ts";

/** A failed chunk, by when it failed: online ("updated", a deploy replaced it) or offline ("lost"). */
export type Lost = "updated" | "lost";
export type Shown = "offline" | Lost | "waking" | "waking-failed";

/** What a new failed chunk makes of what the page already knows (DD 09:29): always "lost". navigator.onLine stays true on
 *  wifi with no internet, so a failure online proves no deploy. "updated" only once a release check (a future
 *  /release.json fetch, not built) confirms a newer release: `release` is that check's answer, and nothing passes it yet. */
export const lostChunk = (was: Lost | null, release = false): Lost => (was === "updated" || release ? "updated" : "lost");

/** The strip's one state, or nothing. */
export function stripKind(s: { online: boolean; lost: Lost | null; wake: WakeState | null }): Shown | null {
  if (!s.online) return "offline";
  if (s.lost) return s.lost;
  return s.wake === "failed" ? "waking-failed" : s.wake === "pending" ? "waking" : null;
}

/** The error boundary's note for a chunk it couldn't draw: offline while offline, else what the failure was. */
export const chunkNote = (lost: Lost, online: boolean): "offline" | Lost => (online ? lost : "offline");
