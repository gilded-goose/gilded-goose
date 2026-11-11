# Submission, video and staying alive through judging

Joshua's Thu Nov 5, 1:30 PM message, §2e, §2f and §2g. Written by Claude, Thu Nov 5. Docs only: nothing here changes the site.

Every rule below was read again on the live pages on Thu Nov 5:
<https://paypalaihackathon.devpost.com/rules> and the overview page. Every behavior was read in the code at
`b074f4f4`, plus one `GET /api/health` on the live site. No `.env` file was opened: variable **names** come from the
code and `render.yaml`, and no value is written anywhere here.

## What the live rules say that our notes didn't

Our notes from a scout on Oct 22 were written when Devpost refused it. These are the
differences:

1. **The deadline is Thu Nov 12, 12:00 PM Pacific**, not just "Nov 12". Our own target stays Wed Nov 11.
2. **Judging runs Tue Dec 1, 2:00 PM PT to Tue Dec 15, 8:00 AM PT.** Winners are announced on or around Mon Dec 21.
3. **The site must stay free and unrestricted until judging ends.** Rules §4, Testing: "available free of charge and
   without any restriction, for testing, evaluation and use… until the Judging Period ends." That's why §3 of this doc exists.
4. **The video must "show the Project functioning on the device for which it was built."** For us, that's a browser at
   desktop and phone widths.
5. **The trademark rule has a permission clause:** no third-party trademarks, "or copyrighted music or other material
   unless the Entrant has permission."
6. **A required "Tools" field:** "identify which tools (model or AI service) were used and explain how." `docs/devpost.md`
   already has this section ("AI tools used, and how").
7. **Sponsor prizes need nothing beyond use.** Each one says only "All Eligible Submissions that use any [sponsor]
   tools." Section 8 lists no other requirements.
8. **Prize limit, unchanged:** one Grand Prize or one Honorable Mention, **plus** one Sponsor Prize.
9. **The repo:** it must be public, and its open-source license must be "visible at the top of the repository page (in
   the About section)." Ours is MIT (`LICENSE`), which GitHub detects.
10. **Winners are verified:** "identity, qualifications and role… in the creation of the Submission." That's the "roles
    if asked" in §1 below.
11. **The organizers ask for more than the Rules do** (Update 47307, "Submission checklist: it's go time!"):
    - "Keep your demo, test credentials, and any trials or credits active until winners are announced on Dec 21."
    - "After the deadline, submissions are locked. Don't edit your repo, video, or linked materials until after the
      winner announcement."
    - The checklist also says "Sponsor tools selected on the form if you're going for a sponsor prize" and "Teammates
      invited and accepted."

    So the window to keep alive is **through Mon Dec 21, 2:00 PM PT** (Rules §1; the Schedule tab says 9:00 AM PST, so
    we use the later one), not just Dec 15. And the live site is linked material: **every fix in this doc has to be
    on live and checked before Thu Nov 12, 12:00 PM PT.** After that, a restart is fine, but a deploy is an edit.

## 1. Joshua's submission checklist (§2e)

Do these on the Devpost "Enter a Submission" page, signed in yourself. I can't see the form behind the login, so where
a step says "if the form asks", the form decides.

1. **Lucas on the team.** Invite Lucas to the project's team on Devpost. He makes his own Devpost account and accepts
   (his login, not ours). Each member has to be at least the age of majority where they live (§3, Eligibility). The
   person who submits is the team's "Representative" (§3) and receives any prize for the team.
2. **Sponsor prizes: select these three sponsor tools on the form** (that's how Update 47307 says to enter for a
   sponsor prize). We can win only one, but we're eligible for each one we truly use:
   - **AG Grid:** the ledger grid (`ag-grid-community`), the charts (`ag-charts-community`) and AG Studio on Behind
     the scenes (`ag-studio`).
   - **Channel3:** "Real prices" comes from Channel3's search API. Joshua's call (Nov 5, 5:20 PM): call it live, with
     caps (built, §3a). Live needs one Render setting from Joshua first: §3a, "Joshua's steps".
   - **Render:** the live site runs on Render from `render.yaml`.
   - Not the two other sponsor tools: we don't use them, so we don't tick them.
