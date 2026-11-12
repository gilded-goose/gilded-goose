// ADR 0010 (Joshua's yes, Wed Oct 28): reading an order and refunding a capture go through PayPal's Agent Toolkit, as a
// client library behind PaymentPort. Its tools are never handed to the model, only this adapter imports it, and the
// browser bundle never carries it. Nothing here reaches the network: the Toolkit is a stand-in, or the real one is only
// built and asked for its tool list.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { ClaudeBuyer } from "../../server/src/adapters/claude.ts";
import { BRAND_NAME, PAYPAL_TIMEOUT_MS, PayPalPort, TOOLKIT_READER_MS, realToolkitMaker, toolkitOf, type ToolkitCalls, type ToolkitMaker } from "../../server/src/adapters/paypal.ts";
import { demoWant, refundRequestId, toCents, type BoundCart } from "../src/index.ts";

const ORDER = { id: "O1", status: "APPROVED", intent: "CAPTURE", purchase_units: [{ custom_id: "h", amount: { value: "42.00", currency_code: "USD" }, payee: { merchant_id: "M1" } }] };

/** A stand-in Toolkit that records every call and answers with the given text. */
function standIn(order: string, refund = JSON.stringify({ id: "R1", status: "COMPLETED" })) {
  const calls: string[][] = [];
  const toolkit: ToolkitCalls = {
    getOrder: async (id) => { calls.push(["get_order", id]); return order; },
    createRefund: async (id, req) => { calls.push(["create_refund", id, req]); return refund; },
  };
  return { calls, toolkit };
}
const portWith = (toolkit: ToolkitCalls) => new PayPalPort({ clientId: "placeholder", clientSecret: "placeholder", environment: "sandbox", toolkit });

