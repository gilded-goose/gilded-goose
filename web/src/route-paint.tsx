// Track F: a page's first render as HTML, for the build (web/prerender-routes.ts). Never imported by the app: the page's
// own bundle doesn't carry react-dom/server. renderToString, not renderToStaticMarkup, because main.tsx hydrates it.
import { renderToString } from "react-dom/server";
import type { ComponentType } from "react";

export const routeHtml = (Page: ComponentType) => renderToString(<Page />);
