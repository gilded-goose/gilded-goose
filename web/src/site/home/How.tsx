// How Goose shops for you: the summary's four steps in their real order, along one rule. Only the last one pays, so
// only it carries gold.
const STEPS: readonly { step: string; approve?: true }[] = [
  { step: "Tell it what you want" },
  { step: "It tests every seller" },
  { step: "It haggles while code decides" },
  { step: "You approve in PayPal", approve: true },
];

export function How() {
  return (
    <section id="how" className="sx" aria-labelledby="how-title">
      <div className="wrap">
        <header className="how-head">
          <h2 id="how-title" className="sx-h">How Goose <span className="sx-n">shops</span> for you</h2>
        </header>
        <ol className="how-steps" role="list">
          {STEPS.map((s) => (
            <li key={s.step} data-approve={s.approve ? "" : undefined}>
              <span className="how-step">{s.step}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
