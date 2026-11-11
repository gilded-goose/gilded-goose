# Gilded Goose: questions and plain answers

**Goose can't be fooled into paying. Goose can't overspend. Goose can't hide anything.** Every answer below stays as
strong as the code holds, and no stronger.

The press release is [press-release.md](press-release.md). Each answer ends with what backs it: a file, or a row in
`docs/claims.md` that `node scripts/check-claims.ts` re-reads on every commit.

## Is it real?
The code is real and runs live at https://gilded-goose.onrender.com. The payments are real PayPal **sandbox** orders:
held, captured or voided on PayPal's own servers, with test money. Three runs we watched end to end:
$50.13 captured; $49.84 captured; $0.00 captured, the last after the cart changed and the hold was voided. Live PayPal,
with real money, is untested.
*Backed by: row `c-launch-runs` (the run log in `docs/claims.md`, with PayPal's order ids); `trust/src/paypal.ts`
refuses anything but the sandbox.*

## Can the AI spend my money?
No. Only your own tap, on PayPal's sandbox page, pays. The AI has no PayPal tool and no Approve button: it can only
propose a move. Plain code holds the money rules: your limit, the one exact cart, the fifteen-minute window, and a
second check of the cart before PayPal captures anything. Your words can lower your limit, never raise it.
Your limits, wants and week live in this browser's session:
another browser starts fresh, and so does this one after seven days without a visit.
A limit that follows your PayPal account to another browser isn't built yet.
*Backed by: row `c-launch-ai-cant-pay` (a buyer move is counter, accept, wait or walk, nothing else; the Claude adapter
imports no payment code; only `trust/src/paypal.ts` imports PayPal's Agent Toolkit); `trust/src/guard.ts`,
`trust/src/cart.ts`; rows `approval-ttl`, `c-cap-docs`, `c-kept-browser`, `limits-per-browser`.*

## What's simulated?
- **The sellers and products.** All fictional, and labeled that way on screen. Ask for something we didn't record and
  an AI model makes up fictional sellers for it; code then plants one scam seller on purpose, and the screen says so.
- **The weeks.** The Desk's Marsh Lights ticket and the wallet's kettle come from recorded practice weeks, so their
  prices are from that week.
- **The Christmas list's plan.** Every price in it is simulated, and it's labeled "Goose's plan, not a prediction".
  Those prices feed nothing else: the guard never sees them.
- **The Live Threat Board's demo week.** Notes we wrote, each run through the real check, labeled "Seeded demo week" and
  never counted as real tries.
- **The money.** Every payment is in PayPal's sandbox. No real money moves.
*Backed by: `core/src/ask/fictional-market.ts` (`FICTIONAL_MARKET_CLAIM`, `RECORDED_MARKET_CLAIM`, `PLANTED_SAYS`);
`docs/fixtures/tape-seed-1.json`; rows `s1-made-by`, `x-plan-label`, `x-plan-simulated`, `tb-seeded-week`, `tb-seeded-note`.*

## What does the AI actually do?
Claude Haiku 5.5 has six jobs, each behind a timeout and a fallback rule:
1. reads your words into chips, which code then checks;
2. makes up fictional sellers when you ask for something we didn't record;
3. proposes haggle moves, which code checks against your limit;
4. in **Try to trick Goose**, reads the note you write as a seller, and can only add caution;
5. reads the price on a photo you add;
6. builds a chart view when you ask the dashboard in Behind the scenes for one.

It never holds a limit, a PayPal tool or the Approve button. On the Desk it also reads the sellers code cleared, within its caps, and it can only hold one for your yes, never clear one. Goose's Read
(Buy now, Wait or Skip) is worked out by code, with no model. Your voice
becomes text on your own device (Whisper), and the audio is never sent to us; the words then go to Goose like typed ones.

One other job, when it's switched on: Claude Sonnet 5.5 writes the scammer AI's note, with no tools.

*Backed by: row `c-launch-ai-jobs` (one Claude class per job in `server/src/adapters/claude.ts`); rows `c-launch-sonnet-job`, `buyer-model`, `c-innov-line`, `c-whisper`, `x-read-code`; `core/src/buyer/port.ts`.*

## What is new?
The missing layer: the Watcher. Before any order exists, it reads what each seller wrote and sets the seller aside, or holds it for your
yes. We didn't find a buyer-side check like it anywhere else (prior art checked Oct 28, sources re-read Nov 4); we say "we didn't find it", not
"first ever". Its AI reader can only make Goose more careful, never less: it can move a seller one step toward caution (cleared → ask you first → set aside), never back. So
fooling the AI wins a scammer nothing. Budgets, limits kept outside the model, approval tied to one
cart, and hold-then-capture are known ideas, and we say so.
*Backed by: row `c-innov-line` (`escalate`, `trust/src/reader.ts`, and the test `ai_reader_can_only_escalate`);
`trust/src/watch.ts`; our prior-art check, Oct 28.*

## Why is the AI reader off on the Desk?
The Desk's sellers are fictional: from a recorded week, or made up for your ask. Every market has a scam seller that
code plants on purpose, and plain code sets it aside with no AI call, so a run is fast and repeatable. The reader costs
a model call for every note, so it runs where the notes are yours: **Try to trick Goose**, while the day's AI
allowance lasts. Code alone is the floor everywhere; the reader can only add to it.
*Backed by: row `c-innov-line` (the live reader runs only in Try to trick Goose's AI mode, under per-browser,
per-address and daily caps, `server/src/main.ts`); `core/src/ask/fictional-market.ts` (`PLANTED_SAYS`) and its test `planted_scam_is_always_present_and_always_set_aside` (300 made markets).*

## Can a scam still get through?
Yes, it can, and we say so. On the Oct 28 blind test, with scam notes and fair notes written by an AI agent told never to open
our code: code alone let 19 of 60 through; with the AI reader on, 0 of 60 (19 held for your yes, 41 set aside). On the Oct 28 recorded set, 0 of 40 fair notes were set aside (8 held for your yes, 32 cleared). On the fresh Nov 4 set, with the AI reader on, 4 of 30 were set aside and 11 held for your yes.
On a fresh set of Nov 4, from a new writer, scored once before anything was tuned on it: code alone let 21 of 59 through and held 9 of 30 fair notes for your yes, setting none aside. With the AI reader on, on the same notes: 0 of 59 through and 4 of 30 fair notes set aside, with 24 scam notes and 11 fair notes held for your yes. Honest sellers pay for that catch. Honest notes still get set aside. A check we wrote after reading the code found 23 that say vanilla, "my shop" or "my store," such as "Scented with vanilla. Money-back guarantee." and "Buy from my shop here on the site."
One writer and one set each: bounded tests, not rates. Whatever gets past, your tap is still the last step.
*Backed by: rows `c-launch-blind`, `c-blind-holds`, `fresh-docs`, `fair-still-refused`; `docs/fixtures/reader-r4.json`, `docs/fixtures/sealed-8-first-run.json`.*

## Why PayPal?
Because the tap that pays happens on PayPal's own page, and PayPal can hold the money first. Goose checks the cart
again while PayPal holds it, then takes the money, or lets the hold go and nothing is charged.
*Backed by: `trust/src/cart.ts` (the cart's hash rides in the order's `custom_id` and is re-checked before capture),
`trust/src/paypal.ts` (authorize, capture, void, sandbox only; order reads and refunds through PayPal's Agent Toolkit;
signed webhooks verified with PayPal before they write a row); rows `paypal-orders-v2`, `paypal-payments-v2`, `sandbox-webhooks`, `toolkit-tools`.*

## Where's the code?
The repo goes public about Nov 11, MIT licensed: [placeholder: public repo link, Nov 11]. The guard, the Watcher and its reader are their own package,
`trust/` (`@gilded-goose/trust`); add the guard to a checkout in ten lines of code (`trust/README.md`). The rest is
`core/` (the shopping logic), `server/` (PayPal and Claude, never in the browser) and `web/` (the screens).
*Backed by: row `c-launch-ten` (`trust/examples/ten-lines.ts`, run by `trust/test/ten-lines.test.ts`).*
