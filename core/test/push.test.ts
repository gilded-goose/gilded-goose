// The ping with the tab closed (Level 2, behind PING_PUSH): VAPID made with node:crypto and checked the way a push
// service checks it, an allowlist of push services so the server can't be pointed anywhere else, and an empty push.
// The keys here are made for this test and thrown away; no real key is read.
import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { PUSH_ADDRESSES_MAX, PUSH_UNTIL, PUSHES_PER_HOUR, PushAddresses, pushAddress, pushOn, sendPush, vapidAuth, vapidKey } from "../../server/src/push.ts";
import { PUSH_PLAIN, PUSH_PLAIN_TITLE } from "../src/view/watching-words.ts";
import { DemoShoppers, SAVE_WAIT_MS, SESSIONS_MAX, type SavedSession } from "../src/scenario.ts";

const pair = () => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const j = privateKey.export({ format: "jwk" }) as { d: string; x: string; y: string };
  const pub = Buffer.concat([Buffer.from([4]), Buffer.from(j.x, "base64url"), Buffer.from(j.y, "base64url")]).toString("base64url");
  return { pub, priv: j.d, jwk: j };
};
const FCM = "https://fcm.googleapis.com/fcm/send/abc:123";

describe("the switch", () => {
  it("is off unless PING_PUSH=on and all three keys are well formed", () => {
    const k = pair();
    const env = { PING_PUSH: "on", VAPID_PUBLIC_KEY: k.pub, VAPID_PRIVATE_KEY: k.priv, VAPID_SUBJECT: "mailto:goose@example.com" };
    expect(pushOn(env)).toBe(true);
    expect(pushOn({ ...env, PING_PUSH: "1" })).toBe(false);
    expect(pushOn({ ...env, VAPID_PRIVATE_KEY: undefined })).toBe(false);
    expect(pushOn({ ...env, VAPID_PUBLIC_KEY: k.priv })).toBe(false);
    expect(pushOn({ ...env, VAPID_SUBJECT: "goose" })).toBe(false);
    expect(pushOn({})).toBe(false);
  });
});

