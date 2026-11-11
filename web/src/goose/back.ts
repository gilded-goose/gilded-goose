// What PayPal's return and this tab remember about a run: plain types, so tests can import them without the hook.
/** What this tab saw before PayPal: the limit Goose held and how many sellers it refused. Kept for one run only. */
export type Recap = { limit: number; refused: number };
/**
 * The server's own reading of a return (`returnCard` in core/src/view/return.ts, sent as `card`), or null when the run
 * is simply paid. The receipt prints it word for word, so no page decides "Not paid" or "Paid" itself (Q, Nov 10).
 */
export type Card = { head: string; line: string | null };
export type Back = {
  total: string | null; merchant: string | null; item: string | null; orderId: string | null; ok: boolean | null; reason: string | null;
  gone?: boolean; recap?: Recap;
  card?: Card | null;
  /** The server's word on whether this browser owns the run (`mine`): another browser never reads "Your tap". */
  mine?: boolean;
  /** The server didn't answer the check: Goose couldn't check, which says nothing about PayPal. */
  lost?: boolean;
};
