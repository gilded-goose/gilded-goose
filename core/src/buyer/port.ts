// The buyer agent sits behind LlmPort. The rule engine, Claude Haiku (server
// adapter) and the recorded tape (seeded mode) all implement it, so the engine,
// the guard and the tests never know which one is talking. Whatever the port
// returns is a *proposal*: the guard decides.

import type { Cents } from "../money.ts";
import type { FencedOffer } from "../trust/fence.ts";

export interface BuyerInput {
  want: { item: string; qty: number; maxPrice: Cents };
  round: number;
  maxRounds: number;
  offers: FencedOffer[];
  /** The buyer's own earlier moves, for consistency. */
  history: BuyerMove[];
}

export type BuyerMove =
  | { type: "counter"; sellerId: string; price: Cents; why: string }
  | { type: "accept"; sellerId: string; price: Cents; why: string }
  | { type: "wait"; why: string }
  | { type: "walk"; why: string };

export interface LlmPort {
  /** Which port is talking, for the label on screen: "rule", "claude-haiku-5-5", "recorded". */
  readonly name: string;
  /** The engine aborts `signal` at its timeout; a port that talks to a network should stop when it fires. */
  decide(input: BuyerInput, signal?: AbortSignal): Promise<BuyerMove>;
  /** Open network connections ahead of the first move, so it isn't the slow one (M2 step 1). Free calls only; never throws. */
  warm?(): Promise<void>;
  /** Fields every buyer row this port made carries, beside `source` (the recorded port: model, label and date; 011 Lesson 25). */
  readonly rowData?: Readonly<Record<string, string>>;
}

/** Shape check on anything a port returns, so a confused model can't hand the engine garbage. */
export function isBuyerMove(x: unknown): x is BuyerMove {
  if (typeof x !== "object" || x === null) return false;
  const m = x as Record<string, unknown>;
  if (typeof m.why !== "string") return false;
  switch (m.type) {
    case "counter":
    case "accept":
      return typeof m.sellerId === "string" && Number.isInteger(m.price) && (m.price as number) > 0;
    case "wait":
    case "walk":
      return true;
    default:
      return false;
  }
}
