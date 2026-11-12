// One reading of a run from the server (GET /api/runs/:id) into the receipt's Back: PayPal's return reads it once
// (useRun), and the receipt reads it again after an Undo, so the headline after a refund is the server's own card
// ("Refunded $x"), never the page's "Paid" (Q, Nov 11). A run the server can't find is never "Paid"; an answer that
// isn't the run (a 5xx, a refused read, no answer at all) is the lost-answer state, never "PayPal hasn't confirmed".
import { json } from "../desk/api.ts";
import type { Back, Recap } from "./back.ts";

type RunAnswer = {
  bound: { total: string; merchant: string; item: string; orderId: string | null } | null;
  settled: { ok: boolean; reason?: string } | null;
  card?: Back["card"];
  mine?: boolean;
};
type Get = <T>(path: string) => Promise<{ status: number; data: T }>;

const NONE = { total: null, merchant: null, item: null, orderId: null, ok: null } as const;
export const GONE: Back = { ...NONE, reason: null, gone: true };
/** No answer at all (the server unreachable). */
export const LOST: Back = { ...NONE, reason: "Goose couldn't reach the server to check this payment.", lost: true };
/** The server answered, but not with the run (an error status other than 404). */
export const LOST_ANSWER: Back = { ...NONE, reason: "Goose's server couldn't say what happened to this payment just now.", lost: true };

export async function readBack(run: string, recap: Recap | null = null, get: Get = json): Promise<Back> {
  if (!/^[0-9a-f]{12}$/.test(run)) return GONE;
  let got: { status: number; data: RunAnswer };
  try { got = await get<RunAnswer>(`/api/runs/${run}`); } catch { return LOST; }
  const { status, data } = got;
  if (status === 404) return GONE;
  if (status >= 400 || !data || typeof data !== "object") return LOST_ANSWER;
  // The server's card and owner word (as the Desk reads them): the receipt prints these, never words of its own.
  return { total: data.bound?.total ?? null, merchant: data.bound?.merchant ?? null, item: data.bound?.item ?? null, orderId: data.bound?.orderId ?? null, ok: data.settled?.ok ?? null, reason: data.settled?.reason ?? null, card: data.card ?? null, mine: data.mine === true, ...(recap ? { recap } : {}) };
}

/** After a refund went through: the run as the server now has it. A run that vanished between the Undo and this read
 *  is the lost-answer state, not "can't find": the Undo itself just found it. */
export async function readAfterUndo(run: string, recap: Recap | null = null, get: Get = json): Promise<Back> {
  const b = await readBack(run, recap, get);
  return b.gone ? LOST_ANSWER : b;
}
