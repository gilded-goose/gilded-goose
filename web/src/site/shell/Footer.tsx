// The footer (spec §6.1 part 10): what is practice and fictional, who we are not, where it runs, and where the
// sources and the code are.
import { hrefOf } from "../route.ts";
import { Nav } from "./Nav.tsx";
import { Wordmark } from "./Header.tsx";

export function Footer({ onJudge }: { onJudge(): void }) {
  return (
    <footer className="footer">
      <div className="wrap footer-grid">
        <div className="footer-brand">
          <Wordmark />
          <p className="footer-line">Goose shops for you, tests every seller, and refuses the ones that try to trick it. Only your tap in PayPal pays.</p>
        </div>

        <nav className="footer-col" aria-labelledby="footer-site">
          <h2 id="footer-site" className="footer-h">Site</h2>
          <Nav route="home" variant="sheet" />
          <button type="button" className="footer-judge" onClick={onJudge}>Judge in 60 seconds</button>
        </nav>

        <div className="footer-col" aria-labelledby="footer-print">
          <h2 id="footer-print" className="footer-h">Plainly</h2>
          <ul className="footer-list" role="list">
            <li>Practice payments and fictional sellers.</li>
            <li>Not affiliated with PayPal.</li>
            <li>Hosted on Render.</li>
          </ul>
        </div>

        <div className="footer-col" aria-labelledby="footer-code">
          <h2 id="footer-code" className="footer-h">Sources and code</h2>
          <ul className="footer-list" role="list">
            <li><a href={hrefOf("proof", "sources")}>Sources for every figure</a></li>
            <li><a href={hrefOf("verify")}>Verify an order</a></li>
            <li>{__GOOSE_REPO_PUBLIC__ ? <a href={__GOOSE_REPO__}>Code on GitHub</a> : "Code on GitHub"}, MIT licence</li>
          </ul>
        </div>
      </div>
      <div className="wrap footer-base">
        <p>Made for the PayPal AI Hackathon, November 2026.</p>
      </div>
    </footer>
  );
}
