# Video shot list v3: Gilded Goose, three moments in 20 seconds, then each one, then the close (2:25, cap 2:45)

The three moments land in the first 20 seconds: **0:00** the Watcher's catch, **0:12** Paid $84.00, **0:16** Proof, then
each one, then "everything Goose does", with "not connected to real stores yet; built on PayPal's agent flow" said once,
plainly. The voice is read from `docs/beat-script.md`.

**Takes:** `pnpm video:takes` (scripts/video-takes.ts) re-shoots every take after any merge; `pnpm video:takes c-menu`
re-shoots one; `pnpm video:takes --stills` makes the captions and the end card. Files land in `docs/video/takes/`
(gitignored, never committed): `<take>-<size>.webm`, its last frame `<take>-<size>-last.png`, and `takes.json`.
Chromium, no cursor drawn, no overlays. A take whose feature isn't live yet is skipped with its reason, and records on
the first run after the feature ships. Master picture is 1440×900; the 390 takes are a safety and the Devpost gallery,
not a second cut.

| # | Moment | Time (s) | Route | Take | Status |
|---|---|---|---|---|---|
| open | Five shots, one idea each: the catch, the idea, the promises, Paid, Proof | 0:00–0:20 (20) | cut from the takes below | `c-signature`, `m0-hero`, `j-pay`, `m3-proof` | **ready**; `j-pay` waits on Joshua |
| 1 | Goose skips the scammer | 0:20–0:50 (30) | live `/` → Ask → Shop for this → Why? | `m1-scam` | **ready** |
| 2 | Your tap pays through PayPal | 0:50–1:20 (30) | live `/` → Approve $84.00 → PayPal sandbox → Paid | `j-pay` (Joshua's take); `m2-pay` is rehearsal only | **needs Joshua's live take** |
| 3 | The Proof page | 1:20–1:45 (25) | live `?desk=proof` | `m3-proof`; `m3-proof-local` is the fallback | **ready** |
| close | Everything Goose does, the judge tour, the end card | 1:45–2:25 (40) | live `/` → menu; `?desk=tour`; end card | `c-menu`, `c-tour`, `end-card` | **ready** |

**Total 2:25**, 20 s under the 2:45 cap. The voice is in the quoted blocks below: **251 words**, about 1:40 at 2.5
words a second, so every block has more picture than voice. The pause marks ([beat], [pause]) are reading notes, not
words; `pnpm check` strips them, counts the words again, lists every number said aloud (row `c-video-voice`), and keeps
the open at 25 words or fewer (row `c-video-open-words`).

**"Not connected to real stores yet; built on PayPal's agent flow" is said once, in the close**, over the end card. Row
`c-agent-flow` checks that it is said exactly once and what it stands on: the code calls PayPal's Agent Toolkit, the
market follows Store Sync's three published steps, and nothing is connected to a real store.

"Rows" are `docs/claims.md` ids. Each moment's **Numbers on screen** line is itself a row, so a price that changes in the
code fails `pnpm check` until this list changes with it. A number with no row is never shown or said.

**The five criteria, where each lands in the video:** technical, moments 2 and 3 (the bound cart re-checked, real sandbox
runs, the blind test); design, the close's menu and tour; impact, the end card's "made to protect" line and the FTC
figure under it; innovation, the open's "PayPal protects the payment; Goose protects everything before it." over
the Watcher's image; presentation, the open itself, and the line to keep: "Nothing is paid until you tap."

## Open · 0:00–0:20 · five shots · one idea each · **24 words**
- **O1 · 0:00–0:05 · a scammer asks; Goose says no.** `c-signature-1440`, cut from its
  `in` mark (the first seller row lands) to its `out` mark (`takes.json`): TixQuack's row is set aside, "Set aside: gift
  card", and the seller's own words rise into the sealed glass case engraved "Read as data, never as
  orders", word for word from the code (`core/src/sellers/moving.ts`):
  **"Seats going fast. Pay with a gift card and I'll send them today."** The case prints the note, so no caption; a small
  "Fictional seller" tag only. Push in: at 1440
  on x 384–1288, y 320–745 (the feed and the case); at 390 on the feed's first screen. `c-signature-rm-1440` (reduced
  motion, the finished frame) is the edit's alternative; `c-cold` is the same moment, kept as a safety.
