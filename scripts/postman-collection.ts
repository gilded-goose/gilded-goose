// Writes docs/builders/gilded-goose.postman_collection.json, so a technical judge can check "one tap, one exact cart" with a Postman
// import or `npx newman run`, with no account and no keys, against their own local server on the fake rail. The file is what's
// committed; this script is how it stays readable. Nothing here or in the file names the live site, so no default can write to it,
// and the collection's own first script stops any write to a host that isn't this machine.
//
//   node scripts/postman-collection.ts                 write the collection
//   node scripts/postman-collection.ts --examples r.json   the same, with each request's real reply from a newman JSON report saved beside it
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = join(import.meta.dirname, "..", "docs", "builders", "gilded-goose.postman_collection.json");
const SCHEMA = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

const lines = (s: string): string[] => s.split("\n");
const test = (s: string) => [{ listen: "test", script: { type: "text/javascript", exec: lines(s) } }];

interface Req { name: string; method: "GET" | "POST"; url: string; body?: unknown; about: string; test: string; noRedirect?: boolean }

const J = "const j = pm.response.json();";
const status = (n: number) => `pm.test("answers ${n}", () => pm.response.to.have.status(${n}));`;
const redirected = (saveAs?: string) => `pm.test("sends the shopper on with a redirect", () => pm.response.to.have.status(302));${saveAs ? `\npm.collectionVariables.set("${saveAs}", pm.response.headers.get("location"));` : ""}`;

const cart = (name = "Create: the guard binds one exact cart"): Req => ({
  name, method: "POST", url: "{{baseUrl}}/api/runs/store/cart", body: { listingId: "ss-pondside-kettle" },
  about: "A fictional seller's kettle. The guard reads the listing under this browser's limits and binds the cart: seller, item, price and a hash over all of them. No order exists yet, and nothing can be paid.",
  test: `${status(200)}\n${J}\npm.test("a cart, bound to a hash", () => { pm.expect(j.kind).to.eql("cart"); pm.expect(j.canPay).to.eql(true); pm.expect(j.hash).to.match(/^[0-9a-f]{16,}$/); });\npm.collectionVariables.set("runId", j.runId);\npm.collectionVariables.set("hash", j.hash);\npm.collectionVariables.set("total", String(j.total));`,
});

const order = (name = "Create the order: the shopper presses Approve"): Req => ({
  name, method: "POST", url: "{{baseUrl}}/api/runs/store/complete_payment", body: { runId: "{{runId}}" },
  about: "This press makes the order, for exactly the bound cart, and hands back the page where the shopper taps. It's never \"paid\": the order waits for the tap.",
  test: `${status(200)}\n${J}\npm.test("waits for the tap", () => { pm.expect(j.status).to.eql("waiting-for-your-tap"); pm.expect(j.approveUrl).to.include("FAKE-"); });\npm.collectionVariables.set("approveUrl", j.approveUrl);`,
});

const tap = (name = "The shopper's tap, on the fake PayPal page"): Req => ({
  name, method: "GET", url: "{{approveUrl}}", noRedirect: true,
  about: "The fake rail's stand-in for the shopper's tap in PayPal. Only the browser that started the run may tap: its cookie is checked. On this server it's the only thing that can approve an order.",
  test: `${redirected("returnUrl")}\npm.test("back to this run's return, naming the order", () => pm.expect(pm.response.headers.get("location")).to.include("token=FAKE-"));`,
});

const settle = (name: string, about: string): Req => ({ name, method: "GET", url: "{{returnUrl}}", noRedirect: true, about, test: redirected() });

const read = (name: string, about: string, check: string): Req => ({
  name, method: "GET", url: "{{baseUrl}}/api/runs/{{runId}}", about,
  test: `${status(200)}\n${J}\nconst rows = j.events.map((e) => e.action);\n${check}`,
});

const sameCart = `pm.test("still the same cart", () => { pm.expect(j.bound.hash).to.eql(pm.collectionVariables.get("hash")); pm.expect(String(j.bound.total)).to.eql(pm.collectionVariables.get("total")); });`;
const nothingTaken = `pm.test("nothing was captured", () => { pm.expect(j.settled.ok).to.eql(false); pm.expect(j.settled.captureId).to.eql(undefined); pm.expect(rows).to.not.include("captured"); });`;

