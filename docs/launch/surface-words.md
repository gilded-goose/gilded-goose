# Surface words: every screen, from the press release down

Claude, Sat Oct 31 2026. Each route gets the one fact it must show, the press-release line it serves, its visible word
count today, a proposed budget, and the exact words to paste. Surface owners implement from this file; the Design
Director sets the final budgets in `docs/guild/brand.md`. The story is `press-release.md`; the hard answers are
`faq.md`.

**The rule for every surface.** One fact on the screen. The explanation one tap away ("Why?", "Before you approve",
"How this works"). The honesty label kept, as one short line. Warm, calm, plain, short.

**How the counts were measured.** A local build (`VITE_WALLET=1 corepack pnpm --filter @goose/web build`) served by the
real server on port 4197 (`PAYMENT=fake BUYER=rule`; bare `vite preview` has no `/api`, and the run needs it), Playwright
at 1440×900 and 390×844, DPR 1, reduced motion, 2.5 s after network idle. *First screen*: words in visible text nodes
that touch the viewport, the nav included (about 12 words of nav at 1440, 11 at 390). *Page*: words in
`document.body.innerText`. A word is a run of characters holding a letter or a digit. The two counters differ where text
sits in a fixed or sticky layer (the run's rail), so compare a surface only with itself. The probe is
`docs/launch/word-count.mjs` (`node docs/launch/word-count.mjs http://localhost:<port>`); re-running it reproduced every
count below exactly. The design review's budget probe can reuse it (the design review is a Claude agent that checks every screen against our brand guide).

**Claims.** Words below marked 🔒 are pinned by a `docs/claims.md` row: change the row in the same commit, or keep the
words. Every proposal here keeps every honesty line.

**Budgets now.** The table at the end, "Reconciled with the design review's budgets", restates every budget below the design review's way (bar,
menu and footer left out; the lower budget wins at each width) and wins where a section below differs.

## The missing layer and the landing's budget (Nov 4; the design review's ruling)

The section adds 166 words with its sources folded, and the fears add 24. With the Challenge mounted, the landing reads
881 / 872 at 1440 / 390. Its first screen is 63 / 46, Challenge's opening lines included.

**Written reason, words (design review, Nov 4):** the page was 685 / 676 before the layer and the Challenge. Accepted, because
Joshua ordered the promises. The gift-card beat is merged: the Steps card shows it, so the moment's sentence and the
second line under Protects are gone. The landing is judged section by section (brand.md §10.3, gate ruling Oct 31
05:49), not by the old 600. The Challenge has its own budget, 110 at rest with its fold closed, and the Challenge's writer owns it.

**Written reason, the fresh numbers (a fresh design review, Nov 4):** the ceiling is now 935 / 926 with the scammer switch off, up
from 895 / 886. The 28 words over were figures Joshua ordered: both blind sets, each labeled, and the AI reader with what
it costs. Cutting a figure to meet the number would be the wrong trade. The 12 in `BAND_STILL` say what still stands under
a catch rate. The AI block adds to the ceiling when the switch is on. Any other new landing word needs a cut. Measured on the merge
with F's five fixes, the page reads 1001 / 992: F's live feed adds 66, which this ruling didn't judge.

**Written reason, the phone's face swap (design review, Nov 4):** when the display face arrives, the hero's lines move by up to
about 5 px at 390. Accepted: nothing reflows, it's one step, and per-promise fits can't hold wrapped lines. The fit stays
within 2 px at 1440 (the ratchet).

## Impact, ruled (a fresh design review, Nov 4)

Joshua's section 1 puts the mission line, the FTC's figures, one line on AI shoppers and a labeled scene right after the
Challenge. **Ceiling 1104 / 1095, switch off, F's 66 included and now judged; anything above returns to the gate.** Why it's
higher: the figures and scene are Joshua's order, and cutting a figure to meet a number is the wrong trade. Measured on the
commit that applies this: **1104 / 1095**, at the ceiling exactly, because the 46% names its own base; first screen unchanged (64 / 74).

**Cut:** the Steps card's footer, "TixQuack's note, read as data. Goose never follows it." (step 02 says it just above), and the
moment's first sentence, leaving "Goose waited, and on day 5 the total came in under your $90.00 events limit." **Refused:** cutting
the eyebrow, which is what tells a reader the figures are the problem. The AI line stays: Joshua asked for it by name, though the
missing layer quotes the same study two sections on.

