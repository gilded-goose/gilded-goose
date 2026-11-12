// Every core test starts on a fresh turn of the event loop. Back-to-back synchronous tests never give the worker a turn, so vitest's
// own reply sits unread, and once they add up to 60 s its call times out and fails a run where every test passed (run 41957559712:
// patience.test.ts, 64 s of sweeps, on a busy runner). No test can forget this; core/test/event-loop-turns.test.ts pins it.
import { beforeEach } from "vitest";

beforeEach(() => new Promise<void>((turned) => setImmediate(turned)));
