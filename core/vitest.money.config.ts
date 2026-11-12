import { defineConfig } from "vitest/config";

const FILES = ["guard", "cart", "money", "policy", "undo"].map((f) => `**/trust/src/${f}.ts`);
export default defineConfig({
  test: {
    testTimeout: 30_000,
    setupFiles: ["./test/turn-the-loop.ts", "./test/clear-of-midnight.ts"],
    include: ["test/guard.test.ts", "test/authorize.test.ts", "test/undo.test.ts", "test/dial.test.ts", "test/price-swap.test.ts", "test/money-paths.prop.test.ts"],
    coverage: { enabled: true, provider: "v8", allowExternal: true, exclude: [], include: [...FILES], reporter: ["text", "json-summary"], reportsDirectory: "node_modules/.ratchet/coverage" },
  },
});
