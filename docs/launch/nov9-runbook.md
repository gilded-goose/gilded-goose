# Wed Nov 11: the public repo and the npm package (Joshua's 15 minutes)

The file keeps its old name, `nov9-runbook.md`, so its links hold. Today is **Wed Nov 11**; Devpost is submitted tonight,
so the repo is public and the package published before then.

Joshua, Thu Nov 5, ~5:45 PM: the repo goes public as the clean copy with fresh history, and he publishes
`@gilded-goose/trust` to npm from his own login. Joshua, Fri Nov 6, 10:25 PM: this moved from Mon Nov 9 to Wed Nov 11.
**Joshua types every login himself.** Nobody else logs in, creates an account, pushes to the public repo or publishes. The
private repo, its history and Render stay as they are. Pushes to the private repo happen today only at 6 AM, 10 AM, 2 PM
and 6 PM PT.

## Ready before Joshua starts (our Claude agents; Joshua does nothing here)

- **The final commit**: the code freeze plus Lucas's new white site (`web/goose.html`, served at `/goose.html`), merged
  and green on `ci-local` on the exact SHA, pushed at 6 AM.
- **The clean copy, built and checked by one script** from that SHA, into a new folder outside the repo:

  ```
  bash scripts/public-copy.sh <final-sha> ~/gilded-goose-public
  ```

  It prints PASS or FAIL per check and ends `public-copy PASS: …` only if every one passed:
  - **build**: one commit, fresh history, exactly the files `scripts/public-allow.txt` keeps, plus three it writes
    (the ratchet's board section, `.env.example`, and the mark `docs/launch/.public-copy`);
  - **scan**, hard failures whatever the allowlist says: a key or token shape, a `.env` file, a films folder or the
    films' reference folder, an `.mp4`, `.mov`, `.wav` or `.npy` file, `web/.probe/`, private notes, a file the allowlist
    doesn't keep, a file in the folder but not in the commit, an author's email from the private history, a session id,
    a home-folder path, a competitor named in prose, a README or `docs/launch` link that doesn't resolve, and
    `check-private` run on the copy;
  - **fresh**: `corepack pnpm install --frozen-lockfile` and `corepack pnpm check` pass in the copy;
  - **npm**: `node scripts/trust-pack.ts` in the copy, `npm pack` to a tarball, installed into an empty project, where the
    import works, the types resolve, and the README, MIT licence and the public repo link are in the package.

  The Lead hands Joshua the folder's path only after `public-copy PASS`. A FAIL is fixed in the private repo and the copy
  rebuilt into a new folder; the copy is never patched by hand.
- The three links to the repo (`README.md`'s Render button, `web/src/Proof.tsx`'s claims link, and
  `scripts/trust-pack.ts`'s package repository) name the public repo, in the final commit (`core/test/repo-links.test.ts`).
  The button names the branch `auto/render-button`, not `main`: Render's button reads the root `render.yaml` of the
  branch it names, and `main`'s is the live site's paid Blueprint. Step 1 makes that branch: `main` plus one commit that
  puts the builder's free copy (`docs/builders/render.yaml`) at the root.
- The sponsor-tools list, re-read: one GET of the hackathon's own page on paypalaihackathon.devpost.com, its sponsor-tools
  line, before Devpost goes in. AG Grid, Channel3, Render and Postman must each still be on it, as claims row
  `c-sponsor-index` says (last read Thu Nov 5). If one is gone, its bullet leaves "Sponsor tools, and how we used each"
  in `README.md` and `docs/devpost.md` in the final commit. If one was added, nothing changes. Read only: no login, no form.

Decided by default: the public repo is `github.com/gilded-goose/gilded-goose`, under a free GitHub organization named
`gilded-goose` (free on GitHub and on npm when checked on Nov 5). It keeps the name the Pages backup is built for
(`/gilded-goose/`) and never touches the private repo, which Render deploys from. Flip if Joshua says: rename the private
repo and take `joshuatistic/gilded-goose` instead (then Render's link to the repo must be checked after the rename).

## Today in short (Wed Nov 11; the full steps with what you should see are below)

The Lead hands you the folder `~/gilded-goose-public` only after `public-copy PASS` on the sha it was built from, and
names that sha. Rehearsed on the 2 PM push's tip: copy PASS, `npm pack` 48 files, `@gilded-goose/trust@0.1.0`, no
dependencies, public access. You type every login.

1. `cd ~/gilded-goose-public && git log --oneline | wc -l` prints `1`; then step 1's two commits with your NAME and EMAIL.
2. On github.com (signed in by you): the free organization `gilded-goose`, then the empty **Public** repo
   `gilded-goose/gilded-goose` with no README, licence or .gitignore (steps 2 and 3).
3. `git remote add origin https://github.com/gilded-goose/gilded-goose.git && git push -u origin main auto/render-button`
   (step 4).
4. `corepack pnpm install --frozen-lockfile && node scripts/trust-pack.ts` ends `Nothing was published.` (step 9).
5. `cd trust/.pack && npm login` (you type it), then `npm publish --access public` and your two-factor code; expect
   `+ @gilded-goose/trust@0.1.0` (steps 7, 8 and 10: the npm organization `gilded-goose` must exist first).
6. Tell the Lead "public and published" (step 12).

## Joshua's steps (about 15 minutes; each ends with what you should see)

The step numbers are the ones the code's comments cite (step 1 makes the Render branch, step 4 makes the repo public,
step 12 is the Lead's flip), so they stay as they are.

1. **Open the copy, sign the commit, make the Render button's branch.** In Terminal, three copy-pastes, with your NAME
   and EMAIL. A GitHub "noreply" address (github.com → your picture → Settings → Emails) keeps your real email off the
   public commit.
   1. `cd ~/gilded-goose-public` (or the path the Lead gave you).
      *Expect:* `git log --oneline | wc -l` prints `1`, and `git status --short` prints nothing.
   2. `git -c user.name="NAME" -c user.email="EMAIL" commit --amend --reset-author --no-edit`
      *Expect:* `git log -1 --format='%an <%ae>'` prints your choice, and `git log --oneline | wc -l` still prints `1`.
   3. `git checkout -q -b auto/render-button && cp docs/builders/render.yaml render.yaml && git -c user.name="NAME" -c user.email="EMAIL" commit -q -am "Deploy to Render: the builder's free copy at the root" && git checkout -q main`
      *Expect:* `git log --oneline auto/render-button | wc -l` prints `2`, and `git branch --show-current` prints `main`.
2. **Create the GitHub organization** (you sign in yourself). github.com → your picture → Your organizations → New
   organization → Free → name `gilded-goose`.
   *Expect:* github.com/gilded-goose opens. If the name is taken, stop and tell the Lead (the three links change).
3. **Create the empty public repo.** github.com/new → Owner `gilded-goose` → name `gilded-goose` → **Public** → no
   README, no licence, no .gitignore (the copy has its own) → Create repository.
   *Expect:* an empty repo page showing push commands.
4. **Push the copy.** In the same Terminal folder, copy-paste:
   `git remote add origin https://github.com/gilded-goose/gilded-goose.git && git push -u origin main auto/render-button`
   *Expect:* the repo page shows 1 commit, and the right sidebar says "MIT license".
5. **About.** On the repo page, the gear by "About": description "A spending guard for shopping agents: the model
   proposes a cart, plain code binds it, and only the shopper's tap pays through PayPal.", website
   `https://gilded-goose.onrender.com`. Save.
   *Expect:* both show in the sidebar.
6. **Pages, the backup site (optional, free on a public repo).** Settings → Pages → Source: **GitHub Actions**. Then
   Actions → pages → Run workflow.
   *Expect:* a green run, and the seeded demo at https://gilded-goose.github.io/gilded-goose/ (it says live mode isn't
   answering; that is by design).
7. **npm account.** npmjs.com: sign in (you type it), or create your account, with two-factor sign-in on.
   *Expect:* your picture shows top right.
8. **npm organization.** npmjs.com → your picture → Add Organization → name `gilded-goose` → Unlimited public packages
   (free).
   *Expect:* npmjs.com/org/gilded-goose opens. If the name is taken, stop and tell the Lead.
9. **Build the package.** In the copy's folder, copy-paste:
   `corepack pnpm install --frozen-lockfile && node scripts/trust-pack.ts`
   *Expect:* the last line starts `trust-pack: dry run ok: @gilded-goose/trust@0.1.0,` and ends `Nothing was published.`
   (48 files when rehearsed on Wed Nov 11; a few more or fewer is fine if the code moved).
10. **Publish.** Copy-paste `cd trust/.pack && npm login`, sign in (you type it), then `npm publish --access public` and
    your two-factor code.
    *Expect:* `+ @gilded-goose/trust@0.1.0`.
11. **Check it as a stranger.** Copy-paste:
    `cd "$(mktemp -d)" && npm init -y >/dev/null && npm install @gilded-goose/trust && node -e 'import("@gilded-goose/trust/node").then((m) => console.log(typeof m.createGuard))'`
    *Expect:* `function`. npmjs.com/package/@gilded-goose/trust shows the README, MIT and a link to the public repo.
12. **Tell the Lead "public and published".** That's the last of yours. The Lead then, in this order:
    1. **Checks, signed out, GET only:** the public repo opens; the README's links and images resolve; the README's
       Deploy to Render button opens Render's page for the free copy (it stops there: nothing is deployed); the npm page
       opens and links the public repo; Devpost's repo link points at the public repo.
    2. **Makes the flip, one commit on the live tip** (`pnpm check` fails on any one left out):
       - `NPM_PUBLISHED` in `web/src/builders/builders.ts` and `REPO_PUBLIC` in `web/src/brand/meta.ts`, set to `true`;
       - claims row `b-get-npm`, its claim and its Value both reworded to say the package is published;
       - the two test lines that pin them false: `core/test/builders.test.ts` ("says how to get it") and
         `core/test/repo-links.test.ts` ("are built from REPO").

       A rehearsal of the flip on the public copy failed exactly those three and nothing else.
    3. **Runs `pnpm check`, then `ci-local` on the exact SHA**, both green.
    4. **Pushes at the next slot**: 10 AM, 2 PM or 6 PM PT, never between. Then confirms GitHub's "check" run is green
       on that SHA, and calls it live only then.
    5. **Reads live once that push is deployed, signed out, GET only:** Proof's claims link opens `docs/claims.md` on
       the public repo; For builders (`?desk=builders`) shows `npm install @gilded-goose/trust` and its "Get it" links
       open; `/goose.html` loads. Till then the site links to no repo page and draws no install line.
13. **The Lead reads live once that push is live** (GET only, no key touched): Behind the scenes still opens in AG Studio,
    and the expiry words in the served bundle match the date the AG Studio key prints (the AG Studio licence row in
    `docs/launch/alive-through-judging.md`). Only a build with the real key shows these words: the rehearsal in `ci-local`
    builds its own date, today plus 30 days. If they don't match, nothing is rebuilt; the Lead tells Joshua.

Decided by default: the public repo keeps its one commit, with the flags still `false` in its code; only the live site
needs them. Flip if Joshua says: rebuild the copy from the flip's SHA and push it as a second commit.

## If something goes wrong

- A push is refused: check step 3 made the repo empty (no README); never force-push over a repo with other commits.
- `trust-pack` fails: send the Lead its last line; don't publish.
- Anything private shows on the public repo: make it private again at once (Settings → General → Danger Zone → Change
  visibility) and tell the Lead. The copy is rebuilt from the allowlist, never patched by hand.
- npm's policy lets a new package be unpublished within 72 hours (`npm unpublish @gilded-goose/trust@0.1.0`), later
  only under its conditions, and a version number can never be used again: a fix ships as 0.1.1.