3. **The public repo link.** Make the repo public yourself (this stays your call, final-go never-list), then check that
   the license shows in the About section and paste the link.
4. **The video link.** The YouTube link, uploaded as **Public** (see §2).
5. **The hosted demo:** `https://gilded-goose.onrender.com`, with the judge path (Joshua's §2d).
6. **The Tools field:** paste `docs/devpost.md`'s "AI tools used, and how" section.
7. **Roles, if asked.** One line each, written by you, because the rules check each person's real role:
   - Joshua: ___
   - Lucas: ___
8. **Submit before Thu Nov 12, 12:00 PM PT.** After that nothing on the entry can change (§5).

## 2. The video kit against the rules (§2f)

The kit is `docs/video-kit/README.md`.

| Rule (from the live rules) | The kit today | Verdict |
|---|---|---|
| Less than 3 minutes | "The limit is 2:45" | Passes |
| Shows the project working on its device | Takes at 1440 and 390 on the real site | Passes |
| Uploaded to YouTube and **publicly visible** | The kit doesn't say | **Add:** upload as **Public**, not Unlisted or Private, and keep it Public through Dec 21 |
| No third-party trademarks | Rule 5: "No other company's name… apart from PayPal and **what the site itself shows**" | **A gap**, below |
| No copyrighted music or material without permission | The kit doesn't mention music | **Add:** no music. Or only a track you have written permission to use |

**The trademark gap.** "What the site itself shows" lets real names into the frame, and the rules allow no
exception like that:
- **The `k-real-prices` take shows real store names.** The panel lists real stores' domains: the recording holds 53
  of them, and many are well-known retailers and brands. That's third-party trademarks on screen.
  **Decided by default:** leave `k-real-prices` out of the cut, or blur every store and product name in it. Flip if
  Joshua says: he has permission, or he reads the rule differently.
- **The model's name.** Behind the scenes and the Challenge show which AI moved, by name. The Tools field asks us to
  name it in the text, but the video rule doesn't make that exception. **Decided by default:** the cut avoids frames
  where the model's name is the subject, and shows no other company's logo. Flip if Joshua says: naming the AI we used
  on screen is fine.
- **Sponsors' own marks:** PayPal's sandbox Approve screen and AG Grid's interface are the hackathon's own developer
  tools working in the project, and the rules ask us to show the project working. Keep them as they appear, and never
  add a sponsor's logo as decoration (§11: a sponsor's IP is used "solely to the extent provided for in these Official
  Rules").
- **Any frame with the site's missing-layer section,** which names other companies, stays out of the cut.

## 3. Alive through judging and winners: Nov 12 to Dec 21 (§2g)

Judging is Dec 1 to Dec 15, but Update 47307 asks for everything to stay active until Dec 21. The site also has to
survive the quiet weeks from Nov 12 to Dec 1, when hardly anyone visits.

Live today (`GET /api/health`, Thu Nov 5): the AI buyer is on (`claude-haiku-5-5`), PayPal is the **sandbox** with
intent `AUTHORIZE`, runs and caps are kept in **Turso**, and nothing is paused.

**How to read the last column:** "Fails closed" means that when this runs out, nothing can pay and nothing can clear
that wouldn't have cleared anyway. The site gets plainer or holds. "Fails open" would mean money or a check slips
through. **None of these fail open.** Three of them can still take a feature away from judges: Render (the whole
site), Turso (Approve) and Channel3 (the real prices panel).

| What | Names in the code | What live uses it for | When it runs out or breaks, what a judge sees | Fails closed? |
|---|---|---|---|---|
| **Render web service** | `render.yaml`: `plan: starter`, `autoDeployTrigger: checksPass`; `RENDER`, `RENDER_EXTERNAL_URL`, `HOST`, `PUBLIC_URL`, `WEB_URL` | Hosts everything, always on | The site is unreachable. Nothing pays, but nothing works either | Yes, but it's the one with no fallback. The uptime alert (§4) is for this |
| **The AI provider** (Anthropic) | `ANTHROPIC_API_KEY`; daily caps `LIVE_HAGGLE_CAP` (default 1,000), `LIVE_AI_CAP` (default 200), `CONTROL_DAY_CAP` (default 300); `BUYER=rule` turns AI off | The AI buyer in live haggles, the AI reader in the Challenge, Studio's view asks | **Balance or spend cap reached:** each call errors. The buyer's move falls back to the plain rule, labeled "The AI call failed, so a plain rule made this move." (`core/src/haggle/words.ts`), and the rule never takes an offer over the max (`core/src/buyer/rule.ts`). The reader's line says "The AI reader didn't answer this round, so code's verdict stands alone" (`core/src/judge/judge.ts`). The reader can only add caution, so missing it never clears anything. **A day's cap reached:** a plain rule buys, and the page says the cap is spent | **Yes** |
| **PayPal sandbox app** | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT`, `PAYMENT_INTENT`, `PAYPAL_WEBHOOK_ID` | Orders, Approve, authorize and capture, the webhook | **Keys missing or rejected at boot:** "PayPal disabled". A cart writes "PayPal sandbox keys are not configured on this server, so no order…", refused. **PayPal errors on a run:** "Could not place the order with PayPal. Nothing was charged." **Webhook ID missing:** the webhook answers 503 "Webhooks aren't connected". A held state with no PayPal stays held | **Yes** |
| **Turso** (the store) | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Keeps runs, their pages and the daily caps across restarts | **Unreachable at boot:** live mode starts paused, and health says `store: "unreachable"`. **A write fails** (an outage or a plan limit): the store retries, health says `turso-retrying`, and live mode pauses until it drains (`server/src/store.ts`). A paused live mode means no AI spend and held states, and **Approve says "Live mode is paused"**, so a judge can't pay in the sandbox. **The free plan archives a database after 10 days with no activity**, and unarchiving is manual ([Turso docs](https://docs.turso.tech/cli/group/unarchive)). **Built Nov 5:** each `/api/health` check may start one read-only `SELECT 1`, at most one a minute, and health says `db: "ok"` or `"failed"`. So the uptime ping and Render's own checks now reach the store. That likely keeps it active, but Turso hasn't confirmed it: their docs don't define "activity". See §3c | **Yes**, but it stops the PayPal demo. **The biggest risk here** |
| **AG Studio licence** | `VITE_AG_STUDIO_LICENSE`, read at **build** time | Studio on Behind the scenes | The gate shuts at the start of Dec 20 UTC (**Sat Dec 19, 4 PM PT**): after judging ends, but **two days before Dec 21**. Then Behind the scenes shows our own view instead of Studio. A missing or rejected key does the same. `scripts/licence-expiry-walk.ts` walks the cut-over. **A must:** that fallback has to be on live and checked before the freeze (§6) | **Yes**, and views only: it never touches money |
| **Channel3** | `CHANNEL3_API_KEY`, `CHANNEL3_LIVE` | "Real prices", read-only | Live answers `"source":"recorded"` until Joshua sets `CHANNEL3_LIVE` to `on` (§3a); then it calls Channel3 inside the caps, and the recording is the fallback. **Built Nov 5:** the recording now shows for 50 days, until **Fri Dec 25, about 3:10 AM PST**, after the winners are named. Past that, the panel shows nothing. See §3a | **Yes** (it shows nothing rather than something false) |
| **View tokens** | `VIEW_TOKEN_SECRET` (optional) | Signs view tokens | Unset, or under 32 characters: a key made at boot signs them, so tokens made before a restart stop working | **Yes** |
| **The GitHub repo and the YouTube video** | (none) | What judges read and watch | A private repo or an unlisted video breaks the rules' public-visibility requirements | Not a code path. Keep both public |

**Caps and spend, said plainly.** The daily caps bound how many AI calls the site makes. They're kept in Turso, so a
restart doesn't reset them. If Turso is down, live mode pauses, so the caps can't be skipped that way either. The
last backstop is the spend cap you set on the key in the provider's console (`server/src/main.ts`, the cap store's
note). If that cap is reached, the plain rule takes over (row 2 of the table). So money can't slip through, and AI
spend is bounded twice: by the caps in code, and by your console cap.

### 3a. Channel3: live inside caps, the recording as fallback, and what happens on Dec 5

Read from the code and two GETs on live, Thu Nov 5. No `.env` was opened.

- **Why live says "recorded" today: the switch.** `server/src/main.ts` hands the Channel3 key to the prices panel only
  when `CHANNEL3_LIVE` is `on`. Without it, `channel3.ts` makes no call and answers from the recording
  (`docs/fixtures/channel3-recorded.json`) with `"notLive":"off"`; a failed live call answers `"notLive":"failed"`.
  `render.yaml` sets neither `CHANNEL3_LIVE` nor `CHANNEL3_API_KEY`: both are dashboard settings, which I can't read.
- **Credits aren't the problem.** Joshua's 2:05 AM message: "21,000 bonus credits plus 1,000 a month, so there's no
  budget worry." Channel3's prize page says the hackathon key holds 20,000 credits, "good for 20,000 product searches",
  and its pricing page adds 1,000 free a month, one credit a search. Past them, extra credits are "billed as they're
  used", so the caps below keep us far under them (the $0 rule).
- **The date window.** A recording older than `RECORDED_MAX_DAYS` isn't shown (`server/src/adapters/channel3.ts`).
  It was 30, which would have hidden every recorded query on Sat Dec 5, in the middle of judging. **Built Nov 5: it's
  50.** The twelve queries were all fetched on Nov 5 between 11:09:52 and 11:10:09 UTC, so they now show until
  **Fri Dec 25, about 3:10 AM PST**. `core/test/channel3.test.ts` checks that every query still shows on Dec 21 at
  2:00 PM PT and is gone the day after the window ends. Past that, `/api/prices` answers `"source":"none"` and
  `RealPrices.tsx` draws nothing. The panel's first line stays "Recorded Nov 5 · not live", so a 40-day-old
  recording never reads as today's price.
- **The prize.** Channel3's page (paypalaihackathon.devpost.com/details/channel3, read Thu Nov 5): the project uses its
  API "as a meaningful part of the product experience — search, product enrichment or recommendations", and "Projects
  that only reference Channel3 without calling it will not meet this requirement." Ours is search: `POST /v1/search`.
  A free `GET /v1/products/{id}` refresh (its pricing page lists `/products` as free) would be a call, but it isn't
  one of the three uses the page names, so we don't lean on it.
- **The caps (J3, built Nov 5), so judging can't run the credits out:** at most 200 live calls a UTC day, 24 per address a day, and 10,000 in all.
  Each good answer is reused for an hour; a failed call waits 5 minutes before trying again, and every try counts
  against the caps. 200 a day for the 47 days to Dec 21 is 9,400, under the 10,000 in all, which is half the hackathon
  credits. The day's and the run's counts are saved in Turso like the other caps, so a restart resets neither; the
  per-address count stays in memory (no address is written down). Past any cap, or on any failed call, or while the
  store can't save the counts, the panel shows the recording as "Recorded Nov 5 · not live", and `/api/prices` says
  why in `notLive` (`off`, `capped`, `paused` or `failed`). "Live" shows only on a real live answer.

**What has to happen before the freeze. These are code and settings; nothing can change after Nov 12:**
1. **Built Nov 5:** the recording's window covers **Dec 21, 2:00 PM PT**, which needed at least 47 days
   from Nov 5. **Decided by default: 50 days.** Flip if Joshua says: re-record nearer the freeze and keep a shorter
   window. The panel already labels the recording honestly ("Recorded Nov 5 · not live"), so a longer window claims
   nothing new.
2. **Joshua's call, made Nov 5, 5:20 PM: real calls on live, with caps.** The caps are built (above). What's left is
   one setting only Joshua can make (I never set the key or the switch):

   **Joshua's steps** (after the Lead says the caps commit is live; the only secret is the key itself: you type it into
   Render, never into chat, and you type your own logins):
   1. In Channel3's dashboard, check the credit balance shows at least 10,000. If it doesn't, stop and tell the Lead:
      past the free credits Channel3 bills each one, and the caps allow up to 10,000.
   2. Sign in at dashboard.render.com.
   3. Open the **gilded-goose** service, then **Environment** in the left menu.
   4. Check that a variable named `CHANNEL3_API_KEY` is in the list. Don't reveal or copy its value. If it isn't
      there, add it with the key from your Channel3 dashboard, typed by you.
   5. Add an environment variable (the button's name may differ). Key: `CHANNEL3_LIVE`. Value: `on` (lowercase,
      exactly those two letters).
   6. Click **Save and deploy**: the switch is read when the server starts, so no rebuild is needed, and a rebuild
      could ship a newer commit. Not **Save only**: the server wouldn't see it. Change nothing else.
   7. Tell the Lead. The Lead runs one `GET https://gilded-goose.onrender.com/api/prices?q=headphones` (one credit)
      and looks for `"source":"channel3"`. Otherwise `notLive` says why: `off`, the switch or the key didn't reach the
      server; `paused`, Turso can't save the counts; `failed`, Render's log has a line starting
      `channel3: live search failed`; `capped` on the very first call, the per-address count may be shared by every
      visitor (Render's forwarded address not read), so tell the Lead.

   To turn it off again: delete `CHANNEL3_LIVE` (or set it to anything but `on`) and save. The panel goes back to the
   recording, still labeled "not live".

### 3b. Every date-based window that runs out between Dec 1 and Dec 21

A sweep of `server/src`, `core/src`, `trust/src` and `web/src` for date math, plus each provider's own clock:

| When | What runs out | What a judge sees | Fix before the freeze |
|---|---|---|---|
| **Any time after ~Nov 22** (10 idle days, if a read doesn't count as activity) | Turso's free plan archives the database | Live mode paused; Approve says "Live mode is paused" | §3c: the keep-alive read is built; the backstops are Joshua's |
| ~~Sat Dec 5~~ **Fri Dec 25, ~3:10 AM PST** | The Channel3 recording's window, now 50 days (built Nov 5) | Nothing during judging; the panel goes quiet after Dec 21 | Done, §3a item 1 |
| **Sat Dec 19, 4:00 PM PT** | The AG Studio gate (`core/src/view/studio-gate.ts`, the key's printed expiry Dec 20) | Our own Behind-the-scenes view instead of Studio | F's proof, §6 |
| **Sun Dec 20, 4:00 PM PST** (Dec 21 UTC) | `nextDec20` in `core/src/view/list.ts`: the Christmas list's demo gifts are "needed by" the next Dec 20 | On winners' day, a newly seeded demo list says "needed by Dec 20" of **2027** (364 days away) | Low; log it, no fix needed for judging |
| Per visitor, not site-wide | Cookies (`maxAge`), a bound cart's `expiresAt`, PayPal's OAuth token (refreshed on `expires_in`) | Each renews or asks again | None |
| Monthly, Dec 1 | Render billing, the AI provider's monthly spend cap if it's monthly, Turso's monthly limits | Whatever §5 doesn't top up | §5 |

### 3c. Turso: keeping the store awake through the quiet weeks

Nov 12 to Dec 1 is 19 days, and the free plan archives a database after 10 idle days. If it archives, the server
pauses live mode (closed, safe), but judges can't Approve. Three ways to handle it:

1. **Joshua: a paid Turso plan** that doesn't archive. It costs money, so it's your call; check the price on Turso's
   page first.
2. **Joshua, $0: one real run on live every 7 days** from Nov 12 to Dec 21 (for example Nov 18, Nov 25, Dec 2, Dec 9,
   Dec 16). A run writes to the store, which counts as activity. It isn't the Challenge counter, which counts
   `/api/runs/trick` and `/api/judge` only.
3. **Built Nov 5 (our lead agent's call): a keep-alive read in code.** Each `/api/health` check may start one
   `SELECT 1`, at most one a minute (`keepAwake` in `server/src/store.ts`). It's a read, never a write. Health answers
   at once with the last read's result and never waits on the database: Render restarts an instance whose health check
   takes over 5 s, for 60 s in a row, and the read gives up after 2 s anyway. A failed read only sets `db: "failed"`; it
   never pauses or un-pauses live mode. The uptime monitor's ping every 5 minutes, and Render's own checks every few
   seconds, are what start the reads. **It likely keeps it active, but Turso hasn't confirmed it:** their docs
   say "archived after 10 days of inactivity" and never define activity (read Nov 5). So 2 stays as the backstop.
4. **Joshua, $0: ask Turso support** whether a read (`SELECT 1`) counts as activity for the 10-day archive. A yes
   means 2 can stop.

**Decided by default: 3 is built, with 2 and the second uptime monitor (§4) as backstops.** Flip if Joshua says: he'd
rather pay (1), or support confirms a read counts (then 2 can stop).

**If Turso's free terms change** (a recent article reports Supabase is buying Turso): on Turso's pricing page and
`docs.turso.tech/cli/group/unarchive`, look for **the number of idle days before an archive** and **any wording on
what counts as activity**. If the days drop below 7, run 2 more often. If activity becomes "writes only", 3 no longer
helps, and 2 or 1 is what's left.

**If it archives anyway:**
1. Run `turso group unarchive <group-name>` (Turso's CLI, your login), or use the dashboard.
2. Open `https://gilded-goose.onrender.com/api/health`.
3. If it still says `"store":"unreachable"`, use Render's **Restart service**. That's a restart, not a deploy, so it
   changes no linked material.
4. Health should then say `"store":"turso"` and `"paused":false`.

## 4. An uptime alert to Joshua (free, his own login)

The steps are already written: **`docs/ops/uptime.md` §A** (UptimeRobot Free, no card, about 5 minutes). It's a
keyword monitor on `https://gilded-goose.onrender.com/api/health` that looks for `"ok":true` every 5 minutes and emails
you when the site is down. `/api/health` costs nothing to ping: it counts no cap, and its one read of the store (§3c,
option 3) is at most one a minute, whoever pings.

If you've already set it up, check it once before Dec 1 with the optional test in step 11 (it should send a **Down**
email), then set it back. Keep it running until Dec 21.

**Add a second monitor, the same way, for a paused live mode.** `"ok":true` stays true even when Turso is archived
and Approve is paused, so the first monitor would never notice that. Steps 3 to 10 of `docs/ops/uptime.md` §A, with:
- **Keyword:** `"paused":false` (with the quotes), alerting when it **does not exist**.
- **Friendly name:** `Gilded Goose live mode`.

It pings the same free endpoint, so it costs nothing.

**Optional, a third monitor, for the store itself:** keyword `"db":"failed"`, alerting when it **exists**. It
catches an archived store as soon as a read fails, even before any write is tried. Use "exists" rather than
looking for `"db":"ok"`: for its first minute after a start, health says `"db":"checking"`.

## 5. For Joshua: what to set before Nov 12, and what to top up before Dec 1

All of these are your logins, so I can't do them. Numbered in order of what breaks worst.

**Before Thu Nov 12, 12:00 PM PT** (after that, nothing linked may change):
1. **Channel3: set `CHANNEL3_LIVE` to `on` in Render** (you said yes on Nov 5; the steps are in §3a, item 2), once
   the Lead says the caps commit is live. The Lead then checks one `GET /api/prices` on live.
2. **Turso: pick 1 or 2 in §3c.** If 2, put the seven-day runs in your calendar now.
3. **The second uptime monitor** (§4).
4. **Render (auto-deploy):** you said "No changes after submission", and Update 47307 says the same.
   `render.yaml` deploys every commit whose GitHub checks pass (`autoDeployTrigger: checksPass`, `docs/ops/uptime.md`
   §E), so a green push to the deploy branch after Nov 12 would still change the live site. After the final deploy, set
   **Auto-Deploy** to **Off** in the service's settings, and push nothing to that branch until Dec 21 (a push that
   changes `render.yaml` may sync the Blueprint's setting back).

**Before Dec 1, and kept through Dec 21:**
5. **Render (billing):** keep the service on **Starter**, with a working card on the account. Starter is about $7 a
   month (`docs/ops/uptime.md` §B; check the price on that screen).
6. **The AI provider:**
   - **Balance:** in the provider's console, look at the usage of the busiest day so far and multiply it by 21 (Dec 1
     to Dec 21). Keep at least that as a balance.
   - **Spend cap:** set the key's spend cap at or above that same amount, so the code's daily caps run out before the
     cap does.
   - **Ask me** if you want the daily caps on Render (`LIVE_HAGGLE_CAP`, `LIVE_AI_CAP`, `CONTROL_DAY_CAP`) changed.
     Today they're the code's defaults unless Render sets them.
7. **Turso (limits and terms):** open the database's usage page and check the plan's monthly limits against
   November's use. December is a new month. If November came close, top up or move to a plan that fits. Re-read the
   free plan's archive rule too (§3c, "If Turso's free terms change").
8. **PayPal sandbox app:** don't rotate the secret or delete the app before Dec 21. The webhook in the app must still
   point at `https://gilded-goose.onrender.com`. Rotating the secret also voids every wallet cookie, because the
   wallet's cookie key comes from it (`server/src/main.ts`).
9. **Channel3 credits:** the caps stop at 10,000 calls in all, against 20,000 hackathon credits plus 1,000 a month.
   That holds only if the hackathon credits are on the key: check the balance before turning live on (§3a, step 1),
   and again on Dec 1. Past the free credits, Channel3 bills each one.
10. **AG Studio:** nothing to do. Don't rebuild with a new key unless AG gives you one.
11. **GitHub and YouTube:** keep the repo public and the video Public through Dec 21. Don't rename or archive the
    repo, because the links on the entry would break.

## 6. Musts before the freeze (Fri Nov 6), for the tracks

The live site is linked material, so these can't be patched in December.
1. **Next: prove the AG fallback on live.** Run `scripts/licence-expiry-walk.ts` (with `LAST_MOMENT=1` for the far
   side of Dec 19, 4 PM PT) on a production build, and write the result here. Studio must give way to our own view,
   with no AG mark and no console banner.
2. **Built (Nov 5): `RECORDED_MAX_DAYS` is 50**, covering Dec 21, 2:00 PM PT (§3a, item 1). A test pins the
   recording's last day. The "Recorded Nov 5 · not live" label stays.
3. **Built (Nov 5): the Turso keep-alive read** (§3c, option 3). One narrow safety review confirms it's read-only and
   off every money path.

## Decided by default

- Opt into AG Grid, Channel3 and Render; not the two sponsor tools we don't use. Flip if Joshua says: drop one.
- `k-real-prices` stays out of the cut, or is blurred. Flip if Joshua says: he has permission, or reads the rule differently.
- The model's name isn't the subject of any frame. Flip if Joshua says: showing it is fine.
- No music in the video. Flip if Joshua says: he has a track with permission.
- Turn off Render auto-deploy after the final deploy. Flip if Joshua says: he'd rather just not push.
- Keep everything alive through Dec 21, 2:00 PM PT, the later of the two published times. Flip if Joshua says: Dec 15 is enough.
- Channel3's recorded window grows to 50 days. Flip if Joshua says: re-record nearer the freeze.
- Channel3's caps: 200 a day, 24 per address a day, 10,000 in all (§3a). Flip if Joshua says: other numbers.
- Turso stays free: the keep-alive read is built, with a real run every 7 days and the second monitor as backstops.
  Flip if Joshua says: pay.

## For Joshua

- **Your two role lines** (§1 step 7).
- **`CHANNEL3_LIVE`: you said yes; it's one setting in Render** (§3a, item 2, "Joshua's steps").
- **Channel3: do the 20,000 hackathon credits expire before Dec 21?** Neither Channel3 page says.
- **Turso: pay, or run it every 7 days?** And will you ask Turso support whether a read counts as activity? (§3c).
- **A sandbox buyer for judges?** The rules' Testing section says to include "any test account credentials, API keys,
  or sandbox login details necessary to run and test the Project." Approve needs a PayPal sandbox buyer account. A
  judge who has none would need to make one at developer.paypal.com. Do you want to make a sandbox **personal** test
  account and put its login in the testing instructions? It's an account and a credential, so it's yours to decide.
  Sandbox accounts hold only test money.

Questioned: I assumed the Render dashboard sets nothing that `render.yaml` doesn't show (`CHANNEL3_LIVE`, the cap
overrides, `SCAMMER_AI`), because I can't read the dashboard, so the Channel3 cause is "most likely", not confirmed. I
assumed a run's writes count as Turso activity, and I don't know whether the keep-alive's read does. Turso's docs
don't say, and I didn't test either on an archived database. I didn't price the AI spend in dollars, because I have no usage numbers I can check. The date sweep was a
pattern search: a window written some other way (a number of minutes, a cron) could be missing from §3b.
