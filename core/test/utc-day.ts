// A booted server counts its day caps per UTC day, on the real clock (trust/src/caps.ts, DailyCap.roll; server/src/main.ts
// passes `() => Date.now()`). A test that takes N runs and expects the next one to get 429 fails if 00:00 UTC (4 or 5 PM in
// California) falls inside it, because the count starts over mid-test (R's clock sweep of ba94fca8). So no core test starts
// that close to 00:00 UTC: clear-of-midnight.ts waits until just after it. The server keeps the real clock. A shifted clock
// would break the tests that compare the server's times with the test's own, like Undo's 60-minute window.

export const DAY_MS = 86_400_000;
/** The longest per-test timeout in core/test (utc-midnight.test.ts pins that none is longer). */
export const LONGEST_TEST_MS = 120_000;
/** Slack on top of the longest test: a boot, a slow runner. */
export const MARGIN_MS = 10_000;

/** How long a test starting at `now` waits so that it runs within one UTC day: 0 unless 00:00 UTC is too close. */
export function waitBeforeTest(now: number): number {
  const toMidnight = DAY_MS - (now % DAY_MS);
  return toMidnight <= LONGEST_TEST_MS + MARGIN_MS ? toMidnight + 1_000 : 0;
}
