// The dashboard's geometry (Track AS, slice 9): the six Goose widgets' places on Studio's 24-column, 16 px-track grid,
// in one place with no AG import, so the shell-first page (Shell.tsx, drawn before the Studio chunk arrives) and the
// dashboard's own `initialView` (widgets/index.tsx) draw the same frames.

/** Studio's row track (its default); the canvas height is tracks × this. */
export const TRACK_PX = 16;
export const COLUMNS = 24;

export interface Place { xTrack: number; yTrack: number; xSpan: number; ySpan: number }
export const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): Place => ({ xTrack, yTrack, xSpan, ySpan });

export type GooseWidgetKey = "week" | "blocked" | "ladder" | "spend" | "paypal" | "every";
export type Layout = Record<GooseWidgetKey, Place>;

/**
 * Where each card goes. With no session the empty "against your limits" card goes last (the Design Director's gate,
 * item 1), and the chart cards share a row height; a phone is one column. On a phone these tracks are where the frames
 * start (the shell draws them before the Studio chunk arrives); once the cards are on the page, `fitColumn` sizes each
 * frame to its own card (AS-12). So the phone's tracks here are each card's own at 390, the common width, with the demo
 * week's rows (no session) or one paid run's (a session): at 390 nothing moves when the dashboard takes the shell's place.
 * The desktop's tracks are each card's own at 1440 plus one, with the demo week's rows (AS-15 measured them, scripts kept
 * with the packet). Below the first row every card has a full-width row of its own (AS-15 slice 2, the DD: the empty
 * "against your limits" card beside the haggle chart left about 380 px of bare velvet under it, since a row is as tall
 * as its tallest card), so `fitRows` can fit each row to its card as rows stream in (a paid cart, PayPal's rows).
 */
export function layoutFor(phone: boolean, hasSession: boolean): Layout {
  const base = cardsFor(phone, hasSession);
  // Each frame is its card's tracks plus the gutter's (GUTTER_TRACKS), restacked as the same rows or column.
  const need = Object.fromEntries(Object.entries(base).map(([k, p]) => [k, p.ySpan + GUTTER_TRACKS]));
  return ((phone ? fitColumn(base, need) : fitRows(base, need)) ?? base) as Layout;
}

/**
 * The gutter (the DD, stack 107, a launch-checklist item): one --s-2 (16 px) around every card, so two cards' 12 px
 * corners never meet in a dark wedge. AG Studio insets each card by its `widgetPadding` on every side (theme.ts
 * `studioWidgetPadding: GUTTER_PX / 2`, so two neighbours are GUTTER_PX apart), and with `studioWrapperSpacing: 0` there
 * is no page padding, so the outer cards sit that half gutter inside the column (measured: 1440, cards 160–1280 under a
 * 152–1288 heading; 390, 24–366 under 16–374). The inset comes out of each frame's height, so a frame is its card's
 * tracks plus one.
 */
export const GUTTER_PX = 16;
export const GUTTER_TRACKS = GUTTER_PX / TRACK_PX;

/** Each card's own tracks (before the gutter), measured as layoutFor's comment says. */
function cardsFor(phone: boolean, hasSession: boolean): Layout {
  return phone
    ? hasSession
      ? { week: at(0, 0, 24, 37), blocked: at(0, 37, 24, 40), ladder: at(0, 77, 24, 36), spend: at(0, 113, 24, 13), paypal: at(0, 126, 24, 42), every: at(0, 168, 24, 221) }
      : { week: at(0, 0, 24, 37), blocked: at(0, 37, 24, 29), ladder: at(0, 66, 24, 36), paypal: at(0, 102, 24, 42), spend: at(0, 144, 24, 13), every: at(0, 157, 24, 187) }
    : hasSession
      ? { week: at(0, 0, 14, 36), blocked: at(14, 0, 10, 36), ladder: at(0, 36, 24, 34), spend: at(0, 70, 24, 12), paypal: at(0, 82, 24, 30), every: at(0, 112, 24, 40) }
      : { week: at(0, 0, 14, 36), blocked: at(14, 0, 10, 36), ladder: at(0, 36, 24, 34), paypal: at(0, 70, 24, 30), spend: at(0, 100, 24, 12), every: at(0, 112, 24, 40) };
}

/** How many tracks tall a layout is: the canvas needs at least that, so the page scrolls, not the canvas. */
export function tracksIn(layout: Partial<Record<string, Place | undefined>>): number {
  return Math.max(0, ...Object.values(layout).map((l) => (l ? l.yTrack + l.ySpan : 0)));
}

/**
 * The phone's frames fit their cards (AS-12, the DD's phone frame rule, dd/system.md §3): on a phone every widget is one
 * full-width frame in one column, and a card's height there turns on the width (360 wraps more than 430) and on the rows
 * (a session adds set-aside sellers, PayPal rows, carts and ledger rows as they stream in), so no one set of tracks can
 * keep every card whole with at most one `--s-12` under it at 360–430. The page measures each card at its own height and
 * hands the tracks it needs here; this restacks the column top to bottom, each frame exactly its card's tracks (under
 * 16 px of room below any card, nothing cut, at any width, 320 included). Null when nothing moves, or when the page is
 * not one full-width column (a visitor's own arrangement is left alone).
 */
