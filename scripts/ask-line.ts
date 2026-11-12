// What a box that takes typed words says about those words, read from the page a visitor gets (claims row as-view-only).
// check-claims reads the source, and passed while the board's box drew no line at all: a claim "on screen" is proved on screen.

import type { Page } from "playwright";
import { ASK_VIEW_ONLY } from "../web/src/studio/words.ts";

export { ASK_VIEW_ONLY };

export interface AskBox { id: string; line: string; why: string }

/**
 * Every ask box drawn on this page and whether its line can be seen. The box is found by what it is (a text field in a form with
 * chips under it, or the form's own ask label), not by a class, so a new one on a new card is read too. Scrolls the page on the way,
 * because the board's cards draw as they come near.
 */
export async function readAskBoxes(page: Page, line = ASK_VIEW_ONLY): Promise<AskBox[]> {
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
  });
  await page.waitForSelector("form input[type=text]", { state: "attached", timeout: 15_000 }).catch(() => {});
  return page.evaluate((want) => {
    const seen = (el: HTMLElement) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (s.display === "none" || s.visibility !== "visible" || Number(s.opacity) < 0.5) return `hidden by CSS (${s.display}, ${s.visibility}, opacity ${s.opacity})`;
      if (r.width < 100 || r.height < 8) return `${Math.round(r.width)} x ${Math.round(r.height)} px: a screen reader's line, not a visitor's`;
      if (r.right > innerWidth + 1 || r.left < -1) return `runs off the ${Math.round(innerWidth)} px page`;
      if (el.closest("[hidden], [aria-hidden=true]")) return "inside a hidden layer";
      return "";
    };
    const boxes = [...document.querySelectorAll<HTMLInputElement>("form input[type=text]")].filter((i) => {
      if (i.closest("[hidden], [data-studio-layer=hidden]")) return false;
      const r = i.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && /ask/i.test(`${i.id} ${i.form?.getAttribute("aria-labelledby") ?? ""} ${i.form?.className ?? ""}`);
    });
    return boxes.map((i) => {
      const lines = [...i.form!.querySelectorAll<HTMLElement>("p, li, span, small, div")].filter((e) => e.children.length === 0 && e.textContent?.trim() === want);
      const why = lines.length === 0 ? "no such line in the form" : lines.map(seen).find((w) => w === "") === "" ? "" : seen(lines[0]!);
      return { id: i.id || i.placeholder, line: lines[0]?.textContent?.trim() ?? "", why };
    });
  }, line);
}
