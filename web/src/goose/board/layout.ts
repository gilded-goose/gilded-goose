// What the board says, as fixed-width lines of flap characters. Two widths: a wide board (31 flaps) and a phone board
// (21). Prices sit in one column under YOUR LIMIT, so every seller is compared to your number by eye.

export type Tone = "base" | "gold" | "red" | "dim" | "label";
export interface Line { text: string; tone: Tone }
export type Size = "wide" | "narrow";

interface Widths { cols: number; name: number; price: number; gap: number; status: number }
const W: Record<Size, Widths> = {
  wide: { cols: 31, name: 13, price: 5, gap: 2, status: 10 },
  narrow: { cols: 21, name: 8, price: 4, gap: 1, status: 7 },
};
export const colsOf = (s: Size) => W[s].cols;

/** A seller's state on the board: under or over your limit, the one Goose picked, held for your yes, or refused. */
export type Status = "under" | "deal" | "over" | "hold" | "refused";

const dollars = (cents: number) => `$${Math.round(cents / 100)}`;

/** A price in `n` flaps. An amount never loses its "$" or a digit to the column: past the width it reads in thousands. */
export function priceText(cents: number, n: number): string {
  const s = dollars(cents);
  if (s.length <= n) return s;
  const k = `$${Math.round(cents / 100000)}K`;
  return k.length <= n ? k : "$$$$".slice(0, n);
}

/** Words that fit `n` flaps: whole words while they fit, else the first word cut. Upper case, "(fictional)" dropped. */
export function fit(text: string, n: number): string {
  const words = text.replace(/\s*\(fictional\)\s*/gi, " ").replace(/[^A-Za-z0-9$.,:'&/+ -]/g, "").toUpperCase().split(/\s+/).filter(Boolean);
  let out = "";
  for (const w of words) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > n) break;
    out = next;
  }
  return (out || (words[0] ?? "").slice(0, n)).replace(/[,.:&/+-]+$/, "").padEnd(n);
}

const right = (s: string, n: number) => s.slice(-n).padStart(n);

/** The status word, sized to the board. */
export function statusWord(s: Status, limitCents: number, size: Size): string {
  const wide = size === "wide";
  switch (s) {
    case "under": return wide ? `UNDER ${dollars(limitCents)}` : "UNDER";
    case "deal": return wide ? "BEST PRICE" : "BEST";
    case "over": return wide ? `OVER ${dollars(limitCents)}` : "OVER";
    case "hold": return wide ? "NEEDS YES" : "HOLD";
    case "refused": return "REFUSED";
  }
}

const toneOf: Record<Status, Tone> = { under: "base", deal: "gold", over: "dim", hold: "base", refused: "red" };

export function sellerLine(name: string, cents: number, status: Status, limitCents: number, size: Size): Line {
  const w = W[size];
  const text = fit(name, w.name) + " " + right(priceText(cents, w.price), w.price) + " ".repeat(w.gap) + statusWord(status, limitCents, size).padEnd(w.status);
  return { text, tone: toneOf[status] };
}

export function headLine(title: string, right_: string, size: Size): Line {
  const w = W[size];
  const r = right_.toUpperCase();
  return { text: fit(title, w.cols - r.length - 1) + " " + r, tone: "base" };
}

/** YOUR LIMIT, with the amount in the price column. */
export function limitLine(cents: number | null, size: Size, label = size === "wide" ? "YOUR LIMIT" : "LIMIT"): Line {
  const w = W[size];
  const amount = cents === null ? "" : priceText(cents, w.price);
  return { text: (label.padEnd(w.name + 1) + right(amount, w.price)).padEnd(w.cols), tone: "gold" };
}

export function labelLine(size: Size): Line {
  const w = W[size];
  return { text: ("SELLER".padEnd(w.name + 1) + right(w.price >= 5 ? "PRICE" : "COST", w.price) + " ".repeat(w.gap) + "STATUS").padEnd(w.cols), tone: "label" };
}

/** What Goose itself has spent: always $0, because only your tap in PayPal can pay. */
export function spentLine(size: Size): Line {
  return { ...limitLine(0, size, size === "wide" ? "SPENT BY GOOSE" : "GOOSE SPENT"), tone: "label" };
}

/** Plain words on one row, left aligned (a receipt's merchant, item, order). */
export const textLine = (text: string, tone: Tone, size: Size): Line => ({ text: fit(text, W[size].cols), tone });

export const blankLine = (size: Size): Line => ({ text: " ".repeat(W[size].cols), tone: "base" });

/** Free text across the whole board width, centred (a power-on word, PAID). */
export function wholeLine(text: string, tone: Tone, size: Size): Line {
  const n = W[size].cols;
  const t = fit(text, n).trimEnd();
  const pad = Math.floor((n - t.length) / 2);
  return { text: (" ".repeat(pad) + t).padEnd(n), tone };
}
