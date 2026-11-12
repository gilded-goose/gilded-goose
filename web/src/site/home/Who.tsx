// Who it's for: the heading on the left, its two readers as ruled lines on the right. Words from the section summary only.
export function Who() {
  return (
    <section id="who" className="sx" aria-labelledby="who-title">
      <div className="wrap who">
        <header className="sx-stack">
          <h2 id="who-title" className="sx-h">Who it’s <span className="sx-n">for</span></h2>
          <p className="sx-lede">Anyone who lets an agent or an ad shop for them, and every checkout that wants to let agents buy safely.</p>
        </header>
        <ul className="who-list" role="list">
          <li><span className="who-k">People who shop through an agent</span><span className="who-v">Or through an ad that buys for them.</span></li>
          <li><span className="who-k">Checkouts</span><span className="who-v">That want to let agents buy, safely.</span></li>
        </ul>
      </div>
    </section>
  );
}
