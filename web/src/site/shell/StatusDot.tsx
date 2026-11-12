// The server's state in the header: a dot and its words, so colour is never the only signal.
import { useServer, type ServerState } from "../live/useServer.ts";

const WORDS: Readonly<Record<ServerState, string>> = {
  checking: "Checking the server",
  live: "Server live",
  away: "Server away",
};

export function StatusDot({ compact = false }: { compact?: boolean }) {
  const state = useServer();
  return (
    <span className="status" data-state={state} data-compact={compact ? "" : undefined} role="status" title={WORDS[state]}>
      <span className="status-dot" aria-hidden="true" />
      <span className={compact ? "vh" : "status-words"}>{WORDS[state]}</span>
    </span>
  );
}
