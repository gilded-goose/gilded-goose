// What this server's payments really are, read once from /api/health: "sandbox" only when PayPal's sandbox is wired
// (keys set, not the local stand-in); anything else, including a server that doesn't answer, is "practice".
import { useEffect, useState } from "react";
import { getJson } from "./api.ts";

export type PaymentMode = "sandbox" | "practice";

export function usePaymentMode(): PaymentMode {
  const [mode, setMode] = useState<PaymentMode>("practice");
  useEffect(() => {
    let on = true;
    void getJson<{ payment?: string; sandbox?: boolean }>("/api/health").then((h) => {
      if (on && h !== "away" && h.payment === "sandbox" && h.sandbox === true) setMode("sandbox");
    });
    return () => { on = false; };
  }, []);
  return mode;
}
