// The worked example for scripts/bench.ts: our own guard as a bench guard. `readSeller` is the published package's one
// call (plain code, no model, no network); its clear, hold and refuse are the bench's clear, held and aside.
import { readSeller } from "../trust/src/index.ts";

const SAID = { clear: "clear", hold: "held", refuse: "aside" } as const;

export default function guard(note: string): "clear" | "held" | "aside" {
  return SAID[readSeller(note).verdict];
}
