// Test-only preload (node --import), never shipped: makes the fake PayPal port answer an order read after 50 ms, the way
// the real one answers over the network. The fake otherwise answers in microtasks, so a settle always finished before the
// server read the next request and two returns could never overlap as they do against PayPal (H4 concurrent returns).
// It patches the same module instance the server imports, so nothing in server/src changes.
//
// Opt-in hold (H2 eviction): with GOOSE_TEST_HOLD_FILE set, each port method named in GOOSE_TEST_HOLD (comma list of
// create, get, capture, refund) writes `<file>.reached` when called, then waits while `<file>` exists. A test creates the
// file, sends the request, waits for `.reached` (the request is now in flight at PayPal), acts, then deletes the file.

import { existsSync, writeFileSync } from "node:fs";
import { FakePaymentPort } from "../../server/src/adapters/fake-payment.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const holdFile = process.env.GOOSE_TEST_HOLD_FILE;
const held = new Set((process.env.GOOSE_TEST_HOLD ?? "").split(",").filter(Boolean));

async function hold(method: string): Promise<void> {
  if (!holdFile || !held.has(method)) return;
  writeFileSync(`${holdFile}.reached`, method);
  while (existsSync(holdFile)) await sleep(20);
}

const proto = FakePaymentPort.prototype;
const { create, get, capture, refund } = proto;
proto.create = async function (this: FakePaymentPort, ...a: Parameters<typeof create>) { await hold("create"); return create.apply(this, a); };
proto.get = async function (this: FakePaymentPort, orderId: string) {
  await sleep(50);
  await hold("get");
  return get.call(this, orderId);
};
proto.capture = async function (this: FakePaymentPort, orderId: string) { await hold("capture"); return capture.call(this, orderId); };
proto.refund = async function (this: FakePaymentPort, ...a: Parameters<typeof refund>) { await hold("refund"); return refund.apply(this, a); };
