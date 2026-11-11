// The white site's first paint (site-paint.ts writes it into dist/goose.html at build time): the home's first screen
// (the header and the hero, as the app's first render draws them; no story player, sections or footer, which the app
// adds below without moving anything), so a phone sees the headline, the lede and the Ask before any script has run. Static
// HTML only: main.tsx mounts with createRoot over it (no hydration, so no mismatch can throw); React draws the same
// components in its place.
import { renderToStaticMarkup } from "react-dom/server";
import { Shell } from "./shell/Shell.tsx";
import { Hero } from "./home/Hero.tsx";

export function siteFirstPaintHtml(): string {
  return renderToStaticMarkup(<Shell route="home" paint><Hero paint /></Shell>);
}