## Real prices on the landing, for the gate (Track C3, Nov 5)

Joshua ordered real prices visible on the landing (2:36 AM). `RealMarket.tsx` adds **0 words to the first screen** (47 / 53 with or
without it, as its panel doesn't load there) and **95 to the whole page at both widths**, counted by `sw-words.ts`'s text rule run over
the whole page: 1049 without it, 1144 with it, against the Impact ruling's ceiling of 1104 / 1095. That ruling says anything above returns
to the gate, so **the design review rules on these words with the Studio re-score**. `sw-words.ts` itself has no landing route, so its budgets don't
cover this section. Already cut: the other stores' rows and the longer sentence, 140 words down to 95. **Kept:** the label, the date,
three references and the flag with its note, all in plain text. Decided by default: no one else's landing words were cut. Flip if the design review says: which.

## The numbered landing, ruled (a fresh design review, Thu Nov 5)

Joshua's 6:20 PM item 4 puts six numbered calm sections in his order (the promises, a week with Goose, try to trick it, Why
now, What Goose keeps, For builders). The design review ruled **SHIP AFTER** on `40252de3` (1424 / 1415). **Cut:** Impact's eyebrow "Why it
matters" on the landing: an un-numbered label in the numbered labels' style, just above "04 Why now", read as a missing number,
and "04 Why now" now says what the Nov 4 refusal kept it for. `IMPACT_EYEBROW` stays in core. **Held for Joshua:** the design review also asks
to drop Impact's AI line (it repeats the missing layer's Microsoft Research quote), but Joshua named that line, so it waits for him.
**Ceiling, in code:** measured on the commit that cut the eyebrow, the page reads **1421 / 1412**, of which 46 are the try counter and
the live feed. `scripts/desk-walk.ts` (`LANDING_WORDS`, run in CI and ci-local) fails the landing over **1375 / 1366** words outside
those two, since their words follow how many tries a server has seen; `core/test/landing-calm.test.ts` fails if either number rises.
The ceiling only goes down from here.
**Whole page, pinned too:** the design review's 1400 / 1395 counts the whole page, as `word-count.mjs` does, and its
"~1399 after the cuts" counted both cuts. With the AI line kept for Joshua, the page reads 1421 / 1412: over the design review's number.
`LANDING_PAGE_WORDS` pins it at 1421 / 1412 (read only in the blank first state: counter blank, feed showing its layers) so
it can't grow; it drops to the design review's answer, or to 1399 / 1390 if Joshua says yes to the AI-line cut. No other words are trimmed.
**The design review's ACCEPT (a fresh review, Thu Nov 5):** 1421 / 1412 stands with Joshua's AI line kept, no cuts:
the 21 words over 1400 are exactly his 22-word line, and paying for it elsewhere would cut honesty labels. If Joshua later cuts
the line, the ceilings fall in that commit. The walk now gates four numbers at both widths: first-load calm **1375 / 1366**, first-load
whole page **1421 / 1412** (blank state only), calm after a slow full scroll **1472 / 1463** (1473 / 1464 when the design review accepted it, tightened once the walk's fixed clock made it hour-safe; the whole scrolled page read 1535 / 1526
with no tries and 1533 / 1524 with two; calm is the same both ways), and the live counter and feed at **139**, the most they can draw
(five feed rows with the longest words, the longest counter lines and the full-network note), computed from core's words in
`landing-calm.test.ts`. The design review guessed 70 for that cap; the computed worst case is 139, so the cap covers it and a busy server never
fails the walk. Optional trim the design review named (Steps' "Goose set TixQuack aside. Your money stays put.") is not taken: cuts are Joshua's.

## Re-measured Nov 4: what shipped against these budgets

The word probe now has two first-screen numbers. `first` counts what a person can see; `firstRaw` is the rule the rest of
this file was measured with, which also counted screen-reader and clipped text (the run's first screen read 263 on a
page of 154). 1440 / 390:

| Surface | Oct 31 | Budget | Nov 4 | |
|---|---|---|---|---|
| The deal card (`.dk-deal2`) | 106 | 50 | **39** | met, down 63% |
| Behind the scenes' header (`.lx-hero`) | 73 | 30 | **17** | met, down 77% |
| The hero: promises, lede, Hello, chips | 80 | half | **38** | met, down 52% |
| `/` first screen | 94 / 93 | | 63 / 46 (old rule 82 / 65) | the Challenge's first lines show at 1440 |
| `/` whole page | 971 / 970 | by section | **881 / 872** | judged by section (the reason above): promises 107, the layer 166, the fears 24, the Challenge its own; was 578 / 569 on Nov 3 |
| `?desk=tour` first screen | 128 / 81 | 90 / 60 | 123 / 73 (old rule 127 / 77) | **over**, unchanged in kind |
| `?desk=ledger` first screen | 228 / 158 | | 96 / 54 (old rule 149 / 107) | |

The hero now carries the three promises, and the "Serves" lines below that name the old sentence
("Payment networks protect the payment. Goose protects the conversation.") are history. The line on the site is
"PayPal protects the payment; Goose protects everything before it."

## Summary

| Route | Owner | First screen 1440 / 390 | Page 1440 / 390 | Budget (first screen) |
|---|---|---|---|---|
| `/`, `?desk=1` hero | DK | 94 / 93 (hero prose 61 + chips 19) | 971 / 970 | hero prose **26** + chips |
| the run (Marsh Lights chip) | DK | deal card **106** (both widths) | 299 / 254 | deal card **50** |
| `?desk=1` landing story below the hero | S2 | — | 971 (with the hero) | page **≤ 600** |
| `?wallet=1` | W-8 | 265 / 156 | 469 / 396 | **130 / 90** |
| `?wallet=0` (Try to trick Goose) | Lead assigns (was W) | 192 / 92 | 325 / 264 | **110 / 70** |
| `?market=1` | Lead assigns (was W) | 79 / 78 | 82 / 81 | **55** |
| `?desk=haggle` | Lead assigns (was H2) | 266 / 129 | 364 / 363 | **150 / 90** |
| `?desk=ledger`, `?desk=studio` | AS-15 | 228 / 158; header **73** | 859 / 931 | header **30**; first chart **≤ 45** (from 202) |
| `?desk=proof` | AS-15 | 176 / 117 | 2087 / 2086 | **110 / 80** |
| `?desk=tour` | S1-13 | 128 / 81 | 162 / 113 | **90 / 60** |
| `/safe.html` | W-8 | 119 / 85 | 632 / 164 | **80 / 60** |
| `?desk=system` | SYS | not built (falls back to the Desk) | — | **40**, page uncounted |
| How it works | SYS | not built | — | **≤ 140** (`how-it-works.md`) |
| 404 | R | 28 / 27 | 28 / 27 | **28** (keep) |

---

## `/` and `?desk=1`: the hero (DK)
- **One fact:** Goose shops for you, and nothing is paid until you tap.
- **Serves:** the promise, "Goose shops for you. Nothing is paid until you tap."
- **Measured:** first screen 94 at 1440, 93 at 390. Hero prose 61 words, chips 19.
- **Budget:** 26 words of prose, plus the Ask box and the chips. **Now 40 for `.dk-hero`, chips included (the design review's, see the reconciled table at the end): cut the greeting line.**
- **Words to paste:**

| Today | Proposed |
|---|---|
| Goose shops for you. / Nothing is paid / until you tap. | *(keep, as is)* |
| Goose compares sellers, sets aside the ones that try to trick it, and waits for your tap. | It sets aside sellers that try to trick it. |
| Good evening. Where would you like to begin? | Good evening. What are you looking for? *(00:00–04:59: "Hello. What are you looking for?")* |
| Tell Goose your name · Mute Goose | *(move to the menu, under Settings)* |
| Speech becomes text on your device, about a second after you let go; your voice is never sent anywhere. | *(off the hero; show it under the mic on the first press only)* 🔒 `desk-voice`, `v-voice-second` keep the string in `core/src/view/desk.ts` |
| Try · four chips | *(keep the four chips)* 🔒 `c-marsh-chip`, `c-cap-chip`, `c-kettle-chip` |

Result: 26 words of prose (was 61), minus 57%; with the mic line moved, the first screen is about 55 words (was 94).

## The run: the Marsh Lights chip → Shop for this (DK)
- **One fact:** the price, **Approve $84.00**, and "Goose set TixQuack aside."
- **Serves:** step 2 ("On the Desk you see one line: 'Goose set TixQuack aside. Your money stays put.'") and step 3
  (Approve locks in this one cart).
- **Measured:** the deal card (`.dk-deal2`) is 106 words at both widths. With the deal card in view: 349 at 1440, 192 at
  390. Page 299 / 254.
- **Budget:** the deal card at **50**. The feed rows stay as they are (they are the data).
- **The protection line** (above the card): keep **"Goose set TixQuack aside. Your money stays put. Why?"** as the one
  line. Today the landing says "Goose set aside TixQuack." Use the Desk's order everywhere: "Goose set TixQuack aside."
- **The deal card, words to paste:**

| Today | Proposed |
|---|---|
| YOUR DEAL · LANTERN HALL BOX OFFICE | Your deal · Lantern Hall Box Office *(keep)* |
| $84.00 | $84.00 *(keep)* |
| was $112.00 · The same seat on day 1. Goose waited. | Was $112.00 on day 1. Goose waited. 🔒 `desk-was`, `h2-ticket-waited` (keep "Goose waited.") |
| Cheapest of the 2 sellers left · Not set aside · no scam wording | *(into Why?)* |
| BEFORE YOU APPROVE *(closed)* | Before you approve › *(keep closed; it holds the limit lines and the steps below)* |
| WHAT HAPPENS AFTER YOUR TAP · Steps Held Re-checked Captured · Captured means PayPal takes the money; voided means the hold is released and nothing is taken. When you tap Approve, code seals this exact cart and PayPal asks for your OK. PayPal then holds the money, code re-checks the cart, and PayPal captures it, or the hold is voided. | *(inside Before you approve)* Held → Re-checked → Captured. PayPal holds the money, code checks the cart again, then PayPal takes it, or lets the hold go and nothing is charged. |
| Approve $84.00 | Approve $84.00 *(keep)* 🔒 `c-video-m2` |
| Practice payments on this server. Only your tap pays. | Practice payment. Only your tap pays. |
| View details · Watch the haggle › | Watch the haggle › *(one link; "View details" duplicates Before you approve)* |

Visible on the closed card: "Your deal · Lantern Hall Box Office $84.00 Was $112.00 on day 1. Goose waited. Before you
approve › Approve $84.00 Practice payment. Only your tap pays. Watch the haggle ›" = **28 words** (was 106).
- **Inside "Before you approve"** (one tap away), keep, in this order: "The Watcher set TixQuack aside: it asks to be paid by
  gift card." · "Your Events limit: $90.00, set in code." · "Approve locks in exactly $84.00: PayPal pays that after
  your tap, or nothing." 🔒 `desk-bound` keeps "PayPal pays that after your tap, or nothing." · then the steps line above.
- **The sealed case** (the set-aside seller's note): keep "Read as data, never as orders" and the reader line 🔒
  `ai_reader_can_only_escalate`.

## `?desk=1` below the hero: the landing story (S2)
- **One fact:** the recorded week in one picture: TixQuack set aside, $84.00 under $90.00, your tap.
- **Serves:** "How it works" (3 steps) and "Who it's for".
- **Measured:** 971 words for the whole Desk page, hero included.
- **Budget:** ≤ 600 for the page. No new words (S2-cine's rule); every cut below only removes.
- **Words to paste:**

| Today | Proposed |
|---|---|
| HOW IT WORKS · What happens after you ask. · 01 You ask … 02 Goose shops … 03 Goose sets the scam aside … 04 Your tap … 05 PayPal confirms … (five steps) | Three steps, the press release's: **01 Ask** "Say what you want, or tap an example." · **02 Goose checks every seller** "It reads each seller's words as data, never as orders, and sets the scam aside." · **03 You tap** "You approve the exact cart in PayPal. Code checks it again before any money moves." |
| 03 … "A seller whose note asks to be paid outside PayPal, or tries to instruct Goose, is set aside." | **Fix, it overclaims:** a cash-in-person seller is held, never set aside (`NEVER_REFUSE`). Use step 02's line above. |
| Goose set aside TixQuack. Your money stays put. | Goose set TixQuack aside. Your money stays put. |
| The eyebrow over the steps: "How it works" (`Steps.tsx`), the same name as the `?desk=how` page, the menu item and the tab title (`HOW_TITLE`, `web/src/brand/title.ts`) | Eyebrow: **"In three steps"**. Under step 03, one link: **"How it works, part by part ›"** to `?desk=how`. One name, one page: "How it works" is only ever the page; the landing's section says what it is (three steps) and hands off to the page for the five parts and their files. **Hand to: S2-cine** (`web/src/desk/story/Steps.tsx`; the link uses the router's `?desk=how` the menu already uses). Row `s2-story-steps` pins the step heads, not the eyebrow, so no row changes. |
| NOW, OR ALL WEEK · Two ways to shop with Goose. · Tell Goose … · Let Goose watch … (44 words) | *(cut the section; "Your wants" is in the menu)* |
| Every seller's note is checked before anything reaches your tap. Your limits live in code, where a seller's words can't change them. | Your limits live in code, where a seller's words can't change them. *(Cut the first sentence only: steps 02 and 03 say it. Keep the second: since "Limits in code" left everything but the menu and the tour (our lead agent's default, which we keep), this is the landing's one line saying a seller can't raise your limit.)* |
| EVERYTHING GOOSE DOES · 15 items, one line each | *(cut, the design review's gate on b304f9c0, Sat Oct 31: the page rendered 847 words against ≤600, and this section was 270 of them, a copy of the menu. No feature is cut: every item stays in the nav's "Everything Goose does". Row `s2-can-count` went with it. Flip if Joshua says: keep a names-only grid.)* |
| Proof band, the close, the FTC line, the team, ten lines of code | *(keep word for word)* 🔒 `c-impact-source`, `ten-lines`, `story-band`, `s2-band-code`, `s2-band-held` |

## `?wallet=1`: the wallet (W-8)
- **One fact:** "Goose set 1 seller aside this week", and the deal waiting for your tap at $47.73.
- **Serves:** step 2 and step 3, on the recorded kettle week.
- **Measured:** first screen 265 at 1440, 156 at 390; page 469 / 396.
- **Budget:** first screen 130 at 1440, 90 at 390.
- **Words to paste:**

| Today | Proposed |
|---|---|
| From the recorded run, week 1 · Goose's moves by an AI model · 2026-10-23 | A recorded practice week. Goose's moves by an AI model. |
| Seller notes on the Watcher's desk · Read as data, never as orders | Read as data, never as orders *(one line)* |
| Its note, as quoted. The AI buyer never read it, and no order was made from it. | The AI buyer never read this note. |
| Asked to be paid by gift card · Its note tried to give Goose orders · See row 5 in Every decision › · Offered again in rounds 2–4; it stayed set aside. | Asked for a gift card, and gave Goose orders. Why? › *(row 5 and the rounds inside Why?)* |
| Goose's haggle, round by round · The AI proposes, plain code decides · four rounds | *(fold behind "Watch the haggle ›"; keep "The AI proposes, plain code decides" as its one line)* |
| Waiting for your tap · Goldfeather Kettle … $47.73 · Your limit: $60.00 locked by code · Goose haggled it $10.27 below their $58.00 ask · Approve $47.73 · This exact cart only · PayPal shows Pay Later here when it offers one. · Goose can't pay. Only your tap in PayPal does. · Try a price swap › | *(keep all)* 🔒 `wallet-deal`, `approve-amount`, `h2-kettle-haggled`, `c-swap-cent` |

## `?wallet=0`: Try to trick Goose (owner: Lead assigns)
- **One fact:** you play the seller; the $60.00 limit lives in code the AI can't reach.
- **Serves:** "What is new" (the reader can only make Goose more careful, live here).
- **Measured:** 192 / 92; page 325 / 264.
- **Budget:** 110 / 70.

| Today | Proposed |
|---|---|
| This is the practice bench. Shop with Goose › | *(cut; the nav has Shopper)* |
| Try to trick Goose into overpaying. | Try to trick Goose. |
| A model can be talked into overspending. The limit lives in code it can't reach. | You're the seller. The $60.00 limit lives in code the AI can't reach. |
| Live on PayPal's sandbox, with test money only. Try to fool it below. | PayPal sandbox, test money only. |
| You're the seller. Try to get it to overpay. | *(cut, said above)* |
| Plain rule (no AI) free · never reads your words / AI reads your note a live AI model · off on this server | *(keep both toggles)*; add under the AI toggle: "Can only make Goose more careful, never less." 🔒 add this file to `c-innov-line`'s Shows in |
| No one has tried to break it here yet. Be the first. | Your note goes first. |

## `?market=1`: the cart, step by step (owner: Lead assigns)
- **One fact:** search, cart, approve; only your tap pays.
- **Serves:** step 3; the FAQ's "What's simulated?".
- **Measured:** 79 / 78; page 82 / 81. **Budget:** 55.

| Today | Proposed |
|---|---|
| Search, fill a cart, approve. Only your tap pays. | *(keep)* |
| Modeled on PayPal Store Sync's published cart flow; not connected to Store Sync (limited availability). | *(keep word for word: Joshua's wording)* 🔒 `store-sync` |
| Fictional stores. Every seller's words are read by the Watcher before any cart. | Fictional stores. The Watcher reads every seller first. |
| Practice only: no real money · PayPal sandbox · simulated sellers, fictional products | Practice only: fictional sellers, PayPal sandbox, no real money. |

