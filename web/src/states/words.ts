// Track R: every word the shared states say, in one place: brand.md §10.9's table, word for word. What happened is one
// sentence of 8 words or fewer; the cause is one sentence; one action, verb first; 24 words at most in all
// (core/test/r-deploy.test.ts counts them). No numbers, so no claims rows: each sentence says only what the code knows
// when it shows. Never "Oops", "Sorry", an exclamation mark or "Nothing here yet".

/** Waiting on content. Say what Goose is really doing: "sellers" only while sellers load. No cause, no action. */
export const LOADING = { sellers: "Goose is checking the sellers.", other: "Goose is loading this." } as const;
/** A list with no rows yet (the ledger's). The one way to fill it is the action. */
export const EMPTY = { title: "No rows yet.", line: "They start when you ask Goose.", action: "Ask Goose" } as const;
/** A part failed. `network` is said only for a network failure or a timeout, never guessed. */
export const ERROR = { title: "Goose couldn't load this.", network: "Goose's server didn't answer.", action: "Try again" } as const;
/** navigator.onLine is false. `back` only where the surface really asks again on `online` (the Offline component's
 *  `onBack`); the page-wide line can promise only that what's drawn stays. */
export const OFFLINE = { title: "You're offline.", line: "What's on screen stays.", back: "What's on screen stays. Goose checks sellers again once you're back." } as const;
/** A 429. "Try again" is enabled once the server's Retry-After has passed; no countdown is shown. */
export const LIMITED = { title: "Goose needs a minute.", line: "Too many asks in a short time.", action: "Try again" } as const;
/** A 429 that no tap can help today (DD, stack 79): a daily cap. No action. DK's own words (core TROUBLE.capped), so
 *  the Desk keeps them when it swaps to the kit. */
export const LIMITED_DAILY = { title: "That's today's limit from here.", line: "Today's made-up markets are used up." } as const;
/** A 429 whose Retry-After is longer than a pill should sit disabled (retry.ts LONG_WAIT_MS). No action, no countdown. */
export const LIMITED_LATER = { title: "That's the limit for now.", line: "Too many asks in a short time." } as const;
/** An unknown path (web/404.html says the same two lines). */
export const NOT_FOUND = { title: "Nothing here.", action: "Back to Goose" } as const;
/** An /api request has waited past WAKE_AFTER_MS with no answer since the page loaded or since a long quiet spell. */
export const WAKING = { title: "Goose's server is waking up.", line: "This fills in when it answers." } as const;
/** The DD (~07:20): the words follow the request. `line` above only while a request is out (state "pending", no
 *  button); once the wake's requests ended with no real answer (state "failed": a host's non-JSON 503, a timeout, an
 *  error) nothing fills in by itself, so the cause drops that promise and the action is Try again. */
export const WAKING_FAILED = { title: WAKING.title, line: "Give it a moment, then try again.", action: "Try again" } as const;
/** Not in §10.9's table (Track R): a chunk failed because a deploy replaced it. Reachable only once a /release.json
 *  check confirms a newer release (DD 09:29; not built yet, so nothing shows it today: strip.ts lostChunk).
 *  No line (DD, stack 79): the headline and [Reload] say it all. */
export const UPDATED = { title: "Goose was just updated.", action: "Reload" } as const;
/** Track R-11 (the DD's "offline wins", then DD 09:29): a chunk failed to load, online or offline. The code can't tell a
 *  deploy from a dropped network (wifi with no internet keeps onLine true), so it names no cause. It shows only while
 *  online (offline wins), and its action is the one way to get the part back: Reload, her tap. No line. */
export const LOST = { title: "Part of this page didn't load.", action: "Reload" } as const;
/** A room whose chunk never came: its one way forward, in place of a blank. Offline, Reload would lose the page, so she goes back. */
export const ROOM_LOST = { title: "This room didn't load.", offline: "You're offline. It can open once you're back." } as const;
/** R-11 part 2: a step failed while she was offline and she is back. The cause is the one the code saw at the time (she
 *  was offline), never the server's; the surface adds its own fact ("Nothing was bought.") and Try again. */
export const WAS_OFFLINE = { title: "That didn't go through while you were offline.", action: "Try again" } as const;
/** R-12: what a surface says after OFFLINE.title when live mode is "offline" or one of its calls failed offline: the
 *  surface's own fact, never the server. A "once you're back" line only where the surface really reads again on `online`. */
export const OFFLINE_SAYS = {
  /** The wallet's Approve and the classic page's: opening PayPal needs the network. Nothing moves without her tap there. */
  pay: "PayPal can't open until you're back. Nothing was charged.",
  /** The Ask box: the keyword rule runs here (AskGoose's read() goes to the browser whenever live mode isn't up). */
  ask: "A plain keyword rule reads your words in this browser. Nothing is saved.",
  /** Wants and Settings read the list again once live mode is back (Wants.tsx). */
  wants: "Your wants show once you're back.",
  settings: "Your limits and what Goose remembers show once you're back.",
  /** A forget that failed offline may or may not have reached the server: only that it may come back is known. */
  forget: "Goose may offer that again. Forget it in Your wants once you're back.",
  /** The classic page's run read: no re-read is wired there, so the action is hers. */
  run: "Reload once you're back to see this run.",
  /** "Bring it back" failed offline: the cart stays aside, the safer state. */
  aside: "The cart stays set aside. Try Bring it back once you're back.",
  /** The after-pay room reads this tab's purchase again on `online` (AfterPay.tsx). */
  after: "This tab's purchase shows once you're back. Nothing changed.",
  /** The judge box and the Safe page: the plain rule's round ran in the browser. */
  round: "This round ran in your browser.",
  /** The AI read needs live mode, which needs the network. */
  ai: "The AI read needs the network. The plain rule works here.",
  /** The market's PayPal return, read again once she's back (StoreSync.tsx). No "Nothing was bought": she came back
   *  from PayPal, so a capture may have happened; only the read failed. */
  back: "Goose reads PayPal's answer again once you're back.",
} as const;
/** R-12: the market's read of PayPal's return failed online: only the read failed (the payment, if any, happened on the
 *  return route), so no "Nothing was bought"; her Try again reads it again in place, never a reload. */
export const BACK_UNREAD = { title: "Goose couldn't read PayPal's answer.", line: ERROR.network, action: "Try again" } as const;

// By every button that opens PayPal, in sandbox mode only (Round 5, consumer B2). Here, on every route already, not in a chunk of its own.
export const SANDBOX_NEXT = "Next: PayPal's practice site. Don't type your real password. No practice account? Press Cancel and pay nothing.";

/** A stranger on someone else's paid run link (Round 5, red team 1): true for them, and it says nothing about whose it is. */
export const PAID_ELSEWHERE = "Paid from another browser.";
