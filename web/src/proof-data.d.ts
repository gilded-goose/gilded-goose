// `virtual:goose-proof` (web/proof-data.ts): the claims rows the Proof panel shows, and the build's own test count.
declare module "virtual:goose-proof" {
  import type { ProofGroup } from "@goose/core/proof";
  const data: { groups: ProofGroup[]; tests: { cases: number; files: number } };
  export default data;
}