## `?desk=haggle` (owner: Lead assigns)
- **One fact:** they met at $47.73 in round 4, under your $60.00 max.
- **Serves:** "plain code decides"; FAQ "What does the AI actually do?" (job 3).
- **Measured:** 266 / 129; page 364 / 363. **Budget:** 150 / 90.

| Today | Proposed |
|---|---|
| Each seller's price steps down, Goose's offer steps up, and they meet at the deal. Every number here is a row in the run's ledger. | Sellers step down, Goose steps up, they meet at the deal. |
| Recorded demo week, no money moved · Goose's moves: an AI model, recorded 2026-10-23 | Recorded practice week. No money moved. |
| Pondside Goods asked $58.00, $55.37 … then took $47.73. *(the chart's text twin, 50+ words)* | *(keep for screen readers only: visually hidden)* |
| A recording: no order exists, so nothing can be paid. | *(keep)* |

## `?desk=ledger` and `?desk=studio`: Behind the scenes (AS-15)
- **One fact:** every decision Goose's code made, with who, why and which rule; and the scam set aside on day 5.
- **Serves:** "Payment networks protect the payment. Goose protects the conversation."
- **Measured:** first screen 228 at 1440, 158 at 390; header (`.lx-hero`) **73**; the first chart's title, caption and
  fact cards **202**; the grid's caption 65; page 859 / 931.
- **Budget:** header **30**; first chart **≤ 45**; grid caption **≤ 25**.
- **Header, words to paste:**

| Today | Proposed |
|---|---|
| Behind the scenes | Behind the scenes |
| Payment networks protect the payment. Goose protects the conversation that comes before it. | Payment networks protect the payment. Goose protects the conversation. |
| Every row Goose's code writes, the moment it writes it, with who, what, why and which rule. See the proof: every number Goose claims, each with its source. | Every decision, with its reason and rule. See the proof › |
| Nothing here yet: your rows start the moment you ask Goose: every seller it checks and the one it sets aside. PayPal's rows join after your tap. Ask Goose › | Your rows start when you ask. Ask Goose › 🔒 `l-ask-rows` (reword the row; "Nothing here yet" never appears, per the checklist) |

Header: **30 words** (was 73), counted with `word-count.mjs`'s rule.
- **First chart, words to paste:**

| Today | Proposed |
|---|---|
| Until you ask: the demo week we recorded, one ticket's price day by day. | *(cut; the chart's caption says it)* |
| Where the ticket's price went this week | The ticket's price, day by day |
| A ticket to The Marsh Lights, Saturday, as your Desk watches it: fictional sellers and demo prices over 7 simulated days, not rows from the ledger. Total with fees and taxes, as you'd pay it. | Fictional sellers, a recorded week. Totals with fees. |
| The price scale starts at $40, not $0, so the drops look steeper than they are. | *(cut: start the scale at $0, checklist §3)* |
| Lantern Hall Box Office's total fell … asked for gift cards. *(the chart's text twin, 52 words)* | *(visually hidden; keep for screen readers)* |
| Day 5 · Lantern Hall Box Office · $84.00 · Under your $90.00 Events limit. The same seat was $112.00 on day 1: the price fell $28.00 while Goose waited. That's the price moving, not haggling. On day 6 it rose again, to $91.00. | Day 5 · $84.00 at Lantern Hall Box Office. Under your $90.00 limit. Goose waited. 🔒 `h2-ticket-waited` |
| The cheapest offer was the scam · TixQuack's $55.00 was lower than any cleared seller's lowest total all week. The Watcher set it aside: asked for gift cards. | The cheapest was the scam. TixQuack, $55.00, asked for a gift card. Set aside. |
| Reedwhistle Tickets stayed over the limit · Its lowest total all week was $97.00, fees in. Goose compares totals, never a price before fees. | Reedwhistle never came under $90.00. |

