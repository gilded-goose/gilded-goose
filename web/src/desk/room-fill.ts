// The room covers' fills, in their own file (Track F, Nov 6). The Challenge's and Your wants' fills (CHALLENGE_FILL,
// WANTS_FILL) sat inline in index.html's cover placer: 1,007 B that every route downloads for two addresses most visitors
// never open, and with the head's asks they put the Community ledger 326 B over its line on push 18f (rehearsal-bytes).
// Now the head starts first/room-fill.js on a #challenge or #wants arrival only, beside the room's own file, and the two
// meet whichever lands first: the file leaves its fill on the page, the placer marks the cover placed, and the fill runs
// once, after the cover is in. The asks stay in the head (EARLY_CHALLENGE, EARLY_WANTS): they must start before any file.
// Plain ES5 in strings, as the fills are; web/prerender.ts writes the file and core/test/room-fill.test.ts runs the meeting.

/** The fills' file, under the build's base. */
export const ROOM_FILL_FILE = "first/room-fill.js";

/** The rooms whose covers the file fills. */
export const FILLED_ROOMS = ["challenge", "wants"] as const;

/** In the head's room branch (`N` is the room): starts the file, only for a room it fills. `src` is a JS string literal. */
export const fillAsk = (src: string): string =>
  `if(${JSON.stringify(FILLED_ROOMS)}.indexOf(N)>=0){var f=document.createElement("script");f.src=${src};document.head.append(f)}`;

/** In the placer, once the cover is in: marks it placed, and fills now if the file came first. */
export const FILL_PLACED = "window.__placed=1;window.__fill&&__fill()";

/** The file: leaves its fill on the page, and fills now if the cover went in first. */
export const roomFillFile = (fills: string): string => `window.__fill=function(){${fills}};window.__placed&&__fill();\n`;
