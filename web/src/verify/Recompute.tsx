// "Recompute it yourself": a cart's fields, the exact text they make, the fingerprint this browser works out from it
// with Web Crypto (recompute.ts), and whether that is the value the order holds. A reader can change a field (one cent
// on the total) and watch the match break. Purely local: this file and recompute.ts call nothing and keep nothing
// (core/test/fingerprint-recompute.test.ts reads both for any way out), and every value is drawn as text.
//
// Mounted one way today: the default export, on recorded week 1's cart, under Under the hood's ledger (site/hood/Below.tsx).
// `Recompute` itself takes any cart's fields and the custom_id to compare with, and is NOT mounted anywhere yet: it is for
// the Verify page, with a real order's fields. Its "paypal" and "stored" words (words.ts) are unreachable until then.
import { useEffect, useId, useState } from "react";
import { Button } from "../site/ui/Button.tsx";
import { Provenance } from "../site/ui/Provenance.tsx";
import { draftOf, readDraft, rowsOf, safeDollars, type Draft, type Editable } from "./draft.ts";
import { canonical, centsOf, fingerprintOfText, type FingerprintFields } from "./recompute.ts";
import { RECORDED_FIELDS, RECORDED_FINGERPRINT } from "./recorded.ts";
import { FIELD_WORDS, MATCH_WORDS, RECIPE_FILE, RECIPE_LINK, RECIPE_SERVED, RECOMPUTE_HOW, RECOMPUTE_LABELS as L, RECOMPUTE_LOCAL, RECOMPUTE_NO_KEY, RECOMPUTE_RECORDED, RECOMPUTE_TRY, RECOMPUTE_WORKS, VECTORS_FILE, VECTORS_LINK, WITNESS_LABEL, type Witness } from "./words.ts";
import "./recompute.css";

const Tick = () => <svg className="fp-mark" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4.5 10.5l3.6 3.6 7.4-8.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const Cross = () => <svg className="fp-mark" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5.5 5.5l9 9m0-9l-9 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;

export interface RecomputeProps {
  /** The cart's fields with this approval's nonce and expiry (`fieldsOf(bound)` from a bound cart). */
  fields: FingerprintFields;
  /** The value to compare with: the order's custom_id, or null when the order carries none. */
  customId: string | null;
  /** Where that value came from; it picks the words. */
  witness: Witness;
  /** The level of this part's two small headings: one under its host's own heading. */
  level?: 3 | 4;
}

/** A new cart or a new value to compare with starts the part afresh, so no edit carries over from the last one. */
export function Recompute(p: RecomputeProps) {
  return <Part key={`${JSON.stringify(p.fields)}|${p.customId ?? ""}`} {...p} />;
}

function Part({ fields: from, customId, witness, level = 3 }: RecomputeProps) {
  const id = useId();
  const H = `h${level}` as "h3" | "h4";
  const [draft, setDraft] = useState<Draft>(() => draftOf(from));
  const [mine, setMine] = useState<{ text: string; value: string } | null>(null);
  const [cant, setCant] = useState(false);

  const read = readDraft(from, draft);
  let text: string | null = null, error: string | null = "error" in read ? read.error : null;
  if ("fields" in read) { try { text = canonical(read.fields); } catch { error = L.badTotal; } }

  useEffect(() => {
    if (text === null) return;
    if (!globalThis.crypto?.subtle) { setCant(true); return; }
    let live = true;
    fingerprintOfText(text).then((value) => { if (live) setMine({ text, value }); }, () => { if (live) setCant(true); });
    return () => { live = false; };
  }, [text]);

  const value = text !== null && mine?.text === text ? mine.value : null;
  const state = error ? "none" : cant ? "cant" : value === null ? "working" : value === customId ? "match" : "differ";
  const said = error ?? (state === "cant" ? L.cantHash : state === "working" ? L.working : MATCH_WORDS[witness][state === "match" ? "match" : "differ"]);
  const start = draftOf(from);
  const changed = (Object.keys(start) as Editable[]).some((k) => draft[k] !== start[k]);
  const cents = centsOf(draft.price ?? "");
  const shown = "fields" in read ? rowsOf(read.fields) : rowsOf(from);

  return (
    <div className="fp" data-state={state}>
      <p className="fp-lede">{RECOMPUTE_WORKS} {RECOMPUTE_LOCAL}</p>
      {witness === "recorded" ? <p className="fp-note"><Provenance kind="recorded" /> <span>{RECOMPUTE_RECORDED}</span></p> : null}
      <div className="fp-cols">
        <div className="fp-col">
          <H className="fp-h">{L.fields}</H>
          <ol className="fp-fields">
            {shown.map((r) => (
              <li key={r.key} className="fp-field">
                {r.edit ? (
                  <>
                    <label className="fp-name" htmlFor={`${id}-${r.key}`}>{FIELD_WORDS[r.key]}</label>
                    <input
                      id={`${id}-${r.key}`} className="fp-box" type="text" value={draft[r.edit] ?? ""} spellCheck={false} autoComplete="off" autoCapitalize="off" autoCorrect="off"
                      inputMode={r.edit === "qty" ? "numeric" : r.edit === "price" ? "decimal" : "text"}
                      aria-invalid={(r.edit === "qty" && error === L.badQty) || (r.edit === "price" && error === L.badTotal) || undefined}
                      onChange={(e) => { const v = e.currentTarget.value; setDraft((d) => ({ ...d, [r.edit!]: v })); }}
                    />
                  </>
                ) : (
                  <>
                    <span className="fp-name">{FIELD_WORDS[r.key]}</span>
                    <span className={r.quiet ? "fp-fixed fp-quiet" : "fp-fixed"}>{r.value}</span>
                  </>
                )}
              </li>
            ))}
          </ol>
        </div>
        <div className="fp-col">
          <H className="fp-h">{L.text}</H>
          <pre className="fp-text">{text ?? "\u2014"}</pre>
          <p className="fp-fine">{RECOMPUTE_HOW}</p>
          <dl className="fp-pair">
            <div><dt>{L.mine}</dt><dd className="fp-hash">{value ?? " "}</dd></div>
            <div><dt>{WITNESS_LABEL[witness]}</dt><dd className="fp-hash">{customId ?? L.noCustomId}</dd></div>
          </dl>
          <p className="fp-said" role="status">{state === "match" ? <Tick /> : state === "working" ? null : <Cross />}<span>{said}</span></p>
          <p className="fp-try">{RECOMPUTE_TRY}</p>
          <p className="fp-acts">
            <Button tone="ink" size="s" disabled={cents === null} onClick={() => { if (cents !== null) setDraft((d) => ({ ...d, price: safeDollars(cents + 1) })); }}>{L.addCent}</Button>
            <Button tone="line" size="s" disabled={!changed} onClick={() => setDraft(start)}>{L.reset}</Button>
          </p>
        </div>
      </div>
      <p className="fp-key">{RECOMPUTE_NO_KEY}</p>
      <p className="fp-fine"><a href={`${import.meta.env.BASE_URL}${RECIPE_FILE}`}>{RECIPE_LINK}</a> and its <a href={`${import.meta.env.BASE_URL}${VECTORS_FILE}`}>{VECTORS_LINK}</a>. {RECIPE_SERVED}</p>
    </div>
  );
}

/** Recorded week 1's cart, compared with the fingerprint the recorded week's file holds for it. The default export, so a
 *  host's lazy import is one short line (Under the hood's first load is counted in bytes: scripts/ratchet.ts). */
export default function RecordedRecompute() {
  return <Recompute fields={RECORDED_FIELDS} customId={RECORDED_FINGERPRINT} witness="recorded" />;
}
