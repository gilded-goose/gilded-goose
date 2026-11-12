// The pin behind "the same guard code as @gilded-goose/trust <version> on npm" (the Builders page). Run by hand after a publish:
// it reads the package back from the public registry, signed out, checks the tarball against the registry's own integrity
// hash, and writes trust/published.json: the tarball's sha256 for each file readSeller runs. Then it compares this checkout
// with that pin, the same comparison `pnpm check` makes offline (trust/test/published.test.ts, claims row tg-same-code).
// It publishes nothing, logs in to nothing and runs nothing from the package: it only hashes its files.
//   node scripts/trust-published.ts           read the registry, rewrite the pin, compare
//   node scripts/trust-published.ts --check   read the registry and compare with the pin as it is; write nothing
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PIN, WHAT_NOW, differences, published, runs, sha256, type Published } from "../trust/test/published.ts";

const root = new URL("..", import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(root, "trust/package.json"), "utf8")) as { name: string; version: string };
const ENTRY = "seller";
const spec = `${pkg.name}@${pkg.version}`;
const npm = (args: string[], cwd: string) => execFileSync("npm", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, npm_config_userconfig: "/dev/null" } });
const die = (m: string): never => { console.error(`trust-published FAIL: ${m}`); process.exit(1); };

const work = realpathSync(mkdtempSync(join(tmpdir(), "trust-published-")));
try {
  const dist = (JSON.parse(npm(["view", spec, "dist", "--json"], work)) as { tarball: string; integrity: string });
  npm(["pack", spec, "--ignore-scripts"], work);
  const tgz = readdirSync(work).find((f) => f.endsWith(".tgz")) ?? die(`npm pack ${spec} left no tarball`);
  const sri = `sha512-${createHash("sha512").update(readFileSync(join(work, tgz))).digest("base64")}`;
  if (sri !== dist.integrity) die(`the tarball's hash isn't the registry's integrity for ${spec}`);
  execFileSync("tar", ["-xzf", tgz], { cwd: work });
  const files = Object.fromEntries(runs(ENTRY).map((n) => [`dist/${n}.js`, sha256(readFileSync(join(work, "package", "dist", `${n}.js`)))]));
  const pin: Published = { name: pkg.name, version: pkg.version, tarball: dist.tarball, integrity: dist.integrity, entry: ENTRY, files };
  if (process.argv.includes("--check")) {
    if (JSON.stringify(pin) !== JSON.stringify(published())) die(`${PIN} isn't what the registry serves for ${spec}. Run without --check to rewrite it.`);
  } else {
    writeFileSync(join(root, PIN), `${JSON.stringify(pin, null, 2)}\n`);
    console.log(`trust-published: wrote ${PIN} from ${dist.tarball}`);
  }
  const diff = differences(pin);
  if (diff.length) die(`${diff.join("; ")}. ${WHAT_NOW}`);
  console.log(`trust-published ok: the ${Object.keys(files).length} files readSeller runs compile, from this checkout, to the bytes in ${spec} on npm`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
