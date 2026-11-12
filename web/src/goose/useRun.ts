// One shopping run, from words to PayPal's return. Every word about a seller, a price or a payment comes from the
// server: the ask is read by /api/runs/market/understand (code, no model), the market by /api/runs/market/ask (a fictional
// market, labelled so), the cart by /api/runs/store/cart (the guard checks it again in code), and the payment happens
// on PayPal's own approval page. Nothing here can pay: only the shopper's tap on Approve starts the cart, and `approve` hands back PayPal's address for the page that shows its sandbox warning to open.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toCents } from "@goose/core/money";
import { json, troubleNote } from "../desk/api.ts";
import { buildWeek, pulledTo, type Beat, type Market } from "./market.ts";
import { readBack } from "./read-back.ts";

export type Health = { payment?: string } | null | "away";
export type Read = { item: string; title?: string; said?: string; limit: string; category: string; why: string; because: string; cap: string | null; held: string; heldBy: string; line: string };
type Cart =
  | { kind: "cart"; runId: string; total: string; reason: string; holds: string[]; canPay: boolean }
  | { kind: "refused" | "missing"; reason: string };
export type { Recap, Back } from "./back.ts";
import type { Recap, Back } from "./back.ts";

const recapKey = (run: string) => `gg-recap:${run}`;
function readRecap(run: string): Recap | undefined {
  try {
    const r = JSON.parse(sessionStorage.getItem(recapKey(run)) ?? "null") as Recap | null;
    return r && Number.isFinite(r.limit) && Number.isFinite(r.refused) ? r : undefined;
  } catch { return undefined; }
}
export type Phase = "rest" | "reading" | "brief" | "asking" | "shopping" | "stopped" | "done" | "failed" | "back";

