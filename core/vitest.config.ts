import { defineConfig } from "vitest/config";

// One timeout for every core test (lesson 34). The exhaustive sweeps (300 markets, every corpus note × field × history)
// run ~1.5–3.7 s on a laptop and well past vitest's 5 s default on GitHub's 2-core runner: CI failed on three sweeps
// before `ff3eb18` gave them 30 s each, then on `ai_reader_can_only_escalate` (run 40761612340, Wed Oct 28), a sweep
// added after that fix. A per-test number has to be remembered for every new sweep; this one can't be forgotten.
// 30 s still fails a test that hangs.
//
// One worker on GitHub's 2-core runner (vitest's default there), on purpose. Two took the slowest sweep from 13 s to 26 s of its 30 s
// limit on the same runner (run 41957559712, which also went red on vitest's own 60 s call, turn-the-loop.ts): 2-3 minutes saved isn't
// worth a check that turns red on a busy runner.
export default defineConfig({ test: { testTimeout: 30_000, setupFiles: ["./test/turn-the-loop.ts", "./test/clear-of-midnight.ts"] } });