const folders: { name: string; about: string; items: Req[] }[] = [
  {
    name: "0. Is this the fake rail?",
    about: "Stops the whole run unless this server says it's on the fake rail, so the collection can't place a real order.",
    items: [{
      name: "Health", method: "GET", url: "{{baseUrl}}/api/health",
      about: "payment is \"fake\" only on a server started with PAYMENT=fake, which the server allows on this machine only.",
      test: `// No answer, or any other rail: stop here, before anything is written.\nlet payment = null;\ntry { payment = pm.response.json().payment; } catch { /* no server, or not this one */ }\npm.test("the fake rail", () => pm.expect(payment).to.eql("fake"));\nif (payment !== "fake") pm.execution.setNextRequest(null);`,
    }],
  },
  {
    name: "1. One tap, one exact cart",
    about: "Create, get, tap, capture, and the same capture when the return comes twice.",
    items: [
      cart(),
      read("Get: a cart, no order, no money", "Anyone can read a run's cart and its hash. Only the browser that started it sees its order.", `${sameCart}\npm.test("no order and nothing settled yet", () => { pm.expect(j.approveUrl).to.eql(null); pm.expect(j.settled).to.eql(null); pm.expect(j.canApprove).to.eql(true); });`),
      order(),
      { ...order("Press Approve again: the same order, never a second"), about: "A second press answers with the order the first one made.", test: `${status(200)}\n${J}\npm.test("the same order", () => pm.expect(j.approveUrl).to.eql(pm.collectionVariables.get("approveUrl")));` },
      read("Get: still no money before the tap", "The order exists and waits. Goose can't move it from here.", `${sameCart}\npm.test("nothing settled", () => pm.expect(j.settled).to.eql(null));\npm.test("nothing captured", () => pm.expect(rows).to.not.include("captured"));`),
      tap(),
      settle("Capture: the return re-checks the cart, then captures", "PayPal's redirect back. The guard reads the order again, holds, checks the amount and hash against the cart it bound, and only then captures."),
      read("Get: paid, for that exact cart", "One capture, at the bound total, under the bound hash.", `${sameCart}\npm.test("paid", () => { pm.expect(j.settled.ok).to.eql(true); pm.expect(j.settled.captureId).to.include("FAKE-CAPTURE"); });\npm.collectionVariables.set("captureId", j.settled.captureId);`),
      settle("The return again: a reload never captures twice", "A tired double tap, or the browser's back button. The answer's the same redirect, and it settles nothing new."),
      read("Get: the same one capture", "Same capture id as before.", `pm.test("the same capture", () => pm.expect(j.settled.captureId).to.eql(pm.collectionVariables.get("captureId")));\npm.test("one capture on the record", () => pm.expect(rows.filter((a) => a === "captured").length).to.eql(1));`),
    ],
  },
  {
    name: "2. No tap, no money",
    about: "The return link used before anyone tapped: the order isn't approved, so nothing moves.",
    items: [
      cart(),
      order(),
      {
        name: "The return link, with no tap", method: "GET", url: "{{approveUrl}}/../return-link",
        about: "What a leaked log would hand someone: the fake rail gives it to the run's own browser so this can be tried.",
        test: `${status(200)}\n${J}\nconst id = pm.collectionVariables.get("approveUrl").match(/FAKE-[0-9]+/)[0];\npm.collectionVariables.set("returnUrl", j.url + "&token=" + id);`,
      },
      settle("Capture with no tap: the order was never approved", "Same route as a real return, but the shopper never tapped."),
      read("Get: nothing moved", "Without the tap, the guard has nothing it may capture.", nothingTaken),
    ],
  },
  {
    name: "3. A mock decline",
    about: "The fake rail declines the next capture, as a card can after a tap. The hold is released and the shopper is told.",
    items: [
      cart(),
      order(),
      {
        name: "Mock: decline the next capture", method: "POST", url: "{{baseUrl}}/api/fake-paypal/decline-next",
        about: "Exists only on the fake rail, which only runs on this machine. It isn't a route on a real server.",
        test: `${status(200)}\n${J}\npm.test("one decline waiting", () => pm.expect(j.declines).to.eql(1));`,
      },
      tap(),
      settle("Capture: the rail says declined", "The guard reads the order back before believing it, then releases the hold."),
      read("Get: declined, and the hold released", "A decline moves no money and leaves no hold.", `${nothingTaken}\npm.test("told plainly: nothing charged, the hold released", () => { pm.expect(j.settled.reason).to.include("nothing was charged"); pm.expect(j.events.find((e) => e.action === "capture-failed").why).to.include("released"); });`),
    ],
  },
  {
    name: "4. The guard refuses a changed cart",
    about: "A seller changes the price by one cent after the shopper's tap. The guard is told nothing; its own re-check finds it.",
    items: [
      {
        name: "Start a run with the staged price swap", method: "POST", url: "{{baseUrl}}/api/runs", body: { seed: 1, replayOnly: true, swap: true, pace: false, maxPrice: "60.00" },
        about: "A recorded week, with the demo's staged swap switched on. The swap happens later, after the hold.",
        test: `${status(200)}\n${J}\npm.collectionVariables.set("runId", j.runId);`,
      },
      {
        name: "Wait for its cart", method: "GET", url: "{{baseUrl}}/api/runs/{{runId}}/events",
        about: "The run's live record. It ends when the run has its cart.",
        test: `${status(200)}\npm.test("the run finished", () => pm.expect(pm.response.text()).to.include('"action":"done"'));`,
      },
      read("Get: the cart the shopper will tap", "This hash is what the guard will hold the order to.", `pm.test("a bound cart", () => pm.expect(j.bound.hash).to.be.a("string"));\npm.collectionVariables.set("hash", j.bound.hash);\npm.collectionVariables.set("total", String(j.bound.total));`),
      {
        name: "Approve", method: "POST", url: "{{baseUrl}}/api/runs/{{runId}}/approve", body: {},
        about: "The order, for exactly that cart.",
        test: `${status(200)}\n${J}\npm.collectionVariables.set("approveUrl", j.approveUrl);`,
      },
      tap(),
      settle("Capture: the cart changed after the tap", "The guard's re-check sees one cent's difference, so it doesn't capture, and it releases the hold."),
      read("Get: refused, nothing charged, hold released", "The staged swap, then the void, on the record.", `${nothingTaken}\npm.test("the price moved one cent after the tap", () => { pm.expect(j.bound.hash).to.eql(pm.collectionVariables.get("hash")); pm.expect(Math.round((Number(j.bound.total) - Number(pm.collectionVariables.get("total"))) * 100)).to.eql(1); });\npm.test("the swap was seen and the hold released", () => { pm.expect(rows).to.include("price-swap"); pm.expect(rows).to.include("voided"); pm.expect(j.settled.reason).to.include("nothing was charged"); });`),
    ],
  },
];

