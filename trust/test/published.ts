// What "the same code as the published package" means, in code (the Builders page says it of readSeller). The package on npm is
// this folder's src compiled file by file (scripts/trust-pack.ts: the base tsconfig, with relative imports rewritten to .js), so
// one source file compiled that way must be byte-equal to its file in the tarball. trust/published.json holds the tarball's own
// sha256 for each file readSeller runs, written by scripts/trust-published.ts from the registry. Not a test file: the test,
// the claims probe and that script all read through here, so they can't disagree about how a file is compiled.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";

const at = (p: string) => new URL(`../../${p}`, import.meta.url);
const read = (p: string) => readFileSync(at(p), "utf8");

export interface Published { name: string; version: string; tarball: string; integrity: string; entry: string; files: Record<string, string> }
export const PIN = "trust/published.json";
export const published = (): Published => JSON.parse(read(PIN)) as Published;
export const sha256 = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");

/** One source file as the package carries it: `dist/<name>.js`, compiled alone with trust-pack's options. */
export function compiled(name: string): string {
  const base = (JSON.parse(read("tsconfig.base.json")) as { compilerOptions: Record<string, unknown> }).compilerOptions;
  const { options, errors } = ts.convertCompilerOptionsFromJson({ ...base, lib: ["ES2022"], noEmit: false, rewriteRelativeImportExtensions: true }, ".");
  if (errors.length) throw new Error(`tsconfig.base.json no longer reads as compiler options: ${String(errors[0]!.messageText)}`);
  return ts.transpileModule(read(`trust/src/${name}.ts`), { compilerOptions: options, fileName: `${name}.ts` }).outputText;
}

/** Every file `entry` runs: itself and what its compiled JS imports, followed to the end. Type-only imports are gone by then. */
export function runs(entry: string): string[] {
  const seen = new Set<string>();
  for (const queue = [entry]; queue.length;) {
    const name = queue.pop()!;
    if (seen.has(name)) continue;
    seen.add(name);
    for (const m of compiled(name).matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']\.\/([\w-]+)\.js["']/g)) queue.push(m[1]!);
  }
  return [...seen].sort();
}

/** What differs between this checkout and the published package, for the files `entry` runs. Empty means the same code. */
export function differences(pin: Published = published()): string[] {
  const out: string[] = [];
  const pkg = JSON.parse(read("trust/package.json")) as { name: string; version: string };
  if (pkg.name !== pin.name || pkg.version !== pin.version) out.push(`trust/package.json says ${pkg.name}@${pkg.version}, the pin is ${pin.name}@${pin.version}`);
  const mine = runs(pin.entry).map((n) => `dist/${n}.js`);
  const theirs = Object.keys(pin.files).sort();
  if (mine.join() !== theirs.join()) out.push(`${pin.entry} now runs ${mine.join(", ")}; the pin holds ${theirs.join(", ")}`);
  for (const f of theirs) {
    const name = f.replace(/^dist\/|\.js$/g, "");
    let got: string;
    try { got = sha256(compiled(name)); } catch { out.push(`trust/src/${name}.ts is gone`); continue; }
    if (got !== pin.files[f]) out.push(`trust/src/${name}.ts no longer compiles to ${f} of ${pin.name}@${pin.version} on npm`);
  }
  return out;
}

/** Said by whatever finds a difference: the page's sentence is the thing at stake. */
export const WHAT_NOW = "The Builders page says its guard code is the same as the published package's (claims row tg-same-code). Either publish the new version and run `node scripts/trust-published.ts`, or, for a fix that can't wait, set SAME_AS_PUBLISHED to false in web/src/site/builders/try-guard-words.ts and reword the row: the page then says \"plus changes not yet published\".";
