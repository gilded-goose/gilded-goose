// A local server that loads an env file must never write to live (Track C, Fri Nov 6; Lead-12's safety item). Node's
// --env-file never overwrites a variable that is already set, even to "", so `TURSO_DATABASE_URL= node --env-file=…` keeps
// live's store out whatever the file holds. We fix as if the repo's .env holds every live value, and never open it to check.
// Three places boot server/src/main.ts with an env file: .claude/launch.json's entries (which scripts/screens.ts and
// voice-screens.ts drive), the package scripts (server's dev and start), and scripts that spawn it (csp-smoke). Every one
// blanks the set below, and keeps a part of it only with a reason named here or in its own comment.

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { privateText } from "./public-copy.ts";

/** Live's store, its push sender, and the flags that make a process think it is the Render host. Blank in every boot. */
export const WRITE_TO_LIVE = [
  "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN",
  "PING_PUSH", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT",
  "RENDER", "RENDER_EXTERNAL_URL", "RENDER_GIT_COMMIT",
] as const;
/** The sandbox app live shares. Blank too, except where a named sandbox reason says why a boot needs it. */
export const PAYPAL = ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID"] as const;

/** Package scripts held to less than the whole set, each with its reason. JSON has no comments, so the reasons live here. */
export const SCRIPT_REASONS: Record<string, { keeps: readonly string[]; why: string }> = {
  // README's Run it: `cp .env.example .env`, fill in your own sandbox app's keys, `pnpm dev`, approve with a sandbox buyer.
  // Blanking PayPal here would turn that path's payment off, so README would claim beyond the code (Track C, Nov 6).
  "server/package.json dev": { keeps: PAYPAL, why: "sandbox: README's Run it uses the builder's own sandbox app" },
  // Render's dashboard may run it, and that's Joshua's (Lead-12, Nov 6): blanking here could take live's store from live.
  "server/package.json start": { keeps: [...WRITE_TO_LIVE, ...PAYPAL], why: "Render's own start, left alone" },
};

/** A spawner may keep PayPal only with a comment that says so and names the sandbox reason, e.g. csp-smoke's
 *  `// … PayPal stays: --paypal draws Pay Later from the sandbox app …`. */
export const PAYPAL_STAYS = /\/\/.*PayPal stays\b.*\bsandbox\b/;

/** The shell segments of a command (split at &&, ||, ;, |, & and parentheses), outside quotes. */
export function segments(cmd: string): string[] {
  const out: string[] = []; let cur = "", quote = "";
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]!;
    if (quote) { cur += ch; if (ch === "\\" && i + 1 < cmd.length) cur += cmd[++i]; else if (ch === quote) quote = ""; continue; }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if ("&|;()".includes(ch)) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Whether a segment starts the Goose server, and whether that start reads an env file. `pnpm dev`/`start` run
 *  server/package.json's scripts, which read ../.env. */
export function boot(segment: string): { boots: boolean; envFile: boolean } {
  const viaPnpm = /\bpnpm\b(?:\s+--?\S+)*\s+(?:run\s+)?(?:dev|start)\b/.test(segment);
  const boots = /(?:^|\s)(?:\S*\/)?src\/main\.ts\b/.test(segment) || viaPnpm;
  return { boots, envFile: boots && (/--env-file\b/.test(segment) || viaPnpm) };
}

/** The variables a segment sets to "" before its command (`A= B='' node …`). The two PayPal key names are written `=''`:
 *  bare, check-private reads the next variable's name after the space as the key's 21-character value, and `''` is the
 *  same empty value to sh without loosening that gate. */
