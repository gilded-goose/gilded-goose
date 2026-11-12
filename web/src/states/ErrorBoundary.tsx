// Track R: the generic error boundary. A part of a page that throws while drawing is replaced by the states kit's error
// block (brand.md §10.9) with "Try again", which draws the part afresh; the rest of the page stays. A throw is not a
// network failure, so no cause is said. A chunk that failed to load can't be drawn again from this page, so it offers
// Reload instead, with strip.ts's rule (R-11, offline wins): while offline it says only "You're offline." (a Reload can't
// work offline); online it says "Part of this page didn't load." ("updated" waits on a release check, DD 09:29).
import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";
import { StateNote } from "./StateNote.tsx";
import { ERROR, LOST, OFFLINE, UPDATED } from "./words.ts";
import { chunkNote, lostChunk, type Lost } from "./strip.ts";

const CHUNK = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i;
export const isChunkError = (e: unknown): boolean => CHUNK.test(e instanceof Error ? e.message : String(e));

type State = { error: unknown; tries: number; lost: Lost };
export class ErrorBoundary extends Component<{ children: ReactNode; className?: string; onError?: (error: unknown, info: ErrorInfo) => void }, State> {
  state: State = { error: null, tries: 0, lost: "updated" };
  static getDerivedStateFromError(error: unknown) { return { error, lost: lostChunk(null) }; } // "updated" waits on a release check
  private redraw = () => { if (this.state.error !== null) this.forceUpdate(); };
  componentDidMount() { addEventListener("online", this.redraw); addEventListener("offline", this.redraw); }
  componentWillUnmount() { removeEventListener("online", this.redraw); removeEventListener("offline", this.redraw); }
  componentDidCatch(error: unknown, info: ErrorInfo) { this.props.onError?.(error, info); }
  render() {
    if (this.state.error === null) return <Fragment key={this.state.tries}>{this.props.children}</Fragment>; // a new key per try: the part starts afresh
    if (isChunkError(this.state.error)) {
      const note = chunkNote(this.state.lost, navigator.onLine);
      if (note === "offline") return <StateNote className={this.props.className} kind="offline" title={OFFLINE.title} line={OFFLINE.line} />;
      const words = note === "updated" ? UPDATED : LOST;
      return <StateNote className={this.props.className} kind="updated" title={words.title} action={{ label: words.action, onClick: () => location.reload() }} />;
    }
    return <StateNote className={this.props.className} kind="error" title={ERROR.title} action={{ label: ERROR.action, onClick: () => this.setState((s) => ({ error: null, tries: s.tries + 1 })) }} />;
  }
}
