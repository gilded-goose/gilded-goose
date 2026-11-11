// A take films; it never adds to the real counter (Joshua, Nov 3: the counter is real attempts only; Lead-10, the video
// kit). Every take runs behind this: a write to a counted route on anything but this machine is stopped and fails the take.

const COUNTED = /^\/api\/(?:runs\/trick|runs\/scammer|judge)(?:\/|$)/;
const HERE = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** True when this request would count as a real attempt on a site that isn't this machine. Reads are always fine. */
export const spendsTheCounter = (method: string, url: string): boolean => {
  const u = new URL(url);
  return method.toUpperCase() !== "GET" && method.toUpperCase() !== "HEAD" && !HERE.has(u.hostname) && COUNTED.test(u.pathname);
};
