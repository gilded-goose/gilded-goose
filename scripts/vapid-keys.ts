// Makes the VAPID key pair for the ping with the tab closed (Level 2) into a file outside the repo, readable by its owner
// only, and prints only the file's path and the variable names: never a key (Joshua, Nov 5 6:40 PM: "never print, commit
// or echo it"). Joshua copies the three lines into Render himself. Refuses to overwrite a file that's already there.
//   node scripts/vapid-keys.ts [path]   (default ~/.goose-secrets/vapid.env)
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

const out = resolve(process.argv[2] ?? `${homedir()}/.goose-secrets/vapid.env`);
if (out.startsWith(resolve(import.meta.dirname, ".."))) throw new Error("vapid-keys: the key file goes outside the repo");
if (existsSync(out)) throw new Error(`vapid-keys: ${out} is already there; nothing was made or changed`);
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const j = privateKey.export({ format: "jwk" }) as { d: string; x: string; y: string };
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(j.x, "base64url"), Buffer.from(j.y, "base64url")]).toString("base64url");
mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
writeFileSync(out, `PING_PUSH=on\nVAPID_PUBLIC_KEY=${pub}\nVAPID_PRIVATE_KEY=${j.d}\nVAPID_SUBJECT=https://gilded-goose.onrender.com\n`, { mode: 0o600, flag: "wx" });
console.log(`vapid-keys: wrote PING_PUSH, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT to ${out} (owner-only). No key was printed.`);
