# Survive judging: the risk register (Wed Nov 11 to Mon Dec 21, 2026)

The short, current, action-ordered version. Depth lives in [`alive-through-judging.md`](alive-through-judging.md) (Nov 5);
this file does not repeat it, it ranks it and adds what that one missed (AG's real expiry behavior, the certificate date,
the AI spend-cap errors, Render's limits, the weekly check script). Written by Claude, Wed Nov 11, from the code at
`e56d7de5` (live: `/api/health` on Nov 11 reports that same commit). No `.env` was opened; only `.env.example`.

Status words: **SAFE-TONIGHT** (small, tested, off the money path, done on this branch), **NEEDS-JOSHUA** (account, billing,
email, key), **WATCH** (nothing to change; run the check). Judging runs Dec 1 to Dec 15; we keep everything alive to
**Mon Dec 21, 2 PM PT** (alive-through-judging, "What the live rules say", item 11). After the Nov 12 deadline a deploy is an edit.

## The register (most likely and most damaging first)

| # | What could break | When | What a judge would see | How we would know | Fix or fallback | Who | Status |
|---|---|---|---|---|---|---|---|
| 1 | **Turso archives the free database after idle days**, or a write keeps failing | Any time from ~Nov 22 if reads do not count as activity | Live mode paused; Approve says "Live mode is paused"; the recorded demo still works | `/api/health` shows `"paused":true`, `"store":"unreachable"` or `"turso-retrying"`, or `"db":"failed"`; UptimeRobot monitor 2 (`"paused":false`) | The keep-alive read is built (`keepAwake`, `server/src/store.ts`), but whether Turso counts a read as activity is **not verified** (turso.tech/pricing, read Nov 11, states no archive rule; alive-through-judging §3c quotes the Nov 5 docs). Backstop: one real run every 7 days. If archived: `turso group unarchive`, then Render **Restart service** (a restart, not a deploy) | Joshua: UptimeRobot monitor 2 (steps below); one run each Wed (Nov 18, 25, Dec 2, 9, 16) | NEEDS-JOSHUA |
| 2 | **AG Studio trial licence ends** (key prints Dec 20) | The gate shuts at the start of Dec 20 UTC = **Sat Dec 19, 4 PM PT**; Dec 20 and 21 are on the fallback | Behind the scenes opens the AG Grid **Community ledger** (our own view), not Studio. No watermark, no banner | `scripts/licence-expiry-walk.ts` (the walk across the cut-over); `core/test/studio-gate.test.ts`, `rehearsal-expiry.test.ts`; the key's real printed date is **not verified** (see §A) | A safe fallback **already exists** (`core/src/view/studio-gate.ts`, `web/src/studio/pick.ts`): Studio is never instantiated past the date. Optional: ask AG for an extension (appendix) so Studio stays on through Dec 21 | Joshua: send the appendix email by Nov 14 (optional). Lead: run the walk once on the live build's twin (not a deploy) | NEEDS-JOSHUA (email) / WATCH (walk) |
| 3 | **Anthropic credit or Console spend limit reached** | Whenever balance or monthly limit runs out; a month boundary (Dec 1, 00:00 UTC) resets a monthly limit | The haggle falls back to the plain rule, labeled "The AI call failed, so a plain rule made this move."; the Challenge reader says "code's verdict stands alone". Nothing clears that would not have cleared anyway | Console usage page; there is **no alert in our code** for a dead key. A judge round with `"buyer"` still `claude-haiku-5-5` in health does not prove the key works | Code already degrades (all clients `maxRetries: 0`, 1.5 s move budget, `server/src/adapters/claude.ts`). Set the Console limit above the Dec 1 to Dec 21 need and top up (§C) | Joshua, by Nov 30 | NEEDS-JOSHUA |
| 4 | **Render deploy of a bad or unwanted commit** (auto-deploy on every green push) | Any push to `auto/m2-attacks-blocked` after Nov 12 | The linked material changes under judging (rules: do not edit after Nov 12) | Compare `/api/health` `commit` with the last intended SHA | Turn **Auto-Deploy Off** after the final deploy (alive-through-judging §5 item 4) and push nothing to that branch. `render.yaml` keeps `checksPass`, and a Blueprint sync may turn it back on, so re-check the toggle | Joshua, once, the evening of Nov 11 or Nov 12 AM | NEEDS-JOSHUA |
| 5 | **Render instance is restarted** (deploy, Render maintenance) | Any time; Starter is always on but is restarted by Render now and then | A cold few seconds. Prerendered pages and the recording keep showing; live mode says it is waking | `/api/health`; UptimeRobot monitor 1 | Plan is **Starter** in `render.yaml` (always on, never spins down; the Free tier spins down after 15 idle minutes with about a minute to wake, render.com/docs/free, read Nov 11). Single process only; do not scale past one instance (`weekStop` is in memory) | WATCH | WATCH |
| 6 | **Render billing**: card declined or a monthly bandwidth overage | Monthly, Dec 1 | Site suspended or stopped | Render's billing email; `/api/health` not answering | Keep a working card; look at **Billing, Monthly Included Usage** once before Dec 1 (Render publishes no numbers on its Free-limits page: bandwidth and build-minute allowances are **not verified**; render.com/pricing gave no numbers to a fetch on Nov 11) | Joshua, by Nov 28 | NEEDS-JOSHUA |
| 7 | **TLS certificate on onrender.com** | Cert read on Nov 11 ends **Sun Dec 20, 23:04 GMT** (the issuer is named in the certificate; served via Cloudflare), one day before winners | Browser "not secure" warning, a dead site | `sh scripts/weekly-check.sh` prints days left (fails under 2, warns under 10) | Render says it renews automatically before expiry (render.com/tls docs, read Nov 11), but gives **no renewal lead time**. If the cert still ends Dec 20 on Dec 14, ask Render support from the dashboard | WATCH; Joshua only if Dec 14 shows it unchanged | WATCH |
| 8 | **Channel3 live prices stop** (credits spent, key rejected) | When 10,000 total calls or the key's credits run out | "Real prices" shows the recording, labeled "Recorded Nov 5 · not live". After **Fri Dec 25** the panel shows nothing | `/api/prices?q=…` `notLive` field (spends one credit; not in the weekly check); Render logs `channel3: live search failed` | Built: 200 calls a day, 24 per address, 10,000 in all, recording fallback (alive-through-judging §3a). Whether the 20,000 hackathon credits expire before Dec 21 is **not verified** (channel3.com/pricing returned 404 on Nov 11) | Joshua: look at the Channel3 balance on Dec 1 | NEEDS-JOSHUA |
| 9 | **Public repo goes private or is renamed; the npm package is unpublished; the video goes Private or Unlisted** | Any time (an accident, a settings change) | Dead links; the rules need a public repo and a Public video | `sh scripts/weekly-check.sh` (repo 200 signed out, npm 200, video via oEmbed with `VIDEO_URL`) | Do not touch settings. If broken: Settings, General, Change visibility; YouTube Studio, Visibility, Public | WATCH; Joshua fixes | WATCH |
| 10 | **GitHub Actions minutes run out on the private repo**, so no green `check` and no deploy | December (the minutes reset monthly) | Nothing visible; the site stays on the last green build. A needed hotfix could not auto-deploy | `gh run list --branch auto/m2-attacks-blocked`; GitHub billing email at 90% | By design a missing check means no deploy (safe). Included usage is a dollar amount (about 2,000 Linux minutes by our arithmetic; docs.github.com about-billing page, read Nov 11, gives "$12" not minutes). Public-repo runs are free. Emergency path: Render Manual Deploy only after `ci-local` passes on that SHA | WATCH | WATCH |
| 11 | **PayPal sandbox outage or slow answers** | Any time | A cart says "Could not place the order with PayPal. Nothing was charged." (502, `server/src/main.ts` ~L1077); each PayPal call times out at 10 s (`PAYPAL_TIMEOUT_MS`, `trust/src/paypal.ts`); the wallet says "the server isn't answering, so PayPal can't open" | Weekly check cannot see PayPal. Hand test: replay a week, press Approve once | No fix: nothing pays when PayPal fails (closed). The recorded Approve picture stays. Judges need a sandbox buyer (alive-through-judging "For Joshua", last bullet) | Joshua: decide on a test buyer login for the testing instructions (his account, his call) | NEEDS-JOSHUA |
| 12 | **PayPal sandbox app secret rotated, or the sandbox app deleted** | Only if someone acts | "PayPal disabled"/sandbox keys not configured; carts refused | Health `"paypal":false` | Never rotate or delete before Dec 21; rotating also voids wallet cookies. PayPal's sandbox page (developer.paypal.com/api/rest/sandbox, read Nov 11) says **nothing** about credentials or test accounts expiring: **not verified**, so one Approve on Dec 14 is the proof | Joshua: one Approve in the sandbox on Dec 14 | WATCH |
| 13 | **PayPal webhook stops arriving** | If the sandbox webhook URL or `PAYPAL_WEBHOOK_ID` changes | Nothing visible to a judge. Webhook rows only add evidence lines to the ledger; the server verifies each signature with PayPal and answers 503 when the id is unset (`/api/paypal/webhook`) | Render logs `webhook:`; no health field | Webhooks **are** used (signed, capped, deduped). Do not change the URL. Not on the pay path | WATCH | WATCH |
| 14 | **Date-dependent copy** | Dec 1 to Dec 21 | Footer "November 2026" (true, a made-for date); push notice "Deleted … on Dec 22" (after judging); `nextDec20` demo gift "needed by" next Dec 20 turns 2027 after Dec 20 (low); recorded "Nov 4 set" labels (dated, honest). "This week" strings mean the **recorded demo week**, not the calendar | A pattern search of `web/src`, `core/src` (Nov 11; a differently worded date could be missed) | Nothing to change. Not a judge-visible lie | WATCH | WATCH |
| 15 | **Tests that go red on a later push** (clock) | A push after Dec 25 (Channel3 recording window of 50 days) or around Dec 20 (studio gate) | `pnpm check` red, so no deploy | Most tests pin fixed dates (`Date.UTC(2026, 10, …)`); 20 test files read the real clock (`Date.now()`/`new Date()`), not individually audited. The channel3 window and studio gate tests use fixed `T0`, not today | Push nothing after Nov 12 (item 4), so this should not bite. If a hotfix is ever needed after Dec 20, expect to read the first red test | Lead | WATCH |
| 16 | **GitHub Pages backup** is not set up | Now | `https://gilded-goose.github.io/gilded-goose/` answered **404** on Nov 11 (runbook step 6 is optional and not done) | The weekly check does not hit it | Optional: runbook step 6 (Settings, Pages, Source GitHub Actions; run the `pages` workflow). If the Pages link is not on the Devpost entry, nothing is lost | Joshua, optional, Nov 12 AM | NEEDS-JOSHUA |
| 17 | **Dependencies drift** | Never by themselves | Nothing | `pnpm-lock.yaml` plus `install --frozen-lockfile` in `render.yaml`'s build and in CI; `ag-studio` is pinned at 3.0.0 and `web/studio-licence.ts` throws if AG's `@internal` licence API changes | Nothing to do while nothing is pushed | WATCH | WATCH |
| 18 | **No tool to run the weekly check in two minutes** | Now | n/a | `scripts/weekly-check.sh` | Added on this branch (commit below), tested live | Lead | SAFE-TONIGHT (done) |
| 19 | **The order lookup (`#/verify`, `GET /api/verify/:id`) misbehaves or is abused** | Any time after the 6 AM batch | A wrong or noisy answer on the Verify page | A report, or odd lookups in Render's logs | `VERIFY_ORDER=off` in Render's environment turns the order lookup off without a deploy (404, no order read, no PayPal read) | Joshua | WATCH |

## A. AG Studio in detail (row 2)

- **Where it is used.** `web/src/studio/pick.ts` chooses Studio or the Community ledger (`web/src/SessionLedger.tsx`) with
  `studioAllowed()` from `core/src/view/studio-gate.ts`. The key is `VITE_AG_STUDIO_LICENSE`, read at **build** time on
  Render (`render.yaml`), shipped in the bundle as AG intends. `web/studio-licence.ts` turns AG's own answer into build
  facts, and the browser compares them with the clock.
- **What an expired or missing key does at runtime (verified in the installed package, not assumed).** In
  `ag-studio@3.0.0`'s own code (`dist/package/main.esm.mjs`, licence manager, read Nov 11): a trial key past its date
  produces the watermark text "Trial Period Expired" and a console banner ("Your trial only license … expired on …,
  please email info@ag-grid.com to purchase a license"); a missing key on a non-AG-website host gives a "For Trial Use
  Only" mark and a console message; an invalid key gives "Invalid License". The component keeps rendering: it is a
  watermark plus console output, not a shutdown. AG's public licensing page
  (ag-grid.com/javascript-data-grid/licensing, read Nov 11) says a missing key shows "a watermark and an error message in
  the console" and says **nothing** about expired trial keys, so the package code is the evidence.
- **What Dec 20 and 21 look like.** Our gate never lets AG draw that mark: from the start of the printed expiry day (UTC),
  Behind the scenes mounts the **Community ledger** and Studio is not loaded. Nobody sees a watermark; judges see the ledger
  view. The home page's "See it live in AG Studio" link is also removed by the same date (`__STUDIO_UNTIL__`). The walk
  script checks exactly this across the cut-over.
- **Not verified.** The date the real key prints. The served bundle's expiry words were not found by my search of three
  entry chunks, so confirm with the runbook's step 13 (the Lead reads the served bundle's expiry words). If the key
  prints **22 December 2026** rather than 20 December, Studio stays through Dec 21 and the fallback is not needed. If it
  prints earlier than Dec 20, the fallback starts earlier, which is still safe.
- **The "smallest safe fallback"** already exists; nothing to add. Do not change it after Nov 12.

## B. Render (row 5, 6)

Plan: `starter` (paid, always on). Free-tier facts for comparison (render.com/docs/free, read Nov 11): spin down after 15
minutes with no inbound traffic; about one minute to wake; 750 free instance hours a month per workspace; bandwidth and build
minutes are billed against "monthly included amounts" with no numbers on that page. Deploy on push: yes, but only after
all GitHub checks pass (`autoDeployTrigger: checksPass`). A judge's first click after a restart: the prerendered page
(`web/prerender.ts`) and recordings load; live actions say "waking up"; the rule and recorded demo do not need the server's
AI. UptimeRobot (docs/ops/uptime.md §A) pings `/api/health` every 5 minutes.

## C. Anthropic spend, in the code and at the vendor (row 3)

- **Vendor behavior (platform.claude.com/docs/en/api/rate-limits, read Nov 11).** The organization's monthly spend cap
  returns HTTP **429** `rate_limit_error` with `enforced_spend_limit_reached` and **no** `retry-after`; a spend limit **you**
  set returns HTTP **400** `invalid_request_error` ("You have reached your specified API usage limits"). Rate limits
  return 429, sometimes with `retry-after`. Our clients use `maxRetries: 0`, so a dead key costs one fast failure per
  call, not a retry storm.
- **Our own caps (all kept in Turso, so a restart does not reset them):** live haggles `LIVE_HAGGLE_CAP` 1,000 a day
  (30 per address, 10 per browser); judge, Ask and scammer share `LIVE_AI_CAP` 200 a day; control 300 a day; view
  100 a day (inside the judge count); desk reader 300 a day. The buyer races 3 identical Haiku calls per move
  (`BUYER_RACE = 3`), so one haggle is several calls. There is **no single ceiling across all features**, and no monthly
  total in code. Converting this to dollars needs the model's price: **not verified**.
- **Smallest safe addition.** The Console's **monthly spend limit** is the right layer (not code, not money path). A code-level
  all-features ceiling would touch many call sites for a worse guarantee, so I did not build it. Joshua sets the limit.
- **Tests that cover the fallbacks:** `core/test/haggle.test.ts`, `market.test.ts`, `recorded.test.ts` and
  `r12-offline-live.test.ts` contain the "AI call failed" wording; `abuse.test.ts` and `s-keep-awake.test.ts` cover the
  caps and the store. No test names an Anthropic 429 or a credit-exhausted response specifically; failure there is "any
  thrown error becomes the labeled rule fallback".

## Appendix: email to AG Grid (Joshua sends it from his own mail; draft only)

To: `info@ag-grid.com` (the address AG's own licence banner gives for trial and licence questions).
Subject: Hackathon trial key: request to extend to Dec 22, 2026

> Hello AG Grid team,
>
> I'm a student entering the PayPal AI Hackathon on Devpost with a project called Gilded Goose
> (https://gilded-goose.onrender.com). It uses AG Grid, AG Charts and AG Studio, and AG Studio is the "Behind the scenes"
> view. My AG Studio trial key ends on December 20, 2026. The hackathon judging runs December 1 to 15 and winners are
> announced on December 21, and the rules ask us to keep the project working until then.
>
> Could you extend the trial key, or issue a hackathon key, so it stays valid through December 22, 2026? If you can, I
> would just replace the key in my hosting settings. If an extension isn't possible, no problem: the site falls back to
> the AG Grid Community ledger on its own with no watermark.
>
> Thank you,
> Joshua Javier

## Joshua's list (only what you alone can do, in order)

1. **By Wed Nov 11 night / Thu Nov 12 AM:** Render dashboard, gilded-goose, Settings, Build & Deploy: set **Auto-Deploy to Off** after the final deploy. (Row 4.)
2. **By Thu Nov 12 AM:** UptimeRobot monitor 2: keyword `"paused":false`, alert when it does **not** exist, name `Gilded Goose live mode`, 5 minutes (docs/ops/uptime.md §A steps 3 to 10). (Row 1.)
3. **By Thu Nov 12, 12 PM PT:** the Devpost entry, your two role lines, and the Channel3 setting if you want live prices (alive-through-judging §5).
4. **Calendar, each Wed from Nov 18 to Dec 16:** one real Approve run on the live site (keeps Turso written to). (Row 1.)
5. **By Nov 14:** send the appendix email to AG Grid (optional; the fallback already covers a no). (Row 2.)
6. **By Nov 30:** Claude Console, Settings, Limits: set the monthly spend limit to at least 21 times your busiest day so far, and keep the balance topped up. (Row 3.)
7. **By Nov 28:** Render, Billing: working card, and look at Monthly Included Usage. (Row 6.)
8. **By Dec 1:** Channel3 dashboard: check the credit balance is at least 10,000. (Row 8.)
9. **Dec 14:** one sandbox Approve as a buyer to prove the PayPal app still works; if the weekly check says the certificate still ends Dec 20, contact Render support. (Rows 7, 12.)
10. **Optional, Nov 12 AM:** GitHub Pages backup, runbook step 6. (Row 16.)
11. **Only if needed:** `VERIFY_ORDER=off` in Render's environment turns the order lookup off without a deploy (404, no order read, no PayPal read). (Row 19.)

## Weekly check (two minutes)

Run every Wednesday from Nov 18 (and the day before Dec 1, Dec 15 and Dec 21). Nothing here signs in or spends credit.

1. `sh scripts/weekly-check.sh` : health (`ok`, `store:turso`, `db:ok`, `paused:false`, sandbox), home and `/goose.html` 200, public repo and npm package open signed out, certificate days left. Add `VIDEO_URL='<the YouTube link>'` to include the video check.
2. `curl -s https://gilded-goose.onrender.com/api/health` : the `commit` is still the one you last deployed (nothing slipped through).
3. `gh run list --branch auto/m2-attacks-blocked --limit 3` : no new runs after the freeze, and the last one green.
4. Open `https://gilded-goose.onrender.com/?desk=studio` : Studio until Dec 19, 4 PM PT, the ledger after; no AG watermark either way.
5. Open the UptimeRobot dashboard: both monitors green, no downtime since last week.

Questioned: I assumed the Render dashboard matches `render.yaml` (I cannot read it), that the `ag-studio@3.0.0` code I read is
what is bundled live, and that the key's printed expiry is Dec 20 (from the older doc, not re-read from the live bundle). I
did not spend a Channel3 or Anthropic call, I did not run the licence walk, and I checked only a handful of vendor pages;
every "not verified" above is a real gap, not a guess.
