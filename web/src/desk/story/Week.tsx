// A week with Goose (Joshua, Nov 5 6:10 PM): a calm section under the promises, numbered 02 (6:20 PM). A small-caps label, then four moments,
// each a day label and one plain sentence, on hairlines, then the footnote. The words are core's (`weekMoments`), read
// from the recorded week, so the page types no name, price or day (row `week-moments`).
import { WEEK_LABEL, WEEK_NOTE, type WeekMoment } from "@goose/core/scroll";

export function Week({ moments }: { moments: readonly WeekMoment[] }) {
  return (
    <section className="ds-sec ds-week" data-sr data-story="ds-week" aria-labelledby="ds-week-h">
      <h2 id="ds-week-h" className="dk-eyebrow ds-eyebrow ds-n">{WEEK_LABEL}</h2>
      <ol className="ds-week-list">
        {moments.map((m, i) => (
          <li key={i}><span className="ds-week-day ds-num">Day {m.day}</span><p>{m.line}</p></li>
        ))}
      </ol>
      <p className="ds-small ds-week-note">{WEEK_NOTE}</p>
    </section>
  );
}
