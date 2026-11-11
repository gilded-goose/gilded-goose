// Every call to the server goes through here, so a page never shows a thrown error: a network failure, a timeout, an
// HTML answer (the 404 page, a proxy's error page) or a 5xx is "away", and the page plays its labelled recording.
// A 4xx is the server's own answer (a refused note, an unknown run), so its JSON body comes back as it is.

export type Away = "away";

/** Fired when the server refuses this page's origin (it only accepts the address its WEB_URL names). */
export const REFUSED = "gg-origin-refused";

export async function getJson<T>(path: string, init?: RequestInit, timeoutMs = 8000): Promise<T | Away> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const outer = init?.signal;
  const onOuter = () => ctrl.abort();
  outer?.addEventListener("abort", onOuter);
  try {
    const res = await fetch(path, { ...init, signal: ctrl.signal });
    if (res.status >= 500) return "away";
    // The server answers a page it doesn't recognise with a plain 403: say so, rather than a vague server error.
    if (res.status === 403 && (await res.clone().text()) === "not our page") (globalThis as { dispatchEvent?: (e: Event) => boolean }).dispatchEvent?.(new Event(REFUSED));
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("json")) return "away";
    return (await res.json()) as T;
  } catch {
    return "away";
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onOuter);
  }
}

export function postJson<T>(path: string, body: unknown, timeoutMs = 8000): Promise<T | Away> {
  return getJson<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, timeoutMs);
}
