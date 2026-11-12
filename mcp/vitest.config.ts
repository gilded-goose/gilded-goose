import { defineConfig } from "vitest/config";

// Every test here starts the real server as a child process. 30 s is core's one limit (core/vitest.config.ts): a loaded Mac
// has taken seconds to start Node, and a hung server still fails.
export default defineConfig({ test: { testTimeout: 30_000 } });