export function blanked(segment: string): Set<string> {
  const set = new Set<string>();
  for (const tok of segment.split(/\s+/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(tok);
    if (!m) break;
    if (m[2] === "" || m[2] === "''" || m[2] === '""') set.add(m[1]!);
  }
  return set;
}

/** For each segment of `cmd` that boots the server with an env file: the needed variables it leaves set. */
export function missingBlanks(cmd: string, need: readonly string[]): string[][] {
  return segments(cmd).filter((s) => boot(s).envFile).map((s) => need.filter((v) => !blanked(s).has(v)));
}

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

describe("a local server that loads an env file blanks every write-to-live variable", () => {
  it("reads a shell command the way sh does (controls)", () => {
    const bad = "corepack pnpm --filter @goose/web build && cd server && PAYMENT=fake PORT=8791 node --env-file=../.env src/main.ts";
    expect(missingBlanks(bad, WRITE_TO_LIVE)).toEqual([[...WRITE_TO_LIVE]]);
    const good = `cd server && ${[...WRITE_TO_LIVE].map((v) => `${v}=`).join(" ")} PORT=1 node --env-file=../.env src/main.ts`;
    expect(missingBlanks(good, WRITE_TO_LIVE)).toEqual([[]]);
    // A blank after the command, or one with a value, doesn't count; a boot with no env file needs none.
    expect(missingBlanks("node --env-file=.env src/main.ts TURSO_DATABASE_URL=", ["TURSO_DATABASE_URL"])).toEqual([["TURSO_DATABASE_URL"]]);
    expect(missingBlanks("TURSO_DATABASE_URL=x node --env-file=.env src/main.ts", ["TURSO_DATABASE_URL"])).toEqual([["TURSO_DATABASE_URL"]]);
    expect(missingBlanks(`A='' B="" node --env-file=.env src/main.ts`, ["A", "B"])).toEqual([[]]); // quoted empty is empty
    expect(missingBlanks(`A='x' node --env-file=.env src/main.ts`, ["A"])).toEqual([["A"]]);
    expect(missingBlanks("cd server && PAYMENT=fake node src/main.ts", WRITE_TO_LIVE)).toEqual([]);
    // `pnpm dev` reads ../.env through server's script, so it is a boot with an env file.
    expect(missingBlanks("PORT=8787 corepack pnpm dev", ["RENDER"])).toEqual([["RENDER"]]);
    // A quoted && (node -e "…") is not a segment break.
    expect(segments(`node -e "a && b" && node src/main.ts`)).toEqual([`node -e "a && b"`, "node src/main.ts"]);
  });

  it(".claude/launch.json: every entry that boots with an env file blanks the store, push, Render and PayPal", () => {
    // The public copy leaves .claude out: there, no launch entries exist to boot anything.
    const { here, text } = privateText(".claude/launch.json", () => JSON.stringify({ configurations: [] }));
    if (!here) return;
    const entries = (JSON.parse(text) as { configurations: { name: string; runtimeExecutable?: string; runtimeArgs?: string[] }[] }).configurations;
    // `sh -c "<cmd>"` runs <cmd>; anything else runs its executable and args as one command line, with no way to blank.
    const command = (e: (typeof entries)[number]) => {
      const args = e.runtimeArgs ?? [];
      return /^(?:\S*\/)?(?:sh|bash|zsh)$/.test(e.runtimeExecutable ?? "") && args[0] === "-c" ? args[1] ?? "" : [e.runtimeExecutable ?? "", ...args].join(" ");
    };
    const loose = entries.map((e) => ({ name: e.name, missing: missingBlanks(command(e), [...WRITE_TO_LIVE, ...PAYPAL]).flat() })).filter((e) => e.missing.length);
    expect(loose).toEqual([]);
    // Controls: the entries that boot with ../.env are found (so a renamed entry can't slip past), and the no-key ones aren't.
    const withEnvFile = entries.filter((e) => segments(command(e)).some((s) => boot(s).envFile)).map((e) => e.name);
    expect(withEnvFile).toEqual(expect.arrayContaining(["goose-dev", "goose-built-no-ai", "goose-built-fake"]));
    expect(withEnvFile).not.toContain("goose-built-fake-nokeys");
  });

  it("package scripts that boot the server with an env file blank the whole set, or keep only what a named reason allows", () => {
    const pkgs = ["package.json", ...["core", "server", "trust", "web"].map((d) => `${d}/package.json`)];
    const loose: { at: string; missing: string[] }[] = [];
    for (const p of pkgs) {
      const scripts = (JSON.parse(read(p)) as { scripts?: Record<string, string> }).scripts ?? {};
      for (const [name, cmd] of Object.entries(scripts)) {
        const keeps = SCRIPT_REASONS[`${p} ${name}`]?.keeps ?? [];
        const missing = missingBlanks(cmd, [...WRITE_TO_LIVE, ...PAYPAL].filter((v) => !keeps.includes(v))).flat();
        if (missing.length) loose.push({ at: `${p} ${name}`, missing });
      }
    }
    expect(loose).toEqual([]);
    // Every reason names a script that exists, so a renamed script can't keep an exemption it no longer needs.
    for (const at of Object.keys(SCRIPT_REASONS)) {
      const [p, name] = at.split(" ");
      expect((JSON.parse(read(p!)) as { scripts?: Record<string, string> }).scripts?.[name!], at).toBeTypeOf("string");
    }
    // The dev reason keeps PayPal only: the store and push are still blanked there.
    expect(SCRIPT_REASONS["server/package.json dev"]!.keeps).toEqual(PAYPAL);
    // Control: the server's own dev script is a boot with an env file, so this test really reads it.
    const dev = (JSON.parse(read("server/package.json")) as { scripts: Record<string, string> }).scripts.dev!;
    expect(segments(dev).some((s) => boot(s).envFile)).toBe(true);
  });

  it("scripts that spawn the server with an env file set the whole set to \"\", PayPal only kept by a named sandbox reason", () => {
    const files = readdirSync(new URL("../../scripts/", import.meta.url)).filter((f) => f.endsWith(".ts"));
    const spawners = files.filter((f) => { const t = read(`scripts/${f}`); return t.includes("--env-file") && /["'`]src\/main\.ts["'`]/.test(t); });
    expect(spawners).toContain("csp-smoke.ts"); // control: the one known spawner is found
    const loose = spawners.map((f) => {
      const t = read(`scripts/${f}`);
      const need = PAYPAL_STAYS.test(t) ? WRITE_TO_LIVE : [...WRITE_TO_LIVE, ...PAYPAL];
      return { f, missing: need.filter((v) => !t.includes(`${v}: ""`)) };
    }).filter((x) => x.missing.length);
    expect(loose).toEqual([]);
    // Control: the reason is a comment that names the sandbox, not any mention of PayPal.
    expect(PAYPAL_STAYS.test(`// PayPal stays: --paypal draws Pay Later from the sandbox app`)).toBe(true);
    expect(PAYPAL_STAYS.test(`const why = "PayPal stays for the sandbox";`)).toBe(false);
    expect(PAYPAL_STAYS.test(`// PayPal stays because we like it`)).toBe(false);
  });
});
