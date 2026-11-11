// The ping with the tab closed (Level 2; registered only by "Ping me with the tab closed", web/src/desk/PushRow.tsx).
// The push carries nothing. Woken by one, this asks the server for her ping with her own cookie and shows it; offline, it
// shows a plain line that names no price. A tap opens her Watching list. It caches nothing and handles no other request.
const PLAIN_TITLE = "Goose · simulated price alert";
const PLAIN = "Simulated: something you're watching reached your price. Tap to see your list.";

self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    let w = { title: PLAIN_TITLE, body: PLAIN, tag: "goose" };
    try {
      const r = await fetch("/api/runs/push/words", { credentials: "same-origin", cache: "no-store" });
      const got = r.ok ? await r.json() : null;
      if (got && typeof got.title === "string" && typeof got.body === "string" && typeof got.tag === "string") w = got;
    } catch { /* the plain line stands */ }
    await self.registration.showNotification(w.title, { body: w.body, tag: w.tag });
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const here = open.find((c) => new URL(c.url).origin === self.location.origin);
    if (here) { await here.focus(); return here.navigate ? here.navigate("/#wants").catch(() => {}) : undefined; }
    return self.clients.openWindow("/#wants");
  })());
});
