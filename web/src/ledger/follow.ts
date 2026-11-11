// Following the session's ledger stream (AS-15): which stream is the live one, when a failed stream asks the server
// why, and "Try again". Plain code with no DOM, so a test drives it with a fake EventSource (core/test/as15.test.ts);
// SessionLedger.tsx wires it to the page.
//
// Three rules, each from a bug:
// - A stream that never opened is not a dropped one. EventSource retries an unreachable server forever, and the page sat
//   on "Reading your ledger…" with nothing under it; now the first failed connect closes it and asks once why. A stream
//   that opened and then dropped is left to EventSource's own retry.
// - Only the latest attempt speaks. Each connect is a generation; an answer from an older one (a slow "why" after a
//   second "Try again") is dropped, and a new connect always closes the one before, so the page never holds two streams
//   (the server allows two per browser).
// - "Didn't answer" only when nothing answered. If the "why" comes back 2xx (the server is up; the stream itself failed),
//   it connects again once before giving up, and the page's words for that case are not "didn't answer".

/** The parts of an EventSource this uses (readyState 0 connecting, 1 open, 2 closed). */
export interface SourceLike {
  readonly readyState: number;
  close(): void;
  addEventListener(type: "open", f: () => void): void;
  onerror: ((e: never) => void) | null;
}
/** Why a stream ended: the HTTP status of one plain read (0: no answer at all) and the server's words, if any. */
export interface StreamEnd { status: number; body?: { error?: string } | null }

export interface FollowOptions<S extends SourceLike> {
  /** A new stream. */
  open: () => S;
  /** Asks the server once, with a plain read, why the stream ended. */
  askWhy: () => Promise<StreamEnd>;
  /** Each new stream, for the page to hang its row listeners on. */
  wire: (src: S) => void;
  /** The latest attempt's stream opened. */
  opened?: () => void;
  /** The latest attempt ended, and why. */
  ended: (end: StreamEnd) => void;
}

export interface Follow<S> {
  /** Starts with the first paint's open stream (`adopt`), its ending (`end`), or a new stream. */
  start(first?: { adopt?: S; end?: Promise<StreamEnd> }): void;
  /** Connects again now, closing whatever stream there is ("Try again", and the no-session look every 3 s). */
  again(): void;
  stop(): void;
}

const OPEN = 1;
const CLOSED = 2;

export function follow<S extends SourceLike>(o: FollowOptions<S>): Follow<S> {
  let gen = 0;
  let live: S | null = null;
  let stopped = false;
  /** One reconnect when the server is up but the stream failed; an opened stream earns it back. */
  let spare = 1;
  const finish = (mine: number, p: Promise<StreamEnd>) => void p.then((end) => {
    if (stopped || mine !== gen) return;
    if (end.status >= 200 && end.status < 300 && end.status !== 204 && spare > 0) { spare--; connect(); return; }
    o.ended(end);
  });
  const connect = (adopt?: S) => {
    const mine = ++gen;
    live?.close();
    const src = live = adopt ?? o.open();
    let opened = src.readyState === OPEN;
    src.addEventListener("open", () => { opened = true; spare = 1; if (!stopped && mine === gen) o.opened?.(); });
    o.wire(src);
    src.onerror = () => {
      if (stopped || mine !== gen) return;
      if (src.readyState !== CLOSED && opened) return; // a dropped stream: EventSource retries it on its own
      src.close();
      live = null;
      finish(mine, o.askWhy());
    };
  };
  return {
    start(first) {
      if (stopped) return;
      if (first?.end) { finish(++gen, first.end); return; }
      connect(first?.adopt);
    },
    again() { if (!stopped) connect(); },
    stop() { stopped = true; live?.close(); live = null; },
  };
}
