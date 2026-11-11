// For builders: the one number the summary gives, set large, and the way to the Builders page.
import { hrefOf } from "../route.ts";

export function BuildersTeaser() {
  return (
    <section id="builders" className="sx" aria-labelledby="builders-title">
      <div className="wrap bt">
        <span className="bt-ten" aria-hidden="true">10</span>
        <h2 id="builders-title" className="sx-h">For builders</h2>
        <p className="sx-lede">The guard goes in front of an agent's checkout in about ten lines of code.</p>
        <a className="sx-link" href={hrefOf("builders")}>Read the guard</a>
      </div>
    </section>
  );
}
