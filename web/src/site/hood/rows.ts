// Under the hood's rows (spec §6.2), from the ledger's own events and nothing else: who proposed each step, what it was,
// the row's own why, and the PayPal call that made it, by its real name. Mapped from fields the events carry:
//   who   ← actor (+ data.modelLabel on a buyer row, data.rule / data.sign naming the AI reader on a Watcher row)
//   what  ← action, price, and the seller's name the offer rows carry (data.merchant), as the server wrote it
//   why   ← why, word for word
//   call  ← actor "paypal" and its action; the Agent Toolkit tools are the ones trust/src/paypal.ts really runs
//           (get_order before every capture, create_refund for Undo, list_disputes, list_transactions, shipment tracking)
// A seller row is "Seller": the plan's list has no word for the sellers, who propose every price.
import { usdOf } from "@goose/core/money";
import type { LedgerEvent } from "@goose/core";

export type HoodWho = "Claude Haiku · buyer" | "Claude Haiku · reader" | "Claude Haiku · market" | "Rule" | "Code" | "PayPal" | "You" | "Seller";

export interface HoodRow {
  seq: number;
  who: HoodWho;
  what: string;
  why: string | null;
  call: string | null;
  kind: "live" | "recorded";
}

const RECHECK = "get_order re-check (Agent Toolkit)";
const READ = "get_order (Agent Toolkit)";

const money = (e: LedgerEvent): string => (e.price ? ` ${usdOf(e.price)}` : "");
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

function whoOf(e: LedgerEvent): HoodWho {
  switch (e.actor) {
    case "buyer": {
      const label = str(e.data?.modelLabel) ?? str(e.data?.model) ?? "";
      return /haiku/i.test(label) ? "Claude Haiku · buyer" : "Rule";
    }
    case "watcher":
      return /ai-reader/.test(str(e.data?.rule) ?? "") || str(e.data?.sign) ? "Claude Haiku · reader" : "Code";
    case "seller": return "Seller";
    case "paypal": return "PayPal";
    case "shopper": return "You";
    default: return "Code";
  }
}

function callOf(e: LedgerEvent): string | null {
  if (e.actor !== "paypal") return null;
  const held = str(e.data?.authorizationId) !== null;
  switch (e.action) {
    case "order-created": return "Orders v2 · create order";
    case "error": return e.data?.reason === "create-failed" ? "Orders v2 · create order" : null;
    case "authorized": return `${READ} · Orders v2 authorize`;
    case "captured":
    case "capture-failed":
    case "capture-mismatch":
      return held ? `${RECHECK} · capture authorization` : `${READ} · Orders v2 capture`;
    case "voided":
    case "void-failed":
      return str(e.data?.code) ? `${RECHECK} · void authorization` : "Payments v2 · void authorization";
    case "refunded":
    case "refund-failed":
      return "create_refund (Agent Toolkit)";
    case "webhook":
      return e.data?.verified === true ? `Webhook verified · ${str(e.data.eventType) ?? "event"}` : null;
    case "shipped":
    case "ship-unconfirmed":
      return "create_shipment_tracking (Agent Toolkit)";
    default:
      if (e.action.startsWith("dispute-")) return "list_disputes (Agent Toolkit)";
      if (e.action.startsWith("reconcile-")) return "list_transactions (Agent Toolkit)";
      return null;
  }
}

function whatOf(e: LedgerEvent, names: ReadonlyMap<string, string>): string {
  const seller = (e.sellerId && names.get(e.sellerId)) || "a seller";
  const p = money(e);
  switch (`${e.actor}/${e.action}`) {
    case "seller/offer": return `${str(e.data?.merchant) ?? seller} asks${p}`;
    case "seller/price-swap": return `Seller changed the price after the hold:${p}`;
    case "watcher/refuse": return `Set aside ${seller}`;
    case "watcher/ask":
    case "watcher/hold": return `Waits for your yes: ${seller}`;
    case "buyer/counter": return `Counter${p} to ${seller}`;
    case "buyer/propose-counter": return `Proposes a counter of${p} to ${seller}`;
    case "buyer/accept": return `Accepts${p} from ${seller}`;
    case "buyer/walk": return `Walks away from ${seller}`;
    case "buyer/wait": return "Waits a round";
    case "code/counter": return `Counters at${p}`;
    case "code/store-cart": return `Cart from ${seller}${p}`;
    case "guard/worst-case": return `The most any cart can cost:${p}`;
    case "guard/ask": return `Cart${p} waits for your yes`;
    case "guard/capturing": return `Holds${p} against your week`;
    case "guard/done": return "Run finished";
    case "cart/refuse":
    case "fence/refuse": return `Refused${p}`;
    case "paypal/order-created": return `Order created for${p}`;
    case "paypal/authorized": return `Money held:${p}, not charged`;
    case "paypal/captured": return `Captured${p}`;
    case "paypal/capture-failed": return "Capture failed: nothing charged";
    case "paypal/capture-mismatch": return `Captured a different amount:${p}`;
    case "paypal/voided": return "Hold released: $0.00 captured";
    case "paypal/void-failed": return "Hold release not confirmed";
    case "paypal/refunded": return `Refunded${p}`;
    case "paypal/refund-failed": return "Refund didn't go through";
    case "paypal/webhook": return "PayPal webhook";
    case "paypal/unavailable": return "No PayPal on this server";
    case "paypal/error": return "PayPal order not created";
    case "shopper/cancel": return "You pressed Cancel on PayPal's page";
    default: return `${e.action.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase())}${p}`;
  }
}

export function hoodRows(events: readonly LedgerEvent[], kind: "live" | "recorded"): HoodRow[] {
  const names = new Map<string, string>();
  const out: HoodRow[] = [];
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    const merchant = str(e.data?.merchant);
    if (e.sellerId && merchant) names.set(e.sellerId, merchant);
    out.push({ seq: e.seq, who: whoOf(e), what: whatOf(e, names), why: e.why || null, call: callOf(e), kind });
  }
  return out;
}

/** This visit's own rows: the seeded week is simulated history, so it stays out of a run's ledger. */
export const ownRows = (events: readonly LedgerEvent[]): LedgerEvent[] => events.filter((e) => e.source !== "seeded");
