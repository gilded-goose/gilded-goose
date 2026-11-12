# Beyond the brief (our lead agent, Wed Nov 11 night): the list, the scores, the picks

Panel: **P** PayPal product lead, **J** 60-second judge, **S** security researcher, **D** agent developer.
Score = wow × honesty × safety ÷ hours. "6 AM" = fully live on the site without Joshua; "AM" = last step needs him (public-repo push or npm).

**Note sets (checked):** both were written by our own Claude Sonnet agents, are tracked in the MIT repo, and carry no licence or "do not publish" line: `core/test/fixtures/reader-blind-r4.json:2` (Oct 28, 60 + 40) and `docs/fixtures/sealed-8-first-run.json:2` (Nov 4, 59 + 30). Both say they are "used up as a blind set", so a published set is a **public regression set, never "blind"**. Not checked: whether the public export already holds them.

## All ideas

| # | Idea: what a judge sees | Proof | Trips | Loves / objects | W | H | S | h | Score | Live |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **The 21 that got through**: each scam note that beat code alone, word for word, with what stopped it next | probe counts rows = `fresh-code-through` | perf (lazy) | S, J love; P: "leading with failure" | 5 | 5 | 5 | 1.5 | 83 | 6 AM |
| 2 | **Goose reads itself** + `/llms.txt`: our own Watcher run over our own public copy; no page gives an agent orders | test: `readSeller` on every public string | none | S grins; J shrugs | 3 | 5 | 5 | 1 | 75 | 6 AM |
| 3 | **Recompute it yourself**: on Verify, the browser re-hashes the cart (keyless SHA-256) and matches `custom_id` | test: WebCrypto = `bindingHash` on vectors | claim: hash has no key, say so | J, S love; D neutral | 4 | 5 | 5 | 1.5 | 67 | 6 AM |
| 4 | **Cart fingerprint spec v0** + 10 test vectors: the `custom_id` recipe on one page | test runs vectors through `bindingHash` | "standard" overclaim | P, D love; J: dry | 4 | 5 | 5 | 2 | 50 | 6 AM |
| 5 | **Threat model with open rows**: each attack, its test, and what is unsolved | each row links a named test; probe checks they exist | none | S loves; J skims | 3 | 5 | 5 | 1.5 | 50 | 6 AM |
| 6 | **Guard in CI**: example workflow that fails a build when a scam note clears | `pnpm check` runs the example | none | D loves; J can't see it | 3 | 5 | 5 | 1.5 | 50 | AM |
| 7 | **Open benchmark** (seed 2): both sets as one JSON, our first-run verdicts as row one, a runner | probe: file tallies = claims rows | "blind", "benchmark" words | S, D love; P: one writer per set | 4 | 5 | 5 | 2.5 | 40 | 6 AM |
| 8 | **Attack permalinks**: share your trick note as a link; code re-judges on load | test: round-trip, verdict recomputed | note in URL fragment only | J, D like; S: phishing-looking links | 3 | 5 | 4 | 1.5 | 40 | 6 AM |
| 9 | **Python verifier**: 30 lines pass the same vectors | CI step or stored run | no Python in CI | D, P like | 3 | 4 | 5 | 1.5 | 40 | AM |
| 10 | **Mutation scoreboard**: we broke the guard N ways, tests caught N | stored `scripts/mutants.ts` run | heavy job | S loves | 3 | 4 | 5 | 2 | 30 | 6 AM |
| 11 | **MCP server** (seed 1): `read_seller_note` tool, zero new deps, stdio | test spawns it, sends JSON-RPC | "works with any agent" | D loves; S: clear ≠ safe must be in the tool text | 4 | 4 | 5 | 3 | 27 | AM |
| 12 | **Change one cent**: edit a bound cart in the page, watch settle refuse | fake port in browser | `/node` entry in bundle; perf | J loves; S: demo, not proof | 5 | 4 | 4 | 3 | 27 | 6 AM |
| 13 | **Agent recipes**: three copy-paste loops, each run by check | example tests | none | D likes | 2 | 5 | 5 | 2 | 25 | AM |
| 14 | **Dispute evidence pack** (seed 3): printable order record from Verify | fields = ledger rows | claims PayPal accepts it; near money words | P loves; S, J: unproven format | 5 | 3 | 4 | 3.5 | 17 | 6 AM |
| 15 | **"Stopped since launch" counter** | none durable (memory ledger) | claim beyond code | J likes; S objects | 4 | 2 | 3 | 2 | 12 | no |

## The picks (in build order)

**1. The 21 that got through (83).** Slice: Nov 4 set only, lazy-loaded from Proof. Branch `beyond/misses-wall`. Files: `web/src/charts/MissesWall.tsx`, a build step reading `docs/fixtures/sealed-8-first-run.json`. Test: rows = `fresh-code-through` (21), verdicts match the fixture. Claims row `misses-wall`. Devpost: "We publish each scam note that beat our code, word for word." Film: the wall scrolling under "21 of 59". Drop first: the Oct 28 set.

**2. Recompute it yourself (67).** Depends on Verify this order. Slice: one button; WebCrypto SHA-256 of the canonical cart beside `custom_id`. Branch `beyond/recompute`. Files: `web/src/verify/recompute.ts`, tested against `bindingHash` on fixed vectors. Claims row `verify-recompute` must say the hash has no key; PayPal holding it is what binds (`trust/src/cart.ts:67-69`). Devpost: "Don't trust our server: your browser re-derives the fingerprint PayPal holds." Film: two hashes turning green. If Verify slips, ship it on Under the hood with a recorded cart.

