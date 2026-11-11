// Track R: the seven states of brand.md §10.9, each already worded, for surface owners to place where their content
// would go. Each is StateNote with the table's words; overrides exist only where a surface has its own missing thing.
import { useEffect, useState } from "react";
import { StateNote } from "./StateNote.tsx";
import { EMPTY, ERROR, LIMITED, LIMITED_DAILY, LIMITED_LATER, LOADING, NOT_FOUND, OFFLINE, WAKING, WAKING_FAILED } from "./words.ts";
import type { WakeState } from "./waking.ts";
import { limitedAction } from "./retry.ts";

/** Waiting on content. `sellers` only while sellers really load ("Goose is checking the sellers."). */
export function Loading(p: { sellers?: boolean; className?: string }) {
  return <StateNote kind="loading" title={p.sellers ? LOADING.sellers : LOADING.other} className={p.className} />;
}

/** No rows yet: the ledger's words by default; a surface with its own missing thing passes its own two lines. */
export function Empty(p: { title?: string; line?: string; action?: { label: string; href: string } | { label: string; onClick: () => void }; className?: string }) {
  return <StateNote kind="empty" title={p.title ?? EMPTY.title} line={p.line ?? EMPTY.line} action={p.action ?? { label: EMPTY.action, href: `${import.meta.env.BASE_URL}?desk=1` }} className={p.className} />;
}

/** A part failed. `network`: the call failed at the network or timed out (then, and only then, the cause is said). */
export function ErrorState(p: { onRetry: () => void; network?: boolean; className?: string }) {
  return <StateNote kind="error" title={ERROR.title} line={p.network ? ERROR.network : undefined} action={{ label: ERROR.action, onClick: p.onRetry }} className={p.className} />;
}

/** Offline. With `onBack` the surface asks again on `online` (and only then is that promised); no action either way. */
export function Offline(p: { onBack?: () => void; className?: string }) {
  const { onBack } = p;
  useEffect(() => {
    if (!onBack) return;
    addEventListener("online", onBack);
    return () => removeEventListener("online", onBack);
  }, [onBack]);
  return <StateNote kind="offline" title={OFFLINE.title} line={onBack ? OFFLINE.back : OFFLINE.line} className={p.className} />;
}

/** A 429. "Try again" stays focusable but disabled until `retryAfterMs` has passed (no countdown shown). `cause`: the
 *  server's own sentence when a cap says more than "too many in a short time" (a daily cap must not say "a minute"). */
export function RateLimited(p: { onRetry?: (() => void) | undefined; retryAfterMs?: number | undefined; daily?: boolean | undefined; title?: string | undefined; cause?: string | undefined; className?: string | undefined }) {
  const how = limitedAction({ daily: p.daily, retryAfterMs: p.retryAfterMs, canRetry: !!p.onRetry });
  const wait = how === "wait" ? p.retryAfterMs ?? 0 : 0;
  const [ready, setReady] = useState(wait <= 0);
  useEffect(() => {
    if (wait <= 0) { setReady(true); return; }
    setReady(false);
    const t = setTimeout(() => setReady(true), wait);
    return () => clearTimeout(t);
  }, [wait]);
  // A daily cap or a long wait draws no Try again (retry.ts limitedAction): it would sit disabled for hours, or retry into the cap.
  const words = p.daily ? LIMITED_DAILY : how === "none" && (p.retryAfterMs ?? 0) > 0 ? LIMITED_LATER : LIMITED;
  const action = how === "none" || !p.onRetry ? undefined : { label: LIMITED.action, onClick: p.onRetry, disabled: !ready };
  return <StateNote kind="limited" title={p.title ?? words.title} line={p.cause ?? words.line} action={action} className={p.className} />;
}

/** The server is waking: the vector egg at 40% above the words, lit to full (one --d-3 transition) once it answers. */
/** The server is waking (waking.ts). `state` (the DD, ~07:20): "pending" while a request is out says it fills in when
 *  it answers, with no button; "failed" (that request ended with no real answer) never says "fills in" and offers Try
 *  again (`onRetry`, else a reload). */
export function Waking(p: { state?: WakeState | undefined; onRetry?: (() => void) | undefined; lit?: boolean | undefined; className?: string | undefined }) {
  if (p.state === "failed") {
    return <StateNote kind="waking" title={WAKING_FAILED.title} line={WAKING_FAILED.line} egg="dim" action={{ label: WAKING_FAILED.action, onClick: p.onRetry ?? (() => location.reload()) }} className={p.className} />;
  }
  return <StateNote kind="waking" title={WAKING.title} line={WAKING.line} egg={p.lit ? "lit" : "dim"} className={p.className} />;
}

/** In-app "nothing here" (a missing case or row); the unknown path's page is web/404.html, with the egg still. */
export function NotFound(p: { href?: string; className?: string }) {
  return <StateNote kind="notfound" title={NOT_FOUND.title} action={{ label: NOT_FOUND.action, href: p.href ?? import.meta.env.BASE_URL }} className={p.className} />;
}
