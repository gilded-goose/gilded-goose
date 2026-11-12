// Round 2 red team's server fixes (Track AS, slice 7; `q/round2/redteam.md` fixes 2 and 4), on one booted server each.
// Fix 2: GET /api/runs/:id answers a non-owner (a shared run link, the judge path) with the cart, its hash and the
// trail, in the same shape as the owner's answer, but PayPal's order id only to the run's own browser (in `bound` and,
// since AS-9, inside the trail's rows and the run's event stream too); the capture
// return without the run's secret is still a 403. Fix 4: /voice-test and /voice-test-2 (and the build's own copy
// voice-test-2.html) are mounted only off Render; on Render they are a 404 like any unknown path.
// (Fix 1, the 400 for a smuggled message, and fix 3, the route's own cookie, are in ask-view.test.ts.)
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import http from "node:http";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { bootServer, type Booted } from "./boot.ts";

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const tmp = (): string => { const d = mkdtempSync(join(tmpdir(), "goose-r2-")); dirs.push(d); return d; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A fake-payment server on an empty disk, never with a real key, store or Render flag from the shell unless `more` sets it. */
async function boot(more: Record<string, string> = {}): Promise<Booted> {
  const dir = tmp();
  return bootServer((port, base) => {
    const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port), HOST: "127.0.0.1", PUBLIC_URL: base, GOOSE_DIR: dir, RUN_LIBRARY_DIR: join(dir, "runs"), PAYMENT: "fake", BUYER: "rule", ...more };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_BASE_URL; delete env.TURSO_DATABASE_URL; delete env.TURSO_AUTH_TOKEN;
    if (!("RENDER" in more)) delete env.RENDER;
    return env;
  });
}

interface RunView { done: boolean; shopper: unknown; approveUrl: string | null; canApprove: boolean; bound: { hash: string; orderId: string | null; total: string; spent: boolean } | null; events: unknown[] }

/** One browser: keeps its runs cookie like a browser would. */
function browser(s: Booted) {
  let cookie = "";
  const req = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(`${s.base}${path}`, { redirect: "manual", ...init, headers: { ...(init.headers as Record<string, string>), ...(cookie ? { Cookie: cookie } : {}) } });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0]!;
    return r;
  };
  return {
    get cookie() { return cookie; },
    post: (path: string, body: unknown) => req(path, { method: "POST", headers: { "Content-Type": "application/json", Origin: s.base }, body: JSON.stringify(body) }),
    view: async (id: string) => (await req(`/api/runs/${id}`)).json() as Promise<RunView>,
    async run() {
      const r = await this.post("/api/runs", { seed: 1, pace: false });
      expect(r.status).toBe(200);
      const { runId } = await r.json() as { runId: string };
      let v = await this.view(runId);
      for (let i = 0; i < 100 && !v.done; i++) { await sleep(50); v = await this.view(runId); }
      expect(v.done).toBe(true);
      return runId;
    },
  };
}

describe("fix 2: PayPal's order id is the owner's; the shared run link keeps the trail", () => {
  it("non_owner_run_view_has_no_order_id: the owner sees bound.orderId after Approve; a stranger and another browser get null in the same shape, with the events and the cart hash; the return without the secret is 403", async () => {
    const s = await boot();
    try {
      const me = browser(s);
      const runId = await me.run();
      const a = await me.post(`/api/runs/${runId}/approve`, {});
      expect(a.status).toBe(200);
      const { approveUrl } = await a.json() as { approveUrl: string };
      expect(approveUrl).toContain("FAKE-0001");

      const owner = await me.view(runId);
      expect(owner.bound?.orderId).toBe("FAKE-0001");
      expect(owner.approveUrl).toBe(approveUrl);
      expect(owner.canApprove).toBe(true);
      expect(owner.events.length).toBeGreaterThan(0);

      const other = browser(s);
      await other.run();
      expect(other.cookie).not.toBe("");
      for (const headers of [{}, { Cookie: other.cookie }, { Cookie: "gg_runs=not-a-token" }]) {
        const r = await fetch(`${s.base}/api/runs/${runId}`, { headers });
        expect(r.status).toBe(200);
        const v = await r.json() as RunView;
        expect(Object.keys(v).sort()).toEqual(Object.keys(owner).sort()); // one shape for everyone: no oracle
        expect(Object.keys(v.bound!).sort()).toEqual(Object.keys(owner.bound!).sort());
        expect(v.bound).toEqual({ ...owner.bound, orderId: null });
        expect(v.bound?.hash).toBe(owner.bound?.hash); // the judge path reads the cart's hash
        expect(v.approveUrl).toBeNull();
        expect(v.canApprove).toBe(false);
        expect(v.shopper).toBeNull();
        // AS-9 (the slice 7 leftover): the trail is kept whole for the judge path, row for row and key for key, but
        // PayPal's order id is the owner's there too: the `order-created` row stays, its words and `data.orderId` say
        // "(id hidden)", and the cart's hash on it stays. Nothing in a non-owner's answer names the order.
        expect(v.events.length).toBe(owner.events.length);
        type Row = { action: string; why: string; data?: Record<string, unknown> };
        (v.events as Row[]).forEach((e, i) => {
          const mine = owner.events[i] as Row;
          expect(Object.keys(e).sort()).toEqual(Object.keys(mine).sort());
          expect(Object.keys(e.data ?? {}).sort()).toEqual(Object.keys(mine.data ?? {}).sort());
          if (!JSON.stringify(mine).includes("FAKE-0001")) expect(e).toEqual(mine); // rows that never named it are as written
        });
        const created = (v.events as Row[]).find((e) => e.action === "order-created")!;
        const ownCreated = (owner.events as Row[]).find((e) => e.action === "order-created")!;
        expect(ownCreated.why).toContain("FAKE-0001");
        expect(ownCreated.data?.orderId).toBe("FAKE-0001");
        expect(created.why).toBe(ownCreated.why.replace("FAKE-0001", "(id hidden)"));
        expect(created.data).toEqual({ ...ownCreated.data, orderId: "(id hidden)" });
        expect(created.data?.hash).toBe(owner.bound?.hash);
        expect(JSON.stringify(v)).not.toContain("FAKE-0001");
        // The run's event stream gives a non-owner the same rows: no order id there either.
        const sse = await (await fetch(`${s.base}/api/runs/${runId}/events`, { headers })).text();
        expect(sse).toContain("order-created");
        expect(sse).toContain("(id hidden)");
        expect(sse).not.toContain("FAKE-0001");
      }
      // The owner's own stream still names it.
      expect(await (await fetch(`${s.base}/api/runs/${runId}/events`, { headers: { Cookie: me.cookie } })).text()).toContain("FAKE-0001");
      // Even a stranger who knew the order id can't capture: the return needs the run's own 128-bit secret.
      const ret = await fetch(`${s.base}/api/runs/${runId}/return?k=${"deadbeef".repeat(4)}&token=FAKE-0001`, { redirect: "manual" });
      expect(ret.status).toBe(403);
      expect(await ret.text()).toBe("not this run's return");
      expect((await me.view(runId)).bound?.spent).toBe(false);
    } finally { await s.stop(); }
  }, 60_000);
});

