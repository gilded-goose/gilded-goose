import type { MenuAction, MenuIndexItem } from "@goose/core/menu-hash";

/**
 * The menu item the Desk marks as current (DK part 6 (g), the DD on part 5): the room that is open, and for the Ask
 * pane, which three items open, the one that actually opened it (Ask Goose, Talk to Goose or The Watcher). Anything
 * else that lands on the Ask pane (a week's "ask again", a fresh start) reads as Ask Goose.
 */
export function currentItem(items: readonly MenuIndexItem[], pane: string, opener: MenuAction | null): string | undefined {
  const a = pane === "ask" && (opener === "talk" || opener === "watcher") ? opener : pane;
  return items.find((it) => it.action === a)?.id;
}