**3. Cart fingerprint spec + vectors (50).** Shares vectors with pick 2. Branch `beyond/fingerprint-spec`. Files: `docs/fingerprint-v0.md`, `trust/test/vectors.json`, `trust/test/vectors.test.ts`, a Builders link. Claims row `fingerprint-vectors` (10 of 10). Words: "our recipe", never "a standard". Devpost: "The fingerprint is a one-page recipe with test vectors anyone can pass." Film: none. Drop first: the Python port (9).

**4. Open benchmark (40).** Extends pick 1. Slice: one static `goose-notes-v1.json` (both sets, our first-run verdicts) and `scripts/bench.ts` taking any `(note) => verdict`. Branch `beyond/bench`. Test: tallies equal `blind-*` and `fresh-*` rows. Claims row `bench-file`. Words: "public test set, not a rate". Devpost: "Run your guard on the notes that beat ours." The site file is live at 6 AM; the runner needs the repo push (AM). Drop first: the runner.

**5. MCP server (27), only if 1 to 3 are green by 2:30 AM.** Slice: `trust/src/mcp.ts`, hand-written stdio JSON-RPC, one tool, no new dependency; the tool text says "clear doesn't mean safe". Test spawns it. Nothing public names it until Joshua pushes (AM). Drop this pick first.

Also cheap and safe if a hand is free: Goose reads itself (2), threat model (5).

## Rejected, though tempting

- **Dispute evidence pack (seed 3):** nothing proves PayPal's dispute process takes this form, and it reads as a promise about money. The honest slice is "print this order record", which Verify nearly is.
- **Judge-submitted "hall of misses":** publishes strangers' text, needs storage we lack, too slow to review.
- **"Stopped since launch" counter / leaderboard against other guards:** the ledger is in memory, so the count can't be checked; a leaderboard names competitors.

## Status

- 1 The 21 that got through: not started
- 2 Recompute it yourself: not started
- 3 Cart fingerprint spec + vectors: not started
- 4 Open benchmark: not started
- 5 MCP server: not started

## The Lead's picks (Wed Nov 11, 6:45 PM), before any build

Picked, three builders, each its own branch off the live commit `40d7c310`, each with a fresh reviewer, all into the single 6 AM
push only if green:

1. **The 21 that got through + the public test set** (panel picks 1 and 4, one builder, branch `beyond/misses-wall`). Why: it is
   the one thing no other entry will show: the attacks that beat our code, word for word, and what caught them next. Cheapest,
   safest, and fully provable from fixtures already in the repo. The JSON test set ships with it; the runner script is second.
   Wording rule from the fixtures themselves: these sets are "used up as a blind set", so they are published as a public test
   set, never called blind, never called a rate.
2. **Recompute it yourself + the cart fingerprint recipe and test vectors** (panel picks 2 and 3, one builder, branch
   `beyond/fingerprint`). Why: "check us without trusting us." The hash has no key; the claim must say so, and say that PayPal
   holding it in the order is what binds. Called "our recipe", never "a standard". Mounts on Verify this order if that ships,
   on Under the hood with a recorded cart if it does not.
3. **MCP server** (the owner's seed 1, branch `beyond/mcp`). Why: it is the guard where agents live. Built and tested tonight in
   its own folder, with no change to the published package's source; it is NOT published tonight (npm needs the owner's
   two-factor approval), so the site and Devpost may only say "in the repo", never "on npm". First to be dropped.

Not picked: the dispute evidence pack (the owner's seed 3): nothing in the code proves PayPal's dispute process takes this form,
and it reads as a promise about money; "Verify this order" already gives a merchant the facts. A judge-submitted hall of misses
(publishes strangers' text). A "stopped since launch" counter (cannot be checked from an in-memory ledger). Real store listings
as sellers (B3): no-go. The design note says why: the approve and receipt words would name a real store as the payee while every order pays our own sandbox account.

Fillers if a hand is free and the batch is green early: `/llms.txt` + "Goose reads itself", the threat model with its open rows,
a guard-in-CI example.

Also in the same batch, the owner's own two: **"Try the guard in your browser"** (B2) and **"Verify this order"** (B1): reviewed,
fixes in progress (see Status below).

Rule for all of it: the film and the 7:30 AM export are never put at risk; anything slipping is dropped and marked here.

## Status (the Lead updates this)
Updated Wed Nov 11, about 9:30 PM, as the 6 AM batch (`lead13/batch-6am`) was assembled:
- MCP server: built, reviewed, fixed, merged into the batch (`beyond/mcp` at `01dd4af6`). Not published; not on the site.
- Misses wall: built, reviewed, fixed, merged into the batch (`beyond/misses-wall` at `b75803af`): "The 21 that got through" on
  Proof. The downloadable test-set file was dropped tonight: both note sets name real payment apps inside quoted notes, and
  the owner's rule is that nothing names competitors publicly.
- Fingerprint recipe + recompute: built, reviewed, fixed, merged into the batch (`beyond/fingerprint` at `9161d34e`).
- "Verify this order" (the owner's B1): built, reviewed twice, fixed, merged into the batch (`lead13/verify-order` at
  `728ab49a`). `VERIFY_ORDER=off` turns it off without a deploy.
- "Try the guard in your browser" (the owner's B2): built, reviewed, re-checked, fixed, merged into the batch
  (`lead13/try-guard` at `67eb55af`), on Builders.

All five are in `lead13/batch-6am` with goose-suggests, the polish fixes, the survive-judging notes and the trust-pack repair.
Nothing is pushed until one local CI run passes on the final commit.
