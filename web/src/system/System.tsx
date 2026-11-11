// The living design system (`?desk=system`; Track SYS, launch program; unlisted and noindex). The bar, the heading and
// the page's index paint first; every token and component (./Specimens.tsx, drawn from the real sources) follows in its
// own chunk, so the heading isn't held behind a hundred specimens on a slow phone.
//
// `&palette=midnight` draws the page in the back room's palette; the colours section always shows both rooms.

import { appHref } from "../menu/href.ts";
import { useEffect, useState, type ComponentType } from "react";
import { SiteNav } from "../nav/SiteNav.tsx";
// The page's own sheet, as text, laid down after the Desk's sheets (Specimens.tsx's SHEETS) so its rules win ties.
import sysCss from "./system.css?inline";
// The back room's names (--lx-*) for the bar in Midnight, in the shell, so the bar is Midnight from its first paint and
// not only once the specimens' chunk (which carries the same sheet) arrives. `?raw` less its `@import`: tokens.css is
// already this page's sheet, and `?inline` carried a second copy of it (9.7 KB) in the h1's bytes (phone drill, Oct 31).
// The token count and tokens.css's text live in ./Specimens.tsx for the same reason: the h1 waited on 6 KB gz of it.
import midnightRaw from "../ledger/midnight.css?raw";

const midnightCss = midnightRaw.replace(/@import[^;]*;/g, "");

/** The page's palette: Velvet unless the address asks for Midnight. */
export const paletteOf = (search: string): "v" | "midnight" => (new URLSearchParams(search).get("palette") === "midnight" ? "midnight" : "v");

const INDEX: readonly (readonly [string, string])[] = [
  ["sys-colour", "Colour"], ["sys-type", "Type"], ["sys-space", "Space"], ["sys-shape", "Shape"], ["sys-glass", "Glass"], ["sys-motion", "Motion"],
  ["sys-buttons", "Buttons"], ["sys-ask", "Ask"], ["sys-cards", "Cards"], ["sys-rows", "Rows"], ["sys-nav", "Nav"], ["sys-data", "Data"], ["sys-states", "States"],
];

export default function System() {
  const pal = paletteOf(location.search);
  const [spec, setSpec] = useState<{ Specimens: ComponentType; SHEETS: string } | null>(null);
  useEffect(() => {
    document.title = "Design system · Gilded Goose";
    // Unlisted: never in a search index (the server sends the same page for every route, so the tag is set here).
    const meta = document.createElement("meta");
    meta.name = "robots"; meta.content = "noindex, nofollow";
    document.head.append(meta);
    let live = true;
    void import("./Specimens.tsx").then((m) => {
      if (!live) return;
      setSpec({ Specimens: m.default, SHEETS: m.SHEETS });
      // An address with a section's anchor lands on it once the sections exist.
      if (location.hash) requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView());
    });
    return () => { live = false; meta.remove(); };
  }, []);
  const other = pal === "v" ? "midnight" : "v";
  return (
    <div className="dk sys" data-palette={pal}>
      <style suppressHydrationWarning>{`${pal === "midnight" && !spec ? midnightCss : ""}\n${spec?.SHEETS ?? ""}\n${sysCss}`}</style>
      <SiteNav {...(pal === "midnight" ? { room: "back" as const } : {})} />
      <main id="main" className="sys-wrap sys-main">
        <header className="sys-head">
          <p className="dk-eyebrow">Unlisted</p>
          <h1>Design system</h1>
          <p className="sys-lead">Every token and the site's core components, drawn from the code.</p>
          <p className="sys-switch"><a href={appHref(other === "v" ? "?desk=system" : "?desk=system&palette=midnight")}>{other === "v" ? "See it in Velvet" : "See it in Midnight"}</a></p>
          <nav className="sys-index" aria-label="On this page">
            {INDEX.map(([id, n]) => <a key={id} href={`#${id}`}>{n}</a>)}
          </nav>
        </header>
        {spec ? <spec.Specimens /> : <p className="sys-val" role="status">Drawing the specimens…</p>}
      </main>
      <footer className="sys-wrap sys-foot"><p>Fictional sellers. PayPal sandbox. Practice only: no real money.</p></footer>
    </div>
  );
}
