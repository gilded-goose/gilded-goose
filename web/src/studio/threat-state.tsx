// The Live Threat Board's state (Track T): the real record polled from the server, the seeded week from the build, which
// of the two is on show, and the view on it. One provider, so the fallback's page and AG Studio's custom widgets read the
// same board. Real-time here means a poll every 10 s while the tab is in view: the record is one small JSON answer, and a
// stream per open tab would hold a connection for rows that arrive a few an hour.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import seeded from "virtual:goose-threat-week";
import { TYPE_WORDS, type Attempt, type ChallengeCounts } from "./threat-shape.ts";
import { ALL, arrivals, askedView, readAsk, readBoard, tryRows, tryWord, type BoardRows, type Source, type ThreatView } from "./threat-model.ts";
import { PAGE_BOUNDARY, PAGE_RULE_LABEL, pageAsksToAct } from "./rule.ts";
import { ASK_NO_AI, newestWords, THREAT_ASK_CANT } from "./threat-words.ts";
import { within } from "./within.ts";

const POLL_MS = 10_000;
/** When the record can't be read: ask again, but less often, and print one line in the console at most per minute. */
const RETRY_MS = 60_000;
/** One read waits this long at most (within.ts): a stalled answer is a failed one, and the counter says so. */
const READ_MS = 6_000;
/** The first failure since a good answer asks again this soon: a judge is looking at the board now. Later ones, RETRY_MS. */
const FIRST_RETRY_MS = 5_000;

export interface Feed {
  state: "reading" | "live" | "unavailable";
  rows: readonly Attempt[] | null;
  /** The server's own fold; its rows stop short of it past `cut`. Null while the record can't be read: no number stands in. */
  counts: ChallengeCounts | null;
  cut: boolean;
  /** When the last good answer came. */
  at: number | null;
  /** The rows this answer added, set with the rows themselves so a row is born knowing it's new. The first read adds none. */
  arrived: ReadonlySet<string>;
}
const NONE_NEW: ReadonlySet<string> = new Set();

/** The first paint's answer, if it has come (early-board.ts): the board opens on the record, with no "Reading" between. */
function earlyFeed(): Feed | null {
  const read = readBoard(window.__board?.v);
  return read ? { state: "live", ...read, at: Date.now(), arrived: NONE_NEW } : null;
}

export function useThreatFeed(): Feed {
  const [feed, setFeed] = useState<Feed>(() => earlyFeed() ?? { state: "reading", rows: null, counts: null, cut: false, at: null, arrived: NONE_NEW });
  // The same answer keeps the same array, so a poll with no new row re-renders no chart and re-feeds no grid.
  const heard = useRef<{ key: string; rows: readonly Attempt[]; arrived: ReadonlySet<string> } | null>(null);
  useEffect(() => {
    let gone = false;
    let timer = 0;
    let failed = 0;
    const next = (ms: number) => { if (!gone) timer = window.setTimeout(tick, ms); };
    const tick = async () => {
      // A hidden tab doesn't ask; the visibility listener below asks the moment it's back.
      if (document.hidden) return;
      try {
        // The first read is the first paint's answer when it asked (early-board.ts), so one moment costs one request.
        // Each wait has an end (within.ts): a stalled answer held this board in "Reading the record…" for good on live.
        const early = window.__board?.p;
        delete window.__board;
        let body = early ? await within(early, READ_MS) : null;
        if (!body) {
          const stop = new AbortController();
          body = await within(fetch("/api/challenge", { credentials: "same-origin", headers: { accept: "application/json" }, signal: stop.signal }).then((r) => (r.ok ? r.json() : null)), READ_MS);
          if (!body) stop.abort();
        }
        const read = body ? readBoard(body) : null;
        if (gone) return;
        if (read) {
          failed = 0;
          const key = JSON.stringify(read.rows);
          if (heard.current?.key !== key) heard.current = { key, rows: read.rows, arrived: new Set(arrivals(heard.current?.rows ?? null, read.rows)) };
          setFeed({ state: "live", ...read, rows: heard.current.rows, arrived: heard.current.arrived, at: Date.now() });
          next(POLL_MS);
          return;
        }
      } catch { /* no network: the same as a broken answer */ }
      if (gone) return;
      // Rows already on the board stay; the status says they've stopped updating.
      setFeed((f) => ({ ...f, state: "unavailable" }));
      next(failed++ === 0 ? FIRST_RETRY_MS : RETRY_MS);
    };
    const back = () => { if (!document.hidden) { clearTimeout(timer); void tick(); } };
    document.addEventListener("visibilitychange", back);
    void tick();
    return () => { gone = true; clearTimeout(timer); document.removeEventListener("visibilitychange", back); };
  }, []);
  return feed;
}

