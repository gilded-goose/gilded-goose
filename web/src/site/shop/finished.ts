// Whether this tab's Shop is showing a finished run with a pick. Shop sets it while it is mounted and clears it when it
// unmounts (the run lives in Shop's own state, so it is gone then); the Judge tour's "Approve it yourself" reads it, so
// it keeps the pick on screen instead of priming a second ask. A flag in memory, never stored: it can't outlive the run.
let finished = false;
export const setFinishedRun = (v: boolean): void => { finished = v; };
export const hasFinishedRun = (): boolean => finished;
