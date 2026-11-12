// The three promises, each with how far the code backs it and the features that prove it (Joshua, Nov 3, section 2). The
// words are core's (`@goose/core/promises`, rows `p-promise-*`); the links are the menu's, so a proof never names a page
// the menu doesn't open. Section 02 of the numbered landing, under the challenge (Joshua, Fri Nov 6 9:35 AM decision
// 1a): its opening lines are PromisesStart.tsx's.
import { CAP_CHIP, PROMISES, curly, type PromiseId } from "@goose/core/promises";
import { MENU_INDEX_ITEMS } from "@goose/core/menu-hash";
import { FEARS } from "@goose/core/missing-layer";
import { appHref } from "../../menu/href.ts";
import { PROMISES_ID, PromisesLines } from "./PromisesStart.tsx";

/** Each promise's proofs on the landing, by menu id. The menu lists them all; the challenge is the section above, under the ask. */
export const PROOFS: Readonly<Record<PromiseId, readonly string[]>> = {
  fooled: ["watcher", "approve"],
  overspend: ["limits", "haggle"],
  hide: ["ledger", "proof", "how"],
};

export function Promises({ onAsk }: { onAsk: (words: string) => void }) {
  return (
    <section className="ds-sec ds-promises" data-sr data-story="ds-promises" aria-labelledby={PROMISES_ID}>
      <PromisesLines />
      <ul className="ds-promise-list">
        {PROMISES.map((p) => (
          <li key={p.id}>
            <p className="ds-promise-fear">{FEARS[p.id]}</p>
            <h3>{curly(p.head)}</h3>
            <p>{p.line}</p>
            {p.id === "overspend" && <button type="button" className="ds-promise-try" onClick={() => onAsk(CAP_CHIP)}>{CAP_CHIP}</button>}
            <ul className="ds-promise-proofs" aria-label={`Proof: ${p.head}`}>
              {PROOFS[p.id].flatMap((id) => MENU_INDEX_ITEMS.filter((i) => i.id === id)).map((i) => (
                <li key={i.id}><a className="ds-textlink" href={appHref(i.href)}><span className="ds-u">{i.name}</span> <span aria-hidden="true">›</span></a></li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
