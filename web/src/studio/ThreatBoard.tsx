// The Live Threat Board on the plain page (Track T; Joshua's Tier 2b): the same widgets as AG Studio's, on AG Grid Community
// and AG Charts, so a judge sees the whole board with or without a Studio licence. Its own lazy chunk (ThreatSlot.tsx).

import { ThreatProvider } from "./threat-state.tsx";
import { ThreatAsk, ThreatCounter, ThreatCredit, ThreatRules, ThreatTimeline, ThreatTries } from "./threat-widgets.tsx";

export default function ThreatBoard() {
  return (
    <ThreatProvider>
      <section className="tb" aria-labelledby="tb-h" data-board="fallback">
        <div className="tb-card dk-glass"><ThreatCounter /><ThreatAsk /></div>
        <div className="tb-cols">
          <div className="tb-card dk-glass"><ThreatTimeline /></div>
          <div className="tb-card dk-glass"><ThreatRules /></div>
        </div>
        <div className="tb-card dk-glass"><ThreatTries /></div>
        <ThreatCredit />
      </section>
    </ThreatProvider>
  );
}
