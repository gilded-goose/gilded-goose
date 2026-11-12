# Gilded Goose: the ratchet

Written by `node scripts/ratchet-board.ts`; every number is read from a run, never typed.

<!-- ratchet:start -->
**Ratchet, 2026-11-04 13:57 UTC.** Limits only tighten; a worse number blocks a merge unless the DD or Q writes a reason. Bytes are raw first-load, the gate; gzipped is what a phone downloads. To refresh: `corepack pnpm ratchet:record <live url>`, then, after `corepack pnpm check`, `corepack pnpm ratchet:board`.

| Number | Now | Limit or best | State | Measured on |
|---|---|---|---|---|
| Tests passing | 1790 | at least 1450 | better | this checkout, 4728dbae plus uncommitted code |
| Tests skipped | 0 | at most 0 | at the limit | this checkout, 4728dbae plus uncommitted code |
| Money paths' coverage, the lowest of guard, cart, money, policy, undo | 100% | at least 100% | at the limit | this checkout, 4728dbae plus uncommitted code |
| Claims rows | 187 | at least 137 | better | this checkout, 4728dbae plus uncommitted code |
| First screen p95, / | 453 ms | best 453 ms | ok | gilded-goose.onrender.com, 2026-11-04 13:42 UTC |
| First screen p95, /?wallet=0 | 340 ms | best 340 ms | ok | gilded-goose.onrender.com, 2026-11-04 13:42 UTC |
| First screen p95, /?wallet=1 | 626 ms | best 573 ms | ok | gilded-goose.onrender.com, 2026-11-04 13:42 UTC |
| Interaction p95 | 32 ms | best 24 ms | WORSE (23 slow-enough events) | gilded-goose.onrender.com, 2026-11-04 13:42 UTC |
| Axe violations, every route, 1440 and 390 | 0 | must be 0 | ok | gilded-goose.onrender.com, 2026-11-04 13:42 UTC |
| Keyboard-only through the judge tour, stops failed | 4 | must be 0 | WORSE (of 24 stops) | gilded-goose.onrender.com, 2026-11-04 13:42 UTC |
| Console errors | 0 | must be 0 | ok | gilded-goose.onrender.com, 2026-11-04 13:42 UTC |
| Asset 404s | 0 | must be 0 | ok | gilded-goose.onrender.com, 2026-11-04 13:42 UTC |
| Failed live walks | 1 | must be 0 | WORSE (failed: keyboard-tour) | gilded-goose.onrender.com, 2026-11-04 13:42 UTC |
| First load, classic (183.6 KB gzipped) | 572.7 KB | at most 577.9 KB | better | this checkout, 4728dbae plus uncommitted code |
| First load, desk (148.0 KB gzipped) | 498.2 KB | at most 623.5 KB | better | this checkout, 4728dbae plus uncommitted code |
| First load, haggle (121.9 KB gzipped) | 400.8 KB | at most 486.1 KB | better | this checkout, 4728dbae plus uncommitted code |
| First load, how (111.4 KB gzipped) | 368.9 KB | at most 388.3 KB | better | this checkout, 4728dbae plus uncommitted code |
| First load, ledger (101.8 KB gzipped) | 343.6 KB | at most 362.6 KB | better | this checkout, 4728dbae plus uncommitted code |
| First load, list (114.5 KB gzipped) | 375.6 KB | at most 384.5 KB | better | this checkout, 4728dbae plus uncommitted code |
| First load, market (112.7 KB gzipped) | 378.0 KB | at most 503.8 KB | better | this checkout, 4728dbae plus uncommitted code |
| First load, proof (123.3 KB gzipped) | 405.1 KB | at most 532.6 KB | better | this checkout, 4728dbae plus uncommitted code |
| First load, system (111.9 KB gzipped) | 371.7 KB | at most 391.0 KB | better | this checkout, 4728dbae plus uncommitted code |
| First load, tour (114.5 KB gzipped) | 380.3 KB | at most 504.7 KB | better | this checkout, 4728dbae plus uncommitted code |
| First load, wallet (210.4 KB gzipped) | 686.2 KB | at most 693.2 KB | better | this checkout, 4728dbae plus uncommitted code |

Day by day (– means it wasn't measured that day):

| Day | SHA | Tests | Money coverage | Claims | Heaviest route | First screen, / | Axe | Keyboard | Console | 404s | Walks |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-11-04 | 4728dbae | 1790 | 100% | 187 | 686.2 KB | 453 ms | 0 | 4 | 0 | 0 | 1 |
<!-- ratchet:end -->
