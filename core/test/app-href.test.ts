// The class sweep after S1-13's appHref (Lead-10, stack 119): no renderer in web/src writes an app address raw. A bare
// "?desk=proof" resolves against the page it sits on, so from /safe.html, the 404 or the /gilded-goose/ mirror's
// sub-path it reloads that page. menu.test.ts holds S1-13's four renderers; this holds every other file (raw-href.ts).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALLOW, rawHrefs, rawIn } from "./raw-href.ts";

const src = new URL("../../web/src", import.meta.url).pathname;

describe("every app address in web/src goes through appHref", () => {
  it("finds the bug's own forms (the guard can fail)", () => {
    for (const bad of [
      '<a href="?desk=ledger">', "<a href={`?desk=proof#${m.anchor}`}>", '<a href={"?market=1"}>', '<Lockup href="?desk=1" />',
      "<a className=\"gm-item\" href={i.href}>", "<a href={ledgerRowHref(r.seq)}>", '<LedgerHero proofHref="?desk=proof" />',
      '<X proofHref={proof ? "#proof" : "?desk=proof"} />', "const proofHref = (id: string) => `?desk=proof#${anchorOf(id)}`;",
    ]) expect(rawIn(bad), bad).toHaveLength(1);
    for (const good of [
      '<a href={appHref("?desk=ledger")}>', "<a href={appHref(`?desk=proof#${m.anchor}`)}>", "<a href={appHref(ledgerRowHref(r.seq))}>",
      '<a href="#main">', "<a href={location.href}>", '<a href="https://www.ftc.gov/">', '<X proofHref={proof ? "#proof" : appHref("?desk=proof")} />',
      "const proofHref = (id: string) => appHref(`?desk=proof#${anchorOf(id)}`);", "<a href={`#dk-${id}`}>",
    ]) expect(rawIn(good), good).toEqual([]);
  });
  it("no file in web/src writes one raw, outside href.ts and the allowlist", () => {
    expect(rawHrefs(src)).toEqual([]);
  });
  it("the allowlist is empty: every app address in web/src goes through appHref (Desk.tsx converted in stack 122)", () => {
    expect(ALLOW).toEqual({});
    expect(rawHrefs(src, {})).toEqual([]);
  });
});
