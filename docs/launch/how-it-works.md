# How it works

Money moves only after your tap.

<!-- For SYS, not on the page: five boxes, left to right (on a phone, top to bottom), each one sentence and the real
file that does it. The words are the press release's (docs/launch/press-release.md). pnpm check row c-launch-how fails
if a box loses its file, a file moves, the Watcher's box loses cash or "can miss", or the page (everything outside this
note, file lines included) passes 140 words. Behind the boxes: `core/src/buyer/port.ts` (Goose's only moves: counter,
accept, wait, walk), `trust/src/reader.ts` (the AI reader, caution only), `trust/src/cart.ts` (the cart and its hash).
The simulated lines: `core/src/ask/fictional-market.ts` (`PLANTED_SAYS`), `core/src/ask/recorded-market.ts`,
`trust/src/paypal.ts`. -->

1. **You.** You ask in your words, and only your tap can pay.
   File: `web/src/desk/Desk.tsx`
2. **Goose.** When it's on, Claude Haiku 5.5 reads your ask and proposes moves, never a payment.
   File: `server/src/adapters/claude.ts`
3. **The Watcher.** Code reads seller words as data, sets aside the gift-card asks, other ways to pay and orders to Goose it recognizes, holds other mentions, asks first about cash in person, and can miss one.
   File: `trust/src/watch.ts`
4. **The guard.** Code holds your limits and locks one exact cart for fifteen minutes.
   File: `trust/src/guard.ts`
5. **PayPal.** PayPal holds the money, code re-checks the cart, then PayPal takes or releases it.
   File: `trust/src/paypal.ts`

## What's simulated
- **Sellers:** fictional, labeled, one planted scam per made-up market.
- **Weeks:** recorded; $84.00 is that week's price.
- **Money:** PayPal sandbox; test money.
