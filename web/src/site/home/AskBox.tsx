// The hero's Ask box (spec §6.1 part 1): say what you want and the most you'll pay, then Shop for this starts a real run.
// The three examples fill the field and never shop on their own; the Live badge shows only when the server answered.
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { clearEarlyWords, earlyWords } from "../early-words.ts";
import { Button } from "../ui/Button.tsx";
import { Provenance } from "../ui/Provenance.tsx";
import { ArrowRightIcon } from "../ui/icons.tsx";
import { AskTools } from "../ui/AskTools.tsx";
import { handleSaid } from "../live/said.ts";
import type { ServerState } from "../live/useServer.ts";

export const ASK_EXAMPLES = ["A kettle under $60", "A rain jacket under $70", "A ticket under $90"] as const;

export function AskBox({ onShop, onWords, live, server }: { onShop(words: string): void; onWords?(words: string): void; live: boolean; server?: ServerState }) {
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const [early] = useState(earlyWords);
  const [words, setWords] = useState(early?.words ?? "");
  useEffect(() => {
    if (!early) return;
    clearEarlyWords();
    if (early.words) onWords?.(early.words);
    if (early.focused) field.current?.focus();
    // Once, for what was typed before the app loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [empty, setEmpty] = useState(false);
  const [help, setHelp] = useState<string | null>(null);
  const say = (w: string) => { setWords(w); onWords?.(w); };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const said = words.trim();
    if (!said) { setEmpty(true); field.current?.focus(); return; }
    if (handleSaid(said, setHelp)) { setWords(""); return; }
    onShop(said);
  };

  return (
    <form className="ask" onSubmit={submit} noValidate>
      <div className="ask-head">
        <label htmlFor={`${id}-words`} className="ask-label">What should Goose shop for?</label>
        {live ? <Provenance kind="live" /> : server === "away" ? <span className="ask-away">Server away</span> : null}
      </div>
      <div className="ask-field" data-empty={empty ? "" : undefined}>
        <input
          ref={field}
          id={`${id}-words`}
          className="ask-input"
          type="text"
          name="words"
          inputMode="text"
          enterKeyHint="go"
          autoComplete="off"
          spellCheck={false}
          maxLength={120}
          placeholder="Say what you want and your limit"
          value={words}
          aria-describedby={empty ? `${id}-hint` : undefined}
          aria-invalid={empty ? true : undefined}
          onChange={(e) => { say(e.target.value); if (empty) setEmpty(false); }}
        />
        <AskTools onWords={(w) => { say(w); setEmpty(false); field.current?.focus(); }} onStatus={setHelp} />
        <Button tone="ink" type="submit" className="ask-go">Shop for this <ArrowRightIcon size={18} /></Button>
      </div>
      {empty ? <p id={`${id}-hint`} className="ask-hint" role="status">Type what you want, or pick an example below.</p> : null}
      <p className="ask-help" aria-live="polite" data-on={help ? "" : undefined}>{help ?? "Hold the mic to talk. Your voice stays on this device."}</p>
      <div className="ask-try">
        <span className="ask-try-label" id={`${id}-try`}>Try</span>
        <ul className="ask-chips" role="list" aria-labelledby={`${id}-try`}>
          {ASK_EXAMPLES.map((x) => (
            <li key={x}>
              <button type="button" className="ask-chip" aria-pressed={words === x} onClick={() => { say(x); setEmpty(false); }}>{x}</button>
            </li>
          ))}
        </ul>
      </div>
    </form>
  );
}
