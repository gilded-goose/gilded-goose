// The ping with the tab closed (Joshua, Nov 5 6:40 PM, Level 2), mounted only when the server's switch is on. Offered
// wherever this browser can take a push and notifications aren't blocked; when they haven't been allowed yet, its own
// press asks first, before any wait, so it counts as her tap (the L2 DD seat: phones are never asked by Set your price, so
// this is where Android and a home-screen iPhone ask). Then it registers the page's service worker (/ping-sw.js),
// subscribes this browser, and gives the server only the push address. Stop deletes it there and here. iPhone outside a
// home-screen install: said plainly. The words are core's.
import { useEffect, useState } from "react";
import { PUSH_IPHONE, PUSH_KEPT, PUSH_OFF, PUSH_ON, PUSH_SENT, PUSH_SENT_NONE, PUSH_STOPPED } from "@goose/core/watching-words";
import { json, troubleNote } from "./api.ts";

const SW = "/ping-sw.js";

export default function PushRow() {
  const [st, setSt] = useState<{ key: string; kept: boolean } | null>(null);
  const [blocked, setBlocked] = useState(() => typeof Notification === "undefined" || Notification.permission === "denied");
  const [line, setLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    json<{ key?: string; kept?: boolean }>("/api/runs/push").then((r) => { if (r.data.key) setSt({ key: r.data.key, kept: r.data.kept === true }); }).catch(() => {});
    // A block set in the browser's own settings may land after this mounts.
    navigator.permissions?.query({ name: "notifications" }).then((p) => { p.onchange = () => setBlocked(Notification.permission === "denied"); }).catch(() => {});
  }, []);
  if (!st) return null;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return /iPhone|iPad/.test(navigator.userAgent) ? <p className="dk-watch-said">{PUSH_IPHONE}</p> : null;
  }
  if (blocked) return null;

  async function on() {
    // Asked here, by her press, before any wait; a no hides the button, a dismissal leaves it, and nothing else changes.
    const asked = Notification.permission === "default" ? Notification.requestPermission() : Promise.resolve(Notification.permission);
    setBusy(true); setLine(null);
    try {
      const got = await asked;
      if (got !== "granted") { setBlocked(got === "denied"); setBusy(false); return; }
      const reg = await navigator.serviceWorker.register(SW);
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: st!.key }));
      const r = await json<{ kept?: boolean; ping?: boolean; error?: string }>("/api/runs/push", { endpoint: sub.endpoint });
      if (r.data.kept) { setSt({ ...st!, kept: true }); setLine(r.data.ping ? PUSH_SENT : PUSH_SENT_NONE); } else setLine(r.data.error ?? troubleNote(null));
    } catch (e) { setLine(troubleNote(e)); }
    setBusy(false);
  }
  async function off() {
    setBusy(true); setLine(null);
    try {
      const sub = await (await navigator.serviceWorker.getRegistration(SW))?.pushManager.getSubscription();
      await sub?.unsubscribe();
      await json("/api/runs/push/remove", {});
      setSt({ ...st!, kept: false }); setLine(PUSH_STOPPED);
    } catch (e) { setLine(troubleNote(e)); }
    setBusy(false);
  }
  return (
    <div className="dk-watch-said">
      <button type="button" className="dk-pill" disabled={busy} onClick={() => void (st.kept ? off() : on())}>{st.kept ? PUSH_OFF : PUSH_ON}</button>
      <p role="status">{line ?? PUSH_KEPT}</p>
    </div>
  );
}