First chart: **47 words** visible with the Reedwhistle line, **42** without it (was 202).
- **The grid's caption:**

| Today | Proposed |
|---|---|
| A second recording from the demo week, apart from the ticket above: one haggle with fictional sellers, row by row as its code wrote it, no money moved. Your own rows stream in above it once you ask Goose. Click a row for its full story, or Tab into the table, move with the arrow keys and press Enter. | One recorded haggle, row by row. No money moved. Click a row for its story. *(the keyboard help in the grid's accessible description)* |

## `?desk=proof` (AS-15)
- **One fact:** two blind tests side by side (Nov 4: 21 of 59 through code alone; with the reader on, 0 of 59 through and 4 of 30 fair notes refused. Oct 28: 19 of 60; with the reader on, 0 of 60 through and 0 of 40 refused); three sandbox money paths with PayPal's order ids.
- **Serves:** FAQ "Is it real?" and "Can a scam still get through?".
- **Measured:** 176 / 117; page 2087 / 2086 (the Sources list is long by design). **Budget:** 110 / 80; Sources folded.

| Today | Proposed |
|---|---|
| Every number here is a row in our claims list, quoted in full under Sources below. On every commit the check reads each row's Value again from its source: the code itself, or the recording of a run. Tap a number to see its row and its source. | Every number here is re-checked against the code on every commit. Tap one for its source. |
| Two blind tests, newest first. One writer each, measured before any change. | *(Nov 4: the table of both sets replaced the single figure)* |
| Sources (the full list) | *(folded behind "All sources ›")* |

## `?desk=tour`: the Judge tour (S1-13)
- **One fact:** everything Goose does, one button each.
- **Serves:** "Try it" step 1.
- **Measured:** 128 / 81; page 162 / 113. **Budget:** 90 / 60.

| Today | Proposed |
|---|---|
| Everything Goose does, in about 3 minutes. | Now "Three promises, in about 3 minutes." (Nov 4) 🔒 `s1-tour-time` |
| Each button opens the real thing. Come back with Back or the menu; your ticks stay in this browser. Not counting PayPal's own sandbox login. | Each button opens the real thing. PayPal's sandbox login not included. |

## `/safe.html`: See how it keeps you safe (W-8)
- **One fact:** $60.00, locked by code.
- **Serves:** FAQ "Can the AI spend my money?".
- **Measured:** 119 / 85; page 632 / 164. **Budget:** 80 / 60.

| Today | Proposed |
|---|---|
| See how it keeps you safe. Five steps from one recorded week. The AI proposes, plain code decides. | See how it keeps you safe. The AI proposes; plain code decides. |
| Locked: no note, chip or typed max can raise it. | *(keep)* |
| Your yes · This exact cart only · 15 min · Re-checked against the order before paying. | *(keep)* |

## `?desk=system` (SYS)
- **One fact:** every token, component and state on one page (unlisted, noindex).
- **Serves:** nothing public; it is the team's page.
- **Budget:** a 40-word intro: "Gilded Goose's design system. Every token, component and state, as the live site draws
  them. Unlisted. If a screen and this page disagree, the screen is wrong." (26 words.) Component labels uncounted.

## How it works (SYS)
- **One fact:** shopper → Goose → Watcher → guard → PayPal, each box a real file.
- **Serves:** "How it works" and "What is new", for technical judges.
- **Budget:** ≤ 140 words. **Words to paste:** `docs/launch/how-it-works.md`.
- **One name.** The page is "How it works" everywhere (`HOW_TITLE`, the menu, the tab); `how-it-works.md`'s title now
  matches. The landing's section stops using the name (eyebrow "In three steps", see the landing story above) and
  links here instead. **Hand to: SYS** (`web/src/how/how.ts`): take the lead line "Money moves only after your tap."
  and the five box sentences from `how-it-works.md` in place of SYS's draft words (`HOW_LEAD` "Five steps sit between
  your ask and a payment, and only your tap can finish it."; the file's own header says our words replace them).

## 404 (R)
- **One fact:** nothing here; one way back.
- **Measured:** 28 / 27 with the bar and footer; the body is 5. **Budget:** keep (inside the design review's 8, bar and footer
  left out).
- Today: "Nothing here. Back to Goose › Fictional sellers. PayPal sandbox. Practice only: no real money." Keep.

---

## Lines every surface shares
- **The promise:** "Goose shops for you. Nothing is paid until you tap." (hero, README, Devpost, video).
- **The set-aside line:** "Goose set TixQuack aside. Your money stays put." (the Desk, the landing, the video).
- **The honesty label:** one line, never a paragraph: "Practice only: fictional sellers, PayPal sandbox, no real
  money." The footer can carry it once per page.
- **The new idea:** "can only make Goose more careful, never less" (Try to trick Goose, README, Devpost, How it works).
- **Words that stay off the shopper's screens** (the FAQ keeps them in its Backed by lines): verdict, escalate,
  custom_id, webhook, hash, TOCTOU, seed.

## Reconciled with the design review's budgets (`docs/guild/brand.md` §10.3)

The design review's table and this file measured the same build (`bcb37d2f`) two ways: the design review counts the first screen **without**
the bar, menu and footer; this file counts it **with** the bar (about 12 words at 1440, 11 at 390), and the deal card
and the header by the element's own `innerText`. So subtract the bar before comparing. The rule both files now follow:
**the design review's measure (bar excluded), and at each width the lower budget wins.** The budget now, per surface:

| Surface | Design review's budget 1440 / 390 | Our budget, bar excluded | **Budget now** | Note |
|---|---|---|---|---|
| Landing hero (`.dk-hero`) | ≤40 | prose 26 + "Try" and four chips 20 = 46 | **40** | Cut the greeting line (7 words; the Ask box already asks): 39. |
| The deal card (`.dk-deal2`) | ≤75 (design review measured 155) | 50 (28 proposed) | **50** | Today's counts differ (design review 155, ours 106, same build), likely a different state of the card; ours reproduces with `word-count.mjs` (`run-deal-card`). |
| A run's first screen | ≤120 / ≤80 | not set | **120 / 80** | |
| Wallet `?wallet=1` | ≤120 / ≤80 | 118 / 79 | **118 / 79** | |
| Try to trick Goose `?wallet=0` | ≤110 / ≤70 | 98 / 59 | **98 / 59** | |
| `safe.html` | ≤60 / ≤50 | 68 / 49 | **60 / 49** | |
| Behind the scenes header (`.lx-hero`) | ≤36 | 30 | **30** | |
| Behind the scenes first screen | ≤120 / ≤80 | first chart ≤45 | **120 / 80**, first chart **45** | |
| Proof | ≤100 / ≤70 | 98 / 69 | **98 / 69** | |
| The haggle | ≤120 / ≤80 | 138 / 79 | **120 / 79** | |
| The cart step by step `?market=1` | ≤60 | 43 | **43** | |
| Judge tour | ≤40 a stop | 78 / 49 on the first screen | **40 a stop; 78 / 49** | |
| Landing steps section | ≤120 | three steps, about 45 | **45** | The five steps become the release's three. |
| 404 | ≤8 | 16 (the footer's 9 included; the body is 5) | **8** | Today's body already fits: keep. |
| How it works (SYS) | not set | 140, file lines included | **140** | `docs/launch/how-it-works.md`; row `c-launch-how` counts it |

**The share headline (brand guide §10.8).** We rule: **"Nothing is paid until you tap."** in place of the default "Goose
protects the conversation." Why: a share card is read cold, by someone who has never seen the site. "Protects the
conversation" needs the sentence before it to make sense; "Nothing is paid until you tap." is the promise on its own,
the line the beat script expects judges to repeat, the video's third line and the release's bold line. At 30
characters it sets in two lines at 80 px in 600 px, as the design review's layout asks. With it: `og:description` "Goose can't be fooled into paying, can't overspend and can't hide anything. Practice only: no real money." (the three promises, in one line) and
`og:image:alt` "A gold egg beside the words: Nothing is paid until you tap."
