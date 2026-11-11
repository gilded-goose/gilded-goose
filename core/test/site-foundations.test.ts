// The new site's foundations (plan Task 1): the hash router, the stamp's words and precedence, the fetch that turns a
// failure into "away" instead of a thrown error, and the kettle week built from the code's own answer.
import { afterEach, describe, expect, it, vi } from "vitest";
import { hrefOf, routeOf } from "../../web/src/site/route.ts";
import { stampWords, verdictOf } from "../../web/src/site/ui/stamp.ts";
import { getJson, postJson } from "../../web/src/site/live/api.ts";
import { builtKettle } from "../../web/kettle-data.ts";
import { spacingFaults } from "../../scripts/check-site-spacing.ts";

describe("check-site-spacing", () => {
  it("flags px spacing off the 4px scale and allows tokens, 0, hairlines and multiples of 4", () => {
    const css = [
      ".a { padding: 6px var(--s2); margin: 0 auto; gap: var(--s4); }",
      ".b { width: 1px; height: 40px; inset: -4px; top: calc(100% - 10px); }",
      ".c { line-height: 18px; border-width: 3px; letter-spacing: 0.5px; --x: 7px; }",
    ].join("\n");
    expect(spacingFaults("t.css", css)).toEqual([
      "t.css:1  padding: 6px var(--s2)  (6px)",
      "t.css:2  top: calc(100% - 10px)  (10px)",
    ]);
  });

  it("allows 2px only inside a rule marked control", () => {
    expect(spacingFaults("t.css", ".a { gap: 2px; }")).toHaveLength(1);
    expect(spacingFaults("t.css", ".a {\n  gap: 2px; /* control */\n}")).toEqual([]);
    expect(spacingFaults("t.css", ".a { gap: 2px; } /* control */")).toEqual([]);
  });
});

describe("routeOf / hrefOf", () => {
  it("reads an empty, bare or root hash as home", () => {
    expect(routeOf("")).toEqual({ route: "home", anchor: null });
    expect(routeOf("#")).toEqual({ route: "home", anchor: null });
    expect(routeOf("#/")).toEqual({ route: "home", anchor: null });
  });

  it("splits a route from its anchor", () => {
    expect(routeOf("#/proof#blind")).toEqual({ route: "proof", anchor: "blind" });
    expect(routeOf("#/under-the-hood")).toEqual({ route: "under-the-hood", anchor: null });
    expect(routeOf("#/#trick")).toEqual({ route: "home", anchor: "trick" });
  });

  it("sends an unknown route home", () => {
    expect(routeOf("#/nope").route).toBe("home");
    expect(routeOf("#shop").route).toBe("home");
  });

  it("writes hrefs that read back to themselves", () => {
    expect(hrefOf("shop")).toBe("#/shop");
    expect(hrefOf("home")).toBe("#/");
    expect(hrefOf("home", "trick")).toBe("#/#trick");
    expect(routeOf(hrefOf("proof", "blind"))).toEqual({ route: "proof", anchor: "blind" });
  });
});

describe("the stamp", () => {
  it("says each verdict in its fixed words", () => {
    expect(stampWords("clear")).toBe("Clear");
    expect(stampWords("held")).toBe("Waits for your yes");
    expect(stampWords("aside")).toBe("Set aside");
    expect(stampWords("over")).toBe("Over your limit");
  });

  it("ranks refuse, then hold, then over the limit, then clear", () => {
    expect(verdictOf("refuse", true)).toBe("aside");
    expect(verdictOf("refuse", false)).toBe("aside");
    expect(verdictOf("hold", true)).toBe("held");
    expect(verdictOf("hold", false)).toBe("held");
    expect(verdictOf("clear", true)).toBe("over");
    expect(verdictOf("clear", false)).toBe("clear");
  });
});

describe("getJson / postJson", () => {
  afterEach(() => vi.unstubAllGlobals());
  const respond = (body: string, status: number, type = "application/json") =>
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status, headers: { "content-type": type } })));

  it("gives away on a rejected fetch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect(await getJson("/api/health")).toBe("away");
  });

  it("gives away on a 5xx", async () => {
    respond(JSON.stringify({ error: "down" }), 503);
    expect(await getJson("/api/health")).toBe("away");
  });

  it("gives away on an HTML body (the 404 page or a proxy error)", async () => {
    respond("<!doctype html><p>Not here</p>", 200, "text/html");
    expect(await getJson("/api/health")).toBe("away");
  });

  it("gives away when the server is slower than the timeout", async () => {
    vi.stubGlobal("fetch", vi.fn((_u: string, init?: RequestInit) => new Promise((_r, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })));
    expect(await getJson("/api/health", undefined, 10)).toBe("away");
  });

  it("returns a 4xx JSON body as it came", async () => {
    respond(JSON.stringify({ error: "bad note" }), 400);
    expect(await getJson("/api/runs/trick")).toEqual({ error: "bad note" });
    expect(await postJson("/api/runs/trick", { note: "x" })).toEqual({ error: "bad note" });
  });

  it("posts JSON and returns the parsed answer", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    expect(await postJson("/api/x", { a: 1 })).toEqual({ ok: true });
    const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });
});

describe("virtual:goose-kettle (builtKettle)", () => {
  it("is recorded week 1: the Reedbank deal, the QuickQuack refusal and the guard-off order", async () => {
    const k = await builtKettle();
    expect(k.home.deal?.total).toBe("47.73");
    expect(k.home.deal?.opening).toBe("58.00");
    expect(k.home.deal?.below).toBe("10.27");
    expect(k.home.refusal?.seller).toBe("QuickQuack Deals");
    expect(k.home.refusal?.note.some((s) => s.flagged && s.text.includes("budget raised to $500"))).toBe(true);
    expect(k.control.amount).toBe("500.00");
    expect(k.control.orderId).toBe("821193914R209014J");
    expect(k.events.length).toBeGreaterThan(0);
  });

  it("pairs the home with the same week's rows: the deal's row and the refusal's row are both in the events", async () => {
    const k = await builtKettle();
    const ask = k.events.find((e) => e.seq === k.home.deal?.seq);
    expect(ask?.actor).toBe("guard");
    expect(ask?.action).toBe("ask");
    const refuse = k.events.find((e) => e.seq === k.home.refusal?.seq);
    expect(refuse?.actor).toBe("watcher");
    expect(refuse?.action).toBe("refuse");
  });

  it("survives the JSON round trip the plugin serves it through", async () => {
    const k = await builtKettle();
    expect(JSON.parse(JSON.stringify(k))).toEqual(k);
  });
});