describe("where a push may go", () => {
  it("only the browsers' push services, over https on the default port", () => {
    for (const ok of [FCM, "https://updates.push.services.mozilla.com/wpush/v2/gAAA", "https://web.push.apple.com/QGuQ", "https://wns2-par02p.notify.windows.com/w/?token=x"]) expect(pushAddress(ok)).toBe(new URL(ok).href);
    for (const bad of ["http://fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "https://user:pw@fcm.googleapis.com/x", "https://fcm.googleapis.com.evil.example/x", "https://evil.example/fcm.googleapis.com", "https://127.0.0.1/x", "https://localhost/x", "https://push.apple.com.evil.example/x", "https://a.b.push.apple.com/x", "not a url", 42, null, `https://fcm.googleapis.com/${"a".repeat(1100)}`]) expect([bad, pushAddress(bad)]).toEqual([bad, null]);
  });
});

describe("VAPID", () => {
  it("signs an ES256 JWT for the push service's origin that its public key verifies", () => {
    const k = pair();
    const at = Date.UTC(2026, 10, 6, 3, 0);
    const auth = vapidAuth(FCM, k.pub, vapidKey(k.pub, k.priv), "mailto:goose@example.com", at);
    const m = auth.match(/^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/)!;
    expect(m[4]).toBe(k.pub);
    expect(JSON.parse(Buffer.from(m[1]!, "base64url").toString())).toEqual({ typ: "JWT", alg: "ES256" });
    expect(JSON.parse(Buffer.from(m[2]!, "base64url").toString())).toEqual({ aud: "https://fcm.googleapis.com", exp: at / 1000 + 12 * 3600, sub: "mailto:goose@example.com" });
    const pub = createPublicKey({ key: { kty: "EC", crv: "P-256", x: k.jwk.x, y: k.jwk.y }, format: "jwk" });
    expect(verify("sha256", Buffer.from(`${m[1]}.${m[2]}`), { key: pub, dsaEncoding: "ieee-p1363" }, Buffer.from(m[3]!, "base64url"))).toBe(true);
  });

  it("refuses a public key that isn't an uncompressed point", () => {
    const k = pair();
    expect(() => vapidKey(k.priv, k.priv)).toThrow(/uncompressed/);
  });
});

describe("the push", () => {
  it("is empty, never follows a redirect, and says when the address is gone", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const answer = (status: number) => (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(null, { status }); }) as unknown as typeof fetch;
    expect(await sendPush(FCM, "vapid t=x, k=y", answer(201))).toBe("sent");
    expect(calls[0]!.init.body).toBeUndefined();
    expect(calls[0]!.init.redirect).toBe("manual");
    expect(calls[0]!.init.headers).toMatchObject({ Authorization: "vapid t=x, k=y", TTL: "600", "Content-Length": "0" });
    expect(await sendPush(FCM, "a", answer(410))).toBe("gone");
    expect(await sendPush(FCM, "a", answer(404))).toBe("gone");
    expect(await sendPush(FCM, "a", answer(302))).toBe("failed");
    expect(await sendPush(FCM, "a", answer(500))).toBe("failed");
    const n = calls.length;
    expect(await sendPush("https://evil.example/x", "a", answer(201))).toBe("failed");
    expect(calls.length).toBe(n);
    expect(await sendPush(FCM, "a", (async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toBe("failed");
  });

  it("the private key is never logged or put in a body", async () => {
    const src = readFileSync(new URL("../../server/src/push.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/console\.\w+\([^)]*(VAPID_PRIVATE_KEY|privateKey)/);
  });
});

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const walk = (dir: string): string[] => readdirSync(new URL(`../../${dir}/`, import.meta.url)).flatMap((f) => (statSync(new URL(`../../${dir}/${f}`, import.meta.url)).isDirectory() ? walk(`${dir}/${f}`) : [`${dir}/${f}`]));

describe("what Level 2 keeps", () => {
  it("only a push service's address, per session, forgotten on Stop, at the cap, and on Dec 22", () => {
    let t = Date.UTC(2026, 10, 6);
    const kept = new PushAddresses(() => t);
    expect(kept.keep("s1", "https://evil.example/x")).toBe("refused");
    expect(kept.keep("s1", FCM)).toBe("kept");
    expect(kept.has("s1")).toBe(true);
    expect(kept.has("s2")).toBe(false);
    kept.forget("s1");
    expect(kept.has("s1")).toBe(false);
    kept.keep("s1", FCM);
    t = PUSH_UNTIL;
    expect(kept.has("s1")).toBe(false);
    expect(kept.size).toBe(0);
    expect(kept.keep("s1", FCM)).toBe("refused");
    t = Date.UTC(2026, 10, 6);
    // Full: only addresses whose session is gone make room. A live shopper's is never pushed out, and since live sessions
    // are capped below the store's size, a newcomer is never locked out either.
    expect(PUSH_ADDRESSES_MAX).toBeGreaterThan(SESSIONS_MAX);
    const live = new Set<string>();
    const full = new PushAddresses(() => t, (s) => live.has(s));
    for (let i = 0; i < PUSH_ADDRESSES_MAX; i++) { full.keep(`s${i}`, FCM); if (i < SESSIONS_MAX - 1) live.add(`s${i}`); }
    live.add("one more");
    expect(full.keep("one more", FCM)).toBe("kept");
    expect([full.size, full.has("s0"), full.has(`s${SESSIONS_MAX - 2}`), full.has(`s${SESSIONS_MAX}`), full.has("one more")]).toEqual([SESSIONS_MAX, true, true, false, true]);
    // A store of only live sessions refuses rather than evicts (can't happen while the cap holds).
    const allLive = new PushAddresses(() => t, () => true);
    for (let i = 0; i < PUSH_ADDRESSES_MAX; i++) allLive.keep(`s${i}`, FCM);
    expect([allLive.keep("one more", FCM), allLive.has("s0")]).toEqual(["refused", true]);
  });

  it("the room check counts only sessions in memory: never a stored one, and it never reads the store", () => {
    vi.useFakeTimers();
    try {
      const saved = new Map<string, SavedSession>();
      let loads = 0;
      const store = { load: (k: string) => { loads++; return saved.get(k); }, save: (k: string, s: SavedSession) => { saved.set(k, s); } };
      const t = Date.UTC(2026, 10, 6);
      const shoppers = new DemoShoppers({ max: 2, store });
      for (const k of ["a", "b", "c"]) { shoppers.session(k, t); shoppers.setWant(k, { catalogId: "marsh-lights-ticket", priority: "really", max: 9000 }, t); }
      vi.advanceTimersByTime(SAVE_WAIT_MS + 1);
      expect([saved.has("a"), shoppers.size]).toEqual([true, 2]);
      loads = 0;
      // "a" was pushed out of memory by the cap but is still in the store: alive for peek, not in memory for the room check.
      expect([shoppers.alive("a", t), shoppers.inMemory("a", t), shoppers.inMemory("c", t), shoppers.inMemory("nobody", t)]).toEqual([true, false, true, false]);
      const afterAlive = loads;
      expect(afterAlive).toBe(1);
      shoppers.inMemory("a", t); shoppers.inMemory("nobody", t);
      expect(loads).toBe(afterAlive);
    } finally { vi.useRealTimers(); }
  });

  it("six pushes an hour at most, and a push's words are read once", () => {
    let t = Date.UTC(2026, 10, 6);
    const kept = new PushAddresses(() => t);
    expect(kept.take("s1", "marsh-lights-ticket")).toBe(false);
    kept.keep("s1", FCM);
    for (let i = 0; i < PUSHES_PER_HOUR; i++) expect(kept.take("s1", "marsh-lights-ticket")).toBe(true);
    expect(kept.take("s1", "marsh-lights-ticket")).toBe(false);
    expect(kept.due("s1")).toBe("marsh-lights-ticket");
    expect(kept.due("s1")).toBeNull();
    expect(kept.due("s2")).toBeNull();
    t += 3600_000;
    expect(kept.take("s1", "marsh-lights-ticket")).toBe(true);
  });
});

describe("Level 2 on the server and the page", () => {
  it("every push route answers 404 with the switch off, and the words are her own ping or a line with no price", () => {
    const main = read("server/src/main.ts");
    const routes = main.match(/app\.(get|post)\("\/api\/runs\/push[^"]*"/g)!;
    expect(routes).toEqual(['app.get("/api/runs/push"', 'app.post("/api/runs/push"', 'app.post("/api/runs/push/remove"', 'app.get("/api/runs/push/words"']);
    expect(main.match(/if \(!PUSH_KEY\) return c\.json\(\{ error: "off" \}, 404\);/g)).toHaveLength(4);
    expect(main).toContain("const p = due && session ? pingsFor(session.wants, CATALOG, session.policy)[due] : undefined;");
    // Kept only for a session that watches something, inside the want changes' caps.
    const keep = main.slice(main.indexOf('app.post("/api/runs/push"'), main.indexOf('app.post("/api/runs/push/remove"'));
    expect(keep).toContain("session.wants.length === 0) return");
    expect(keep).toContain("WANT_CAPS.takeOrWhy(");
    // The room check reads memory only: it never renews or loads a session (peek would), and never reads the store,
    // whose sessions SESSIONS_MAX doesn't bound (security review, third finding).
    expect(main).toContain("const PUSHES = new PushAddresses(() => Date.now(), (k) => SHOPPERS.inMemory(k, Date.now()));");
    expect(main).not.toMatch(/PushAddresses\([^;]*SHOPPERS\.(alive|peek|session)\(/);
    expect(PUSH_PLAIN).not.toMatch(/\$|\d/);
    expect(main).toContain('{ title: PUSH_PLAIN_TITLE, body: PUSH_PLAIN, tag: "goose" }');
    // The plain line says "Simulated", true only while every push is the simulated week's: pushLater reads pingsFor only,
    // and the keep route says `ping` only when pushLater really queued one.
    expect(PUSH_PLAIN.startsWith("Simulated: ")).toBe(true);
    const later = main.slice(main.indexOf("function pushLater("), main.indexOf("const pushKeyOf"));
    expect(later).toContain("!pingsFor(session.wants, CATALOG, session.policy)[catalogId]");
    expect(later).not.toMatch(/realRows|RealWatch|channel3/i);
    expect(main).toContain("return c.json({ kept: true, ping: first !== undefined && pushLater(key, first) });");
  });

  it("the service worker shows only the server's words or core's plain line, caches nothing and handles no fetch", () => {
    const sw = read("web/public/ping-sw.js");
    expect(sw).toContain(`const PLAIN_TITLE = ${JSON.stringify(PUSH_PLAIN_TITLE)};`);
    expect(sw).toContain(`const PLAIN = ${JSON.stringify(PUSH_PLAIN)};`);
    expect(sw).toContain('let w = { title: PLAIN_TITLE, body: PLAIN, tag: "goose" };');
    expect(sw).toContain('fetch("/api/runs/push/words", { credentials: "same-origin", cache: "no-store" })');
    expect(sw).not.toMatch(/addEventListener\("fetch"|caches\.|importScripts|localStorage|indexedDB/);
  });

  it("only the closed-tab button registers a worker or subscribes, and it asks for permission only inside its own press", () => {
    const hits = walk("web/src").filter((f) => /\.(ts|tsx)$/.test(f) && /pushManager|serviceWorker\.register/.test(read(f)));
    expect(hits).toEqual(["web/src/desk/PushRow.tsx"]);
    const row = read("web/src/desk/PushRow.tsx");
    // Shown wherever a push can come and notifications aren't blocked (phones ask here; the L2 DD seat). ping.test pins the ask.
    expect(row).toContain("if (blocked) return null;");
    expect(row).toContain('Notification.permission === "denied"');
    // It promises a ping only when the server says one is on its way (the DD: no promise a push won't keep).
    expect(row).toContain("setLine(r.data.ping ? PUSH_SENT : PUSH_SENT_NONE)");
    expect(read("web/src/desk/Panes.tsx")).toContain("got.push && got.wants.length > 0 && <Suspense fallback={null}><PushRow /></Suspense>");
  });
});
