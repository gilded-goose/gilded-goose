// What we've checked: one band between two ink rules, pointing at the Proof page where each figure keeps its source.
import { hrefOf } from "../route.ts";

export function Checked() {
  return (
    <section id="checked" className="sx" aria-labelledby="checked-title">
      <div className="wrap">
        <div className="chk">
          <div className="sx-stack">
            <h2 id="checked-title" className="sx-h">What we’ve checked, <span className="sx-n">misses</span> included</h2>
            <p className="sx-lede">Every figure here links to the row that says where it came from.</p>
          </div>
          <a className="sx-link" href={hrefOf("proof")}>See the proof</a>
        </div>
      </div>
    </section>
  );
}
