// Set your price (Joshua, Nov 5, 3a): her price on a want, or on a real product at one store (3b). Its own small file so
// Find's page can place it without carrying the Desk's rooms: it imports only the API helper and the fixed words. Saving
// a price buys nothing: the server keeps it (checked against her limit for a want), and the reply's row says what it is.
import { useState, type FormEvent } from "react";
import { SET_YOUR_PRICE, YOUR_PRICE } from "@goose/core/watching-words";
import { json, troubleNote } from "./api.ts";
import "./setprice.css";

/** A real product at one store, from Find's row (Channel3's id): watched at her price, never bought through Goose. */
export type RealPick = { productId: string; domain: string; name: string };
/** What the form reads back from the server's answer: an error, or the saved row's status. */
export type PriceReply = { error?: string; watching?: { catalogId: string; status: string }[]; real?: { productId: string; domain: string; status: string }[] };

/** Her price on a want, or on a real product at one store when `real` is given. `now` is in cents. */
/** `ping`: this press can play a ping (the Watching list's), so it may ask the browser for permission; nowhere else asks. */
export function SetPrice<T extends PriceReply>({ catalogId, real, priority, now, onSaved, quiet, ping }: { catalogId?: string; real?: RealPick; priority?: "really" | "nice"; now: number; onSaved?: (w: T) => void; quiet?: boolean; ping?: boolean }) {
  const [typed, setTyped] = useState(String(now / 100));
  const [st, setSt] = useState<{ kind: "idle" | "busy" } | { kind: "saved" | "error"; line: string }>({ kind: "idle" });
  async function save(e: FormEvent) {
    e.preventDefault();
    // The ping's permission, asked only here, by her press, before any wait (a browser asks only inside the tap), and only
    // where a page's notification can show: a phone browser shows them only from a service worker (Android Chrome throws),
    // so it isn't asked for something that can't happen (DD, Nov 5). A no changes nothing: the row's line is the ping.
    // Only where a ping can come (R's red team, Nov 5): the Week shelf's press plays none, so it doesn't ask; a real row's can bring the real ping, so it does (Track F).
    if (ping && typeof Notification !== "undefined" && Notification.permission === "default" && !/Android|iPhone|iPad/i.test(navigator.userAgent)) void Notification.requestPermission().catch(() => {});
    setSt({ kind: "busy" });
    try {
      const cents = Math.round(Number(typed) * 100);
      const r = real ? await json<T>("/api/runs/wants/real", { ...real, target: cents }) : await json<T>("/api/runs/wants", { catalogId, priority, max: cents });
      const row = real ? r.data.real?.find((w) => w.productId === real.productId && w.domain === real.domain) : r.data.watching?.find((w) => w.catalogId === catalogId);
      if (r.data.error || !row) { setSt({ kind: "error", line: r.data.error ?? "That didn't save. Nothing changed." }); return; }
      setSt({ kind: "saved", line: row.status });
      onSaved?.(r.data);
    } catch (err) { setSt({ kind: "error", line: troubleNote(err) }); }
  }
  return (
    <form className="dk-setprice" onSubmit={(e) => void save(e)}>
      <label aria-label={quiet ? YOUR_PRICE : undefined}>{!quiet && <span className="dk-k">{YOUR_PRICE}</span>}<span className="dk-setprice-in">$<input inputMode="decimal" autoComplete="off" maxLength={9} value={typed} onChange={(e) => setTyped(e.target.value)} /></span></label>
      <button type="submit" className="dk-pill" disabled={st.kind === "busy"}>{st.kind === "busy" ? "Saving…" : SET_YOUR_PRICE}</button>
      {st.kind === "error" && <p className="dk-setprice-line" role="alert">{st.line}</p>}
      {st.kind === "saved" && !onSaved && <p className="dk-setprice-line" role="status">{st.line}</p>}
    </form>
  );
}
