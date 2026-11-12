// Test-only preload (node --import), never shipped (W86): while the file GOOSE_TEST_HIDE_CAPTURED_FILE exists, a run's
// ledger reads leave out PayPal's "captured" rows, so a paid run looks like one whose captured row is missing (a store
// that lost it). The reconcile route then refuses with its 409, which is the case its slot give-back exists for.
// It patches the same module instance the server imports (Node resolves the workspace link to this real path), so
// nothing in server/src or trust/src changes. Delete the file and every row reads back as before.

import { existsSync } from "node:fs";
import { RunLedger } from "../../trust/src/events.ts";

const gate = process.env.GOOSE_TEST_HIDE_CAPTURED_FILE;
if (gate) {
  const { read } = RunLedger.prototype;
  RunLedger.prototype.read = function (this: RunLedger, since?: number) {
    const rows = read.call(this, since);
    return existsSync(gate) ? rows.filter((e) => !(e.actor === "paypal" && e.action === "captured")) : rows;
  };
}