describe("fix 4: the voice test pages are dev pages, mounted only off Render", () => {
  /** A stand-in web build with the mic test page in it, so the static copy is tested too. */
  const dist = (): string => {
    const d = join(tmp(), "dist");
    mkdirSync(d);
    writeFileSync(join(d, "index.html"), "<!doctype html><title>goose</title>");
    writeFileSync(join(d, "voice-test-2.html"), "<!doctype html><title>mic</title>");
    return d;
  };
  const PAGES = ["/voice-test", "/voice-test-2", "/voice-test-2.html"];

  it("voice_test_pages_local_only: off Render the three answer; on Render each is a 404, the app and its API unchanged", async () => {
    const local = await boot({ WEB_DIST: dist() });
    try {
      for (const p of PAGES) {
        const r = await fetch(`${local.base}${p}`);
        expect(r.status, p).toBe(200);
        if (p !== "/voice-test-2.html") expect(r.headers.get("x-robots-tag"), p).toBe("noindex");
      }
    } finally { await local.stop(); }

    // PAYMENT=fake refuses to boot on Render (fake-payment.ts), as it should; the hosted case runs with PayPal off.
    const hosted = await boot({ WEB_DIST: dist(), RENDER: "true", PAYMENT: "" });
    try {
      for (const p of PAGES) expect((await fetch(`${hosted.base}${p}`)).status, p).toBe(404);
      expect((await fetch(`${hosted.base}/`)).status).toBe(200);
      expect((await fetch(`${hosted.base}/api/health`)).status).toBe(200);
      expect((await fetch(`${hosted.base}/no-such-page`)).status).toBe(404);
    } finally { await hosted.stop(); }
  }, 60_000);

  // Track F's commit gave every text file a Brotli and a gzip copy (web/compress.ts), and the block above is one exact
  // path, so `/voice-test-2.html.br` walked around it. A copy is only ever chosen by the server, from Accept-Encoding.
  it("precompressed_copies_only_by_negotiation: a copy asked for by name is a 404, the page and the assets still compress", async () => {
    const d = dist();
    writeFileSync(join(d, "index.html.br"), "index-copy");
    for (const copy of ["voice-test-2.html.br", "voice-test-2.html.gz", "safe.html.br"]) writeFileSync(join(d, copy), "copy");
    mkdirSync(join(d, "assets"));
    writeFileSync(join(d, "assets", "a-AbCd1234.wasm.br"), "wasm-copy");
    const hosted = await boot({ WEB_DIST: d, RENDER: "true", PAYMENT: "" });
    try {
      for (const p of ["/voice-test-2.html.br", "/voice-test-2.html.gz", "/voice-test-2.html.BR", "/voice-test-2.html%2Ebr", "/voice-test-2%2Ehtml%2Egz", "/safe.html.br", "/index.html.br"]) {
        const r = await fetch(`${hosted.base}${p}`);
        expect(r.status, p).toBe(404);
        expect(await r.text(), p).not.toBe("copy");
      }
      // A client that never normalizes the path: fetch would have collapsed the `..` itself.
      for (const raw of ["/assets/../voice-test-2.html.br", "/assets/%2E%2E/voice-test-2.html.br"]) {
        const status = await new Promise<number>((done, fail) => {
          const url = new URL(hosted.base);
          http.get({ host: url.hostname, port: url.port, path: raw }, (res) => { res.resume(); done(res.statusCode ?? 0); }).on("error", fail);
        });
        expect(status, raw).toBe(404);
      }
      // The exact-path block itself, spelled another way.
      expect((await fetch(`${hosted.base}/voice-test-2%2Ehtml`)).status).toBe(404);
      // The negotiation still works, and a hashed asset's own copy is still fetchable (the wasm's cache rule names it).
      const page = await fetch(`${hosted.base}/`, { headers: { "accept-encoding": "br" }, decompress: false } as RequestInit);
      expect(page.headers.get("content-encoding")).toBe("br");
      expect((await fetch(`${hosted.base}/assets/a-AbCd1234.wasm.br`)).status).toBe(200);
    } finally { await hosted.stop(); }
  }, 60_000);
});
