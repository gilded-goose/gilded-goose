// `virtual:goose-threat-week` (web/threat-week.ts): the seeded demo week's rows, each verdict from the real round.
declare module "virtual:goose-threat-week" {
  const rows: ReadonlyArray<import("./threat-shape.ts").Attempt>;
  export default rows;
}
