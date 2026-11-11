// Test-only preload (node --import), never shipped: the server's Date.now becomes real time plus an offset in ms read from
// the file GOOSE_TEST_CLOCK_FILE names (missing or unreadable: no offset), so a test can jump the clock of a running server
// past a window (an approval's TTL, the paid run's keep window) while a request is still in flight (H2 eviction). Every
// clock in the server is Date.now (the guard's, the caps', the keep window's), so all of them jump together.
// The file is read on each call: a few small reads per request, only in tests, and nothing to keep in sync.

import { readFileSync } from "node:fs";

const file = process.env.GOOSE_TEST_CLOCK_FILE;
if (file) {
  const real = Date.now.bind(Date);
  Date.now = () => {
    let offset = 0;
    try { offset = Number(readFileSync(file, "utf8")) || 0; } catch { /* no file yet: no offset */ }
    return real() + offset;
  };
}
