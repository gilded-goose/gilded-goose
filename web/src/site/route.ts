// Hash routes (spec §6): the server answers unknown paths with 404.html and stays as it is, and a hash also works on the
// static mirror. "#/proof#blind" is the Proof page scrolled to its "blind" section.
export type Route = "home" | "shop" | "under-the-hood" | "proof" | "builders" | "haggle" | "how" | "list" | "market" | "verify";

const ROUTES: readonly Route[] = ["home", "shop", "under-the-hood", "proof", "builders", "haggle", "how", "list", "market", "verify"];
const isRoute = (s: string): s is Route => (ROUTES as readonly string[]).includes(s);

export function routeOf(hash: string): { route: Route; anchor: string | null } {
  const m = /^#\/([^#]*)(?:#(.*))?$/.exec(hash);
  if (!m) return { route: "home", anchor: null };
  const name = m[1] ?? "";
  const anchor = m[2] ? decodeURIComponent(m[2]) : null;
  if (name === "") return { route: "home", anchor };
  return isRoute(name) ? { route: name, anchor } : { route: "home", anchor: null };
}

export function hrefOf(route: Route, anchor?: string): string {
  const path = route === "home" ? "#/" : `#/${route}`;
  return anchor ? `${path}#${encodeURIComponent(anchor)}` : path;
}
