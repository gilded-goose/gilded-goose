// Lifts the cover a room named in the address is painted under (prerender.ts): the bar and the room's head, on screen
// before any of the Desk's code. Once the room's own head is in the same place, or it isn't coming, the page is the
// Desk's. Nothing happens on any other arrival: a room opened from the menu in place has no cover. The cover comes in its
// own file (first/room-<name>.html), so it can land after the room did: the attribute going is what tells it not to come.
export function roomArrived(): void {
  const h = document.documentElement;
  if (!h.hasAttribute("data-first-room")) return;
  h.removeAttribute("data-first-room");
  h.removeAttribute("data-first-fit");
  document.getElementById("dk-room-first")?.remove();
}
