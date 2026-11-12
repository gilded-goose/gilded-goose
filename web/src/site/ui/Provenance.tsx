// Where a thing on screen came from, in fixed words, so "recorded" and "live" never drift between pages.
import "./ui.css";

export type ProvenanceKind = "live" | "recorded" | "practice" | "sandbox" | "fictional";

const WORDS: Readonly<Record<ProvenanceKind, string>> = {
  live: "Live",
  recorded: "Recorded",
  practice: "Practice",
  sandbox: "PayPal sandbox",
  fictional: "Fictional",
};

export function Provenance({ kind }: { kind: ProvenanceKind }) {
  return (
    <span className="prov" data-kind={kind}>
      <span className="prov-mark" aria-hidden="true" />
      {WORDS[kind]}
    </span>
  );
}
