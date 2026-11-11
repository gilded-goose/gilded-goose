// The heads prerender.ts paints for a room named in the address, before the Desk's code runs. The room draws its own head
// when it arrives, so these are the same words twice: `roomHeadsChanged` stops the build if they part (web/prerender.ts).
// For the build only: nothing the app ships imports this.
import { AFTER_TITLE } from "@goose/core/after";
import { LIMITS_NAME } from "@goose/core/menu";

export const ROOM_EYEBROW = "The challenge";
/** The Challenge's section number on its label (hero.css's ds-n counter): the first numbered section since push 17. */
export const ROOM_N = "01";
/** The Challenge's lede, on its cover above the counter (ChallengeStart.tsx CH_LEDE). */
/** Your wants' line under its head: the pane's and the cover's (early-wants.ts). */
export const WANTS_SUB = "Goose watches these prices for you and says what it set aside.";
export const ROOM_LEDE = "You're the seller. Write anything.";
export const ROOM_HEADS = {
  challenge: "Try to trick Goose.",
  after: AFTER_TITLE,
  wants: "Your wants",
  week: "Your week",
  settings: LIMITS_NAME,
} as const;

/** Each head as its own room's source writes it. Returns what parted, or null. */
export function roomHeadsChanged(read: (file: string) => string): string | null {
  const panes = read("desk/Panes.tsx");
  const challenge = read("desk/story/ChallengeStart.tsx");
  const after = read("after/AfterPay.tsx");
  const held: [string, boolean][] = [
    [ROOM_HEADS.challenge, challenge.includes(`CH_HEAD = "${ROOM_HEADS.challenge}"`) && challenge.includes(`CH_EYEBROW = "${ROOM_EYEBROW}"`) && challenge.includes(`CH_LEDE = "${ROOM_LEDE}"`)],
    [ROOM_HEADS.wants, panes.includes(`tabIndex={-1}>${ROOM_HEADS.wants}</h1>`)],
    [ROOM_HEADS.week, panes.includes(`tabIndex={-1}>${ROOM_HEADS.week}</h1>`)],
    [ROOM_HEADS.settings, panes.includes("tabIndex={-1}>{LIMITS_NAME}</h1>")],
    [ROOM_HEADS.after, after.includes("{AFTER_TITLE}</h1>")],
  ];
  const parted = held.find(([, ok]) => !ok);
  return parted ? `the room's head "${parted[0]}" no longer matches its room's source (web/src/desk/room-heads.ts)` : null;
}

/** The cover's rules (inside the room's own file, first/room-<name>.html). A pane's head wears the Desk's
 *  own `.dk-pane-h`; After you pay's and the challenge's sheets aren't here yet, so their heads carry their sizes. */
