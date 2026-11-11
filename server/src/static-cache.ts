// Track R (launch program): how long a browser may keep each file of the web build, and the 304 that makes `no-cache`
// cheap. A deploy replaces the HTML and the hashed chunks together; a page whose HTML a browser kept from the last deploy
// asks for chunks this deploy doesn't have. So the HTML is never used without asking first (`no-cache`: a conditional
// GET, answered 304 when it hasn't changed), and a file whose name carries its content's hash (`/assets/*`, Vite's
// output) is kept for a year, since a new content gets a new name. The previous release's chunks are carried into the
// new build by scripts/carry-assets.ts, so a tab opened before a deploy still finds its lazy chunks after it.

import { deskByDefault } from "@goose/core/menu-hash";

/** Vite's output: `/assets/<name>-<8-char hash>.<ext>` (and a `.br`/`.gz` copy of one). */
const HASHED = /^\/assets\/[\w.-]+-[A-Za-z0-9_-]{8}\.[a-z0-9]+(?:\.br|\.gz)?$/;

export const IMMUTABLE = "public, max-age=31536000, immutable";
export const REVALIDATE = "no-cache";

/** True for any path under `/assets/`, hashed or not: a miss there is a plain 404, never a page. */
export const isAssetPath = (path: string): boolean => path.startsWith("/assets/");

/** The Cache-Control for a file the static handler found. Only content-hashed names are cached for good; the HTML, and
 *  every unhashed public file (the favicon, the voice clips, the release manifest), is checked with the server first. */
export function cacheControlFor(requestPath: string): string {
  return HASHED.test(requestPath) ? IMMUTABLE : REVALIDATE;
}

/** A conditional GET that the file's Last-Modified answers: the browser's copy is current (RFC 9110 §13.1.3; dates are
 *  compared to the second, as HTTP dates carry no more). An unparseable date is never "not modified". */
export function notModifiedSince(ifModifiedSince: string | undefined, lastModified: string | null): boolean {
  if (!ifModifiedSince || !lastModified) return false;
  const since = Date.parse(ifModifiedSince);
  const modified = Date.parse(lastModified);
  if (Number.isNaN(since) || Number.isNaN(modified)) return false;
  return Math.floor(modified / 1000) <= Math.floor(since / 1000);
}

/** Pages kept out of search engines: the living design system (`?desk=system`, Track SYS: unlisted). It shares
 *  index.html with every other page, and the page sets its robots meta by script, which a crawler may never run, so the
 *  server says it in a header too. Null for every other page. */
export function robotsFor(path: string, search: string): string | null {
  if (path !== "/" && path !== "/index.html") return null;
  return new URLSearchParams(search).get("desk") === "system" ? "noindex, nofollow" : null;
}

/**
 * Lead-13 (Nov 11): the bare domain is the white site. A visit to `/` whose query names no page of the old app (none at
 * all, or only a `utm_source` from a link: deskByDefault, the old app's own rule) is answered from goose.html, in place,
 * so the address bar keeps the bare domain. An address naming an old page (`?desk=`, `?wallet=`, `?market=`, `?run=` and
 * the rest of ROUTE_PARAMS, or `?studio=force`) keeps index.html. Only when the build has goose.html (`hasWhite`).
 */
export function rootFilePath(path: string, search: string, hasWhite: boolean): string {
  if (path !== "/" || !hasWhite) return path;
  return deskByDefault(search) && !new URLSearchParams(search).has("studio") ? "/goose.html" : path;
}

/** serveStatic's option for that: the file it reads for a request path. */
export const rootFile = (hasWhite: boolean) => ({
  rewriteRequestPath: (path: string, c: { req: { url: string } }) => rootFilePath(path, new URL(c.req.url).search, hasWhite),
});
