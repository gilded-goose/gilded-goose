# Gilded Goose brand spec

Track B (Brand & Motion), Fri Oct 30 2026. Every track builds to this. The values live in one file,
`web/src/desk/tokens.css`; this page says what they mean and where they may go. If the two ever disagree, the file is
right and this page gets fixed. New tokens are added there, never forked into a surface's own CSS.

## 1. The idea

**A jewelry case at night. The gold egg is the only light.** Velvet that drinks light, cream type, one precious object.
Everything else is quiet and exact so the egg, "you're protected" and the one approvable deal can be found in a glance.

- One idea per screen. If a screen has two jobs, it is two screens.
- Restraint is the look: every element earns its place by helping a regular person trust Goose faster.
- Type does the work. Hierarchy comes from size, space and ink tier, never from boxes, color or weight.
- Gold means one of three things: the egg, "you're protected", the deal you can approve. Never decoration, never a button.
- Glass is a lit object, so it is rare: at most three on screen, always with the egg's light behind it.
- Motion answers something real (her tap, a row arriving, the egg following her). Nothing moves on its own clock.

## 2. What we learned from the craft reference

We studied one consumer-hardware site Joshua named for its craft (captures kept out of the repo). We take its
discipline, not its look: no code, assets, words or layout of theirs are used, and it is never named in anything that
ships. In general terms:

1. **Light display type, tight at large sizes.** Headlines are a light weight (around 300) with negative tracking that
   grows with size (about -3% at 40 px and up). Body copy is a light-to-regular weight at 15-18 px with 1.5-1.6 line height.
   Weight is barely used for hierarchy. *Ours:* Hanken display at 300, `--track-display`, Archivo body at 400.
2. **Ink tiers instead of greys.** Text sits at three or four opacities of one cream (about 100 / 74 / 52 / 34%), so
   secondary lines recede without changing hue. *Ours:* `--ink`, `--ink-2`, `--ink-3` (solid values, AA on every surface).
3. **Huge rhythm between ideas.** About 160-200 px of empty space separates one idea from the next on a wide screen;
   inside an idea, spacing is tight. The contrast between the two is what makes it feel calm. *Ours:* `--section`.
4. **Hairline grids, not boxes.** Facts sit in cells divided by a 1 px line at about 10% ink, with no card behind them.
5. **Glass only where something lit is behind it.** Its glass panels sit over a lit photograph; over flat black it would
   look like grey plastic. It uses two or three glass surfaces per screen, small, never glass on glass.
6. **One curve.** A single strong ease-out (fast start, long soft landing, no overshoot) for every move: 450-700 ms for
   a reveal, 180-250 ms for hover and color. No bounce anywhere. *Ours:* two curves that both land without overshoot,
   `--spring` for a move and `--ease` for a fade, and shorter: 200-400 ms (section 7).
7. **The opening is one object coming to light.** A dark screen, one hairline, one object lit, then the page. Ours
   already does this in our own terms (the case light coming on, `opening.ts`), and stays ours.
8. **A dignified "not now".** Under its main offer sits a quieter second card for people who aren't ready: same width,
   plain surface, a hairline, lower-contrast words, a quiet outline button. The hesitant visitor gets a respectful
   exit instead of pressure. *Ours:* beside "Approve $X" there is always a quiet way out ("Ask for something else",
   "Not now"), as an outline pill, never a second gold or filled button.
9. **The precious object gets light inside its edge.** Its featured offer has a warm light along the inside of its
   border; everything else is neutral. *Ours:* only the deal card wears the gold edge (`--gold-line`).

## 3. Color (two palettes, the same case)

Velvet is the shopper's room (`.dk[data-palette="v"]`). Midnight is the same case with the lights lowered, the back
room (`.dk[data-palette="midnight"]`; `"c"` is the same block under its older name). One set of role names, two sets of
values, both in `tokens.css`. The back room's `--lx-*` names are only aliases that point at these
(`--lx-page: var(--page-solid)` and so on); no value is typed anywhere else.