export interface Board {
  feed: Feed;
  /** The two sources, apart. Nothing on the board adds one to the other. */
  sources: BoardRows;
  source: Source;
  setSource: (s: Source) => void;
  /** The rows of the source on show, and nothing else. */
  rows: readonly Attempt[];
  view: ThreatView;
  setView: (v: ThreatView) => void;
  /** Reading the words with the fixed rule: true when they named a view (or asked to act, which is answered), false when they're for someone else. */
  ask: (words: string) => boolean;
  /** What the rule says about the last ask; empty before one. */
  said: string;
  /** A row just arrived, in fixed words, for the live region. */
  fresh: string;
  /** The real rows to mark as new: those that arrived while this page was open, and the newest when someone came here from their try. */
  freshIds: ReadonlySet<string>;
  /** The real record's top row, once the page has a reason to name it: a row arrived, or someone came here from their try. */
  newest: Attempt | null;
  /** Bumped to play a new row's entrance again, when asked to see it. */
  spot: number;
  showNewest: () => void;
  now: number;
}

const ThreatContext = createContext<Board | null>(null);
export function useBoard(): Board {
  const b = useContext(ThreatContext);
  if (!b) throw new Error("a threat widget rendered outside the board");
  return b;
}

export function ThreatProvider({ children }: { children: ReactNode }) {
  const feed = useThreatFeed();
  const [picked, setPicked] = useState<Source | null>(null);
  const [view, setView] = useState<ThreatView>(ALL);
  const [said, setSaid] = useState("");
  const [fresh, setFresh] = useState("");
  const [spot, setSpot] = useState(0);
  const realCount = feed.rows?.length ?? 0;
  // Came here from a try (`?desk=ledger&tried=1`): the link says so once, and the address stays clean after it.
  const [tried] = useState(() => new URLSearchParams(location.search).get("tried") === "1");
  useEffect(() => {
    if (!tried) return;
    const u = new URL(location.href);
    u.searchParams.delete("tried");
    history.replaceState(history.state, "", u);
  }, [tried]);
  // Real first, whenever there is a real try to show; with none yet, the labelled seeded week, so the board is never bare.
  // After someone's try the seeded week doesn't flash up while the record is being read.
  const source: Source = picked ?? (realCount > 0 || (tried && feed.state === "reading") ? "real" : "demo");
  const sources = useMemo<BoardRows>(() => ({ real: feed.rows, demo: seeded }), [feed.rows]);
  const rows = useMemo(() => (source === "real" ? (feed.rows ?? []) : seeded), [source, feed.rows]);
  // A day picked on one side means nothing on the other: its bucket's times differ.
  // Nor does a source on the seeded side, where nobody tried anything.
  const setSource = useCallback((s: Source) => { setPicked(s); setView((v) => ({ ...v, span: typeof v.span === "object" ? "all" : v.span, by: s === "demo" ? null : v.by })); }, []);

  const ask = useCallback((words: string) => {
    const text = words.trim();
    if (!text) return false;
    if (pageAsksToAct(text)) { setSaid(`${PAGE_BOUNDARY} ${PAGE_RULE_LABEL}`); return true; }
    const read = readAsk(text);
    if (!read) { setSaid(THREAT_ASK_CANT); return false; }
    const asked = askedView(read.view, read.source ?? source, feed.rows);
    setView(asked.view);
    if (read.source) setPicked(read.source);
    setSaid(asked.noAi ? `${ASK_NO_AI} ${PAGE_RULE_LABEL}` : PAGE_RULE_LABEL);
    return true;
  }, [source, feed.rows]);

  // A deep link for the tour and the video kit (`?desk=ledger&threat=gift+cards+set+aside`): the words only pick from
  // closed lists, and they're never drawn on the page.
  const linked = useRef(false);
  useEffect(() => {
    if (linked.current) return;
    linked.current = true;
    const words = new URLSearchParams(location.search).get("threat");
    if (words) ask(words.slice(0, 120));
  }, [ask]);

  // A real row arriving, or the row someone came here to see. The first read is news only after their try.
  const named = useRef<string | null | undefined>(undefined);
  if (named.current === undefined && feed.rows !== null) named.current = tried ? (tryRows(feed.rows, "real")[0]?.id ?? null) : null;
  const [everArrived, setEverArrived] = useState(false);
  const freshIds = useMemo(() => (named.current ? new Set([...feed.arrived, named.current]) : feed.arrived), [feed.arrived, feed.rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const top = feed.rows?.[0] ?? null;
  const newest = top && (everArrived || feed.arrived.size > 0 || named.current) ? top : null;
  useEffect(() => {
    if (feed.arrived.size > 0) setEverArrived(true);
    if (newest && (feed.arrived.size > 0 || named.current)) setFresh(newestWords(TYPE_WORDS[newest.type], tryWord(newest)));
  }, [feed.arrived, newest]);

  const showNewest = useCallback(() => { setSource("real"); setView(ALL); setSpot((x) => x + 1); }, [setSource]);

  // To the minute, as the rows are: a poll with nothing new redraws nothing.
  const now = Math.floor((feed.at ?? Date.now()) / 60_000) * 60_000;
  const board = useMemo<Board>(() => ({ feed, sources, source, setSource, rows, view, setView, ask, said, fresh, freshIds, newest, spot, showNewest, now }), [feed, sources, source, setSource, rows, view, ask, said, fresh, freshIds, newest, spot, showNewest, now]);
  return <ThreatContext.Provider value={board}>{children}</ThreatContext.Provider>;
}

/** The counter's numbers, always the real side's: the server's fold, or none. Never the seeded rows, and never a fold of a list that may be cut. */
export const realCounts = (feed: Feed): ChallengeCounts | null => feed.counts;