describe("Agent Toolkit behind PaymentPort (ADR 0010)", () => {
  it("toolkit_reads_and_refunds: get and refund go through the Toolkit, never REST fetch", async () => {
    const fetchSpy = vi.fn(async () => { throw new Error("REST fetch must not be called for get or refund"); });
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const { calls, toolkit } = standIn(JSON.stringify(ORDER));
      const port = portWith(toolkit);
      expect(await port.get("O1")).toEqual({ id: "O1", status: "APPROVED", amount: 4200, currency: "USD", customId: "h", payee: "M1", intent: "CAPTURE" });
      const req = refundRequestId("a1b2c3");
      expect(await port.refund("CAP-1", req)).toEqual({ status: "COMPLETED", refundId: "R1" });
      // The refund's PayPal-Request-Id is the run's own key, so a retry answers the first refund.
      expect(calls).toEqual([["get_order", "O1"], ["create_refund", "CAP-1", req]]);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it("toolkit_errors_throw: PayPal's error, the Toolkit's own error and unreadable text each throw, never read as an order", async () => {
    const replies = [
      JSON.stringify({ ok: false, status: 404, code: "PAYPAL_API_HTTP_ERROR", message: "RESOURCE_NOT_FOUND" }),
      JSON.stringify({ error: { message: "boom", type: "paypal_error" } }),
      "not json", "null", "[]", "42", "undefined",
    ];
    for (const text of replies) {
      await expect(portWith(standIn(text, text).toolkit).get("O1"), text).rejects.toThrow(/paypal get/);
      await expect(portWith(standIn(text, text).toolkit).refund("CAP-1", "goose-refund-r1"), text).rejects.toThrow(/paypal refund/);
    }
    // The status and code reach the server log's message; Undo and the guard write fixed words of their own.
    await expect(portWith(standIn(replies[0]!).toolkit).get("O1")).rejects.toThrow("paypal get 404: PAYPAL_API_HTTP_ERROR");
    // Control: a good order reads.
    expect((await portWith(standIn(JSON.stringify(ORDER)).toolkit).get("O1")).status).toBe("APPROVED");
  });

  it("toolkit_bent_ids_never_reach_the_url: the Toolkit pastes ids into its URL as they are, so a bent one throws first", async () => {
    const { calls, toolkit } = standIn(JSON.stringify(ORDER));
    const port = portWith(toolkit);
    for (const bad of ["../v1/oauth2/token", "O1?x=1", "O1/capture", "", "a".repeat(65)]) {
      await expect(port.get(bad), bad).rejects.toThrow("unreadable id");
      await expect(port.refund(bad, "goose-refund-r1"), bad).rejects.toThrow("unreadable id");
      await expect(port.refund("CAP-1", bad), bad).rejects.toThrow("unreadable id");
    }
    expect(calls).toEqual([]);
    // A refund id that isn't an id never reaches a row's words: it's left out, and the refund still counts as made.
    const bent = standIn("{}", JSON.stringify({ id: "R1 <script>", status: "COMPLETED" }));
    expect(await portWith(bent.toolkit).refund("CAP-1", "goose-refund-r1")).toEqual({ status: "COMPLETED", refundId: "" });
  });

  it("toolkit_times_out: a Toolkit call that never answers throws at PAYPAL_TIMEOUT_MS, not before", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const never = (): Promise<string> => new Promise(() => {});
      const port = portWith({ getOrder: never, createRefund: never });
      for (const [what, call] of [["get", () => port.get("O1")], ["refund", () => port.refund("CAP-1", "goose-refund-r1")]] as const) {
        let settled: unknown = "pending";
        const p = call().then(() => "answered", (e: Error) => e.message);
        void p.then((v) => { settled = v; });
        await vi.advanceTimersByTimeAsync(PAYPAL_TIMEOUT_MS - 1);
        expect(settled, what).toBe("pending");
        await vi.advanceTimersByTimeAsync(1);
        expect(await p).toBe(`paypal ${what}: no answer in ${PAYPAL_TIMEOUT_MS} ms`);
      }
    } finally { vi.useRealTimers(); }
  });

  it("toolkit_instances: one reader rebuilt every 30 minutes; each refund its own instance carrying its request id", async () => {
    let t = 0;
    const made: { sandbox: true; request_id?: string }[] = [];
    const ran: [string, unknown][] = [];
    const make: ToolkitMaker = async (context) => {
      made.push(context);
      return { tools: ["get_order", "create_refund"], run: async (name, args) => { ran.push([name, args]); return "{}"; } };
    };
    const tk = toolkitOf(make, () => t);
    await tk.getOrder("O1");
    t = TOOLKIT_READER_MS - 1;
    await tk.getOrder("O2");
    expect(made).toEqual([{ sandbox: true }]);
    t = TOOLKIT_READER_MS;
    await tk.getOrder("O3");
    expect(made).toEqual([{ sandbox: true }, { sandbox: true }]);
    await tk.createRefund("CAP-1", "goose-refund-r1");
    await tk.createRefund("CAP-2", "goose-refund-r2");
    expect(made.slice(2)).toEqual([{ sandbox: true, request_id: "goose-refund-r1" }, { sandbox: true, request_id: "goose-refund-r2" }]);
    expect(ran).toEqual([["get_order", { id: "O1" }], ["get_order", { id: "O2" }], ["get_order", { id: "O3" }], ["create_refund", { capture_id: "CAP-1" }], ["create_refund", { capture_id: "CAP-2" }]]);
    // A reader that failed to build isn't kept: the next read builds again.
    let fail = true;
    const flaky: ToolkitMaker = async (context) => { made.push(context); if (fail) throw new Error("import failed"); return make(context); };
    const tk2 = toolkitOf(flaky, () => 0);
    await expect(tk2.getOrder("O1")).rejects.toThrow("import failed");
    fail = false;
    expect(await tk2.getOrder("O1")).toBe("{}");
  });

  it("toolkit_exposes_six_tools: the real Toolkit, built with these actions, offers exactly get_order, create_refund, the two shipment tools, list_disputes and list_transactions", async () => {
    const tk = await realToolkitMaker("placeholder", "placeholder")({ sandbox: true });
    expect([...tk.tools].sort()).toEqual(["create_refund", "create_shipment_tracking", "get_order", "get_shipment_tracking", "list_disputes", "list_transactions"]);
    // Control: a tool it didn't turn on is refused by name before the Toolkit runs it (no network either way).
    const only = toolkitOf(async () => ({ ...tk, tools: ["get_order"] }));
    await expect(only.createRefund("CAP-1", "goose-refund-r1")).rejects.toThrow("no create_refund tool");
  }, 30_000);

  it("toolkit_wire: the real Toolkit, aimed at a local stub, sends get_order and create_refund as PayPal expects, and its errors throw", async () => {
    // The real Toolkit code (its axios calls included), with two of its client's methods redirected for this test only:
    // the base URL to a stub on 127.0.0.1 and the token to a placeholder. The adapter has no such switch; it is sandbox only.
    // This file loads the Toolkit's entry itself to reach that client: tests aren't held to the one-importer rule below.
    const seen: { method: string; url: string; requestId: string | undefined; body: string }[] = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        seen.push({ method: req.method!, url: req.url!, requestId: req.headers["paypal-request-id"] as string | undefined, body });
        const [status, reply] = req.url === "/v2/checkout/orders/O1" ? [200, ORDER]
          : req.url === "/v2/payments/captures/CAP-1/refund" ? [201, { id: "R1", status: "COMPLETED" }]
          : [422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "CAPTURE_FULLY_REFUNDED" }] }];
        res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(reply));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const entry = (await import(new URL("../../server/node_modules/@paypal/agent-toolkit/openai/index.js", import.meta.url).href)) as { PayPalAgentToolkit: new (c: object) => { client: object } };
    const client = Object.getPrototypeOf(new entry.PayPalAgentToolkit({ clientId: "p", clientSecret: "p", configuration: { actions: {}, context: { sandbox: true } } }).client);
    const spies = [vi.spyOn(client, "getBaseUrl").mockReturnValue(base), vi.spyOn(client, "getAccessToken").mockResolvedValue("placeholder")];
    try {
      const port = portWith(toolkitOf(realToolkitMaker("p", "p")));
      expect(await port.get("O1")).toMatchObject({ id: "O1", status: "APPROVED", amount: 4200, customId: "h" });
      expect(await port.refund("CAP-1", "goose-refund-r1")).toEqual({ status: "COMPLETED", refundId: "R1" });
      await expect(port.refund("CAP-2", "goose-refund-r2")).rejects.toThrow(/paypal refund 422: PAYPAL_API_HTTP_ERROR/);
      expect(seen).toEqual([
        { method: "GET", url: "/v2/checkout/orders/O1", requestId: undefined, body: "" },
        // The capture id rides in the body too: the Toolkit posts its whole args. The sandbox run checks PayPal accepts it.
        { method: "POST", url: "/v2/payments/captures/CAP-1/refund", requestId: "goose-refund-r1", body: JSON.stringify({ capture_id: "CAP-1" }) },
        { method: "POST", url: "/v2/payments/captures/CAP-2/refund", requestId: "goose-refund-r2", body: JSON.stringify({ capture_id: "CAP-2" }) },
      ]);
    } finally {
      for (const spy of spies) spy.mockRestore();
      server.close();
    }
  }, 30_000);

  it("toolkit_one_importer: only the PayPal adapter imports @paypal/agent-toolkit, and the bundle gate looks for it", () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx|js|mjs)$/.test(name)) files.push(p);
      }
    };
    for (const dir of ["trust/src", "core/src", "server/src", "web/src", "scripts"]) walk(join(root, dir));
    const importers = files.filter((f) => /from\s+["']@paypal\/agent-toolkit|import\(\s*["']@paypal\/agent-toolkit/.test(readFileSync(f, "utf8")));
    expect(importers.map((f) => f.slice(root.length))).toEqual(["trust/src/paypal.ts"]);
    expect(readFileSync(join(root, "scripts/check-bundle.sh"), "utf8")).toMatch(/PATTERNS='[^']*\|agent-toolkit[|']/);
  });

  it("model_sees_one_tool: the buyer's Anthropic request carries exactly one tool, move, and no PayPal tool", async () => {
    const buyer = new ClaudeBuyer("placeholder", "prompt");
    const sent: { tools?: { name: string }[] }[] = [];
    (buyer as unknown as { client: { messages: { create: (req: { tools?: { name: string }[] }) => Promise<unknown> } } }).client.messages.create = async (req) => {
      sent.push(req);
      return { content: [{ type: "tool_use", name: "move", input: { type: "wait", why: "ok" } }] };
    };
    await buyer.decide({} as never);
    expect(sent.map((r) => r.tools?.map((t) => t.name))).toEqual([["move"]]);
    // The adapter's other four requests (asker, market maker, reader, photo looker) each send one tool of their own, and none is the Toolkit's.
    const claude = readFileSync(new URL("../../server/src/adapters/claude.ts", import.meta.url), "utf8");
    expect(claude.match(/tools: \[[^\]]*\]/g)).toEqual(["tools: [MOVE_TOOL]", "tools: [tool]", "tools: [tool]", "tools: [tool]", "tools: [tool]"]);
    expect([...claude.matchAll(/tool_choice: \{ type: "tool", name: "([a-z]+)"/g)].map((m) => m[1])).toEqual(["move", "chips", "market", "reading", "look"]);
    expect(claude).not.toMatch(/agent-toolkit|adapters\/paypal|getTools/);
  });
});

describe("PayPal's approval page names us (Joshua, Fri 3:05 PM)", () => {
  it("brand_name: the order asks PayPal to show \"Gilded Goose\", not the sandbox app's \"Test Store\"", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body?: string }) => {
      if (url.endsWith("/v1/oauth2/token")) return new Response(JSON.stringify({ access_token: "placeholder", expires_in: 3600 }), { status: 200 });
      bodies.push(JSON.parse(init?.body ?? "null"));
      return new Response(JSON.stringify({ id: "O1", links: [{ rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=O1" }] }), { status: 201 });
    }));
    try {
      const bound: BoundCart = { cart: { item: demoWant().item, merchant: "Pondside Goods (fictional)", sellerId: "pondside", qty: 1, price: toCents("42.00"), currency: "USD", shape: "one-off", catalogId: "kettle" }, nonce: "n", hash: "h".repeat(32), expiresAt: Date.now() + 60_000, spent: false };
      await portWith(standIn("{}").toolkit).create(bound, "https://example.test/return");
      expect(BRAND_NAME).toBe("Gilded Goose");
      expect(bodies).toMatchObject([{ payment_source: { paypal: { experience_context: { brand_name: "Gilded Goose", user_action: "PAY_NOW" } } } }]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
