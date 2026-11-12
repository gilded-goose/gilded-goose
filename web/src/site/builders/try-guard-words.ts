// Try the guard in your browser (Builders): the pure half of the lazy part. Words and the input cap only, so the test and
// the claims probes read what the page draws. No request, no storage and no log: a pasted note lives in React state and
// goes nowhere. The reading itself is the package's (`readSeller`), called in TryGuard.tsx by the two lines below.
import type { SellerReading } from "../../../../trust/src/seller.ts";

/** The lines that produce a result, as a developer would write them. TryGuard.tsx runs these lines (try-guard.test.ts); its
 *  import carries one build mark, `?own`, which names the same package (web/own-copy.ts). */
export const CODE_LINES = [
  'import { readSeller } from "@gilded-goose/trust";',
  "const { verdict, rule, reason, cantSee } = readSeller(note);",
] as const;
export const CODE_HEAD = "The two lines that ran:";

export const TRY_HEAD = "Try the guard in your browser";
/** Said in place of the part if it throws while drawing. The same words Builders.tsx types for a chunk that never arrives
 *  (they can't be shared: this file is the lazy chunk's); try-guard.test.ts holds the two equal. */
export const LOST = "Didn’t load. Reload to try it.";
export const NOTE_LABEL = "Paste a seller's note";
/** Under the box. Held by try-guard.test.ts (no fetch, storage or log in the part's files) and by the browser walk's request count. */
export const NOTHING_SENT = "The package reads it here, in this page. Nothing is sent, stored or logged.";

/** True while the six files readSeller runs are, compiled, byte-equal to the published package's: trust/test/published.test.ts
 *  and claims row tg-same-code hold it. THE SWITCH for a Watcher fix that can't wait for an npm publish: set this to false in
 *  the same commit as the fix, and reword row tg-same-code in docs/claims.md to the second sentence (check-claims prints the
 *  Value it then expects, so the row can't go on citing a sentence the page stopped saying). The equality check stands down;
 *  it goes red instead if the code is equal again, so false can't outlive the next publish and pin (node scripts/trust-published.ts). */
export const SAME_AS_PUBLISHED: boolean = true;
export const SAME_CODE = (name: string, version: string) => `This is the same guard code as ${name} ${version} on npm: a test checks each file readSeller runs against the published package.`;
export const CHANGED_CODE = (name: string, version: string) => `Built from the same source as ${name} ${version} on npm, plus changes not yet published.`;
/** The package and version come from trust/package.json at the call (TryGuard.tsx), never typed here. */
export const sameCode = (name: string, version: string) => (SAME_AS_PUBLISHED ? SAME_CODE : CHANGED_CODE)(name, version);
/** What this box is not: the live round. The reader line is true with the reader on or off (it "can add" one). */
export const CODE_ONLY = "It's the code-only guard: plain word rules, with no AI, no price and no payment in this box. The live site can add an AI reader on top, which can only make Goose more careful, never less.";
export const CODE_MISSES = "Code alone misses some scam notes.";
export const PROOF_LINK = "See Proof";

/** One scam, one honest, one tricky: notes the repo already cites (builders.ts's SELLER_READS; the test holds them equal). */
export const EXAMPLES: readonly { label: string; note: string; verdict: SellerReading["verdict"] }[] = [
  { label: "A scam", note: "Pay me with a $19 gift card and I ship today.", verdict: "refuse" },
  { label: "An honest note", note: "Small scuff on the left corner, ships Monday.", verdict: "clear" },
  { label: "A tricky one", note: "Cash at pickup.", verdict: "hold" },
];
export const EXAMPLES_HEAD = "Or try one:";
export const CHECK = "Check this note";
export const RETURNED = "readSeller returned";

/** The most this box takes. Above the Watcher's own 500, so the package's "too long" reading can still be seen here. */
export const NOTE_CAP = 2000;
export const CAP_SAID = "This box takes 2,000 characters at most. The rest of what you pasted was left out and not read.";
/** The note as the box keeps it, and whether anything was left out. */
export function capNote(text: string): { note: string; cut: boolean } {
  return text.length > NOTE_CAP ? { note: text.slice(0, NOTE_CAP), cut: true } : { note: text, cut: false };
}

export const TRY_WORDS: readonly string[] = [TRY_HEAD, NOTE_LABEL, NOTHING_SENT, CODE_HEAD, ...CODE_LINES, CODE_ONLY, CODE_MISSES, PROOF_LINK, EXAMPLES_HEAD, ...EXAMPLES.flatMap((e) => [e.label, e.note]), CHECK, RETURNED, CAP_SAID];
