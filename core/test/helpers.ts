import { createHash } from "node:crypto";
import { MemoryLedger, demoDeps, demoGuard, demoPolicy, type Policy } from "../src/index.ts";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function world(seed = 1, policy: Partial<Policy> = {}) {
  const deps = demoDeps(seed, sha256);
  const ledger = new MemoryLedger();
  const pol = demoPolicy(policy);
  const guard = demoGuard(deps, ledger, pol);
  return { deps, ledger, policy: pol, guard };
}
