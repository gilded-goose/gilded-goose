// The Postman collection for builders: what it may hold, and the fake rail's mock decline it leans on. The collection itself is run
// with newman (no dependency here): this pins what can't be allowed to drift, with the route's real behavior behind it.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bootServer, type Booted } from "./boot.ts";

const file = join(import.meta.dirname, "..", "..", "docs", "builders", "gilded-goose.postman_collection.json");
const text = readFileSync(file, "utf8");
interface Item { name: string; request: { method: string; url: string; header: { key: string }[]; auth?: unknown } }
const c = JSON.parse(text) as { auth?: unknown; event: { listen: string; script: { exec: string[] } }[]; variable: { key: string; value: string }[]; item: { name: string; item: Item[] }[] };
const items = c.item.flatMap((f) => f.item);

const boot = (more: Record<string, string>): Promise<Booted> => {
  const dir = mkdtempSync(join(tmpdir(), "goose-postman-"));
  return bootServer((port, base) => {
    const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port), HOST: "127.0.0.1", PUBLIC_URL: base, GOOSE_DIR: dir, RUN_LIBRARY_DIR: join(dir, "runs"), BUYER: "rule", ...more };
    delete env.ANTHROPIC_API_KEY; delete env.TURSO_DATABASE_URL; delete env.TURSO_AUTH_TOKEN; delete env.RENDER;
    return env;
  }).then((s) => ({ ...s, stop: () => s.stop().finally(() => rmSync(dir, { recursive: true, force: true })) }));
};

describe("the Postman collection", () => {
  it("defaults to this machine, and every request goes where that variable says or where the server sent it", () => {
    expect(c.variable.find((v) => v.key === "baseUrl")?.value).toBe("http://localhost:8787");
    for (const i of items) expect(i.request.url, i.name).toMatch(/^\{\{(baseUrl|approveUrl|returnUrl)\}\}/);
    expect(items.filter((i) => i.request.method === "POST").every((i) => i.request.url.startsWith("{{baseUrl}}"))).toBe(true);
  });

  it("names no live site and holds no key, whatever a saved reply carried", () => {
    expect(text).not.toMatch(/onrender\.com|paypal\.com|sk-ant|Bearer |PAYPAL_CLIENT|set-cookie/i);
    expect(c.auth).toBeUndefined();
    for (const i of items) {
      expect(i.request.auth, i.name).toBeUndefined();
      expect(i.request.header.map((h) => h.key), i.name).not.toContain("Authorization");
    }
  });

  it("stops a write to any other host, before the first request of its own", () => {
    const guard = c.event.find((e) => e.listen === "prerequest")!.script.exec.join("\n");
    expect(guard).toContain("pm.execution.skipRequest()");
    const shape = /\/\^(.+)\/\.test\(base\)/.exec(guard)?.[1];
    const local = new RegExp(`^${shape!}`);
    for (const yes of ["http://localhost:8787", "http://127.0.0.1:8841/", "http://[::1]:8787"]) expect(local.test(yes), yes).toBe(true);
    for (const no of ["https://gilded-goose.onrender.com", "http://localhost.evil.test", "http://127.0.0.1.evil.test:80", "http://evil.test/localhost:8787"]) expect(local.test(no), no).toBe(false);
  });

  it("holds the five things it promises, and answers come saved beside each request", () => {
    expect(c.item.map((f) => f.name)).toEqual(["0. Is this the fake rail?", "1. One tap, one exact cart", "2. No tap, no money", "3. A mock decline", "4. The guard refuses a changed cart"]);
    expect((c.item[0]!.item[0] as unknown as { event: { script: { exec: string[] } }[] }).event[0]!.script.exec.join("\n")).toContain("pm.execution.setNextRequest(null)");
    for (const i of items) expect((i as unknown as { response: { code: number }[] }).response.length, i.name).toBeGreaterThan(0);
  });
});

describe("the fake rail's mock decline", () => {
  const json = { "Content-Type": "application/json" };

  it("declines one capture: nothing charged, the hold released, and the next cart pays", async () => {
    const s = await boot({ PAYMENT: "fake" });
    try {
      let cookie = "";
      const go = async (url: string, init: RequestInit = {}) => {
        const r = await fetch(url, { redirect: "manual", ...init, headers: { ...(init.headers as Record<string, string>), ...(cookie ? { Cookie: cookie } : {}) } });
        const set = r.headers.get("set-cookie");
        if (set) cookie = set.split(";")[0]!;
        return r;
      };
      const buy = async (decline: boolean) => {
        const cart = await (await go(`${s.base}/api/runs/store/cart`, { method: "POST", headers: json, body: JSON.stringify({ listingId: "ss-pondside-kettle" }) })).json() as { runId: string };
        const { approveUrl } = await (await go(`${s.base}/api/runs/store/complete_payment`, { method: "POST", headers: json, body: JSON.stringify({ runId: cart.runId }) })).json() as { approveUrl: string };
        if (decline) expect(await (await go(`${s.base}/api/fake-paypal/decline-next`, { method: "POST" })).json()).toEqual({ declines: 1 });
        const tapped = await go(approveUrl);
        await go(tapped.headers.get("location")!);
        return await (await go(`${s.base}/api/runs/${cart.runId}`)).json() as { settled: { ok: boolean; reason?: string; captureId?: string }; events: { action: string; why?: string }[] };
      };
      const declined = await buy(true);
      expect(declined.settled.ok).toBe(false);
      expect(declined.settled.reason).toContain("nothing was charged");
      expect(declined.settled.captureId).toBeUndefined();
      expect(declined.events.map((e) => e.action)).not.toContain("captured");
      expect(declined.events.find((e) => e.action === "capture-failed")?.why).toContain("released");
      // Control: one decline, not a broken rail. The same steps pay.
      const paid = await buy(false);
      expect(paid.settled.ok).toBe(true);
      expect(paid.events.map((e) => e.action)).toContain("captured");
    } finally { await s.stop(); }
  }, 60_000);

  it("isn't a route on a server without the fake rail", async () => {
    const s = await boot({ PAYMENT: "", PAYPAL_CLIENT_ID: "", PAYPAL_CLIENT_SECRET: "" });
    try {
      expect((await fetch(`${s.base}/api/fake-paypal/decline-next`, { method: "POST" })).status).toBe(404);
    } finally { await s.stop(); }
  }, 60_000);
});
