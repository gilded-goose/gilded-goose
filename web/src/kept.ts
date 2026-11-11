// One part of a page, held on its own: a throw while it draws costs that part, and the rest of the page, and everything it remembers,
// stays. A boundary at a page's root (held.tsx) saves the page from going empty, but the shopper loses all she'd done there; under the
// Desk's root, that's her conversation and her deal. `or` draws in the part's place (nothing, by default), and goes when the part's
// parent draws a different part in its place, since that unmounts this. No stylesheet, so it adds nothing to a first paint's sheets.
// With no `or`, the part's loss is named in the page-wide strip with Reload (PartLost), never a silent hole (Track P, Fri Nov 6).
import { Component, createElement, type ReactNode } from "react";
import { PartLost } from "./states/online.ts";

export class Kept extends Component<{ children: ReactNode; or?: ReactNode }, { threw: boolean }> {
  state = { threw: false };
  static getDerivedStateFromError() { return { threw: true }; }
  render() { return this.state.threw ? this.props.or ?? createElement(PartLost) : this.props.children; }
}
