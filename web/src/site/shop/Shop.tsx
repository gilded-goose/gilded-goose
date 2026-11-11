// Shop (spec §6.2): Ask → Understand → Discover → Compare → Decide → Approve → Receipt, driven by the same useRun the
// board page uses, with Under the hood beside it. The hero's Ask arrives as sessionStorage["gg-ask"]; PayPal's return
// (any of the five shapes back() sends, returns.ts) opens the receipt. With the server away the page says so and shows
// the recorded kettle week, labelled, never a blank or an error.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { lazyPage } from "../ui/lazy-page.tsx";
import kettle from "virtual:goose-kettle";
import { useRun, type Recap } from "../../goose/useRun.ts";
import { REFUSED } from "../live/api.ts";
import { useServer } from "../live/useServer.ts";
import { Button } from "../ui/Button.tsx";
import { GooseMark } from "../ui/Goose.tsx";
import { hoodRows, ownRows } from "../hood/rows.ts";
import { approveOnce } from "./approve-once.ts";
import { ApproveCard, ApproveSheet } from "./ApproveSheet.tsx";
import { Brief, ShopAsk } from "./Brief.tsx";
import { Compare, RealPrices, preloadGrid } from "./Compare.tsx";
import { compareRows, kettleRows } from "./compare-rows.ts";
import { Decide, Pick } from "./Decide.tsx";
import { Discover } from "./Discover.tsx";
import { payFor, type Placed } from "./pay.ts";
import { Receipt } from "./Receipt.tsx";
import { returnOf } from "./returns.ts";
import { usd } from "./receipt-words.ts";
import { useSessionRows } from "./session.ts";
import "./shop.css";

const HoodDrawer = lazyPage(() => import("../hood/Drawer.tsx").then((m) => ({ default: m.HoodDrawer })));

const KETTLE_LIMIT = 6000;

function readOnce(key: string): string | null {
  try { const v = sessionStorage.getItem(key); sessionStorage.removeItem(key); return v; } catch { return null; }
}
// The ledger is evidence, not the default view: closed until someone opens it (and it stays open for the session).
function hoodDefault(): boolean {
  try { return sessionStorage.getItem("gg-hood-open") === "1"; } catch { return false; }
}

