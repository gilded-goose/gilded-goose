// This visit's ledger rows, live, from /api/runs/session/events (the stream SessionLedger.tsx reads): every row the
// server writes for this browser's session, once each (deduped by seq), in the order written. With no session yet the
// server answers 204, which ends an EventSource for good, so the stream is opened again each time `key` changes (a
// brief read, a market found, a return from PayPal): the run's steps are what make the session.
import { useEffect, useState } from "react";
import type { LedgerEvent } from "@goose/core";

export function useSessionRows(key: string): LedgerEvent[] {
  const [rows, setRows] = useState<LedgerEvent[]>([]);
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const src = new EventSource("/api/runs/session/events");
    src.addEventListener("row", (m) => {
      let e: LedgerEvent;
      try { e = JSON.parse((m as MessageEvent<string>).data) as LedgerEvent; } catch { return; }
      if (typeof e?.seq !== "number") return;
      setRows((had) => (had.some((x) => x.seq === e.seq) ? had : [...had, e].sort((a, b) => a.seq - b.seq)));
    });
    // A 204, a 429 or a dropped link: stop here (no reconnect loop); the next step of the run opens it again.
    src.onerror = () => src.close();
    return () => src.close();
  }, [key]);
  return rows;
}
