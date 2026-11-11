// Lines that follow each other (the Desk's run): each starts when the last has really ended, since on a quick run "Tap Approve" would
// otherwise cut "Set aside" off half way, and a slow network clipped any timing worked out from the words. Its own file, as only the
// Desk says lines in turn and speech.ts is in every page's first load.
import { say } from "../speech.ts";

const waiting: string[] = [];
let saying = false;
let next: ReturnType<typeof setTimeout> | undefined;
function pump(): void {
  if (saying || waiting.length === 0) return;
  saying = true;
  say(waiting.shift()!, () => { saying = false; next = setTimeout(pump, 200); });
}
export function sayInTurn(line: string): void { waiting.push(line); pump(); }
/** Drops the lines still waiting; the one playing finishes. */
export function hushLines(): void { waiting.length = 0; clearTimeout(next); }