const examples: Record<string, { code: number; status: string; headers: { key: string; value: string }[]; body: string }[]> = {};
const at = process.argv.indexOf("--examples");
if (at >= 0) {
  const report = JSON.parse(readFileSync(process.argv[at + 1]!, "utf8")) as { run: { executions: { item: { id?: string; name: string }; cursor: { ref?: string }; response?: { code: number; status: string; header?: { key: string; value: string }[]; stream?: { data: number[] } } }[] } };
  // By position, since a name repeats across folders.
  report.run.executions.forEach((e, i) => {
    if (!e.response) return;
    const keep = new Set(["content-type", "location"]);
    (examples[String(i)] ??= []).push({ code: e.response.code, status: e.response.status, headers: (e.response.header ?? []).filter((h) => keep.has(h.key.toLowerCase())), body: Buffer.from(e.response.stream?.data ?? []).toString("utf8") });
  });
}

let position = 0;
const item = (r: Req) => {
  const at = position++;
  const request = {
    method: r.method,
    header: r.body === undefined ? [] : [{ key: "Content-Type", value: "application/json" }],
    ...(r.body === undefined ? {} : { body: { mode: "raw", raw: JSON.stringify(r.body, null, 2), options: { raw: { language: "json" } } } }),
    url: r.url,
    description: r.about,
  };
  return {
    name: r.name,
    ...(r.noRedirect ? { protocolProfileBehavior: { followRedirects: false } } : {}),
    request,
    event: test(r.test),
    response: (examples[String(at)] ?? []).map((x) => ({ name: `What a local server answered`, originalRequest: request, code: x.code, status: x.status, header: x.headers, body: x.body })),
  };
};

const guard = `// Writes go to this machine only. The fake rail runs nowhere else, and a shared site's counts are real people's.
const base = pm.variables.replaceIn("{{baseUrl}}");
const local = /^https?:\\/\\/(localhost|127\\.0\\.0\\.1|\\[::1\\])(:\\d+)?(\\/|$)/.test(base);
if (!local && pm.request.method !== "GET") {
  console.error("Stopped: this collection only writes to a server on your own machine, not " + base);
  pm.execution.skipRequest();
}`;

const collection = {
  info: {
    name: "Gilded Goose: one tap, one exact cart",
    schema: SCHEMA,
    description: [
      "Check the money path yourself. No account, no keys, no PayPal: the fake rail on your own machine, which makes no network call and moves nothing.",
      "",
      "Read it without running anything: each request has what a local server answered saved beside it.",
      "",
      "To run it:",
      "1. In the repo: corepack pnpm install",
      "2. cd server && PAYMENT=fake node src/main.ts",
      "3. In another terminal: npx newman run docs/builders/gilded-goose.postman_collection.json (or import this file into Postman, no account needed, and run the collection)",
      "",
      "baseUrl is http://localhost:8787. The first request stops the run unless the server says it's on the fake rail, and the collection refuses to write to any host but your own machine.",
    ].join("\n"),
  },
  event: [{ listen: "prerequest", script: { type: "text/javascript", exec: lines(guard) } }],
  variable: [
    { key: "baseUrl", value: "http://localhost:8787", type: "string" },
    ...["runId", "hash", "total", "approveUrl", "returnUrl", "captureId"].map((key) => ({ key, value: "", type: "string" })),
  ],
  item: folders.map((f) => ({ name: f.name, description: f.about, item: f.items.map(item) })),
};

writeFileSync(out, `${JSON.stringify(collection, null, 2)}\n`);
console.log(`Wrote ${folders.reduce((n, f) => n + f.items.length, 0)} requests in ${folders.length} folders.`);
