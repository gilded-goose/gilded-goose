// The moment panel's words (the "Every decision" ledger), kept out of Ledger.tsx so a test reads what the panel says, not its
// source: under the week's stop (the server's words), the "asked" moment never says it waits for a yes (Lead-12, Nov 5).
// Imported only by the lazy Ledger chunk, so no route's eager bytes move.
import type { Moment } from "@goose/core/grid";
import type { StopSaid } from "@goose/core/return";
import { usd } from "@goose/core/money";

export { usd };

/** The deal lane's words at each phase after the deal (the money's state, never "needs your yes" once it moved). */
const DEAL_STATE: Partial<Record<Moment["phase"], string>> = { deal: "deal, code checks next", asked: "deal, needs your yes", approved: "deal, approved by code", ordered: "ordered, approve in PayPal", paid: "paid", finished: "deal, not paid", closed: "closed, not paid" };

/** The deal lane at this phase: the stop's lane while it asks, else the money's state. */
export const dealLane = (phase: Moment["phase"], said?: StopSaid | null): string => (phase === "asked" && said?.lane) || (DEAL_STATE[phase] ?? "deal");

export const HEAD: Record<Moment["phase"], (m: Moment, s?: StopSaid | null) => string> = {
  starting: () => "Before any offer",
  haggling: (m) => `Round ${m.round}: haggling`,
  refused: (m) => (m.row.actor === "watcher" ? `Round ${m.round}: the Watcher set a seller aside` : `Round ${m.round}: code refused`),
  deal: (m) => `Deal at ${usd(m.model.deal!.price)}, before code checks the cart`,
  asked: (m, s) => `Deal at ${usd(m.model.deal!.price)}${s?.strip ?? ", waiting for your yes"}`, // under the stop, the yes it waited for can't come
  approved: (m) => `Code approved the ${usd(m.model.deal!.price)} cart`,
  ordered: (m) => `Order placed for ${usd(m.model.deal!.price)}, waiting for approval in PayPal`,
  paid: (m) => `Paid ${usd(m.model.deal!.price)} through PayPal`,
  finished: (m) => (m.model.deal ? `Deal at ${usd(m.model.deal.price)}; the run ended, nothing paid` : "The run ended. Nothing bought."),
  walked: () => "The agent walked away. Nothing bought.",
  closed: () => "The cart closed without paying",
};
