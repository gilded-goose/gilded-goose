// A walk's route that fetches the real answer (`route.fetch()`, then `.json()` or `.text()`, then `route.fulfill`) can still be
// mid-request when the walk closes its page or context: Playwright disposes the response and the handler rejects with nobody
// to catch it, so the whole walk died on a request it no longer needed (LOCAL-CI f8e9164b, Nov 5: desk-walk's /api/health,
// "apiResponse.json: Response has been disposed"). Importing this module lets exactly that end quietly: a rejection from a
// route's own Playwright call on a page that's gone. Anything else still ends the walk as before, with its stack.

const CLOSED = /^(apiResponse\.(json|text|body)|route\.(fetch|fulfill|continue|fallback|abort)): (Response has been disposed|Target page, context or browser has been closed)/;

/** Whether a rejection is a route call that lost its page (and only that). */
export function closedMidRoute(e: unknown): boolean {
  return e instanceof Error && CLOSED.test(e.message);
}

process.on("unhandledRejection", (e) => {
  if (closedMidRoute(e)) return;
  throw e; // as Node would: the walk fails, loudly
});
