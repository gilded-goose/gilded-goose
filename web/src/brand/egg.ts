// The vector egg (brand.md §10.1): one path on one radial gradient, for every lockup size, the favicon and the waking
// state. Never the photo egg in the lockup; the photo/3D egg is the hero asset only (§10.2). Plain strings, no imports,
// so the HTML entries, the favicon and the share render can all carry the very same markup (core/test/brand.test.ts
// holds each copy to these).

/** The egg's outline, in a 24-unit box; cropped to its own bounds by EGG_VIEWBOX. */
export const EGG_PATH = "M12 2.2c-4.2 0-7.6 6.3-7.6 11.2a7.6 7.6 0 0 0 15.2 0C19.6 8.5 16.2 2.2 12 2.2Z";
export const EGG_VIEWBOX = "4.4 2.2 15.2 18.8";
/** Its light: cream at the top left, falling through gold to a deep bronze foot. The one object that never changes. */
export const EGG_STOPS: readonly (readonly [string, string])[] = [["0", "#fff3c4"], [".34", "#f0cb62"], [".74", "#b98a1c"], ["1", "#6e4f06"]];
const gradient = (id: string): string =>
  `<radialGradient id="${id}" cx="38%" cy="30%" r="78%">${EGG_STOPS.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</radialGradient>`;

/** The symbol every lockup's egg-o uses (`<use href="#ggEgg"/>`), with its gradient: placed once at the top of each HTML
 *  page's body. 0×0 and absolutely placed, never display:none (which drops the gradient). */
export const EGG_SYMBOL =
  `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${gradient("ggG")}` +
  `<symbol id="ggEgg" viewBox="${EGG_VIEWBOX}"><path d="${EGG_PATH}" fill="url(#ggG)"/></symbol></defs></svg>`;

/** The favicon (web/public/favicon.svg): the vector egg alone, on transparent. */
export const FAVICON_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${EGG_VIEWBOX}"><defs>${gradient("g")}</defs>` +
  `<path d="${EGG_PATH}" fill="url(#g)"/></svg>\n`;