export function Shop() {
  const run = useRun();
  const server = useServer();
  const [returned] = useState(() => returnOf(window.location));
  const [hood, setHood] = useState(hoodDefault);
  const [sheet, setSheet] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payNote, setPayNote] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    const on = () => setRefused(true);
    window.addEventListener(REFUSED, on);
    return () => window.removeEventListener(REFUSED, on);
  }, []);
  const placed = useRef<Placed | null>(null);
  const { phase, market, week, limit, read } = run;
  const mode = run.health !== "away" && run.health?.payment === "sandbox" ? "sandbox" : "practice";
  const away = server === "away" || run.health === "away";

  // The hero's words, once; never on a return from PayPal.
  useEffect(() => {
    if (returned) return;
    const words = readOnce("gg-ask");
    if (words && words.trim().length >= 2) { run.setWords(words); void run.ask(words); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const again = useCallback(() => {
    run.startOver();
    placed.current = null;
    setSheet(false); setPayNote(null); setPaying(false);
    // startOver drops the query and the hash; this page stays the Shop.
    history.replaceState(null, "", `${location.pathname}#/shop`);
  }, [run]);

  // useRun turns any `?run=` into a return; only the shapes back() really sends are one (returns.ts).
  useEffect(() => { if (phase === "back" && !returned) again(); }, [phase, returned, again]);

  // Goose found sellers: if their stone is below the fold (a phone), bring it up once, so the testing is what you watch.
  useEffect(() => {
    if (phase !== "shopping" && phase !== "done") return;
    const el = document.getElementById("discover-h");
    if (!el || el.getBoundingClientRect().top < window.innerHeight * 0.6) return;
    el.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    // Only on arriving at the market, never as the run moves on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market?.marketId]);

  // AG Grid (Compare's grid) loads once Goose starts on a run, or when the recorded compare will show: never with the
  // shop's first screen, and in by the time the compare does.
  useEffect(() => { if (phase !== "rest" || away) void preloadGrid().catch(() => undefined); }, [phase, away]);

  const rows = useMemo(() => (market ? compareRows(market.results, limit) : []), [market, limit]);
  const best = rows.find((r) => r.best) ?? null;
  const finished = phase === "done" || phase === "stopped";
  const listing = market && week?.best ? market.results.find((r) => r.id === week.best!.id) ?? null : null;

  // Approve: the latest run state, behind approveOnce so a second tap while the first is pending does nothing.
  const latest = useRef(async () => {});
  latest.current = async () => {
    if (!market || !listing) return;
    setPaying(true); setPayNote(null); setStatus("Asking the server for this exact cart…");
    const recap: Recap = { limit, refused: rows.filter((r) => r.verdict === "aside").length };
    const r = await payFor({ marketId: market.marketId, listingId: listing.id, limitCents: limit, recap, placed: placed.current });
    setTries((n) => n + 1);
    if ("go" in r) { setStatus("Opening PayPal…"); location.assign(r.go); return; }
    placed.current = r.placed;
    setPayNote(r.note); setPaying(false); setStatus(null);
  };
  const tap = useMemo(() => approveOnce(() => latest.current()), []);
  // A new cart (another seller, another limit) starts fresh; a cart already bound is only reused for the same pick.
  useEffect(() => { placed.current = null; setPayNote(null); }, [listing?.id, limit]);

  const live = useSessionRows(`${read?.item ?? ""}|${market?.marketId ?? ""}|${phase === "back" ? "back" : ""}|${tries}`);
  const recorded = useMemo(() => hoodRows(kettle.events, "recorded"), []);
  const liveRows = useMemo(() => hoodRows(ownRows(live), "live"), [live]);
  const hoodData = liveRows.length > 0 ? liveRows : recorded;
  const hoodNote = liveRows.length > 0
    ? (mode === "practice" ? "Practice payments: the PayPal calls on these rows go to the server's stand-in for PayPal, so no real money moves." : null)
    : "Recorded week 1, replayed: the kettle week. Every seller is fictional. Your own run's rows replace these as they happen.";

  const showAsk = phase === "rest" || phase === "reading" || (phase === "failed" && !read);
  const line = sheet ? "Your tap, in PayPal." : showAsk ? "Tell Goose what you want." : phase === "brief" || phase === "failed" ? "Goose has your limit." : phase === "asking" || phase === "shopping" ? "Goose is checking every seller." : phase === "stopped" ? "Goose stopped." : best ? "Goose is back with one pick." : "Goose found nothing under your limit.";
  const kettleCompare = useMemo(() => kettleRows(kettle.events, KETTLE_LIMIT), []);
  const kettleBest = kettleCompare.find((r) => r.best) ?? null;
  const deal = kettle.home.deal;

  const drawer = (
    <Suspense fallback={<aside className="hood hood-loading" aria-busy="true" />}>
      <HoodDrawer rows={hoodData} open={hood} onToggle={() => setHood((o) => !o)} {...(hoodNote ? { note: hoodNote } : {})} />
    </Suspense>
  );

  if (phase === "back" && returned) {
    return (
      <div className="shop" data-hood={hood ? "open" : "closed"}>
        <div className="wrap shop-grid">
          <div className="shop-run">
            <Receipt runId={returned} back={run.back} mode={mode} onAgain={again} />
          </div>
          {drawer}
        </div>
        <PhoneBar rows={hoodData.length} onHood={() => setHood(true)} />
      </div>
    );
  }

  return (
    <div className="shop" data-hood={hood ? "open" : "closed"}>
      <div className="wrap shop-grid">
        <div className="shop-run">
          <h1 className="shop-line" data-calm={showAsk ? undefined : ""}><GooseMark className="shop-line-goose" /><span key={line}>{line}</span></h1>

          {refused ? <p className="away" role="alert"><b>Goose's server refused this page's address ({location.origin}).</b> It only answers the address its WEB_URL names (http://localhost:5173 unless set). Open the site there, or start the server with WEB_URL={location.origin}. Nothing was paid.</p> : null}

          {away ? <p className="away" role="status"><b>Server away: showing the recording.</b> Goose can't shop until its server answers; nothing was paid.</p> : null}

          {showAsk ? <ShopAsk run={run} live={server === "live"} /> : null}
          {!showAsk ? <Brief run={run} /> : null}

          {phase === "failed" && read ? (
            <div className="shop-fail-box" role="alert">
              <p>{run.fail}</p>
              <div className="step-act">
                {run.retry ? <Button tone="line" size="s" onClick={() => void run.shop()}>Try again</Button> : null}
                <Button tone="quiet" size="s" onClick={run.edit}>Change what to find</Button>
              </div>
            </div>
          ) : null}

          {market && phase !== "rest" ? <Discover run={run} onReview={() => { setPayNote(null); setSheet(true); }} /> : null}

          {finished && market ? (
            <>
              <Compare rows={rows} limit={limit} />
              {best ? null : <Decide run={run} best={best} onReview={() => { setPayNote(null); setSheet(true); }} />}
              <RealPrices words={run.words} />
              <div className="step-act shop-end">
                <Button tone="quiet" onClick={again}>Shop for something else</Button>
              </div>
            </>
          ) : null}

          {away && showAsk && kettleBest && deal ? (
            <div className="recorded">
              <Compare rows={kettleCompare} limit={KETTLE_LIMIT} recorded />
              <Pick best={kettleBest} limit={KETTLE_LIMIT} demo />
              <ApproveCard demo deal={{ merchant: deal.seller, item: deal.item, total: deal.total, limit: "60.00", minutes: deal.minutes ?? 15 }} />
            </div>
          ) : null}
        </div>
        {drawer}
      </div>

      <PhoneBar rows={hoodData.length} onHood={() => setHood(true)} {...(finished && best ? { review: { label: usd(best.price), onReview: () => { setPayNote(null); setSheet(true); } } } : {})} />

      {listing && best ? (
        <ApproveSheet
          open={sheet}
          onClose={() => setSheet(false)}
          deal={{ merchant: listing.merchant, item: listing.item, total: listing.price, limit: (limit / 100).toFixed(2), history: listing.history }}
          mode={mode}
          pending={paying}
          status={status}
          note={payNote}
          onApprove={() => { if (!tap.pending()) void tap(); }}
        />
      ) : null}
    </div>
  );
}

/** One thumb on a phone: Under the hood, and Review once Goose has a pick and its own button is out of view. Hidden at 1100 px and wider. */
function PhoneBar({ rows, onHood, review }: { rows: number; onHood(): void; review?: { label: string; onReview(): void } }) {
  // The recommendation carries its own button; the bar offers Review only once that one has scrolled away.
  const [cta, setCta] = useState(false);
  useEffect(() => {
    const el = document.getElementById("rec-cta");
    if (!el) { setCta(false); return; }
    const io = new IntersectionObserver(([e]) => setCta(Boolean(e?.isIntersecting)));
    io.observe(el);
    return () => io.disconnect();
  }, [review?.label]);
  return (
    <div className="shop-bar" data-solo={review && !cta ? undefined : ""}>
      <Button tone="line" onClick={onHood} className="shop-bar-hood">Under the hood<span className="figure shop-bar-n">{rows}</span></Button>
      {review && !cta ? <Button tone="ink" onClick={review.onReview}>Review · {review.label}</Button> : null}
    </div>
  );
}