export const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useRun() {
  const [health, setHealth] = useState<Health>(null);
  const [phase, setPhase] = useState<Phase>("rest");
  const [words, setWords] = useState("");
  const [read, setRead] = useState<Read | null>(null);
  const [market, setMarket] = useState<Market | null>(null);
  const [limit, setLimit] = useState(9000);
  const [step, setStep] = useState(0);
  const [jam, setJam] = useState<number | null>(null);
  const [guarding, setGuarding] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  // A connection failure is worth retrying; words the server couldn't read are not.
  const [retry, setRetry] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payNote, setPayNote] = useState<string | null>(null);
  const [back, setBack] = useState<Back | null>(null);
  const asks = useRef(0);

  useEffect(() => {
    json<{ payment?: string }>("/api/health").then(({ data }) => setHealth(data), () => setHealth("away"));
    // PayPal's return lands here with the run: say what the server's settle says, never more.
    const run = new URLSearchParams(location.search).get("run");
    if (!run) return;
    setPhase("back");
    // read-back.ts: the server's card and owner word; a 404 is "can't find", any other failed answer the lost state.
    void readBack(run, /^[0-9a-f]{12}$/.test(run) ? readRecap(run) ?? null : null).then(setBack);
  }, []);

  const held = read ? toCents(read.held) : 9000;
  const week = useMemo(() => (market ? buildWeek(market, limit) : null), [market, limit]);
  const shown = phase === "done" ? (week?.beats.length ?? 0) : step;
  const beats: Beat[] = week ? week.beats.slice(0, shown) : [];

  // Ask: code reads the words into a brief first (no model, no cap); Goose shops only when you send it.
  const ask = useCallback(async (raw: string) => {
    const w = raw.trim();
    if (w.length < 2) return;
    const n = ++asks.current;
    setWords(w); setFail(null); setMarket(null); setSheet(false); setPayNote(null); setStep(0); setJam(null);
    setPhase("reading");
    try {
      const { data } = await json<Read & { error?: string }>("/api/runs/market/understand", { words: w });
      if (n !== asks.current) return;
      if (data.error) { setFail(data.error); setRetry(false); setPhase("failed"); return; }
      setRead(data); setLimit(toCents(data.held)); setPhase("brief");
    } catch (e) { if (n === asks.current) { setFail(troubleNote(e)); setRetry(true); setPhase("failed"); } }
  }, []);

  const shop = useCallback(async () => {
    if (!read) return;
    const n = ++asks.current;
    setPhase("asking"); setFail(null);
    try {
      const { data } = await json<Market | { kind: "failed"; reason: string }>("/api/runs/market/ask", { words });
      if (n !== asks.current) return;
      if (data.kind !== "market") { setFail(data.reason); setRetry(false); setPhase("failed"); return; }
      setMarket(data); setStep(0); setPhase(still() ? "done" : "shopping");
    } catch (e) { if (n === asks.current) { setFail(troubleNote(e)); setRetry(true); setPhase("failed"); } }
  }, [read, words]);

  // The week plays one beat at a time. A refusal holds longer; one whose note gives orders jams the limit first.
  useEffect(() => {
    if (phase !== "shopping" || !week) return;
    if (step >= week.beats.length) { setPhase("done"); return; }
    const prev = week.beats[step - 1];
    const wait = step === 0 ? 900 : prev?.kind === "aside" ? (prev.pulls ? 4000 : 2200) : prev?.kind === "under" ? 900 : 1000;
    const t = setTimeout(() => setStep((s) => s + 1), wait);
    return () => clearTimeout(t);
  }, [phase, step, week]);
  useEffect(() => {
    const b = week?.beats[step - 1];
    if (phase !== "shopping" || b?.kind !== "aside") return;
    setGuarding(true);
    const to = b.pulls ? pulledTo(b.quoted, limit) : null;
    if (!to) { const t = setTimeout(() => setGuarding(false), 1800); return () => clearTimeout(t); }
    // The note's number starts turning onto your limit's flaps; Goose stops it and turns them back.
    const a = setTimeout(() => setJam(to), 400), z = setTimeout(() => setJam(null), 1900), g = setTimeout(() => setGuarding(false), 3400);
    return () => { clearTimeout(a); clearTimeout(z); clearTimeout(g); setJam(null); };
  }, [phase, step, week, limit]);

  const approve = useCallback(async (): Promise<string | null> => {
    if (!market || !week?.best) return null;
    setPaying(true); setPayNote(null);
    try {
      const r = await json<Cart & { error?: string }>("/api/runs/store/cart", { market: market.marketId, listingId: week.best.id, from: "line", maxPrice: (limit / 100).toFixed(2) });
      if (r.data.error) { setPayNote(r.data.error); setPaying(false); return null; }
      const cart = r.data;
      if (cart.kind !== "cart") { setPayNote(cart.reason); setPaying(false); return null; }
      if (!cart.canPay || cart.holds.length > 0) { setPayNote(cart.holds.length ? `Held for your yes: ${cart.holds.join("; ")}.` : cart.reason); setPaying(false); return null; }
      try { sessionStorage.setItem(recapKey(cart.runId), JSON.stringify({ limit, refused: week.beats.filter((b) => b.kind === "aside").length } satisfies Recap)); } catch { /* the receipt just shows less */ }
      const p = await json<{ approveUrl?: string; error?: string }>("/api/runs/store/complete_payment", { runId: cart.runId });
      if (p.data.approveUrl) return p.data.approveUrl; // stays "paying" while the page leaves, so a second tap can't start another cart
      setPayNote(p.data.error ?? "PayPal didn't open. Nothing was charged.");
    } catch (e) { setPayNote(troubleNote(e)); }
    setPaying(false);
    return null;
  }, [market, week, limit]);

  const startOver = useCallback(() => {
    asks.current++;
    if (location.search) history.replaceState(null, "", location.pathname);
    setPhase("rest"); setMarket(null); setRead(null); setBack(null); setSheet(false); setFail(null); setWords(""); setJam(null);
  }, []);

  const stop = useCallback(() => { setPhase("stopped"); setJam(null); setGuarding(false); }, []);
  const skip = useCallback(() => { setJam(null); setGuarding(false); setPhase("done"); }, []);
  const replay = useCallback(() => { setStep(0); setPhase(still() ? "done" : "shopping"); }, []);
  const edit = useCallback(() => setPhase("rest"), []);

  return {
    health, phase, words, setWords, read, market, limit, setLimit, held, week, shown, beats, jam, guarding, fail, retry,
    sheet, setSheet, paying, payNote, setPayNote, back, ask, shop, approve, startOver, stop, skip, replay, edit,
  };
}
export type Run = ReturnType<typeof useRun>;
