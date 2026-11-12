# Keeping Gilded Goose up through Dec 21

Written by Claude for the launch (our launch checklist, §6). Two jobs only Joshua can do, because each needs an account or money, plus how
the Lead checks every deploy afterwards. Nothing here goes in the repo: no keys, no passwords, no emails.

## Why both, and why the ping alone already helps

- Render's **Free** instance spins down after 15 minutes with no incoming request. The next visitor then waits about a
  minute while it starts (Render shows its own "waking up" page for that, which we can't style), and the instance's
  disk is wiped on each restart.
- A request every **5 minutes** is incoming traffic, so the 15-minute idle timer never runs out and the instance never
  spins down. **The UptimeRobot ping alone stops the cold start**, even before the upgrade.
- The ping doesn't make Free reliable, though. Free instances can still be restarted by Render at any time, and a
  workspace gets **750 free instance hours a month**. An always-awake service uses about 744 of them in a 31-day month
  (December has 31 days), so a second free service in the same workspace could use them up and get the site suspended.
  The **Starter** instance is always on, never spins down, and doesn't count against those hours. That's why we do both.
- Starter does **not** keep the disk: without a paid persistent disk, a deploy or restart still clears what the server
  holds in memory or on disk (today's caps, the run library). The upgrade fixes sleeping, not that.
- `/api/health` is cheap and writes nothing. It answers from in-memory state: no cookie, no cap counted, never cached
  (`cache-control: no-store`). `core/test/r-deploy.test.ts` pins that. Pinging it every 5 minutes costs nothing.
- Since Nov 5 it also keeps Turso awake. A check may start one read-only `SELECT 1` in the background, at most one a
  minute, and says how the last one went: `"db":"ok"`, `"failed"`, or `"checking"` for the first minute after a start
  (`keepAwake`, `server/src/store.ts`; `core/test/s-keep-awake.test.ts`). Health never waits for that read, so a slow
  Turso can't make Render's 5-second health check fail, and a failed read never pauses live mode. Turso's free plan
  archives a database after 10 days of inactivity. Their docs don't say whether a read counts as activity, so
  `docs/launch/alive-through-judging.md` §3c keeps a real run every 7 days as the backstop.

## A. UptimeRobot Free (no card): about 5 minutes

1. Open <https://uptimerobot.com> and choose **Register for FREE**. Sign up with your email; you type the login
   yourself. Don't enter a card. If any screen asks for one, stop: that's a paid plan.
2. Confirm your email from the message UptimeRobot sends, then sign in.
3. On the dashboard, click **+ New monitor**.
4. Set **Monitor type** to **Keyword**. A keyword monitor fails when the page loads but says something wrong, which a
   plain HTTP monitor would miss.
5. **URL to monitor**: `https://gilded-goose.onrender.com/api/health`
6. **Keyword**: `"ok":true` (with the quotes, exactly as written). Set the alert to fire when the keyword **does not
   exist**. Leave case sensitivity off.
7. **Friendly name**: `Gilded Goose health`.
8. **Monitoring interval**: **5 minutes**. That's the Free plan's shortest, and it's what keeps the Free instance awake.
9. **How to get alerted**: tick **E-mail** with your own address, the one you signed up with.
10. Click **Create monitor**. Within 5 minutes the monitor should turn green (**Up**).
11. Optional check that alerts work: in the monitor's settings, change the keyword to `"ok":false` and save. You should
    get a **Down** email within about 10 minutes. Then change it back to `"ok":true` and save.
12. Tell the Lead "UptimeRobot is up". The Lead ticks the box on our launch checklist, §6.

## B. Render: Free → Starter (the cheapest always-on type)

1. Sign in at <https://dashboard.render.com> (you type the login).
2. Open the **gilded-goose** web service.
3. Go to **Settings**, then **Instance Type**. It's also linked from the service's **Upgrade** button.
4. Pick **Starter** (0.5 CPU, 512 MB). It's the cheapest paid type, and any paid type stays on.
5. **Check the price on that screen before you confirm.** We couldn't read it on render.com/pricing (Sat Oct 31). It
   was about **$7 a month**, charged per second while the service exists. If the screen shows a different number, or
   asks for a card you don't want to add, stop and tell the Lead.
6. Confirm. Render redeploys the service on the new instance, which takes a few minutes. The site stays up through it.
7. Tell the Lead "Render is on Starter". The Lead then changes `plan: free` to `plan: starter` in `render.yaml`, so a
   Blueprint sync never moves it back to Free. That edit only happens after your upgrade, never before.
8. To stop paying after Dec 21, go back to **Instance Type** and choose **Free**, or delete the service.

## C. Once, after the next deploy: the build's carry step ran

The site keeps the previous release's files after a deploy (`scripts/carry-assets.ts`, run by `render.yaml`'s build
command). This only works if Render uses the build command in `render.yaml`.

1. After the next push is live, the Lead runs `corepack pnpm postdeploy`, which runs both checks below.
2. If it reports `[carry] … /release.json: missing`, Render is using an older build command saved in its settings.
   Then, Joshua:
   1. Open the service's **Settings**, then **Build & Deploy**, then **Build Command**.
   2. Set it to the `buildCommand` line in `render.yaml`, word for word.
   3. Save, then **Manual Deploy → Deploy latest commit**.

## E. Deploys wait for GitHub's check (Joshua, Thu Nov 5 5:15 PM §1c)

Render deploys a commit only after all of its GitHub checks pass. `render.yaml` sets `autoDeployTrigger: checksPass`,
the Blueprint field for the dashboard's **Auto-Deploy: After CI Checks Pass** ([render.com/docs/blueprint-spec](https://render.com/docs/blueprint-spec)).

What "checks" means to Render ([render.com/docs/deploys](https://render.com/docs/deploys), "Integrating with CI"):
- **All of the commit's checks**, not one. Here that's `check` (every push to `auto/m2-attacks-blocked`) and `pages`
  (only when the Pages mirror's files change; its deploy job is skipped off `main`). A check counts as passed when it
  ends in success, neutral or skipped.
- **Zero checks: no deploy.** The same goes for one red check, or a push while GitHub Actions can't run (minutes used
  up). The site then stays on the last green build, which is the safe way to fail. To ship anyway, use **Manual Deploy →
  Deploy latest commit**, only after `ci-local.sh` passes on that SHA. Never use "Deploy a specific commit": Render's docs
  say it turns auto-deploys off.

Does the `render.yaml` line reach the live service on its own? Only if the service is managed by a Blueprint with
**Auto Sync** on. Then "Render automatically updates affected resources every time you push Blueprint changes to your
linked branch" ([render.com/docs/infrastructure-as-code](https://render.com/docs/infrastructure-as-code)). What we can
see from outside says it is:
- The service was made with **New → Blueprint** (the steps in `render.yaml`'s header).
- Two changes made only in `render.yaml` took effect on live: the Oct 28 build fix (`c1f3d27e`), and the Oct 31 carry
  step (`e22c781a`). Live serves `/release.json`, which only that newer build command writes, and no note records a
  dashboard edit.

That is strong, not proof. The dashboard is the proof, and only Joshua can open it.

**Joshua, once (about 2 minutes, after the Lead says this change is live):**
1. Sign in at <https://dashboard.render.com> (you type the login).
2. Open the **gilded-goose** service, then **Settings**. Find **Auto-Deploy** under Build & Deploy.
3. If it says **After CI Checks Pass**: done. Tell the Lead "Auto-Deploy is After CI Checks Pass".
4. If it still says **On Commit**: under Auto-Deploy, choose **After CI Checks Pass** (click **Edit** first if the field
   is locked), then **Save**. Change nothing else on that page. Then tell the Lead it said On Commit, so the Lead knows the Blueprint isn't syncing and
   other `render.yaml` edits don't reach live on their own.

**The Lead, on the next push after it's live:** compare live `/release.json`'s `built` time with the end of that SHA's
`check` run (`gh run list --branch auto/m2-attacks-blocked`). After the change, `built` comes after the check's end. Before it,
de4ff56f was built at 01:10:39Z, while its check was still running (it started at 01:09:50Z).

## D. After every push (the Lead)

One command, against the live site, once Render shows the new deploy as **Live**:

```sh
corepack pnpm postdeploy
```

It runs both checks against `https://gilded-goose.onrender.com`. To check another address, pass it:
`corepack pnpm postdeploy https://…`.

- `scripts/postdeploy-check.ts` checks every route in the launch checklist and every asset each one loads,
  recursively. Each must answer 200. It also checks that HTML is `no-cache`, hashed assets are `immutable`, unknown
  paths are real 404s, and every file in `/release.json` (including the carried ones) answers 200.
- `scripts/console-sweep.ts` opens every route at 1440 and at 390 with one short interaction each (the menu, a Desk run
  to its verdict, one ledger row). It fails on any console error, page error, failed request or empty state box.

The Desk run is one live ask at each width (two AI calls a push). While live mode's caps are spent, or to save them,
run the sweep without it: `corepack pnpm postdeploy:console https://gilded-goose.onrender.com --skip-run`.

Either one failing means the deploy isn't done. Each failure is listed with its route, width and the exact URL or error.

Then the same push in Safari's engine (about 3 minutes; once per Mac, `corepack pnpm exec playwright install webkit`):

```sh
corepack pnpm postdeploy:webkit
```

`scripts/webkit-walk.ts` walks the menu, the judge's first move (from a cold landing: Menu, then Try to trick Goose,
until the note box is in view and takes focus, timed, within 3 s), the landing's real-price range and the judge tour's
12 stops in Playwright's WebKit, as an iPhone 13 at 390x844 and as Desktop Safari at 1440x900. At each stop the pill must name the stop and sit
inside the window, no text may stay invisible once the fades end, stop 02's waiting ask must show its end, and no
console error may come from our own origin. It is GET-only in code: any other request to the site is aborted and fails
the walk, and it presses only the tour's own buttons and the menu, so the challenge's counter never moves (it prints the
counter before and after). Last it times every route and room cold at 390 by the Chromium drill's own code
(`ENGINE=webkit MODE=phone node scripts/cold-routes.ts`): every largest paint and room head within 1 s, each room's own
largest paint printed beside it. WebKit can't throttle, so these are a Mac's numbers with an iPhone's user agent, never a
phone's; `--skip-cold` leaves them out. Another address or a folder for stills: `corepack pnpm postdeploy:webkit https://… /path/to/stills`.
A FAIL exits 1; a missing WebKit exits 2. To prove it can fail, `corepack pnpm postdeploy:webkit --control` half-fades
the pill, hides the note box, scrolls stop 02's ask back to its start and tries one write (aborted in the browser): it
passes only when every one of those rows goes red. It can't see a real iPhone's sliding toolbar: that stays a phone look by hand.

## F. What each service costs, what runs out, and when (Joshua, Thu Nov 5 6:40 PM)

Joshua's yes (his message, Thu Nov 5 6:40 PM): live stays up and free for judges through
Dec 21. One row per service. A price is from the provider's own page where we could read it (fetched Thu Nov 5);
anything only an account shows says **Joshua's dashboard shows it**. Nov 5 to Dec 21 is 47 days, counting both.

| Service | Plan / tier | Cost a month | What runs out, and when | What live does then |
|---|---|---|---|---|
| **Render** (the server) | Starter, 0.5 CPU, 512 MB (`render.yaml` `plan: starter`) | about **$7**, charged per second ([render.com/pricing](https://render.com/pricing) didn't render its numbers to us on Oct 31 or Nov 5; §B step 5); Nov 5 to Dec 21 about $11. Joshua's dashboard shows the bill | Nothing, while the card on file pays. A failed card is the only way it stops | Stays up. Back on Free it would sleep after 15 idle minutes, which the ping (§A) prevents |
| **Anthropic API** (every live AI call) | Joshua's Console workspace, prepaid balance and a monthly spend limit | Haiku 5.5 **$0.10 / $0.50** per million input / output tokens, **$0.50 / $2.50** for a prompt over 100K tokens; Sonnet 5.5 **$2 / $10** ([platform.claude.com/docs/en/about-claude/pricing](https://platform.claude.com/docs/en/about-claude/pricing)). Worst case at our caps **$23.40 a day** (math below). The balance, the limit and any expiry: Joshua's dashboard shows it | The balance, or the month's spend limit, whichever comes first. The limit starts again on the 1st | The API refuses each call, so each route takes its failed-call path: a haggle move that gets no answer is the labelled rule move, and the judge box, Ask, the reader and the photo read fall back to their rule (README: "Each runs behind a timeout and a fallback rule"); the View answers with its rule, labelled (`server/src/view.ts`); the scammer AI replays a kept note. Nothing pays without the shopper's tap either way |
| **Turso** (caps, runs, sessions) | Free: 100 databases, 5 GB, 500 million rows read and 10 million rows written a month ([turso.tech/pricing](https://turso.tech/pricing)) | **$0** | Any one of those limits, in a month. Turso's FAQ: going over any one blocks the databases until an upgrade. The keep-alive's one read a minute is 67,680 reads in 47 days, far under 500 million. Writes (saved cap counts, runs, sessions) aren't measured here: Joshua's dashboard shows the real use | `/api/health` shows `store: turso-retrying`, then `unreachable`. What each route does then isn't covered by this table |
| **Channel3** (J3's live search, and P's price watch if it ships) | Free: 1,000 credits a month, plus the 20,000 from the promo code `PAYPAL-HACKATHON-2026`; one key, so **one balance** for both | **$0** at our caps. Past the free credits $0.007 a credit ([channel3.ai/docs/pricing](https://channel3.ai/docs/pricing): `/search` 1 credit, `/products` free). The balance, and whether the promo credits expire: Joshua's dashboard shows it (Channel3's billing FAQ doesn't say) | J3's own count: at most 200 searches a UTC day, 24 a visitor, **10,000 in all**, saved before each call. Both on together still last to Dec 21 (below) | J3: the panel shows the recording, labelled "recorded Nov 5", never "live", and blank after Dec 25 (`RECORDED_MAX_DAYS` 50). The watch: a row keeps its last read and says when it was |
| **AG Studio** (the Behind-the-scenes widgets) | A trial licence key (`VITE_AG_STUDIO_LICENSE`, read at build time) | **$0** (trial). AG's pricing page shows no tiers (read Nov 5, our build notes) | The trial, **Sun Dec 20**. Our gate closes first, **Sat Dec 19, 4 PM PT** (our lead agent, Nov 5) | The Community (MIT) ledger, which we checked, carries Dec 19 to 21. Nothing to pay or renew |
| **PayPal** (payments) | Sandbox app (`PAYPAL_ENVIRONMENT: sandbox`) | **$0**: sandbox money isn't real | Nothing we know of. Joshua's dashboard (developer.paypal.com) shows the app | Stays on sandbox. `/api/health` shows `payment: sandbox` |
| **Whisper `tiny.en`** (speech to text) | Runs in the visitor's browser; the model files come once from Hugging Face | **$0** | Nothing on our side | If the files can't load, the mic doesn't fill the box; typing and the keyboard's own dictation still work |
| **Kokoro** (Goose's recorded lines) | Pre-recorded files we serve | **$0** | Nothing | Lines with a price or a store name use the browser's own voice, as always |
| **UptimeRobot** (the ping, §A) | Free, a 5-minute keyword check | **$0** | Nothing | Without it, Starter still stays on (§B) |
| **Domain** | None: `gilded-goose.onrender.com`, Render's own | **$0** | Nothing | Nothing |
| **GitHub Actions** (the `check` that gates deploys, §E) | Free plan: 2,000 minutes a month for a private repo; free on GitHub's standard runners for a public one ([docs.github.com, Actions billing](https://docs.github.com/billing/managing-billing-for-your-products/managing-billing-for-github-actions)) | **$0** | The private repo's minutes, at the end of a busy month (they start again on the 1st). The public copy (Nov 11) runs free | No check runs, so Render doesn't deploy (§E): live stays on the last green build. No one pushes after the final deploy anyway |

### The AI's worst case a day, at our caps (computed from the code, Nov 5)

A call's output can't pass its `max_tokens` (thinking counts inside it). An input can't pass its byte count (a token is at
least one byte). Every Claude client has `maxRetries: 0`, so a call is sent once. Each cap below is a day count across
everyone, saved across restarts.

1. **The haggles: `LIVE_HAGGLE_CAP` 1,000 a day** (`RUN_DAY_CAP` 1,000 bounds every run as well).
   - A haggle is at most 5 moves (`HAGGLE_ROUNDS`). Each move is 3 raced calls (`BUYER_RACE`); the losers are aborted, but
     we count all 3 in full. That's at most 15 calls.
   - Each call's output is at most 200 tokens (`ClaudeBuyer`). Its input was measured at 1,549 tokens in round 5 (free
     `count_tokens`, Oct 23, our build notes). The prompt and markets have grown since, so
     the ceiling here is 4,000 tokens, a margin of 2.6x. This one line is a margin over a measurement, not a byte bound.
   - One call is at most 4,000 × $0.10/M + 200 × $0.50/M = **$0.0005**. A haggle is at most 15 × $0.0005 = **$0.0075**.
   - **1,000 × $0.0075 = $7.50 a day.** A typical haggle is 2 moves, about $0.0013 (013), so $1.30 a day at the cap.
2. **The shared AI pool: `LIVE_AI_CAP` 200 calls a day.** The judge box's buyer and its reader, Ask, the market maker,
   the photo read, the scammer AI and the View each take one from the same 200 per call.
   - **The View: at most 100 of the 200** (`VIEW_DAY_CAP`). Its input is at most 3,255 bytes of prompt + 65,601 bytes of tools
     + 48,000 characters of conversation (`VIEW_MAX_TOTAL_CHARS`), at most 4 bytes each, so 260,856 tokens. That's over
     100K, so the long-prompt price applies: 260,856 × $0.50/M + 1,500 × $2.50/M = **$0.1342 a call**.
   - **The scammer AI** (Sonnet 5.5, only if `SCAMMER_AI=on`; Joshua's dashboard shows it): the input is the 2,133-byte
     prompt plus a brief code writes, at most 212 bytes over 20,000 draws, so under 2,400 tokens. Output is at most 2,000
     tokens. 2,400 × $2/M + 2,000 × $10/M = **$0.0248 a call**.
   - **Every other call in the pool is Haiku** with at most 600 output tokens and a prompt of 0.9 to 2.5 KB. Even at
     100,000 input tokens (where the long-prompt price starts), one costs 100,000 × $0.10/M + 600 × $0.50/M = $0.0103,
     below the scammer's $0.0248. The photo read, even at 20,000 image tokens, costs $0.0023.
   - So the worst day is 100 View calls + 100 scammer calls = 100 × $0.1342 + 100 × $0.0248 = **$15.90**. With the scammer
     off it's 100 × $0.1342 + 100 × $0.0103 = **$14.45**.
3. **The worst day: $7.50 + $15.90 = $23.40** (with the scammer off, $21.95).
   - Over the 47 days to Dec 21 that's at most **$1,100**: $608 for Nov 5 to 30, $491 for Dec 1 to 21.
   - Every input at its byte ceiling every call, every cap full every day: no real day comes near it. A day where all
     1,000 haggles run at the typical mix and the pool is used in full by the View is closer to $1.30 + $13.42.
   - **The Console spend limit is what really bounds the money**, and it's Joshua's to set. At any limit below the
     ceiling, the AI falls back as in the table's Anthropic row once the month's limit is reached, and live goes on.

### When the Console spend limit is reached: what a visitor sees

The API refuses each call. Every Claude client has `maxRetries: 0`, so a refusal is one failed call, and each route
says so in its own fixed words:

| Where | What the visitor reads | Source |
|---|---|---|
| A haggle move | "The AI call failed, so a plain rule made this move." | `core/src/haggle/words.ts` `fallbackLabel("error")` |
| The judge box (the AI buyer) | the row is labelled "Plain rule (the AI buyer didn't answer)" | `core/src/judge/judge.ts` |
| The judge box (the AI reader) | "The AI reader didn't answer this round, so code's verdict stands alone." | `core/src/judge/judge.ts` |
| Ask Goose | "The AI call failed, so a plain keyword rule read your words; code checked every chip." | `core/src/ask/ask.ts` |
| A photo's price tag | "The AI call failed, so this photo wasn't read. Try again, or type it." | `core/src/ask/copy.ts` |
| A made-up market | "Goose couldn't build a market for that; try rewording." | `core/src/ask/fictional-market.ts` |
| The View | the rule answers, ending "No AI call: a fixed rule read your words." | `server/src/view.ts` |
| The scammer AI (if on) | "The scammer AI couldn't run just now. Your own note still works." | `core/src/judge/attempts.ts` |

**Nothing on the money path changes.**
- `server/src/adapters/claude.ts` is imported only by `server/src/main.ts` and `server/src/view.ts`, for the routes
  above. Approve, capture, void and refund call PayPal's sandbox and the guard, never Claude.
- A rule move passes the same Watcher and guard as an AI move. A cart still waits for the shopper's own tap on Approve,
  inside the same limits.
- One thing to know: the caps are taken before each call, so refused calls still use up the day's counts. Over the
  limit, live shows the rule more each day, and the money limit is never passed.

### Channel3: J3 and the price watch on the same 10,000-credit plan

- **Same balance.** Both read `CHANNEL3_API_KEY`, so they draw on one account. J3 searches (`/v1/search`, 1 credit
  each). The watch reads one product (`GET /v1/products/{id}`), which Channel3's pricing page lists as **free**.
- **What each cap allows a day.**
  - J3: 200 searches a UTC day, 24 per visitor, and **10,000 in all**, every count saved before the call.
  - The watch: at most 20 reads a day for the whole site (`PRODUCT_READS_PER_DAY`), 5 per browser, 10 per address, and
    once a day per watch.
  - The watch is on a feature branch (`track-p/your-price`, `server/src/adapters/channel3-product.ts`), not on the deploy
    branch yet. It reads nothing unless `CHANNEL3_WATCH=on` is set in Render.
- **Both on, to Dec 21.**
  - J3: at most 47 × 200 = 9,400 credits; its 10,000 all-time cap stops it before that matters.
  - The watch: 0 credits by Channel3's page. Even if every read were billed, 47 × 20 = 940.
  - Together that's at most 10,340 credits, against 20,000 promo credits plus 1,000 free each month. Both on still last to
    Dec 21 with about half to spare, so **nothing needs lowering**.
  - This holds as long as the promo credits are on the account and don't expire before Dec 21, which only Joshua's
    dashboard shows. Before J3, the panel's old 100-a-day cap may have spent some credits already; the dashboard shows
    that too.
- **Decided by default:** turning the watch on doesn't change any cap. Flip if Joshua says: his dashboard shows fewer
  than 11,000 credits left. Then lower J3's `LIVE_CALLS_PER_DAY` to what's left ÷ 47, in code, before he flips the switch.

### Joshua's top-up dates

1. **Now, before the Nov 11 launch:** in the Anthropic Console, set the workspace's monthly spend limit to what you're
   willing to spend in November. The ceiling for Nov 5 to 30 is $608; a real month is far below that. Check that the
   balance covers that limit. Check the Channel3 dashboard shows the promo credits, at least 11,000 left, and their expiry.
2. **Mon Dec 1:** the Console limit starts again. Set December's (the ceiling for Dec 1 to 21 is $491) and check the balance
   again. Render bills November's ~$7 to the card on file: nothing to do unless the card fails. Glance at Turso's usage
   page (any limit over blocks the database) and the Channel3 balance.
3. **Sat Dec 19, 4 PM PT:** nothing to buy. The AG Studio gate closes on its own and the Community ledger carries on.
4. **After winners are announced, Mon Dec 21:** Render's Instance Type back to **Free**, or delete the service (§B step 8).
   Lower the Console spend limit to $0, and pause the UptimeRobot monitor.
