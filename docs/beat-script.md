# Joshua's read-aloud script, v3: Gilded Goose (2:25 cut, cap 2:45)

The voice below is the shot list's, word for word and line for line
(`docs/video-shot-list.md`; `pnpm check` row `c-video-script` fails if they drift). **251 words**, about 1:40 at 2.5
words a second (150 a minute), inside a 2:25 picture: every block has more picture than voice, so a pause costs nothing.
Read each block as its own file, two takes, named **open, m1, m2, m3, close**. A phone mic in a quiet room is fine.

**One story (Sat Oct 31).** The voice tells the press release's story (`docs/launch/press-release.md`): its promise
("Nothing is paid until you tap."), its three steps (you ask; "Goose checks every seller."; only your tap pays), and its
proof. `pnpm check` row `c-launch-story` fails if the voice loses the promise or step 2's words. m2 keeps "Approve binds
the cart" because the shot shows the Desk's own line (`boundLine`, `core/src/view/desk.ts`); if that line changes to
the release's "locks in", the voice, the shot list and `scripts/video-takes.ts` change with it.

**Pause marks:** **[beat]** is a silent "one"; **[pause]** is a silent "one, two". Full stops get a breath. The marks are
not words; don't say them.

| Block | Words | Speech at 150 wpm | Picture | Air |
|---|---|---|---|---|
| open | 24 | 0:10 | 0:20 | 10 s (the promises and the Proof dots are silent) |
| m1 | 56 | 0:22 | 0:30 | 8 s |
| m2 | 42 | 0:17 | 0:30 | 13 s (PayPal's page and the Paid card hold) |
| m3 | 58 | 0:23 | 0:25 | 2 s (the tightest block; say it calm, not fast) |
| close | 71 | 0:28 | 0:40 | 12 s (the end card holds after the last word) |
| **total** | **251** | **1:40** | **2:25** | |

<!-- script:start -->

## open · 0:00–0:20
On screen: the seller's note and Goose's skip card, then the three promises, then Paid $84.00, then Proof's dots. You speak only
on the first, second and fourth shots. Start half a second after the picture.

> This seller wants a gift card. [beat] Goose said no.

[pause: the case seals]

> PayPal protects the payment; Goose protects everything before it.

[silent: the promises, three seconds]

> Nothing is paid until you tap.

[silent: the Proof dots, four seconds]

## m1 · 0:20–0:50
On screen: the ask typed, the sellers, Why?, the deal card.

> Ask for a Marsh Lights ticket under ninety dollars. [pause] Goose checks every seller. The cheapest wants a gift card.
> The Watcher reads that note as data, never as an order, and sets it aside. [pause] The deal it keeps: eighty-four
> dollars, for a seat that was a hundred and twelve on day one of the recorded week.

## m2 · 0:50–1:20
On screen: Before you approve, Approve $84.00, PayPal's sandbox page, Paid $84.00 with PayPal's order id.

> Goose can't pay. Only your tap can. [beat] Approve binds the cart to exactly eighty-four dollars, for fifteen minutes.
> [pause] You pay in PayPal. [pause] Code checks the cart again before taking the money. [beat]
> Change one cent and the hold is void: nothing is charged.

## m3 · 1:20–1:45
On screen: Proof; both blind sets in its table; the three sandbox runs with their order ids.

> Here's the proof. [beat] Two blind tests, by AI writers who never opened our code. On the newest, code alone let
> twenty-one of fifty-nine through. With our AI reader, none, and the reader can only add caution, but it refused four of
> thirty fair notes. [pause] Three PayPal sandbox runs: paid, held then paid, a changed cart voided, nothing captured.

## close · 1:45–2:25
On screen: the Everything Goose does menu, the judge tour, the end card.

> Everything Goose does is one tap from this menu. [pause] Judges, start here: the tour opens each one live, in about
> three minutes. [pause] One plain note: not connected to real stores yet; built on PayPal's agent flow. The sellers are
> fictional; every payment is in PayPal's sandbox. [beat] Made to protect the people who get scammed online, especially
> those least able to spot it. [beat] Try to trick Goose yourself: the link is below.

<!-- script:end -->

## Reading notes
- **"Goose said no."** flat and certain, not triumphant. The Goose never gloats. Then stop: the case seals in the
  silence.
- **"PayPal protects the payment; Goose protects everything before it."** is the idea of the whole project. Same weight
  on both halves; a hair of air at the semicolon.
- **"Nothing is paid until you tap."** is the line judges will repeat. Say it once, plainly, as if it were obvious.
- **Money:** "ninety dollars", "eighty-four dollars" both times, "a hundred and twelve" (not "one hundred twelve").
  "fifteen minutes" is a fact, not a warning. "one cent" gets a tiny lift.
- **m3's numbers** ("twenty-one of fifty-nine", "none", "four of thirty") are the point of the block; leave air around each. "none got through"
  is the good news: let it land before "and the reader can only add caution". "four of thirty" is what it costs: same weight, never rushed.
- **"paid, held then paid, and a changed cart voided"** is a list of three; count them with your voice.
- **The scope sentence** ("not connected to real stores yet; built on PayPal's agent flow") is said once, exactly as
  written, at the same pace as everything else. A plain fact, not an apology.
- **"Made to protect the people who get scammed online, especially those least able to spot it."** is who this is for.
  Slow down a little; this is the one place the voice is allowed to care out loud.
- **The last line** is an invitation. Smile on it, then stop recording two seconds later.
- If a line feels fast, it is. Say it again slower; the edit picks the calmer take.

## Said only when its feature is live (not in this recording; record on the day it ships)
These are in the shot list's Staged lines; the day each ships, its line joins this script.
- The real-prices line, in m1 after "Goose checks every seller." (8 words, said once, Joshua's wording).
- The dashboard line, in the close after the tour line (15 words).

---

## Earlier drafts
Draft 2 (the Watcher-first 2:40 cut) is in git history, commit 674ce49; v2 (278 words, the 37-word open) is the version
before this one in git. Their claims rows now point at the Devpost, the README, the shot list or the screens that show
them.