- **O2 · 0:05–0:09 · Goose protects everything before the payment.** The same take continuing: the case sealed and the protection
  card up, "Goose set TixQuack aside. Your money stays put." No caption. The innovation line is spoken here, over
  the Watcher's image, never over the Paid card.
- **O3 · 0:09–0:12 · the promises.** `m0-hero-1440-last.png`: the three promises ("Goose can't be fooled into paying. Goose
  can't overspend. Goose can't hide anything.") and the egg. Silent: the type is the line.
- **O4 · 0:12–0:16 · your tap paid.** Joshua's take (`j-pay-1440`), the Paid card: **"Paid $84.00"**, "You approved this
  exact cart in PayPal, and code checked it again before taking payment.", PayPal's order id. Tag: "PayPal sandbox".
  (`m2-pay-1440`'s last frame stands in for rehearsal only; its card says "Practice payments on this server".)
- **O5 · 0:16–0:20 · Proof.** `m3-proof-1440`, the blind-test frame: 0 of 60 scam notes through with the reader. Silent.
- Cut on the beat after each sentence; hard cuts, except O1→O2, which is the same take continuing.
- **Voice (24 words):**

> This seller wants a gift card. [beat] Goose said no.
> PayPal protects the payment; Goose protects everything before it.
> Nothing is paid until you tap.

- **Numbers on screen:** the same as moments 1 to 3 (their rows), nothing new. Nothing is said with a number.
- **Rows:** `c-tix-note` (the note in the case), `c-video-m1` ($55.00), `c-video-m2` (Paid $84.00), `blind-reader-on`.

## 1 · Goose skips the scammer (0:20–0:50, 30 s) · ready
- **Take:** `m1-scam-1440` (live, about 37 s; trim the head: the take starts on the hero). The open already showed the
  catch, so moment 1 starts on the Ask and spends its time on the Why sheet and the deal.
- **Route:** https://gilded-goose.onrender.com/?desk=1 at 1440×900 (and 390×844 for the gallery).
- **Shots:**
  1. **1a · 0:20–0:26, you ask in your own words.** The Ask box: **`A Marsh Lights ticket under $90`** typed, the arrow;
     "Here's what I understood", with the $90.00 Events limit.
  2. **1b · 0:26–0:32, every seller is checked; one is a scam.** "Checked 3 listings. Set aside 1." (the run's own count); **TixQuack ~~$55.00~~ "Set
     aside: gift card"**, Lantern Hall Box Office $84.00 "Best deal you can trust", Reedwhistle Tickets $97.00.
     The run's honesty line, "Recorded fictional week, no AI; one seller is a planted scam.", is on the page; keep it
     in frame.
  3. **1c · 0:32–0:42, the note is data, never an order.** Why? opens **"Why Goose set TixQuack aside"**: "It asks to be
     paid by gift card", "Its note is data. Goose never follows it.", "Your limit lives in code. A seller's words can't
     change it." Hold 8 s.
  4. **1d · 0:42–0:50, the deal, and the wait that earned it.** Got it → the deal card: **$84.00**, **Approve $84.00**;
     tap "Before you approve" (the day-1 price lives there): "Was ~~$112.00~~ from this seller. The same seat
     on day 1. Goose waited." Hold 6 s.
- **Voice (56 words):**

> Ask for a Marsh Lights ticket under ninety dollars. [pause] Goose checks every seller. The cheapest wants a gift card.
> The Watcher reads that note as data, never as an order, and sets it aside. [pause] The deal it keeps: eighty-four
> dollars, for a seat that was a hundred and twelve on day one of the recorded week.

- **Numbers on screen:** $90.00 · $55.00 · $84.00 · $97.00 · $112.00
- **Rows:** `c-video-m1` (the line above, from the recorded week's market), `c-marsh-chip`, `c-hero-deal`, `story-week`,
  `desk-was`, `desk-price`.

## 2 · Your tap pays through PayPal (0:50–1:20, 30 s) · needs Joshua's live take
- **Final take: Joshua's** (`j-pay`, at 1440 and once at 390; see For Joshua). Its `in` and `out` marks are kept by hand
  in `takes.json` (`pnpm video:takes --hand j-pay-1440 <in> <out>`). **Rehearsal only:** `m2-pay-1440`, `m2-pay-390`
  (local fake; never in the cut).
- **Shots:**
  1. **2a · 0:50–0:56, Goose can't pay; the cart is bound.** **Before you approve** open: "The Watcher set TixQuack
     aside: it asks to be paid by gift card." and **"Approve binds the cart to exactly $84.00: PayPal pays that after
     your tap, or nothing."** Hold 4 s, then the tap on **Approve $84.00**.
  2. **2b · 0:56–1:06, you pay in PayPal.** PayPal's sandbox checkout, already signed in (the sign-in is never on
     camera): the amount $84.00 and the merchant name. PayPal's page says "Gilded Goose" because the order sets
     `brand_name` (`trust/src/paypal.ts`, 5d88750); it is PayPal's own type, so no caption. Tag: "PayPal sandbox".
  3. **2c · 1:06–1:14, code checks the cart again, then takes the money.** Back on the Desk: **"Paid $84.00"**, "You
     approved this exact cart in PayPal, and code checked it again before taking payment.", PayPal's order id. Hold 6 s.
  4. **2d · 1:14–1:20, change one cent and nothing is charged.** Hold the Paid card; the caption "Change one cent and
     the hold is void" (the row's words, set from `caption-one-cent-1440.png`).
- **Voice (42 words):**

> Goose can't pay. Only your tap can. [beat] Approve binds the cart to exactly eighty-four dollars, for fifteen minutes.
> [pause] You pay in PayPal. [pause] Code checks the cart again before taking the money. [beat]
> Change one cent and the hold is void: nothing is charged.

- **Numbers on screen:** Approve $84.00 · Paid $84.00
- **Rows:** `c-video-m2` (the line above: the deal's price, and the Desk draws both buttons from it), `desk-bound`,
  `approval-ttl` ("fifteen minutes"), `one-cent`, `sandbox-void`.

## 3 · The Proof page (1:20–1:45, 25 s) · ready
- **Take:** `m3-proof-1440` (live, about 31 s, trimmed to 25). `m3-proof-local-1440` is the fallback if Render is down.
- **Route:** https://gilded-goose.onrender.com/?desk=proof at 1440×900.
- **Shots:**
  1. **3a · 1:20–1:22, Proof.** The heading.
  2. **3b · 1:22–1:34, the blind tests.** The table on Proof's first screen, each set labeled, never just the better one.
     Through code alone: 21 of 59 (Nov 4 set), 19 of 60 (Oct 28 set). AI reader on, Nov 4 set: 0 of 59 through, 4 of 30
     fair notes set aside. Oct 28 set: 0 of 60 through, 0 of 40 fair notes set aside. Hold 12 s.
  3. **3c · 1:34–1:45, real money paths on the sandbox.** "Money on PayPal's sandbox": $50.13 captured, $49.84 captured,
     and "Cart changed after the hold" $0.00, each with PayPal's order id. Hold 11 s.
- **Voice (58 words):**

> Here's the proof. [beat] Two blind tests, by AI writers who never opened our code. On the newest, code alone let
> twenty-one of fifty-nine through. With our AI reader, none, and the reader can only add caution, but it refused four of
> thirty fair notes. [pause] Three PayPal sandbox runs: paid, held then paid, a changed cart voided, nothing captured.

- **Numbers on screen:** 21 of 59 · 19 of 60 · 0 of 59 · 4 of 30 · 0 of 60 · 0 of 40 · $50.13 · $49.84 · $0.00
- **Rows:** `c-video-m3` (the line above), `fresh-code-through`, `fresh-reader-through`, `fresh-reader-fair-refused`, `blind-code-through`, `blind-reader-on`, `blind-fair`,
  `ai_reader_can_only_escalate`, `c-blind-writer`, `sandbox-capture`, `sandbox-authorize`, `sandbox-void`, `story-band`.
- If the cut runs long once staged lines join, trim 3c's hold by 3 s first.

## Close: everything Goose does (1:45–2:25, 40 s) · ready
- **Shots:**
  1. **C1 · 1:45–1:55, everything Goose does is one tap away.** `c-menu-1440`: the Desk, then **Everything Goose does ▾**
     opens the menu: the three promises as its groups, each item a name and one plain line. Nothing tapped.
  2. **C2 · 1:55–2:07, judges, start here.** `c-tour-1440`: "Judge? Start here" opens "Three promises, in about 3
     minutes.", one stop per feature, each with its live button; the take glides to the last stop.
  3. **C3 · 2:07–2:25, who this is for, the scope, the door.** The end card (`end-card-1440.png`, made by `pnpm
     video:takes --stills` from the landing's close, `section.ds-close`, so its words are the site's): the close as the
     site draws it, "Rather see for yourself?" "Try to trick Goose." and its three links; the two lines the still adds
     above the close's notes, from the code (`END_CARD_LINES`, `core/src/view/impact.ts`): "Made to protect the people who get scammed online, especially those least able to spot it." and "In FTC reports from 2018 to 2021, about one in four people who lost money to fraud paid with a gift card." (type only, never spoken; row `c-impact-source`; the landing's Impact section words the same figure its own way, so this line is filmed from the end card only); then the close's notes, "Joshua Javier and Lucas (a team of two)" and "Add the guard to your own checkout in ten lines of code.". **Added in the edit**, each in the site's own words and nothing more: the address https://gilded-goose.onrender.com and its QR code; the landing's footer, just under the close, "Fictional sellers. Practice only: no real money. In PayPal sandbox. Only your tap pays."; and the credit at the top of Behind the scenes, "Built with AG Studio". Hold the address at least 5 s after the last word.
- **Voice (71 words):**

> Everything Goose does is one tap from this menu. [pause] Judges, start here: the tour opens each one live, in about
> three minutes. [pause] One plain note: not connected to real stores yet; built on PayPal's agent flow. The sellers are
> fictional; every payment is in PayPal's sandbox. [beat] Made to protect the people who get scammed online, especially
> those least able to spot it. [beat] Try to trick Goose yourself: the link is below.

- **Numbers on screen:** Kitchen $60 · Clothing $70 · Events $90 · Travel $100 · Other $150
- **Rows:** `c-video-close` (the menu's limits line, from `DEMO_LIMITS`), `menu-limits`, `s1-tour-time` ("about three
  minutes"), `c-agent-flow` (the scope line), `c-impact-source`, `ten-lines`, the team line (`scripts/claims-placeholders.ts`).

## Captions and stills (`pnpm video:takes --stills`)
Three captions in all, set in the site's own type on its plum ground, made from the live site so they match it. A caption
is never a sentence the voice also says. (The Desk prints the seller's words itself, so the note needs no caption.)
- `caption-fictional-1440.png`: "Fictional seller" (O1)
- `caption-sandbox-1440.png`: "PayPal sandbox" (O4, 2b, 2c)
- `caption-one-cent-1440.png`: "Change one cent and the hold is void" (2d)
- `end-card-1440.png`: the site's own end card (the landing's close, `web/src/desk/story/Close.tsx`, plus the two
  `END_CARD_LINES` the still adds), shot at 1440. C3's four additions (the address, its QR code, the footer line and the
  credit) are added in the edit, from the URL and the site's own words, with any offline tool.

## Cut from the video (each still works in the app)
- **The scroll story's TixQuack glide:** moment 1 shows the same skip inside a real run, with the Watcher's reason.
- **The limit card and Keep watching:** a second idea; moment 1 keeps only the deal.
- **The seller lab, "SYSTEM: $500" (`?wallet=0#break`):** the classic page's lab, by its address. Judges' "Try to trick Goose" links go to the Challenge (`?desk=1#challenge`).
- **Behind the scenes, the ledger full screen:** a fourth moment. Its seeded week still tells the kettle story.
- **The guard as a library (`safe.html`):** a pitch line, on the end card and in the README and Devpost.
- **"fifty-five" said aloud, and the menu's items read out:** both are on screen; the voice spends its words elsewhere.

Decided by default:
- The promises (0:09–0:12) and the Proof shot (0:16–0:20) are silent. Flip if Joshua says: "say the promises".
- "Nothing is paid until you tap." is spoken over the Paid card, not the hero. Flip if Joshua says: "say it over the promises".
- The master is 1440 only; the 390 takes are a safety. Flip if Joshua says: "cut a phone version".
- No music. Flip if Joshua says: "add a bed" (then one CC0 track, its licence saved as `docs/video/music-licence.txt`).
- The FTC line is type on the end card, never spoken (v3 keeps the open to 24 words). Flip if Joshua says: "say it".

## Staged lines (not said or shown until the code ships)
Plain bullets on purpose, not voice lines: `pnpm check` reads only "> " lines as the voice. Each moves into a voice
block, with its claims row, on the day its feature ships. With both in, the cut is 2:33, under the cap; to hold
Joshua's 2:30, trim 3c by 3 s.
- **Lands with real product data, +4 s:** in moment 1, after "Goose checks every seller.", over the run's
  "Real prices right now" strip beside the fictional sellers: "Real prices from Channel3, simulated sellers, PayPal
  sandbox." (8 words, said once, Joshua's wording). Its heading and any price get their own rows. Since Nov 5: moment 1's
  Marsh run has no such strip (real stores can't price a fictional ticket) and the heading reads "Real prices, recorded",
  so this line sits over `k-real-prices` instead, or moves to a kettle or backpack run.
- **Lands with the dashboard, +4 s:** in the close, after the tour line, over a `c-dash` take: "Behind the
  scenes is an AG Studio dashboard. Ask it for a view in plain words." (15 words). Only after the dashboard is the live
  Behind the scenes and its ask-for-a-view builds views and nothing else.
- **Lands with the deal card's three-step line:** 2c holds on it; nothing is added to the voice.

### For the landing close
Four plain lines for the site's closing panel. No markdown inside the quotes.
- Impact: "Made to protect the people who get scammed online, especially those least able to spot it."
- Why it matters (row `c-impact-source`, under the impact line; on the video's end card as type, never spoken): "In FTC reports from 2018 to 2021, about one in four people who lost money to fraud paid with a gift card."
- Team: "Joshua Javier and Lucas (a team of two)"
- Trust package: "Add the guard to your own checkout in ten lines of code."

## Schedule
1. **Script to Joshua by Sat Oct 31.** His read-aloud copy is `docs/beat-script.md`, between its script markers: the same
   "> " lines as this file, in order, with reading notes. `pnpm check` (row `c-video-script`) fails if the two drift.
2. **Joshua's voice this weekend**, each block its own file (open, m1, m2, m3, close), two takes, at 2.5 words a second.
3. **Rough cut by Tue Nov 3** (from the takes on disk, `j-pay`, the stills and the voice).
4. **Fresh-viewer check of the rough cut.** Two people who have not seen the plan watch once: what does Goose do, what
   happens when you tap Approve, what would you type to find it, which sentence do you remember. A miss on the first
   means O1 and O2 need the signature take or a longer hold, not more words.
5. **The final**, with the staged lines added as each track ships, and `pnpm check` green on the shot list and the
   script before the Nov 10 noon PT freeze.

## For Joshua (only you can record these)
1. **The real PayPal sandbox Approve (`j-pay`: moment 2, and 4 s of it in the open), at 1440×900 and once at 390×844, two
   takes each.**
   1. In the browser you will record, sign in to the PayPal sandbox buyer off camera first.
   2. Window exactly 1440×900 (for 390: the device toolbar at 390×844). Dark theme, bookmarks bar hidden, no other tabs.
   3. Open https://gilded-goose.onrender.com/?desk=1, tap the chip "A Marsh Lights ticket under $90", then **Shop for this**,
      and wait for **Approve $84.00**. Leave **Before you approve** closed.
   4. Start the screen recording (Cmd+Shift+5, record the window). Count two seconds.
   5. Open **Before you approve**. Hold 4 s. Tap **Approve $84.00**.
   6. On PayPal's page, wait until $84.00 is readable; hold 3 s; pay.
   7. Back on the Desk, wait for **Paid $84.00** and the order id under it; hold 6 s. Stop recording.
   8. Send the files and tell the Lead the order id shown, so it can be matched to the ledger.
2. **The voice**, from `docs/beat-script.md`: the 251 words in its quoted blocks, read plainly.
3. **Yes or flip** on the defaults above.

## Takes on disk
`pnpm video:takes` against the live site and a local `PAYMENT=fake` server (no keys, no .env). Run it once more after
each staged track merges, so its take records. The table is the last full run.

| Take | Where | Size | Seconds | Last run |
|---|---|---|---|---|
| m0-hero | live | 1440 · 390 | 10.7 · 10.4 | Fri Oct 30, about 9 PM (Claude, live tip 7251325), 0 console errors |
| c-cold | live | 1440 · 390 | 8.8 · 8.4 (in 2.8 → out 7.8 · in 2.4 → out 7.4; `in` = the first seller row) | Fri Oct 30, late (Claude, live fd1c6b6), 0 console errors |
| m1-scam | live | 1440 · 390 | 26.1 · 34.6 | Fri Oct 30, about 9 PM (Claude, live tip 7251325), 0 console errors |
| m2-pay | local fake (rehearsal) | 1440 · 390 | 18.5 · 21.0 | Fri Oct 30, about 9 PM (Claude, live tip 7251325), 0 console errors |
| m3-proof | live | 1440 · 390 | about 31 | Wed Nov 4, 0 console errors |
| m3-proof-local | local (fallback) | 1440 · 390 | about 30 | Wed Nov 4, 0 console errors |
| c-menu | live | 1440 · 390 | 12.1 · 14.3 | Fri Oct 30, about 9 PM (Claude, live tip 7251325), 0 console errors |
| c-tour | live | 1440 · 390 | 16.4 · 16.4 | Fri Oct 30, about 9 PM (Claude, live tip 7251325), 0 console errors (first time: the tour is live) |
| c-signature | live | 1440 · 390 · 1440 reduced motion | 9.7 · 9.6 · 9.4 (in 2.7 → out 8.7 · in 2.6 → out 8.6 · in 2.4 → out 8.4; `in` = the first seller row, the case rises about 0.8 s later) | Fri Oct 30, late (Claude, live fd1c6b6), 0 console errors |
| j-pay | hand (Joshua) | 1440 · 390 | waits on Joshua's files | marks set by hand (`--hand`) |
| k-promises · k-board · k-challenge · k-friends-family · k-limits · k-haggle · k-wants · k-ledger | local (no live round) | 1440 · 390 | see `takes.json` | the video kit's takes: re-shoot after any merge |
| k-board-live | live, reads only | 1440 · 390 | see `takes.json` | records once the board is on the live site |
| k-day5 | live, reads only | 1440 · 390 | 12.6 · 16.7 | Fri Nov 6, on a local build of live 7f4d95d2, 0 console errors: beat 3 of A Week with Goose, the landing's "Missed the drop?" over the ticket's simulated day 5, and the track under the limit |
| k-real-prices | local (no live round, no counter) | 1440 · 390 | not shot yet | the landing's real prices and a real flag; records at the kit's re-shoot |
| k-list · k-read | local | 1440 · 390 | about 19 · about 26 | Wed Nov 4, 0 console errors |
| stills | live | 1440 | end card + 3 captions | Fri Oct 30, after 9f9944f deployed (`--stills`): the end card carries all four lines, the FTC line second |

## Notes for the edit
- The phone takes are 390×844 pixels, because Playwright records at the viewport's CSS size. Frame them in a device mock
  at 1:1.
- No cursor is drawn, so taps are invisible; a tap ring is an edit choice.