**Two rooms, one case (Design Director's ruling, Oct 30, 23:15).** Midnight stays: a judge moving from the Desk to
Behind the scenes should feel the room change, not the product. What makes the two rooms one case is everything the
rooms share by name: the one nav (`SiteNav`) with the rendered egg, the 1200 px grid, the type scale, and two things
that are the *same value* in both palettes, not just the same name: the egg's light falls at the same place
(`--egg-at`, set once in the shared block, never per palette; section 6), and the nav's glass is the one recipe
(since 10.6, the bar's own frost: `--glass-bar-bg` and the 40 px blur, read through the page's palette; before it,
`.dk-glass`'s five lines, read through the page's palette: Velvet's `--glass-bg` on the Desk, Midnight's on the back
room, the same blur, edge, hairline and shadow). A back-room page without `data-palette="midnight"` on its root gets
neither (no tokens, no light, a solid nav), so every back-room root carries it.

| Token | Velvet | Midnight | Use | Velvet contrast on `--page-solid` / `--card` |
|---|---|---|---|---|
| `--page-solid` | `#2c1520`, grain .07 | `#151013`, grain .05 | the page: flat and matte, never a gradient or a glow | |
| `--card` / `--card-flat` | `#371c2a` | `#1c1619` | a raised surface: a 1 px line or a shadow, never both | |
| `--card-2` | `#3a1d2c` | `#241d21` | the deal card (the one lit object) | |
| `--sheet` / `--panel` | `#341a27` | `#1c1619` | sheets, and the glass fallback | |
| `--ink` | `#f4eadc` | `#f2e9dc` | primary text, the CTA fill | 14.3 / 13.0 |
| `--ink-2` | `#cdb9b5` | `#c9bdaf` | secondary text | 9.1 / 8.2 |
| `--ink-3` | `#b49f9c` | `#a3978a` | tertiary text, labels | 6.8 / 6.2 (5.8 on glass over the egg's light) |
| `--line` / `--line-2` | cream at 12% / 30% | cream at 9% / 18% | hairlines only; outline buttons and chips | |
| `--cta` / `--on-cta` | `#f4eadc` / `#2c1520` | `#f2e9dc` / `#151013` | the one filled action per surface (cream, never gold) | |
| `--cta-hover` | `#fff6ea` | `#fff6ea` | that action under the cursor: hover is colour only (`--d-1 --ease`); `:active` is scale .98 or translateY(1px), never a third colour | |
| `--gold` | `#e3ba6a` | `#e2b866` | the egg, protection, the approvable deal | 9.3 / 8.4 |
| `--gold-hi` | `#efce8c` | `#efce8c` | gold text | 11.2 / 10.2 |
| `--gold-line` | gold at 62% | gold at 62% | the deal card's edge (the only gold-edged object) | |
| `--red` | `#f0a59a` | `#e48676` | the threat's own number, a marker dot | 8.5 / 7.7 |
| `--focus` | ink | ink | 2 px focus ring, offset 2-3 px | |

Never: blue or teal anywhere (the old teal "palette c" is gone), purple-blue, rainbow or gradient text; gold on a
button; red as a fill.

## 4. Type

Two faces, self-hosted, metric-matched fallbacks so the swap never moves a line (`tokens.css` `@font-face`).

Hanken Grotesk (`--display`) for every heading, price and number that is the point of a card; Archivo (`--face`) for
everything else. Hierarchy by size and space, not weight.

| Token | Size | Weight | Tracking | Line | Used for |
|---|---|---|---|---|---|
| `--t-hero` | clamp(44px, 5.4vw, 68px) | 300 | -.016em (`--track-display`) | 1.04 (`--lh-display`) | the landing h1 only; at ≤430 it takes `--t-h2` (30, stepping down with the width under about 385), and the longest promise wraps (the DD, Round 5) |
| `--t-h1` | clamp(36px, 4vw, 56px) | 300 | -.012em | 1.04 | a room's title (Behind the scenes, Proof, the haggle, the wallet, "Here's what I understood") |
| `--t-h2` | clamp(30px, 3.4vw, 44px) | 300 | -.008em | 1.1 | a landing section head; the deal price |
| `--t-h3` | 24px | 400 (`--w-head`) | -.008em (`--track-head`) | 1.2 (`--lh-head`) | a card or panel head |
| `--t-sec` | 24px | 300 | -.008em | 1.06 | a landing section head at ≤430: under the hero's 30 and over the counter's 20, where `--t-h3`'s phone step would tie it |
| `--t-lead` | 20px | 400 | 0 | 1.5 (`--lh-body`) | the one line under a title |
| `--t-body` | 17px | 400 | 0 | 1.5 | body copy, menu names, card lines |
| `--t-small` | 15px | 400 | 0 | 1.5 | dense data: table cells, rounds, chips, captions |
| `--t-micro` | 13px | 400 / 560 | 0 (.08em uppercase, `--track-eyebrow`) | 1.4 (`--lh-micro`) | meta, the practice line, eyebrows, footers |
| `--t-num` | 40px | 300 | -.01em | 1.05 | one big number on a card ("$47.73", "0 of 60") |

- **One eyebrow:** `--t-micro`, uppercase, .08em, 560, `--ink-2`: the class `.dk-eyebrow` in `tokens.css`, applied,
  never retyped (a surface adds only its margin). Uppercase is for eyebrows alone; a back link, a tag and a button are
  sentence case.
- **Weights:** 300 display, 400 head and body, 560 (`--w-strong`) strong. Nothing at 320, 340, 500, 600, 700 or 800.
- **Numbers:** `tabular-nums` wherever two numbers can sit above each other.
- **Banned sizes:** 12.5, 13.5, 14.5, 19, 21, 23 px and anything else not in the table; 14 px becomes 15 or 13.
- Body stops at 62ch; a lead beside a head at 36ch. Headlines `text-wrap: balance`, paragraphs `pretty`.
- **Phone steps live in one place** (gate ruling, Sat Oct 31 05:48): a size that changes at ≤720 changes only in
  `tokens.css`'s ≤720 block, never in a component; a component that wants another size picks another token. A test
  fails any `.css` file other than `tokens.css` that declares a `--t-*`. The one phone step is `--t-h3: 20px`.
  `--t-lead` stays 20 px at every width (DD ruling): at 17 px it would equal `--t-body`, and the line under a title
  would read as body copy; hierarchy here is size, never weight.

## 5. Space and shape

- **The 8 px grid:** `--s-1` 8 · `--s-2` 16 · `--s-3` 24 · `--s-4` 32 · `--s-5` 40 · `--s-6` 48 · `--s-8` 64 · `--s-10` 80
  · `--s-12` 96. Nothing off the grid except 1 px hairlines: no 10, 12, 14, 18, 20, 28 or 56 px paddings (12 only
  inside a 44 px control). **No optical nudges** (the DD, Sat Oct 31 08:05 PDT): a 1-7 px gap, padding or margin inside
  one block rounds to 0 or `--s-1`, never a raw value, and there is no half step. A `raw-ok` comment in CSS is legal
  only when it cites the brand.md line that allows it; the spacing guard refuses one that doesn't.
- **Frame:**

  | | 1440 | 390 |
  |---|---|---|
  | page width | `--w-page` 1200 px of content; gutters `--gutter` = `--s-4` 32 | gutters `--s-2` 16 |
  | wide data (the one table) | may stretch to `--w-wide` 1280 | full width |
  | nav height | `--nav-h` 64 | 56 |
  | between landing sections | `--section-y` = `--s-12` 96 above and below one hairline | `--s-6` 48 |
  | a back-room title block | `--s-8` 64 above, `--s-5` 40 below | `--s-5` / `--s-4` |
  | card padding | `--s-3` 24 (the deal card `--s-4` 32) | `--s-3` or `--s-2`, nothing between |
  | gap between cards | `--s-2` 16 | `--s-2` |

- **Rhythm: spacious, never empty.** No stretch of empty velvet taller than one `--s-12` (96 px) between two things.
  Each landing section pads itself `--section-y` top and bottom around one hairline, so the step from one idea to the
  next is `--section` (two `--section-y`, 192 px at 1440, 96 px on a phone) with the hairline in the middle of it.
  Inside an idea, `--s-2`-`--s-3`; between an idea's heading block and its proof, `--s-6`-`--s-8`. A section is never
  held taller than its content (no `min-height: 100vh` or `72vh` around a few lines, which centres them in half a
  screen of velvet). No horizontal scroll at 390.
- **Content is there without the scroll.** A section's one reveal (section 7) only adds motion to text that is
  already laid out and readable: a full-page capture, a print, a reader that never scrolls and a slow script all see
  every line. Hidden-until-seen is banned.
- **Cards:** `--card`, a 1 px `--card-line`, `--r-3`, padding `--s-3` (the deal card: `--card-2`, 14 px radius,
  padding `--s-4`); no shadow; one card is one thought; never a card in a card.
- **Radii:** `--r-1` 8 (chips, small buttons) · `--r-2` 10 (inputs, menu items) · `--r-3` 12 (cards, glass) ·
  `--r-pill` (the approve pill, outline pills).
- **Edges:** a hairline (`--hair`) and either a light top edge or a soft shadow, never both. Glass is the one exception.
- **Targets:** 44 px minimum on every control.

## 6. Glass

**One recipe.** One token set, the same shape in both palettes, used as a whole:

| Token | Velvet | Midnight |
|---|---|---|
| `--glass-bg` | `rgba(55, 28, 42, .55)`: the velvet card at 55% | `rgba(21, 16, 19, .55)`: the page at 55% |
| `--glass-bg-read` | `rgba(55, 28, 42, .86)` | `rgba(21, 16, 19, .86)` |
| `--glass-blur` | `blur(24px) saturate(140%)`, the blur for every glass object (the bar alone takes 40 px, 10.6) | the same |
| `--glass-edge` | `inset 0 1px 0 rgba(244, 234, 220, .18)`: the 1 px lit top edge | `inset 0 1px 0 rgba(242, 233, 220, .18)` |
| `--glass-line` | `rgba(244, 234, 220, .1)`: the hairline | `rgba(242, 233, 220, .1)` |
| `--glass-shadow` | `0 40px 80px -24px rgba(10, 3, 7, .72), 0 12px 24px -12px rgba(10, 3, 7, .4)` | the same shape, `rgba(5, 3, 4, …)` |
| `--glass-r` | `--r-3` (12 px); 0 for a phone's full-screen sheet | the same |

`--glass-bg-read` (`.dk-glass-read`) is allowed on a paragraph surface only: glass whose content is read in sentences,
so what is behind it must never show through text. Today that is the ledger's row sheet and its side panel. It is
not for the nav, the menu, a dialog whose content is a title and a button row, the understood card, the steps panel
or any card whose point is a number: those are `--glass-bg`, so the egg's light still reads through them. A paragraph
surface that doesn't sit over the egg's light is a solid `--sheet`, not the darker glass. Apply the recipe with the
class, never by copying its lines:

```html
<aside class="dk-glass">…</aside>      <!-- or dk-glass-read -->
```

`.dk-glass` (in `tokens.css`) is `background: var(--glass-bg)`, `backdrop-filter: var(--glass-blur)`, a 1 px
`--glass-line` border, `--glass-r`, and `box-shadow: var(--glass-edge), var(--glass-shadow)`. A surface that can't
take the class (a pseudo-element, a component's own root) uses those five lines with these tokens and nothing else.

**Losers (Design Director, crit #1):** the Desk nav's own recipe (92% velvet, blur 14 px; replaced since by 10.6's
.92 tint under a literal 40 px blur with an opaque fallback and a probe, which differs in the blur, the fallback and
the proof), the Ask field's (`--glass`
at 72%, blur 10 px), and the back room's `.mn-glass` and `--lx-*` glass values. Each becomes `.dk-glass` or a solid
`--card`.

**The egg's light (the pairing).** Glass needs something lit behind it. The Desk paints the egg's light once: a wide,
low, static warm pool on the velvet (`--egg-light`: gold at 11% at the centre, falling to 0 over an eased curve of seven
stops on a 60vmax by 50vmax ellipse, so it has no visible edge and never reads as a disc), fixed behind
everything and under the grain, at `--egg-at`: behind the hero egg (74% 38%), behind the deal's column in
the app (`data-app`, 78% 40%), high and centred on a phone (50% 26%; 50% 46% in the app). `--egg-at` is one value for
both palettes (the shared block in `tokens.css`): the light sits where the egg stands in the shopper's room and in the
back room alike, so the two rooms read as one case. It never moves or pulses. It comes on
as the egg glides into place in the opening, the case light coming on. It costs no frames and no request (one CSS
gradient, `.dk[data-layer="shopper"]::before`). The menu's scrim carries the same light (`--glass-light` is `--egg-light`
over the page lowered by 82%, so a small bright control under the glass, the cream Go button, can't blur into a pink
glowing spot: only the egg's light may read through glass). On a phone the menu is a full-screen sheet and the scrim
is the opaque page with the egg's light over it, so nothing under the sheet (the egg included) blurs through. A surface that needs glass somewhere the egg's light doesn't reach is a solid surface instead.

**Where glass goes (nowhere else):** the menu · the nav once scrolled, at every width (solid velvet at the top of
the page, the bar's own frost after 8 px of scroll, 10.6) · the deal card's sheet and every dialog · the understood card · the steps panel · the ledger's
row sheet and panel. The deal card itself stays solid `--card-2` with its gold edge.

**At most three on screen.** Count every element with a `backdrop-filter` that is visible in the viewport.
`node scripts/motion.ts --desk` fails above three. Never glass on glass (the menu covers the deal card, it doesn't sit
on it), never glass on an input, button, chip, pill or the Ask field, never animate the blur.

**Fallbacks.** Where `backdrop-filter` isn't supported, or the device asks for reduced transparency
(`prefers-reduced-transparency: reduce`), `--glass-bg` becomes the opaque `--sheet` and `--glass-blur` becomes `none`;
the edge, hairline and shadow stay, so the object keeps its shape. The egg's light stays: it is light, not glass.

**Midnight (Behind the scenes):** the same class and tokens, read from the Midnight glass block, on a root that
carries `class="dk" data-palette="midnight"` (Behind the scenes, Proof). A back-room surface that keeps Velvet's
names (Every decision's full screen, `data-palette="v"`) takes Midnight's glass alone with `data-glass="midnight"`. Its
egg light is the same eased pool at the same `--egg-at` (74% 38%; 50% 26% on a phone), in Midnight's gold
(`--egg-light` in the Midnight block). The back room paints it the way the Desk does (one fixed layer, `.mn-lit` in
`ledger/midnight.css`, reading `var(--egg-light)`, never its own gradient). Fallback: `--sheet` (`#1c1619`) opaque.

## 7. Motion

**Two curves, both landing without overshoot.** `--ease: cubic-bezier(.2, .7, .2, 1)` for fades and color;
`--spring: cubic-bezier(.22, .8, .24, 1)` (critically damped: a fast start, a long soft landing) for anything that moves
into place. Nothing else (no `ease-in-out`, no elastic, no back room `(.22, 1, .36, 1)`, no `linear` except a line that
tracks real progress).

| Token | Length | For |
|---|---|---|
| `--d-1` | 200 ms | hover, color, a press; every exit |
| `--d-2` | 300 ms | a panel in (the menu, a sheet); the nav underline gliding |
| `--d-3` | 400 ms | a card arriving; the most anything takes outside the exceptions named below |

- **Enter:** opacity 0 → 1 with translateY(8 px, `--s-1`) → 0, `--d-3 --spring`. **Exit:** opacity only, `--d-1`.
- **Hover:** color or border only; a 2 px arrow nudge is the one allowed transform.
- **The exceptions, all on the landing only:** the opening (ends by 1380 ms on its own clock, `opening-clock.ts`;
  its hero fades, `dk-sub`, `dk-ask`, `dk-chips`, the headline's one 480 ms fade, count as the opening whether they
  start under `dk-opening` or in the first beat after `dk-opened` lands), and two line draws that each run once, with
  no delay, and track something real on the page: the moment's price track (`.ds-track-line`, `--ds-draw` 700 ms,
  the week's price falling to the deal) and step 3's gold rule (`.ds-protect-rule`, `--ds-rule` 600 ms, the
  protection line drawing under the step). The dot at the track's end fades only when the draw has really ended.
  A third, named in 10.7: `--d-cine` (900 ms on `--spring`), the one reveal of the difference's payoff line and of
  the moment's ticket. Nothing else past `--d-3`; no stagger anywhere. (The hero headline's 900 ms three-line rise, once the second
  exception, has been one 480 ms fade since Round 0; `desk.css:33` keeps the lines unmasked.)
- **What the opening's cap governs, and what it can't.** The cap is the opening's own length on the page's clock: a
  Desk whose code is there by ~750 ms glides and lands the hero by 1380 ms (a laptop: the hero is up at ~1.40 s). A
  Desk whose code arrives later never glides: `skipIfLate()` shows the finished hero the moment it mounts, so the
  opening adds nothing to the network. The opening draws the words first: the headline and the bar's contents, the
  egg and the line drawing in behind them (S2, session 3). On the phone drill (1.6 Mbps, 150 ms, CPU 4x) the Desk's
  code lands after `main.js`'s own wave (the shared React chunk and the chunks every route loads, ~110 KB br,
  bandwidth-bound) plus its own files, and the hero is up at ~1.6 s (Round 2: 1.59–1.65 s; it was ~1.8 s before
  W's commit 7 started `Desk-*.js` after `main.css`, the ~300 ms this section named). That number is the network's,
  not the opening's, and no constant in `opening-clock.ts` moves it; what is left to gain is a smaller first wave for
  the Desk route (`main.tsx`'s static imports). The phone's hero time is stated as ~1.6 s, with the DD's OK, and the
  first screen (the case at ~0.5 s) is what the phone budget holds.
- **The landing paints its words first** (Track B, session 8; Round 3's design judge fix 2 and a11y-perf fix 3). The
  bar and the headline are HTML in `index.html` (`web/prerender.ts` puts `web/src/desk/first-paint.tsx`'s SiteNav and
  Landing into `#root`, the ledger's pattern), styled by the Desk's two sheets landing as blocking sheets beside
  `main.css`, in the tuned fallback faces (tokens.css) until the Desk mounts; React draws the same markup over them
  (overlay of the first paint against React's settled hero: **0 px differ** at 1440 and 390, every word box Δ 0.0 px,
  the bar's underline 0.3 px wider). The egg, the line under the headline, the Ask box and the chips come up behind
  the words as before. **When the headline reads** (its 90% point by a per-frame clock, 1.6 Mbps / 150 ms emulation, a
  fresh context per run; `node scripts/first-screen-clock.ts <base>` with `MODE=desknet` for 1440 and `MODE=phone` for
  the phone drill, CPU 4x; measured by Track B session 10, Sat Oct 31 ~02:30 PT):
  | | 1440 | phone drill |
  |---|---|---|
  | **live site** (0a15f70d on Render, live Sat Oct 31 08:58 PT: after B-9 and B-10; 5 runs each; the document answered in 160–265 ms at 1440, 151–180 ms on the phone; measured by Lead-10) | **median 568 ms** (558–610) | **median 598 ms** (580–602) |
  | was live (14ae80a on Render: before B-9 and B-10, brotli; 10 runs; its document answered in 135–199 ms in the 10 runs where that was recorded, one 473) | **median 590 ms** (577–639; 842 in the 473 ms run) | **median 642 ms** (620–680) |
  | the B-10 build on this laptop (`vite preview`, gzip, B-9's fit and B-10's haggle script in its head; answered in 2–25 ms; 5 runs) | 518–527 ms | 565–587 ms |
  | before the words-first change (B-8 packet, local) | 1634 ms | 1718 ms |
  On the live site the bar's words read in the same frame as the headline in every saved run (10). B-8 first stated
  511 / 548 ms: that was its own local build (brotli), never the live figure. The live site reads ~60–72 ms after the
  laptop (72 at 1440, 60 on the phone), less than the ~110–195 ms more its server takes to answer: consistent with the
  gap being the server's response rather than the page's bytes (the two builds and their compression differ, so this
  is not a controlled comparison; re-measure live once B-9 and B-10 are deployed). The case's first frame waits for the Desk's two sheets
  (11 KB) with the headline. The hairline no longer crosses the headline when the opening plays (a clip around each line's glyphs in
  `opening.ts`, 8 frames struck through before, 0 after). The two faces are not preloaded: the words don't wait on
  them, and their 125 KB in the first wave put the phone's mount ~680 ms later (measured), so they are asked for when
  the Desk mounts, as before. The floor at 1440 on this emulation is two round trips (300 ms) plus the ~38 KB the
  first render needs (~190 ms), plus the server's own response; going under it needs a smaller head (the next step
  would inline the few rules the headline needs from the Desk's two sheets, one round trip), not a reorder.
- **The face swap moves nothing on the landing** (Track B, session 9; the DD's B-9, system.md §5 Stand-ins: every line
  end and every bar word within 2 px). The fallbacks' size-adjust can't carry it alone: line by line, Hanken 300 runs
  1.008 to 1.035 times Helvetica Neue Light's width ("Nothing is paid" against "until you tap."), and Archivo 400 runs
  0.98 to 1.02 times Arial's word by word, a 2.6% spread where 2 px on a 618 px line is 0.3%. tokens.css's fallbacks
  stay as B-7 tuned them (Behind the scenes' h1 at 99.9%), and the landing's own runs get a fit while their fallback
  is drawn (`web/first-fit.ts`, written into the first paint by `web/prerender.ts`): each h1 line its letter-spacing (+.0072, +.0040, +.0141 em on the display's
  tracking), the lede .0015 em letter- and .005 em word-spacing (DK check 2, Sat Oct 31: re-fit by `fit-lede-grid.ts` for
  the lede "Goose sets aside scam sellers.", worst 0.05 px at 1440 and 390, 1.25 px unfitted; was .0085 / −.06 for "It
  sets aside scam sellers." and .008 / −.055 before that), the bar its B-8 tracking. Each fit is lifted only
  when its own face has loaded (`data-first-fit` for Archivo, `data-first-fit-display` for Hanken 300), and never on a
  face that fails, whose fallback then stays fitted. Measured on one settled page, real faces against the fallbacks
  with their fits (B-9 packet), worst |Δ| over every h1 line end, lede line end and bar word box:
  | | 1440 before | 1440 after | 390 before | 390 after |
  |---|---|---|---|---|
  | h1 line ends ("for you." / "is paid" / "you tap.") | −9.8 / −4.1 / −13.5 | 0.0 / 0.0 / 0.0 | −5.2 / −2.2 / −7.1 | 0.0 / 0.0 / 0.0 |
  | lede line ends | +1.9 / +1.0 | −0.4 / +0.9 | −1.9 / +3.3 / −0.1 | −0.9 / +0.4 / +0.2 |
  | bar words, faces in on time | ≤ 0.5 | ≤ 0.5 | ≤ 0.8 | ≤ 0.8 |
  | bar words, faces blocked (the fit was lifted) | 6.3 | ≤ 0.5 (the fit stays) | 2.0 | ≤ 0.8 |
  Every frame from the first paint to the faces' arrival (woff2 held 1.5 s): worst 0.9 px against the settled frame at
  both widths. Line starts Δ 0; the h1's lines sit 1 px higher in the fallback at 1440 (0 at 390), inside the 2 px.
  **The fits are pinned to their words** (Track B, session 10; the DD's B-9 ruling 2a): `web/first-fit.ts` keeps the
  three h1 lines and the lede beside the values, and the build throws if the first paint's h1 or lede, or Desk.tsx's
  lede, reads anything else ("the landing's words changed … re-run scripts/fit-shift.ts"), so a copy change can't ship
  a wrong fit. To re-fit: `node scripts/fit-shift.ts <url>` prints each line's end Δ and its suggested em (from no fit
  it derives today's values to 0.0001 em), `scripts/fit-lede-grid.ts` the lede's pair, `scripts/fit-swap-frames.ts` the
  frame walk.
- **The haggle's own files start after main.css** (Track B, session 10; Round 4 a11y-perf fix 5). On `?desk=haggle` an
  inline script after `main.css` starts the haggle's chunk, its static imports and its three stylesheets (the Desk's
  commit-7 pattern), so they no longer wait for main.js to run; the ladder's AG Charts chunk stays lazy. Phone drill,
  median of 5 (`node scripts/phone-heavy.ts <base> 5 "?desk=haggle"`, vite preview with `/api` proxied to a local server): the h1 at **1581 ms** (was 1783).
  Its long tasks are unchanged: the page's own first render (~150 ms, the recorded week replayed in the browser) and
  AG Charts drawing the ladder (~120 + ~180 ms: its create, then its first layout), so TBT stays ~300 ms.
- **Behind the scenes paints a shell first** (Track B, session 6; Round 0 finding 8). The page's bar, h1, thesis, lede
  and status line are HTML in `index.html` (`web/prerender.ts`, the wallet's pattern), styled by the page's own
  stylesheets landing beside `main.css`; the stream's handshake starts from the same inline script; the ledger's
  chunks start after `main.css`; AG Grid is a lazy chunk behind a plain table of the same rows in the grid's geometry
  (`ledger/ShellTable.tsx`), so it lands on the same lines; AG Charts was already lazy. The web faces wait for the
  chunk (`shell.css`), since their 122 KB would otherwise race it on the phone. Measured on the phone drill (p95 of 10
  cold runs, brotli, `037` session 6): the h1 at **0.59 s** (was 3.16), the status line with it, the first row at
  **1.94 s** (was 3.59), LCP (the panel's lede, which waits for the stream) at **1.95 s** (was 3.60), 38 KB landed
  before the h1 (was 431), and the phone never downloads AG Grid. At 1440: the h1 at 51 ms (was 114), the rows at
  136 ms, the grid over them at ~0.7 s, LCP 144 ms.

**What may move**

1. Something that just arrived because of a real event (a ledger row, a card, the guard's verdict): the enter above.
   Within 300 ms of the event (`node scripts/motion.ts` checks the run's rows).
2. A direct answer to her input: hover, press, a menu or sheet opening (`--d-1` to `--d-2`). Closing is a `--d-1` fade.
3. The egg: it leans toward her cursor, its light shifts as she scrolls or tilts her phone, and it pulses once when
   Goose protects her. When she stops, it settles and stops drawing.
4. The hero's two parallax layers (the egg and the copy): the one place anything moves with the scroll.
5. The opening, once per session, and only on the landing (`opening.ts`): skipped by any tap, key or scroll, and never
   played on a link straight into a room (`?desk=1#wants`, `#week`, `#settings`).

**What may not move**

- Anything that loops, however slowly: a breathing mic, a pulsing dot, a ticking busy line, an idle egg turn. A wait
  is a static state change (an icon swap, a dot) and words ("Asking the guard…").
- Anything on its own clock: no auto-advancing carousels, no timed reveals, no counters.
- Any other scroll-linked layer: no drifting grain, no parallax outside the hero's two layers.
- Cascades: no fade-up stagger across a page or a list.
- Layout properties: animate `transform` and `opacity` only (never width, height, top, left, background-position on
  large areas, or the blur).

**Reduced motion.** Nothing moves: no opening, no reveals, no egg (three.js never loads; the still picture is the egg),
state changes are instant, and every reveal is already revealed.

**No GPU: the still is the egg, and nothing downloads.** Where WebGL draws in software (Chrome's SwiftShader, Mesa's
llvmpipe, a virtual machine, a headless browser, Windows' basic renderer), the live egg never starts: `gl.ts`'s
`eggContext()` makes the WebGL2 context on the real canvas and reads the renderer's name (`WEBGL_debug_renderer_info`)
before three.js is even fetched; software → the context is given back, the canvas leaves the page, the still picture
(the same render) is the egg for the visit, and the 116 KB (br) of `eggThree` never download. On a GPU that same
context is the one three.js draws with (`mountEgg(canvas, dpr, gl)`), so nothing is made twice.
Measured (Round 0 finding 5, then here): the setup was one 565–640 ms main-thread task on software GL on an idle M4
(4.8–5.4 s on the judges' loaded run), with menu taps waiting under it; after the gate there is no task from the egg at
all. A browser that hides its renderer (Safari's "Apple GPU") is taken at its word; the slow-frame fallback (90 frames
under 30 fps → the still) still covers a weak GPU. Context creation alone doesn't tell (about 15 ms on either), so there
is no timing probe: the name is the signal.

## 8. Do and don't (the banned list)

| Banned | Don't | Do instead |
|---|---|---|
| Glow blobs, orbs | a colored blurred circle behind a heading or card | the egg's one static light (`--egg-light`), wide and low |
| Particles | dots, sparkles, stars, floating anything | nothing; the velvet's still grain is the texture |
| Confetti | a celebration when a payment lands | the check draws once (`--d-3`), "Paid" in words |
| Bounce | overshoot, elastic, a stamp that slams and wobbles | `--spring`: lands softly, no overshoot |
| Typewriter text | letters appearing one by one, a blinking caret | the whole sentence at once; arrival by opacity |
| Fade-up-stagger on everything | each line, chip and card rising in turn | one reveal per section, lines together |
| Shimmer skeletons | grey bars sweeping while loading | words that say what Goose is doing, or the real content |
| Blue, rainbow | blue links, gradient borders, multicolor charts | cream, gold for the three meanings, `--red` as a small marker |
| Percent counters | 0% → 100%, numbers rolling up | the real number, still; a loading step is shown as light (the opening) |
| Looping motion | spinners, breathing mics, pulsing dots, idle turns | static state plus words; the egg moves only when she does |
| Generic SaaS cards | three icon-plus-heading-plus-text boxes in a row | a hairline grid, or one idea with type doing the work |
| Stock-illustration feel | people at laptops, isometric scenes, 3D blobs | the egg, the real ledger, the real deal card |

The one gold sheen across the headline in the opening (Joshua's opening, step 5) is not a shimmer: it plays once per
session, on the opening's clock, and never on a loading state.

## 9. How to check 60 fps

1. **The gate:** `node scripts/motion.ts --desk [url] [--trace dir]` (server up). At 1440 and at 390 with the CPU slowed 4x,
   in headless Chromium on the real GPU, it fails on any looping motion, any frames drawn while the page is still, more
   than three glass surfaces, any motion (or three.js) under reduced motion, `infinite` anywhere in the Desk's or the
   menu's CSS, a layer that moves with the scroll other than the hero's two (`.dk-hero-egg`, `.dk-hero-copy`; the
   grain never), and any motion over `--d-3` (400 ms, plus 20 ms of rounding) outside the opening (its hero fades
   included, in the first beat after `dk-opened`) and the two named line draws (`ds-track-line clip-path` 700,
   `ds-protect-rule transform` 600, no delay; the gate's `DRAWS` table). It prints frame pacing for the
   opening, a scroll and the menu opening, the long tasks, and every motion it fails. Targets: p95 frame gap
   16.8 ms at 1440; under 20 ms on the 4x phone; no long task over 50 ms while she scrolls or taps (not yet checked by the gate, which prints the
   long tasks' count and the longest; read the trace).
2. **A trace:** add `--trace dir` and open `desk-390.json` in Chrome DevTools' Performance panel. Look for scroll
   handlers that read layout (`getBoundingClientRect`, `offsetTop`) and then write styles in the same frame, and for
   paints of large areas during scroll.
3. **By hand:** DevTools, Performance, CPU 4x slowdown, record a scroll, the menu and a run; Rendering, Frame Rendering
   Stats and Paint Flashing should stay quiet when nothing moves.
4. **The egg is never missing:** `node scripts/motion.ts --egg [url] [--out dir]`. The still picture is the egg until
   the live egg has drawn its first frame, and again for good whenever WebGL is missing, too slow, or its context is
   lost (the canvas leaves the page, so no browser placeholder can show). The check runs Chromium on the GPU, Chromium
   on software GL (where it must report "still picture": the live egg never starts there), Chromium with WebGL off,
   and WebKit when installed, at 1440 and 390; it loses the context on purpose and takes a full-page capture, and
   fails if the egg box shows no gold.
5. **First screen:** `PROFILE=mobile pnpm budget:first-screen` after any change to the first screen. New CSS and JS go in
   lazy chunks.
6. **Rules of thumb:** transform and opacity only; IntersectionObserver instead of scroll listeners; `will-change` only
   while something moves; glass small and at most three; WebGL draws only while something moves.

## 10. Identity pass (Design Director, Sat Oct 31)

Nine specs, each exact enough to build without asking. Prototypes and DPR-1 stills are in the DD's notes
(`dd/brand/`: `lockup.html`, `frost.html`, `cine.html`, `share.html`, `stills/`). Where this section and an older
line above disagree, this section wins and the older line is amended in place.

### 10.1 The lockup: "Gilded G◯ose"

The name in the display face, with the egg standing in for the first o of "Goose". One mark, no separate logo.

- **Face:** Hanken Grotesk (`--display`), weight 400, tracking -.02em (in the bar .05em, Nov 5), line-height 1. Both faces are already loaded,
  so the lockup costs **0 extra bytes**. A new face was weighed and refused: any third face is a 25–40 KB woff2 on the
  first screen for a word the site already sets.
- **Words:** "Gilded" + a .24em space + "G" + the egg + "ose". Sentence case, never all caps, never Archivo.
- **The egg-o:** the vector egg (below), `.5em` wide by `.62em` tall, `margin: 0 .035em 0 .025em`, lifted
  `translateY(.012em)` so its foot sits on the baseline the o would. At bar sizes (≤24 px) it stands a touch larger,
  `.55em × .68em`, `margin: 0 .03em 0 .02em`, so it reads as an o and not a dot.
- **The vector egg** (every lockup size, the favicon, the waking state): one path on one radial gradient. Never the
  photo egg in the lockup; the photo/3D egg is the hero asset only (10.2).
  ```svg
  <radialGradient id="ggG" cx="38%" cy="30%" r="78%">
    <stop offset="0" stop-color="#fff3c4"/><stop offset=".34" stop-color="#f0cb62"/>
    <stop offset=".74" stop-color="#b98a1c"/><stop offset="1" stop-color="#6e4f06"/></radialGradient>
  <symbol id="ggEgg" viewBox="4.4 2.2 15.2 18.8">
    <path d="M12 2.2c-4.2 0-7.6 6.3-7.6 11.2a7.6 7.6 0 0 0 15.2 0C19.6 8.5 16.2 2.2 12 2.2Z" fill="url(#ggG)"/></symbol>
  ```
- **Where the symbol lives:** one inline `<svg width="0" height="0" style="position:absolute" aria-hidden="true">` with
  the gradient and the symbol in each HTML page's body (never `display:none`, which drops the gradient), or the SVG
  inline in the component. `.gg .o svg { display: block; width: 100%; height: 100%; overflow: visible }`.
  Hover and focus: the lockup links home; hover changes nothing, `:focus-visible` takes the site's focus ring.
- **Markup:** `<a class="gg" aria-label="Gilded Goose">Gilded<span class="sp"></span>G<span class="o"
  aria-hidden="true"><svg><use href="#ggEgg"/></svg></span>ose</a>`. The accessible name is the plain name; a screen
  reader never hears "G, image, ose".
- **Tokens (new, `tokens.css`):** `--mark-face: var(--display)`, `--mark-w: 400`, `--mark-track: -.02em`.
- **Sizes:**

  | Where | Size | Weight / tracking |
  |---|---|---|
  | The bar at ≥721 | 22 px | 400 / .05em (Nov 5: a calm, letter-spaced mark; `.gg-bar` sets it) |
  | The bar at ≤720 | 20 px | 400 / .05em |
  | The share image (1200×630) | 40 px | 400 / -.02em |
  | The video's end card (1920×1080) | 96 px | 300 / -.03em |
  | The 404 | none in the body: the bar carries the one lockup | n/a |

  One lockup per screen. Below 18 px use the egg alone (the favicon), never a smaller lockup.
- **Clear space:** `.62em` on every side (the egg-o's height). Nothing (a hairline, "Practice only", an edge) comes
  closer. In the bar that is 12–14 px, which the existing 12 px gap plus the hairline's padding already gives.
- **Colour:** ink (`--ink`) on Velvet and Midnight; on a light ground (print, a slide), velvet `#2c1520` on cream
  `#f4eadc`. The egg is the same gradient on both: it is the one object that never changes. Never gold type, never a
  gradient on the letters, never an outline.
- **Replaces:** the 18×22 photo `.dk-mark` beside "Gilded Goose" in Archivo 560 17 px, in every bar
  (`index.html`, `safe.html`, `404.html`, `SiteNav`).
- **The favicon:** `favicon.svg` becomes the vector egg alone (the path and gradient above, on transparent), and
  `favicon.ico` its 32×32 render. An `apple-touch-icon` 180×180: the egg 120 px tall, centred on `#2c1520`.

### 10.2 The egg: the one hero asset

**The still.** `web/src/desk/egg.webp` (DK part 3: rendered by `node scripts/egg-still.ts --desk` from eggThree's lifted
studio at the live egg's resting pose, glow 0; 600×720, alpha, 15.2 KB; was 12.4 KB unlifted). It is good
enough at 1200×630 at 1x (the share image draws the egg about 370 px tall, downscaled from 620). It is not good enough at 2x or larger: an egg 880–960 px
tall would be upscaled about 1.5x and go soft, and the lower half reads muddy brown, with a reflection like a dark door.
**The fix (free, B-11):** `scripts/egg-still.ts` renders `eggThree` itself with Playwright on the real GPU at
1500×1800 (`draw({ yaw: 0, pitch: 0, spin: <the hero's resting pose>, glow: 1 })`), saving a PNG master in
`web/public/brand/egg-1500.png` and webp derivatives at 600 and 1200 wide. Before the render, lift the front fill so
the body below the equator reads gold (`#b98a1c` or lighter at its darkest), not brown. Same object, same light, one
source: the still and the live egg can never drift apart.

**The loop (3–6 s, for the video and the end card only; never on the site, where nothing loops).** The same script,
`--loop`: 1920×1080 and 1080×1080, 30 fps, 5 s = 150 frames, the egg 640 px tall at the frame's centre, `spin` stepping
`2π / 150` per frame (one full turn of the studio light; `spin` turns the environment, not the egg). The egg is
symmetric about its axis, so frame 150 equals frame 0 and the loop has no seam. Nothing else moves: no yaw, no bob, no
glow pulse, no particles. Encode with Playwright's bundled ffmpeg (H.264, `-crf 18`, `yuv420p`) and a webm twin.

**Where the egg appears:** the landing hero (live, or the still) · the close · the 404 (the still, 160 px tall at
≤720, 240 at ≥721, above "Nothing here.") · the waking state (10.9, the vector egg) · the share image · the end card ·
the favicon and every lockup (vector). **Never:** beside another hero image or illustration; inside a card, a chip, a
button or a list; twice on one screen (the lockup's egg-o is the one allowed second); in any state but the 404 and
waking; as a loader; spinning or bobbing on its own.

### 10.3 Voice: words that earn their place

Few words, big type, one idea a screen. The site says what happened and what you can do, in the shopper's words.
Five pairs, each from a real string on the site today:

| Don't (on the site today) | Do |
|---|---|
| The menu's Talk line: "Where your browser can record, hold the mic and say it. Your words land in the box; your voice is never sent." (22 words) | "Hold the mic and say it. Your voice is never sent." (11). One line, the promise last; shown only where the browser can record (as today). |
| The ledger's empty state: "Nothing here yet: your rows start the moment you ask Goose: …" (two colons, three clauses) | "No rows yet. They start when you ask Goose." Say what is missing, then the one way to fill it. Never "Nothing here yet". |
| The chart caption: "The price scale starts at $40, not $0, so the drops look steeper than they are." | Keep it: it names the trap before the reader falls in. A caption earns its line only when it stops a misreading. |
| The deal card: "Captured means PayPal takes the money; voided means the hold is released and nothing is taken." (on the card's face) | Behind the card's "Why?" tap. The face says only the price, the seller, and what your tap does. |
| The hero's "Tell Goose your name" and "Mute Goose" pills beside the Ask box | One control on the first screen: the Ask box. Settings live in the menu. |

**Rules:** sentence case; no exclamation marks; no "Oops", no "Sorry"; no "simply", "just", "seamless", "powerful";
the cause in one sentence, never a stack of clauses; a number always with its unit; the same thing called the same
name on every screen (system.md §8).

**Word budgets** (visible words on the first screen at that width, the bar, menu and footer not counted). Today's
counts were measured on the local build at bcb37d2f; the budgets are about half. **To reconcile with C** (Track C's
`docs/launch/surface-words.md`, not written yet): where C's words disagree, the lower budget wins until the DD rules.

| Screen | Today 1440 / 390 | Budget 1440 / 390 | Owner |
|---|---|---|---|
| Landing hero (`.dk-hero`) | 70 / 70 | ≤40 / ≤40 | DK |
| The deal card (`.dk-deal2`) | 155 | ≤75 | DK |
| A run's first screen | 277 / 104 | ≤120 / ≤80 | DK |
| The understood card | 100 / 93 | ≤60 | DK |
| Wallet `/` | 263 / 147 | ≤120 / ≤80 | W-8 |
| Classic `/?wallet=0` | 191 / 88 | ≤110 / ≤70 | W-8 |
| `safe.html` | 105 / 82 | ≤60 / ≤50 | W-8 |
| Behind the scenes header: `.lx-hero`, and the Studio's header (any first screen titled Behind the scenes) | 73 | ≤36 | AS-15 |
| Behind the scenes first screen | 214 / 145 | ≤120 / ≤80 | AS-15 |
| A chart caption | one sentence | ≤16 words | AS-15 |
| Proof | 162 / 104 | ≤100 / ≤70 | Proof's owner |
| The haggle | 244 / 108 | ≤120 / ≤80 | its owner |
| The cart step by step (`?market`) | 54 | ≤60 | its owner |
| A tour stop | 102 / 66 | ≤40 a stop | S1-13 |
| The menu sheet | 233 | ≤120 at ≥721 (one line of ≤8 words an item); ≤60 at ≤720 (names only) | S1-13 |
| Landing sections: moment / ways / steps / protects / can / band / close | 127 / 71 / 172 / 31 / 252 / 110 / 95 | ≤90 / ≤60 / ≤120 / 31 / ≤150 / ≤80 / ≤60 | S2-cine, DK |
| A state (10.9) | n/a | ≤24 | R |
| The 404 | 5 | ≤8 | R |

**How a first screen is counted** (gate ruling, Sat Oct 31 05:49): a route's first-screen budget counts its first
section only, the block above its first section hairline, whatever the viewport shows below it. Each section under a
hairline counts against its own budget, never the route's again; so a section the fold cuts through is counted once,
as itself. Applied so far to the wallet and to Proof (`.pf-top`, 67 / 67 under 98 / 69).

### 10.4 One phone nav: the top bar, everywhere

**One sticky bar at every width; no bottom rail.** The bar is `position: sticky; top: 0` on every page and width,
`--nav-h` tall (64 px at ≥721, 56 px at ≤720). Z-order, bottom to top: the content · the bar · the menu (at ≥721 a
panel hung from the bar; at ≤720 a full-screen sheet starting under the bar, so the bar and its "Close" stay on top
of it) · every other sheet and dialog, which cover the bar. This amends
system.md §4's "the phone bar scrolls with the page" and its bottom rail.

- **≥721:** unchanged except the lockup: lockup 22 px · hairline · "Practice only" · "Everything Goose does ▾" ·
  the views (Shopper · Behind the scenes) · "Judge? Start here ›".
- **≤720:** lockup 20 px · a 1 px `--line` hairline 20 px tall with 12 px either side · "Practice only" (`--t-micro`,
  `--ink-3`) · flexible space · **"Menu"** (`--t-small` 15 px, `--w-strong` 560, `--ink`, a 44×44 px target, its text
  16 px from the bar's right edge). The button's visible text is "Menu"; it opens the dialog named "Everything Goose
  does" (`aria-haspopup="dialog"`, `aria-expanded`). While the sheet is open the same button, in the same place, reads
  "Close".
- **The bottom rail goes** (`.gn-rail` and its 24 px `::before` fade, at every width, on every page), and with it the
  body's `padding-bottom` for the rail and the `PHONE_RAIL` list. Its fade is what let "$84.00" show through at the
  bottom of a phone.
- **The menu sheet at ≤720** (full screen under the bar, the opaque page with the egg's light, as today): first a
  row of the three views (Shopper · Behind the scenes · Judge tour), 48 px tall, the current one with a 1 px ink
  underline (never a filled pill); then the four groups, each a `--t-micro` `--ink-3` heading and its items as **names
  only**, 17 px, 48 px rows padded `--s-4` (32 px) on the left (the lines return at ≥721). The room you are in carries
  a 6 px `--ink` dot, its centre 16 px left of the name, and `aria-current="page"`, on its group item; the views row
  marks its current view with the underline alone.
- **Every feature in ≤2 taps:** Menu → any item, or Menu → any view. The Desk app's old rail (Ask · Wants · Limits) is
  Menu → "Ask Goose" / "Your wants" / "Limits in code".
- **The tour strip** moves from the rail to the bottom edge: `position: fixed; bottom: 0`, padding-bottom
  `max(12px, env(safe-area-inset-bottom))`, and still hides under open sheets (S1-12). S1-13 re-bases the strip's place
  and the ≤742 probe line in the same slice and re-proves S1-12's three items.
- `scroll-padding-top: calc(var(--nav-h) + 8px)` on `html`, so an anchor never lands under the sticky bar.

### 10.5 No left sidebar; the menu's one order

The run page's left rail (`.dk-rail` at ≥721) goes; its anchors are all in the menu, and the run takes the full
`--w-page` (1200 px) column. `web/src/menu/in-view.ts`'s `.dk-rail` selector goes in the same commit. There is no
other sidebar anywhere. The menu's items, in this order (amended Nov 4, DD seat 3: Joshua's three promises set the order
now, so every feature sits under the promise it proves, and "How it works" is no longer first in anything):

1. **Goose can't be fooled into paying.** Try to trick Goose · The Watcher · Approve in PayPal
2. **Goose can't overspend.** Ask Goose · Talk to Goose · Limits in code · The haggle · The cart, step by step · Pay Later ·
   Your wants · Your week
3. **Goose can't hide anything.** Behind the scenes · Proof · How it works · After you pay · Judge tour

### 10.6 The frosted bar

Joshua saw "A ticket to The Marsh Lights, Saturday" through the scrolled bar. Measured at DPR 1 (`dd/brand/frost.html`,
the bar's band with its own words hidden; luminance range over the band, 0–255): today's recipe with its blur applied
reads 5–18, nothing legible. **With the blur missing it reads 57–90 and the line is plainly legible:** that is the
picture he saw, which is consistent with the blur not being applied on his device (his browser is unknown). Two causes, both fixed here: a `var()` inside
`-webkit-backdrop-filter`, which some Safari builds drop (suspected; no WebKit here to prove it), and the phone bar,
which had no frost at all and scrolled away while the rail's fade showed text through.

**The recipe (the bar only, every width, every route, once scrolled past 8 px):**

```css
.gn[data-scrolled] {
  background: var(--glass-bar-bg);
  -webkit-backdrop-filter: blur(40px) saturate(140%);  /* literal on purpose: never var() here */
  backdrop-filter: blur(40px) saturate(140%);
  box-shadow: var(--glass-edge), 0 1px 0 var(--glass-line);
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .gn[data-scrolled] { background: var(--page-solid); }
}
@media (prefers-reduced-transparency: reduce) { .gn[data-scrolled] { background: var(--page-solid); } }
```

- **New tokens:** `--glass-bar-bg` Velvet `rgba(44, 21, 32, .93)`, Midnight `rgba(21, 16, 19, .93)`: the page's own
  colour, so the bar never changes hue between rest and scrolled. `--glass-bar-blur: blur(40px) saturate(140%)`
  records the value; the two backdrop lines write it literally, and the probe asserts they match the token.
- **At rest** (scroll ≤ 8 px): `--page-solid`, no blur, no edge shadow; it does not count as glass.
- **Measured** (Chromium, DPR 1, the moment section only, one scroll position each): this recipe reads 0.8–2.8 over
  the kicker, the item line and the 104 px price; the fallback 0.
- **The tint is not the guarantee:** .92 with no blur still leaves a faint ghost of the item line (17). The blur being
  applied is. Hence the literal values, the `@supports` fallback to opaque, and the probe.
- **The proof S1-13 ships:** a probe over the exact strings ("A ticket to The Marsh Lights, Saturday" and "A replay of
  a recorded practice week. The sellers and days are simulated.") under the scrolled bar at 390 and 1440, DPR 1, the
  bar's words hidden: band range ≤4 in Chromium, a WebKit run when WebKit is installed, and a forced no-blur run that
  must show the opaque fallback. It also asserts the scrolled bar's computed `backdrop-filter` is not `none`, reads the
  strings from their sources (`core/src/sellers/moving.ts`, `Moment.tsx`) rather than retyping them, and adds the
  scrolled bar to `scripts/motion.ts`'s frame-time pass (p95 under 20 ms on the 4x phone): a 40 px blur costs GPU.
- **This amends §6:** two blur values on the site, 24 px for glass objects and 40 px for the bar alone. The bar is
  chrome, not an object: it does not count toward the three glass objects, and content (glass included) sliding under
  it as you scroll is not "glass on glass", which is about objects resting on each other. `scripts/motion.ts`'s glass
  count leaves out `.gn` (S1-13).

### 10.7 Cinematic: two story sections

No new words; nothing banned; one reveal each. Both sections already exist in `web/src/desk/story/`.

**1. The difference (`ds-protects`, `Steps.tsx` `Protects`).** The payoff becomes the biggest type on the site after
the hero.
- Setup line, "Payment networks protect the payment.": `300 clamp(28px, 3.4vw, 48px)/1.12 var(--display)`, -.016em,
  `--ink-2`, `text-wrap: balance`.
- Payoff, "Goose protects the conversation.": `300 clamp(44px, 7.4vw, 108px)/1 var(--display)`, -.03em, `--ink`,
  `max-width: 11em`, balanced (two lines, "Goose protects / the conversation.", measured in Chromium at 1440 and at 390,
  where 44 px fits the 358 px column: `cine-diff-*.png`), `--s-3` (24 px) below the setup at ≥721, `--s-2` (16 px) at
  ≤720. This flips today's inks (the payoff was `--ink-2`): the line that matters is the bright one.
- The sub sits right at ≥721 (as today), `--s-6` (48 px) below; in flow at ≤720, `--s-4` (32 px) below.

**2. The moment (`ds-moment`, `Moment.tsx`).** The ticket a size up, so the price is the picture.
- Columns `1fr / 1fr`, gap `--s-8` (one column at ≤720, gap `--s-6`); h2 `clamp(34px, 3.4vw, 48px)`.
- The ticket: padding `--s-6` (24 px at ≤720), radius 14 px, shadow `0 48px 96px -32px rgba(10,3,7,.75), 0 12px 24px
  -12px rgba(10,3,7,.4)`; item 28 px (24); price `300 104px/.95`, -.035em (72 px at ≤720); the plot 136 px tall
  (104); the approve pill 56 px tall.

**The reveal (both):** the payoff line, and the ticket, each once: opacity 0 → 1 with `translateY(32px)` → 0,
**`--d-cine` 900 ms on `--spring`**, when the block's top crosses 70% of the viewport's height (one
IntersectionObserver, `rootMargin: 0px 0px -30% 0px`). It is laid out and readable before: the hidden state applies
only under `.ds-live` (the script ran) and only to a block below the fold at load; a block in view at load, print,
reduced motion and no script all show the final state at once. The moment's track draw (700 ms) starts on the
ticket's `transitionend`, not on a timer, then the dot. **This amends §5's "content is there without the scroll" for
these two blocks only**, with three fail-safes: "in view at load" means intersecting the viewport at all (no margin),
so a block between 70% and 100% of the screen shows at once; `beforeprint` reveals both; and a full-page capture
scrolls the page first (as the gate accepted for today's ticket, gate log, B slice 1), or runs with reduced motion. The 32 px rise is also an amendment (§7's Enter rises 8 px).
**New named exception:** `--d-cine: 900ms`, for these two
elements only (`scripts/motion.ts`'s `DRAWS`: the payoff's and the ticket's `opacity` and `transform`, 900, no delay).
§7's "nothing past `--d-3`" stands for everything else.

### 10.8 The share image and page titles

**The share image** (`web/public/og/share.png`, 1200×630, under 300 KB): Velvet `#2c1520` with the egg's light
centred on the egg; the lockup 40 px at 72 px from the left and 64 from the top; "Goose protects the conversation." in
`300 80px/1 var(--display)`, -.03em, `--ink`, 600 px wide (two lines), its top at 214 px; "Practice only: no real
money." 22 px `--ink-2` at 72 px from the left and 64 px from the bottom; the egg still's canvas 360 px wide (about 430
tall; the egg in it about 370), its left edge at 700 px
and its top at 52 px; under it a floor shadow, an ellipse 180×18 px at (790, 560), `rgba(10,3,7,.6)` blurred 10 px;
the egg's light a radial gradient 520×440 px centred at (880, 300), gold `rgba(227,186,106,.16)` falling to 0. Everything inside a 64 px safe margin. Render it from the DD's
`dd/brand/share.html` with Playwright at DPR 1 (B-11 keeps the script, so it re-renders when the egg still improves).
Headline: Track C's press release had no headline yet, so this is the default; C's headline replaces it if C rules.

**Head meta (`index.html`; `safe.html` and `404.html` keep their own titles):**
`<meta name="description">` and `og:description`: "Goose checks every seller's note before anything reaches your
tap. Practice only: no real money." · `og:title` "Gilded Goose" · `og:image` `https://gilded-goose.onrender.com/og/share.png` with
`og:image:width` 1200, `og:image:height` 630, `og:image:alt` "A gold egg beside the words: Goose protects the
conversation." · `og:type` website · `twitter:card` summary_large_image · `theme-color` `#2c1520`. Link scrapers do not
run scripts, so every `?route` shares this one card.

**Titles:** `<Page> · Gilded Goose`, set by each room on mount from one helper (`pageTitle(name)` in `web/src/brand`).
The page name is the menu item's name for that room, so the tab, the menu's dot and the title agree: Behind the scenes
· Proof · Judge tour · The haggle · The cart step by step · How it works · Approve in PayPal. The landing and `/` are
"Gilded Goose" alone; `safe.html` keeps "See how it keeps you safe"; the 404 keeps "Nothing here".

### 10.9 The states kit

One block for every state, so a failure looks like Goose and not like a browser.

- **Layout:** in the content column where the missing content would go, left-aligned, `max-width: 32em`, padding
  `--s-12` top and bottom at ≥721 (`--s-8` at ≤720). No card, no box, no glass.
- **Three parts, in this order:** (1) what happened, one sentence of 8 words or fewer, `--t-h3` 24 px `--display` 400
  `--ink`; (2) the cause, one sentence, `--t-body` 17 px `--ink-2`, `--s-1` below; (3) one action, an outline pill
  (1 px `--line-2`, `--r-pill`, 44 px tall, verb first), `--s-3` below, or no action. 24 words at most in all. The
  headline is `--t-h3` as the tokens set it (24 px, 20 px at ≤720). A disabled action stays focusable with
  `aria-disabled="true"`, `--ink-3` text on a `--line` border, and the cause line as its `aria-describedby`.
- **Never:** icons, illustrations, spinners, skeletons, shimmer, progress bars, percentages, countdowns, "Oops",
  "Sorry", exclamation marks, an error code in the headline, or "Nothing here yet".
- **Motion:** the block enters with the one Enter (`--d-3`), and only after 400 ms of waiting (a fast answer never
  flashes a state; this delay is the one timer §7's "nothing on its own clock" allows, and it moves nothing); it leaves by opacity (`--d-1`) as the content takes its place.

| State | What happened | Cause | Action |
|---|---|---|---|
| Loading | What Goose is really doing: "Goose is checking the sellers." only while sellers load; else "Goose is loading this." | none | none |
| Empty | "No rows yet." | "They start when you ask Goose." | "Ask Goose ›" |
| Error | "Goose couldn't load this." | The real cause: "Goose's server didn't answer." only for a network failure or timeout | "Try again" |
| Offline | "You're offline." | "What's on screen stays. Goose checks sellers again once you're back." | none; it retries on `online` |
| Rate-limited | "Goose needs a minute." | "Too many asks in a short time." | "Try again" (enabled once the server's `Retry-After` has passed; no countdown shown) |
| 404 | "Nothing here." | none | "Back to Goose ›" |
| Waking up | "Goose's server is waking up." | "It sleeps when no one visits. The page fills in by itself." | none |

**Waking up** carries the vector egg (48 px tall) above the words at 40% opacity; when the server answers, it lights
to 100% in one `--d-3` transition as the content arrives. It never pulses or loops while waiting. The 404 carries the
egg still (10.2). No other state carries the egg.
