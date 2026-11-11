// The header: the gold egg mark and wordmark, the menu, the server's state and the one way in for judges. On a phone the menu folds into
// a sheet and Judge in 60 seconds stays in the bar.
import { useState } from "react";
import { hrefOf, type Route } from "../route.ts";
import { GooseMark } from "../ui/Goose.tsx";
import { ArtDefs } from "../ui/ArtDefs.tsx";
import { Button } from "../ui/Button.tsx";
import { Sheet } from "../ui/Sheet.tsx";
import { MenuIcon } from "../ui/icons.tsx";
import { Nav } from "./Nav.tsx";
import { StatusDot } from "./StatusDot.tsx";

export function Wordmark() {
  return (
    <a className="wordmark" href={hrefOf("home")} aria-label="Gilded Goose, home">
      <GooseMark />
      <span className="wordmark-name" aria-hidden="true">Gilded Goose</span>
    </a>
  );
}

export function Header({ route, onJudge }: { route: Route; onJudge(): void }) {
  const [menu, setMenu] = useState(false);
  return (
    <header className="header">
      <ArtDefs />
      <div className="wrap header-row glass">
        <Wordmark />
        <nav className="header-nav" aria-label="Main">
          <Nav route={route} variant="bar" />
        </nav>
        <div className="header-end">
          <StatusDot compact />
          <Button tone="line" size="s" className="judge-btn" onClick={onJudge}><span className="judge-long">Judge in 60 seconds</span><span className="judge-short">Judge tour</span></Button>
          <button type="button" className="menu-btn" aria-haspopup="dialog" aria-expanded={menu} onClick={() => setMenu(true)}>
            <MenuIcon size={22} />
            <span className="vh">Menu</span>
          </button>
        </div>
      </div>
      <Sheet open={menu} onClose={() => setMenu(false)} title="Menu">
        <nav aria-label="Main, in the menu">
          <Nav route={route} variant="sheet" onGo={() => setMenu(false)} />
        </nav>
        <div className="sheet-status"><StatusDot /></div>
      </Sheet>
    </header>
  );
}
