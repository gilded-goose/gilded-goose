// The footer jumped through Shop's first screen at ~0.7 s on a desktop (layout shift 0.096 live, 0.097 on the same build
// locally with the server up, Nov 11 audit) because `.main` was only as tall as what had loaded. It is at least a screen tall now.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../web/src/site/shell/shell.css", import.meta.url), "utf8");

describe("the page body holds the fold", () => {
  it("main_min_height_is_a_screen: `.main` has min-height 100svh (100vh before it for older browsers), so the footer starts below the fold", () => {
    const rule = css.match(/^\.main\s*\{([^}]*)\}/m)?.[1] ?? "";
    expect(rule).toMatch(/min-height:\s*100vh;\s*min-height:\s*100svh/);
  });
});
