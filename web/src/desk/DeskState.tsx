// DK (the brief's item 5: every Desk state designed): the Desk's states are Track R's kit (web/src/states/**, brand.md
// §10.9), placed where the missing content would go. This file only picks the kit's state for the Desk's own reading of
// what came back (`Trouble`, core/src/view/desk.ts) and holds two Desk-specific choices, each Decided by default:
// waking is the kit's own `Waking`, whose words follow her request (the DD, part 2 nit 2; R at stack 89): while it is
// still out ("pending"), "This fills in when it answers." and no button; once it has failed, Try again and never "fills
// in", so the Desk and R's page-wide line say the same words; a cap here is per day, so it keeps its honest daily title
// and offers no Try again (asking again can't help); its one way forward is the recorded week (core WEEK_WAY, DK part 9),
// which needs no fresh market.
import { ASKING, TROUBLE, WEEK_WAY, causeOnly, type Trouble } from "@goose/core/desk";
import { appHref } from "../menu/href.ts";
import { ErrorState, Loading as KitLoading, Offline, StateNote, Waking, useWaking, type WakeState } from "../states/index.ts";

/** A pane's empty list: §10.9's Empty block with the pane's own missing thing and its one way forward. */
export function DeskEmpty({ title, line, action, onAction }: { title: string; line: string; action: string; onAction: () => void }) {
  return <StateNote kind="empty" title={title} line={line} action={{ label: action, onClick: onAction }} />;
}

/** A server trouble as its kit block. `line`: the server's own sentence, when it sent one (a cap's). `request`: whether
 *  her request is still out ("pending": waking only, no button) or came back failed (the default). */
export function TroubleState({ trouble, onRetry, line, request = "failed" }: { trouble: Trouble; onRetry: () => void; line?: string | null; request?: WakeState }) {
  if (trouble === "offline") return <Offline onBack={onRetry} />;
  if (trouble === "away") return <ErrorState network onRetry={onRetry} />;
  if (trouble === "error") return <ErrorState onRetry={onRetry} />;
  if (trouble === "waking") return <Waking state={request} onRetry={onRetry} />;
  return <StateNote kind="limited" title={TROUBLE.capped.title} line={line ? causeOnly(line, "capped") : TROUBLE.capped.line} action={WEEK_WAY} />;
}

/** The Desk's ask while its sellers load: §10.9's one line, or, when the server is waking under the pending ask, the
 *  waking block with no button (her ask is already out; a second tap can't send another). `quiet`: the Desk is asking
 *  again by itself after no answer (api.ts readJson, DK part 7), which is the same wake, so the same block. */
export function Asking({ quiet = false }: { quiet?: boolean }) {
  const waking = useWaking();
  return quiet || waking === "pending" ? <Waking state="pending" /> : <p className="dk-fiction">{ASKING}</p>;
}

/** The Desk's failed ask's one action, drawn as the kit's outline pill: Try again or Change my words (a button), or a
 *  cap's recorded week (a link, with the kit's "›", as StateNote draws one). */
export function StateAction(a: { label: string; onClick: () => void } | { label: string; href: string }) {
  return "href" in a
    ? <a className="st-note-action" href={appHref(a.href)}>{a.label} <span aria-hidden="true">›</span></a>
    : <button type="button" className="st-note-action" onClick={a.onClick}>{a.label}</button>;
}

/** A pane still waiting on the server: the kit's one quiet line, which draws only after 400 ms (states.css), or the
 *  waking block when the server is waking under that read. */
export function Loading({ on }: { on: boolean }) {
  const waking = useWaking();
  return on ? (waking === "pending" ? <Waking state="pending" /> : <KitLoading />) : null;
}
