// No core test starts within its longest run of 00:00 UTC (utc-day.ts says why); one that would waits until just after it.
// Every vitest config core runs lists this file, and utc-midnight.test.ts pins that. A test with fake timers is skipped
// here, because its clock isn't the real one and a fake setTimeout would never fire.
import { beforeEach, vi } from "vitest";
import { LONGEST_TEST_MS, MARGIN_MS, waitBeforeTest } from "./utc-day.ts";

beforeEach(async () => {
  if (vi.isFakeTimers()) return;
  const ms = waitBeforeTest(Date.now());
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}, LONGEST_TEST_MS + MARGIN_MS + 10_000);