export function roomFirstCss(): string {
  const words = `"Archivo Fallback",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif`;
  const display = `"Hanken Fallback",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif`;
  return `#dk-room-first{position:fixed;inset:0;z-index:40;overflow:hidden;pointer-events:none;animation:dk-case-out 0s 8s forwards}` +
    `#dk-room-first>.dk{min-height:100%}` +
    // The landing's hero, drawn at the top of the page under the cover until the Desk scrolls to the room: the browser's
    // largest paint doesn't know it's covered, so its headline (16,071 px² at 390) and egg outbid the room's own words and
    // #challenge read 2.3 s with its counter on screen at 0.6 s (Track F, Nov 6). This rule leaves with the cover.
    `#root .dk-hero{visibility:hidden}` +
    // Its children, never the cover: a rule on the cover itself would stop the 8 s above.
    `#dk-room-first,#dk-room-first *{font-family:${words}!important}#dk-room-first *{animation:none!important;transition:none!important}` +
    // The room's heading face wherever the room's sheets give it (desk.css's h1 to h3, states.css's note title): #wants'
    // card title and empty-list title were in the words' face, 4 px shorter, and the list moved at the lift (Track F, Nov 6).
    // `.dk-pane-h` by its class too: the challenge's head is a <p> that wears it, and lost its light face without it.
    `#dk-room-first :is(h1,h2,h3,.dk-pane-h,.st-note-title){font-family:${display}!important}#dk-room-first .dk-pane-h{letter-spacing:-.008em}` +
    `#dk-room-first [data-room-head=after] .dk-pane-h{font-size:32px;line-height:1.2}` +
    // Where the room's landing puts its head on a phone and at 1440: the cold drill's step check holds these. From 721 px the
    // Challenge sits --s-2 under the hero since push 17 (hero.css), so its label lands at y 89, 15 px above the cover's box.
    `#dk-room-first [data-room-head=challenge]{margin-top:-15px}#dk-room-first .dk-eyebrow{margin-bottom:var(--s-3)}` +
    `@media (max-width:720px){#dk-room-first [data-room-head=challenge]{margin-top:0;padding-top:calc(57px - var(--s-3))}}` +
    // One step under the hero's lines at every width over 430 (hero.css: .ds-h2 at 720 and under, .ds-ch .ds-h2 over it).
    `#dk-room-first [data-room-head=challenge] .dk-pane-h{font-weight:var(--w-display);font-size:var(--t-h2);line-height:1.06;letter-spacing:var(--track-display)}` +
    // At a phone's size the head's own sheet sets it smaller, with less air above, and the lede closer (hero.css, Joshua's 3d;
    // the DD on Option B).
    `@media (max-width:430px){#dk-room-first [data-room-head=challenge]{padding-top:0}#dk-room-first [data-room-head=challenge] .dk-pane-h{font-size:var(--t-sec)}#dk-room-first [data-room-head=challenge] .dk-eyebrow{margin-bottom:var(--s-1)}#dk-room-first [data-room-head=challenge] .ds-lede{margin-top:var(--s-2)}}` +
    // The Challenge's counter, as challenge.css draws it (not here yet): core/test/early-challenge.test.ts holds each rule to
    // that sheet's. From 961 px the Challenge is hero.css's two columns (1fr and 1.25fr, a --s-8 gap) and its copy is the first.
    `@media (min-width:961px){#dk-room-first [data-room-head=challenge]{max-width:calc((100% - var(--s-8)) / 2.25)}}` +
    // Its section's number, as hero.css's counter draws it on the room's label: without it "03" came in at the lift and
    // pushed the label 30 px right. The first numbered section in Story.tsx's order since push 17 (room-first.test.ts holds it).
    `#dk-room-first [data-room-head=challenge] .dk-eyebrow::before{content:"${ROOM_N}";margin-right:var(--s-2);font-variant-numeric:tabular-nums;color:var(--ink-3)}` +
    `#dk-room-first ${CH_COUNT_RULES.join("#dk-room-first ")}` +
    // Up to 960 px the room puts the note and Send between its lines and its counter (challenge.css, the DD on Option B):
    // the cover draws no counter there, so it never shows one where the form is about to land.
    `@media (max-width:960px){#dk-room-first .ds-ch-count{display:none}}` +
    // Your wants' empty list, drawn by the room's own sheets (moved to the head when placed): shown only once the head's
    // answers say the room will draw exactly it (early-wants.ts); its parts then sit in the pane as the room's do.
    `#dk-room-first .dk-room-empty{display:none}#dk-room-first[data-empty] .dk-room-empty{display:contents}`;
}

/** challenge.css's counter rules, word for word (the cover's copies take the cover's id in front). */
export const CH_COUNT_RULES = [
  ".ds-ch-count{margin-top:var(--s-5);padding-top:var(--s-3);border-top:var(--hair);max-width:31rem}",
  ".ds-ch-line{margin:0;color:var(--ink);font-size:var(--t-lead);font-weight:var(--w-strong);line-height:1.4;text-wrap:balance}",
  ".ds-ch-outcome{display:block}",
  ".ds-ch-second{margin:var(--s-1) 0 0;color:var(--ink);font-size:var(--t-body);line-height:1.5;text-wrap:pretty}",
  ".ds-ch-count[data-alarm] .ds-ch-line{color:var(--red)}",
] as const;
