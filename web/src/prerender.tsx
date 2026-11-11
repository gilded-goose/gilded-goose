// W64b: the wallet's first paint as HTML, for the build (web/prerender.ts). Never imported by the app: the page's own
// bundle doesn't carry react-dom/server.

import { renderToStaticMarkup } from "react-dom/server";
import { FirstPaint } from "./first-paint.tsx";
import { entryLimit, walletWeek } from "./wallet-week.ts";

/** The recorded week's deal, drawn as the wallet draws it before your tap; the same read the wallet makes on load. */
export async function firstPaintHtml(): Promise<string> {
  const home = await walletWeek(false);
  if (!home.deal) throw new Error("prerender: week 1 has no deal waiting");
  return renderToStaticMarkup(<FirstPaint d={home.deal} limit={entryLimit().limit} refusal={home.refusal ?? null} desk={home.desk ?? null} label={home.label} practice={import.meta.env.BASE_URL === "/"} />);
}
