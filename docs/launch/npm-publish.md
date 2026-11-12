# Publishing @gilded-goose/trust (Joshua only)

Nobody else logs in or publishes; Joshua types every login himself. CI runs everything up to the last step on every push,
with no login, and `bash scripts/public-copy.sh <sha> <outdir>` rehearses it on the public copy: it packs the tarball,
installs it into an empty project and checks the import, the types, the README, the MIT licence and the repo link.
Wed Nov 11's runbook (`docs/launch/nov9-runbook.md`, steps 7 to 11) is the one to follow; in short:

1. On npmjs.com, sign in or create your account, with two-factor sign-in on.
2. Create a free organization named `gilded-goose`, so the `@gilded-goose` scope is yours. If that name is taken, tell the
   Lead: the package name changes everywhere it's written.
3. In a terminal, in the public copy's folder: `corepack pnpm install --frozen-lockfile && node scripts/trust-pack.ts`.
   It must end with `dry run ok`.
4. Read the file list once: `cd trust/.pack && npm pack --dry-run`.
5. `npm login`, then `npm publish` from `trust/.pack`, with your two-factor code.
6. Check it from an empty folder: `npm install @gilded-goose/trust`.

Decided by default: MIT (`LICENSE`, `trust/package.json`). Flip if Joshua says.
