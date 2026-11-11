// The hash route as React state. route.ts stays free of the browser so core's tests can import it.
import { useEffect, useState } from "react";
import { routeOf, type Route } from "./route.ts";

export function useRoute(): { route: Route; anchor: string | null } {
  const [at, setAt] = useState(() => routeOf(window.location.hash));
  useEffect(() => {
    const read = () => setAt(routeOf(window.location.hash));
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  return at;
}
