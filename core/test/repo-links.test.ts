// Every link to Gilded Goose's repo names the public one (docs/launch/nov9-runbook.md: github.com/gilded-goose/gilded-goose
// and its main), built from web/src/brand/meta.ts's REPO, so the claims link, the package's repository and the README's
// Render button can't point at three different places, or at the private repo a judge can't open (Track S, push 5).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REPO, REPO_PUBLIC } from "../../web/src/brand/meta.ts";

const root = new URL("../../", import.meta.url).pathname;
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
/** Every github.com/<owner>/gilded-goose address in the tracked code and the README, with its file. */
function addresses(): { file: string; url: string }[] {
  const out = execFileSync("git", ["grep", "-I", "-n", "-o", "-E", "github\\.com/[A-Za-z0-9_.-]+/gilded-goose[A-Za-z0-9_./#?=-]*", "--", "web/src", "core/src", "trust", "server/src", "scripts", "README.md"], { cwd: root, encoding: "utf8" });
  return out.trim().split("\n").filter(Boolean).map((l) => { const [file, , url] = l.split(":"); return { file: file!, url: url! }; });
}

describe("the repo's links", () => {
  it("name only the public repo", () => {
    expect(REPO).toBe("https://github.com/gilded-goose/gilded-goose");
    const found = addresses();
    expect(found.length).toBeGreaterThanOrEqual(2); // control: the sweep sees meta.ts's REPO and the README's Render button
    for (const a of found) expect(`https://${a.url}`.startsWith(REPO), `${a.file}: ${a.url}`).toBe(true);
  });
  // Render's button reads the root render.yaml of the branch it names. The public main's root file is the live site's paid
  // Blueprint, so the button names the branch whose root file is the builder's free copy, and the runbook makes that branch.
  it("are built from REPO where code makes them, and the Render button deploys the free copy's branch", () => {
    expect(read("web/vite.config.ts")).toContain("__GOOSE_REPO__: JSON.stringify(REPO),");
    expect(read("web/src/Proof.tsx")).toContain("const CLAIMS_URL = `${__GOOSE_REPO__}/blob/main/docs/claims.md`;");
    // The repo is private till runbook step 4, so the site draws its one repo link only behind REPO_PUBLIC (Lead-12, Nov 5).
    expect(read("web/vite.config.ts")).toContain("__GOOSE_REPO_PUBLIC__: JSON.stringify(REPO_PUBLIC),");
    expect(REPO_PUBLIC).toBe(false); // the Lead's flip in step 12 changes this line with meta.ts
    const proof = read("web/src/Proof.tsx");
    expect(proof.match(/CLAIMS_URL\}/g)).toEqual(["CLAIMS_URL}"]);
    expect(proof).toContain('{__GOOSE_REPO_PUBLIC__ ? <a href={CLAIMS_URL}>docs/claims.md</a> : "docs/claims.md"}');
    // No page imports meta.ts: it would load the share card's words as a shared chunk on each route that did.
    for (const f of ["web/src/Proof.tsx", "web/src/builders/Builders.tsx"]) expect(read(f)).not.toContain("brand/meta");
    expect(read("scripts/trust-pack.ts")).toContain("url: `git+${REPO}.git`");
    expect(read("README.md")).toContain(`(https://render.com/deploy?repo=${REPO}/tree/auto/render-button)`);
    expect(read("docs/builders/render.yaml")).toContain("branch auto/render-button holds this file there");
    expect(read("docs/launch/nov9-runbook.md")).toContain("git checkout -q -b auto/render-button && cp docs/builders/render.yaml render.yaml");
  });
});
