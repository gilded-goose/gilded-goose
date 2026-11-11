// A page that throws while drawing: React takes down everything under its root, so with nothing to catch it the shopper is left
// with an empty page and no way forward. Every page's root is held by this, and says so with the kit's words (no new words).
// The kit's own ErrorBoundary is for a part of a page, and carries more than the first screen should: this is the last resort,
// small enough to sit in the first-screen bundle. Offline wins (R-11): no Try again that can't work, and it comes back when she does.
import { Component, type MouseEvent, type ReactNode } from "react";
import type { Tap } from "./held-tap.ts";
import { ERROR, ROOM_LOST } from "./states/words.ts";
import "./held.css";

/** Reloads this page. A plain link to the address she's on only jumps to its hash when it has one, and reloads nothing. */
export function TryAgain() {
  const again = (e: MouseEvent) => { e.preventDefault(); location.reload(); };
  return <a href={location.href} onClick={again}>{ERROR.action}</a>;
}

/** The line, and all a page has left. It's the page's one main and one heading, and it's said aloud (axe, on a real throw: a role on <main> took away both). */
export const HeldLine = ({ children }: { children: ReactNode }) => <main className="held"><div role="alert"><h1 className="held-line">{children}</h1></div></main>;

export class Held extends Component<{ children: ReactNode; onThrow?: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  private redraw = () => { if (this.state.failed) this.forceUpdate(); };
  componentDidMount() {
    // A tap made before the page was live counts now (held-tap.ts, its own chunk: no one else downloads it).
    const tap = (window as unknown as { __tap?: Tap }).__tap;
    if (tap) void import("./held-tap.ts").then((m) => m.heldTap(tap), () => {});
    addEventListener("online", this.redraw); addEventListener("offline", this.redraw); }
  componentWillUnmount() { removeEventListener("online", this.redraw); removeEventListener("offline", this.redraw); }
  componentDidCatch() { this.props.onThrow?.(); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <HeldLine>{ERROR.title} {navigator.onLine ? <><TryAgain />.</> : ROOM_LOST.offline}</HeldLine>;
  }
}