export function fitColumn<P extends Place>(layout: Partial<Record<string, P | undefined>>, need: Partial<Record<string, number>>): Record<string, P> | null {
  const places = Object.entries(layout).filter((e): e is [string, P] => !!e[1]);
  if (places.some(([, p]) => p.xTrack !== 0 || p.xSpan !== COLUMNS)) return null;
  places.sort((a, b) => a[1].yTrack - b[1].yTrack);
  const out: Record<string, P> = {};
  let y = 0;
  let moved = false;
  for (const [id, p] of places) {
    const span = Math.max(1, need[id] ?? p.ySpan);
    if (span !== p.ySpan || y !== p.yTrack) moved = true;
    out[id] = { ...p, yTrack: y, ySpan: span };
    y += span;
  }
  return moved ? out : null;
}

/**
 * The desktop's rows fit their cards (AS-15 slice 2): frames that start on one track are a row, and each row becomes its
 * tallest card's tracks (`need`; a card left out keeps its frame), unless its frame is already within `slack` tracks
 * over that, so the first paint's frames hold still. Rows restack top to bottom. Null when nothing moves, or when the
 * page is not clean rows (each row one height, side by side, each starting where the last ends): a visitor's own
 * arrangement is left alone.
 */
export function fitRows<P extends Place>(layout: Partial<Record<string, P | undefined>>, need: Partial<Record<string, number>>, slack = 0): Record<string, P> | null {
  const places = Object.entries(layout).filter((e): e is [string, P] => !!e[1]);
  places.sort((a, b) => a[1].yTrack - b[1].yTrack || a[1].xTrack - b[1].xTrack);
  // Each row keeps its first frame as `head`, so its track and height never come from an index that might be empty.
  const rows: { head: P; cards: [string, P][] }[] = [];
  for (const e of places) {
    const last = rows[rows.length - 1];
    if (last && last.head.yTrack === e[1].yTrack) last.cards.push(e); else rows.push({ head: e[1], cards: [e] });
  }
  let end = 0;
  for (const { head, cards } of rows) {
    if (head.yTrack !== end || cards.some(([, p]) => p.ySpan !== head.ySpan)) return null;
    let right = -Infinity;
    for (const [, p] of cards) { if (p.xTrack < right) return null; right = p.xTrack + p.xSpan; }
    end += head.ySpan;
  }
  const out: Record<string, P> = {};
  let y = 0;
  let moved = false;
  for (const { head, cards: row } of rows) {
    const had = head.ySpan;
    const tallest = Math.max(1, ...row.map(([id, p]) => need[id] ?? p.ySpan));
    const span = tallest > had || had - tallest > slack ? tallest : had;
    for (const [id, p] of row) {
      if (span !== p.ySpan || y !== p.yTrack) moved = true;
      out[id] = { ...p, yTrack: y, ySpan: span };
    }
    y += span;
  }
  return moved ? out : null;
}

/**
 * The Live Threat Board's frames (Track T), above the six ledger cards: the count, then time beside rules, then every try.
 * Each is its card's own tracks at 1440 and at 390 with the seeded week on show, plus the gutter; `useFit` takes them from
 * there. Apart from `layoutFor`, because the six cards' places are pinned by their own tests and mean the same as ever.
 */
export function withThreat(layout: Layout, phone: boolean): Record<string, Place> {
  // The phone has Studio's own trick type → rule → verdict pivot too, under the rules (Round 6b's AG seat: at 390 AG was
  // only the frame); the by-day pivot, a column a day, stays the desktop's.
  const t = phone
    ? { "threat-counter": at(0, 0, 24, 44), "threat-time": at(0, 44, 24, 64), "threat-rules": at(0, 108, 24, 40), "threat-pivot": at(0, 148, 24, PHONE_PIVOT_TRACKS), "threat-tries": at(0, 148 + PHONE_PIVOT_TRACKS, 24, 83) }
    : { "threat-counter": at(0, 0, 24, 26), "threat-time": at(0, 26, 14, 43), "threat-rules": at(14, 26, 10, 43), "threat-tries": at(0, 69, 24, 39), "threat-pivot": at(0, 108, 24, 36), "threat-days": at(0, 144, 24, 28) };
  const down = tracksIn(t);
  return { ...t, ...Object.fromEntries(Object.entries(layout).map(([k, p]) => [k, { ...p, yTrack: p.yTrack + down }])) };
}

/** The phone's pivot frame before its grid is measured: `useFit` sizes it to the rows it opens with. */
export const PHONE_PIVOT_TRACKS = 40;

/**
 * Which widget a frame on the canvas is, from where it stands: Studio's built-in widgets (its pivot grids) carry no id in
 * the page, so `useFit` finds theirs here, by the track their frame starts on. `topPx` and `leftPx` are the frame's
 * offset in the canvas (the frame's edge or its card's, which sits half a gutter in), `colPx` one column's width. Null
 * when no one frame starts there.
 */
export function placeAt(layout: Partial<Record<string, Place | undefined>>, topPx: number, leftPx: number, colPx: number): string | null {
  const y = Math.floor((topPx + TRACK_PX / 4) / TRACK_PX), x = Math.floor((leftPx + colPx / 4) / colPx);
  const hit = Object.entries(layout).filter(([, p]) => p && p.yTrack === y && p.xTrack === x);
  return hit.length === 1 ? hit[0]![0] : null;
}

/** The tracks the shell's board cards fit to, for the dashboard to start from (`initialView`), so its frames open where they stand. */
export const shellFit: { need: Record<string, number> | null } = { need: null };

/** The tracks a card of `px` (its own height, plus whatever the frame draws around it) needs: whole tracks, never short. */
export const tracksFor = (px: number): number => Math.ceil(px / TRACK_PX - 0.01);
